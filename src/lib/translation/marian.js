// src/lib/translation/marian.js
// Runs OPUS-MT (MarianMT) translation models on the CPU with onnxruntime.
//
// Nothing here depends on a pre-converted model: the transformer graph is
// written out as ONNX by `buildEncoder`/`buildDecoder` below and points at the
// weights inside the official `model.safetensors` file, so the model can be
// used exactly as published by the University of Helsinki on Hugging Face.
// Tokenization uses the hand-written SentencePiece port in sentencepiece.js,
// and decoding (greedy or beam search) happens in plain JavaScript.

import fs from "fs";
import path from "path";
import { Graph, DT } from "./onnx.js";
import { SentencePiece } from "./sentencepiece.js";
import { openWeights } from "./weights.js";

const NEG_INF = -Infinity;
const MASKED = -1e9;

/* ------------------------------------------------------------------ */
/*  Graph construction                                                */
/* ------------------------------------------------------------------ */

function graphHelpers(g, weights, location, cfg) {
  const cache = new Map();
  const H = cfg.heads;
  const Dh = cfg.d / cfg.heads;
  const shapeHeads = g.constInt64([0, 0, H, Dh]);
  const shapeModel = g.constInt64([0, 0, cfg.d]);
  const scale = g.constFloat([Dh ** -0.5], []);

  /** float32 view of a stored tensor (Cast is folded away at session creation). */
  function f32(name) {
    const key = `f32:${name}`;
    if (cache.has(key)) return cache.get(key);
    const t = weights.info(name);
    const raw = g.external(name, t.onnxType, t.dims, location, t.offset, t.length);
    const out = t.onnxType === DT.FLOAT ? raw : g.op("Cast", [raw], { to: DT.FLOAT });
    cache.set(key, out);
    return out;
  }

  /** [in, out] float32 matrix for a PyTorch Linear weight stored as [out, in]. */
  function weightT(name) {
    const key = `T:${name}`;
    if (cache.has(key)) return cache.get(key);
    const out = g.op("Transpose", [f32(name)], { perm: [1, 0] });
    cache.set(key, out);
    return out;
  }

  const linear = (x, prefix) => g.op("Add", [g.op("MatMul", [x, weightT(`${prefix}.weight`)]), f32(`${prefix}.bias`)]);
  const layerNorm = (x, prefix) =>
    g.op("LayerNormalization", [x, f32(`${prefix}.weight`), f32(`${prefix}.bias`)], { axis: -1, epsilon: 1e-5 });
  const splitHeads = (x, perm) => g.op("Transpose", [g.op("Reshape", [x, shapeHeads])], { perm });
  const mergeHeads = (x) => g.op("Reshape", [g.op("Transpose", [x], { perm: [0, 2, 1, 3] }), shapeModel]);
  const activation = (x) => {
    if (cfg.activation === "relu") return g.op("Relu", [x]);
    if (cfg.activation === "swish" || cfg.activation === "silu") return g.op("Mul", [x, g.op("Sigmoid", [x])]);
    throw new Error(`Unsupported activation ${cfg.activation}`);
  };
  const query = (x, prefix) => splitHeads(g.op("Mul", [linear(x, prefix), scale]), [0, 2, 1, 3]);
  const keysT = (x, prefix) => splitHeads(linear(x, prefix), [0, 2, 3, 1]);
  const values = (x, prefix) => splitHeads(linear(x, prefix), [0, 2, 1, 3]);
  const attend = (q, kT, v, bias) => {
    let scores = g.op("MatMul", [q, kT]);
    if (bias) scores = g.op("Add", [scores, bias]);
    return mergeHeads(g.op("MatMul", [g.op("Softmax", [scores], { axis: -1 }), v]));
  };
  const feedForward = (x, prefix) => {
    const h = linear(activation(linear(x, `${prefix}.fc1`)), `${prefix}.fc2`);
    return layerNorm(g.op("Add", [x, h]), `${prefix}.final_layer_norm`);
  };

  return { f32, linear, layerNorm, query, keysT, values, attend, feedForward, H, Dh };
}

/**
 * Encoder: embedded source tokens -> per-decoder-layer cross-attention keys
 * (pre-transposed) and values, plus the encoder output itself.
 */
function buildEncoder(cfg, weights, location) {
  const g = new Graph("marian_encoder");
  const h = graphHelpers(g, weights, location, cfg);
  let x = g.input("hidden", DT.FLOAT, ["batch", "src", cfg.d]);
  const bias = g.input("bias", DT.FLOAT, ["batch", 1, 1, "src"]);

  for (let l = 0; l < cfg.encoderLayers; l++) {
    const p = `model.encoder.layers.${l}`;
    const a = h.attend(h.query(x, `${p}.self_attn.q_proj`), h.keysT(x, `${p}.self_attn.k_proj`), h.values(x, `${p}.self_attn.v_proj`), bias);
    x = h.layerNorm(g.op("Add", [x, h.linear(a, `${p}.self_attn.out_proj`)]), `${p}.self_attn_layer_norm`);
    x = h.feedForward(x, p);
  }

  g.op("Identity", [x], {}, ["encoder_out"]);
  g.output("encoder_out", DT.FLOAT, ["batch", "src", cfg.d]);
  for (let l = 0; l < cfg.decoderLayers; l++) {
    const p = `model.decoder.layers.${l}.encoder_attn`;
    g.op("Identity", [h.keysT(x, `${p}.k_proj`)], {}, [`cross_k_${l}`]);
    g.op("Identity", [h.values(x, `${p}.v_proj`)], {}, [`cross_v_${l}`]);
    g.output(`cross_k_${l}`, DT.FLOAT, ["batch", h.H, h.Dh, "src"]);
    g.output(`cross_v_${l}`, DT.FLOAT, ["batch", h.H, "src", h.Dh]);
  }
  return g;
}

/** Decoder: one step with a key/value cache -> next-token logits. */
function buildDecoder(cfg, weights, location) {
  const g = new Graph("marian_decoder");
  const h = graphHelpers(g, weights, location, cfg);
  let x = g.input("hidden", DT.FLOAT, ["rows", 1, cfg.d]);
  const bias = g.input("bias", DT.FLOAT, ["rows", 1, 1, "src"]);

  for (let l = 0; l < cfg.decoderLayers; l++) {
    const p = `model.decoder.layers.${l}`;
    const pastK = g.input(`past_k_${l}`, DT.FLOAT, ["rows", h.H, h.Dh, "past"]);
    const pastV = g.input(`past_v_${l}`, DT.FLOAT, ["rows", h.H, "past", h.Dh]);
    const crossK = g.input(`cross_k_${l}`, DT.FLOAT, ["rows", h.H, h.Dh, "src"]);
    const crossV = g.input(`cross_v_${l}`, DT.FLOAT, ["rows", h.H, "src", h.Dh]);

    const k = g.op("Concat", [pastK, h.keysT(x, `${p}.self_attn.k_proj`)], { axis: 3 }, [`present_k_${l}`]);
    const v = g.op("Concat", [pastV, h.values(x, `${p}.self_attn.v_proj`)], { axis: 2 }, [`present_v_${l}`]);
    g.output(`present_k_${l}`, DT.FLOAT, ["rows", h.H, h.Dh, "total"]);
    g.output(`present_v_${l}`, DT.FLOAT, ["rows", h.H, "total", h.Dh]);

    const a = h.attend(h.query(x, `${p}.self_attn.q_proj`), k, v, null);
    x = h.layerNorm(g.op("Add", [x, h.linear(a, `${p}.self_attn.out_proj`)]), `${p}.self_attn_layer_norm`);

    const c = h.attend(h.query(x, `${p}.encoder_attn.q_proj`), crossK, crossV, bias);
    x = h.layerNorm(g.op("Add", [x, h.linear(c, `${p}.encoder_attn.out_proj`)]), `${p}.encoder_attn_layer_norm`);

    x = h.feedForward(x, p);
  }

  const flat = g.op("Reshape", [x, g.constInt64([-1, cfg.d])]);
  g.op("Gemm", [flat, h.f32(cfg.outputEmbedding), h.f32("final_logits_bias")], { transB: 1 }, ["logits"]);
  g.output("logits", DT.FLOAT, ["rows", cfg.vocabSize]);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Model                                                             */
/* ------------------------------------------------------------------ */

function sinusoidTable(positions, d) {
  const table = new Float32Array(positions * d);
  const half = d % 2 === 0 ? d / 2 : (d >> 1) + 1;
  for (let pos = 0; pos < positions; pos++) {
    for (let j = 0; j < d; j++) {
      const angle = pos / Math.pow(10000, (2 * Math.floor(j / 2)) / d);
      // Even dims (sin) fill the first half, odd dims (cos) the second half.
      if (j % 2 === 0) table[pos * d + (j >> 1)] = Math.sin(angle);
      else table[pos * d + half + (j >> 1)] = Math.cos(angle);
    }
  }
  return table;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export class MarianModel {
  /**
   * @param {string} dir directory holding config.json, vocab.json, source.spm,
   *   target.spm and model.safetensors
   * @param {object} opts { ort, threads, targetToken }
   */
  static async load(dir, { ort, threads = 2, targetToken = null } = {}) {
    const model = new MarianModel();
    await model.init(dir, ort, threads, targetToken);
    return model;
  }

  async init(dir, ort, threads, targetToken) {
    this.ort = ort;
    const config = readJson(path.join(dir, "config.json"));
    let gen = {};
    try {
      gen = readJson(path.join(dir, "generation_config.json"));
    } catch {
      /* optional */
    }

    this.vocab = readJson(path.join(dir, "vocab.json"));
    this.idToPiece = [];
    for (const [piece, id] of Object.entries(this.vocab)) this.idToPiece[id] = piece;

    const { weights, location } = openWeights(dir);
    this.weights = weights;
    const shared = this.weights.has("model.shared.weight");
    const cfg = {
      d: config.d_model,
      heads: config.decoder_attention_heads,
      encoderLayers: config.encoder_layers,
      decoderLayers: config.decoder_layers,
      activation: config.activation_function,
      vocabSize: config.decoder_vocab_size || config.vocab_size,
      inputEmbedding: shared ? "model.shared.weight" : "model.encoder.embed_tokens.weight",
      decoderEmbedding: shared ? "model.shared.weight" : "model.decoder.embed_tokens.weight",
      outputEmbedding: shared ? "model.shared.weight" : "lm_head.weight"
    };
    if (config.encoder_attention_heads !== config.decoder_attention_heads) throw new Error("Unsupported head layout");
    if (config.normalize_before) throw new Error("Pre-norm Marian models are not supported");
    if (config.normalize_embedding || config.layernorm_embedding) throw new Error("Embedding layer norm is not supported");
    if (config.static_position_embeddings === false) throw new Error("Learned position embeddings are not supported");
    this.cfg = cfg;

    this.padId = config.pad_token_id;
    this.eosId = gen.eos_token_id ?? config.eos_token_id;
    this.startId = gen.decoder_start_token_id ?? config.decoder_start_token_id ?? this.padId;
    this.unkId = this.vocab["<unk>"];
    this.maxPositions = config.max_position_embeddings || 512;
    this.defaultBeams = gen.num_beams || config.num_beams || 4;
    this.embedScale = config.scale_embedding ? Math.fround(Math.sqrt(cfg.d)) : 1;
    this.positions = sinusoidTable(this.maxPositions, cfg.d);
    this.special = new Set([this.padId, this.eosId, this.unkId]);
    this.banUnk = true;
    this.targetTokenId = null;
    if (targetToken) {
      this.targetTokenId = this.vocab[targetToken];
      if (this.targetTokenId === undefined) throw new Error(`Target language token ${targetToken} not in vocabulary`);
    }

    this.sourceSp = new SentencePiece(fs.readFileSync(path.join(dir, "source.spm")));

    const encoderFile = path.join(dir, "encoder.taj.onnx");
    const decoderFile = path.join(dir, "decoder.taj.onnx");
    fs.writeFileSync(encoderFile, buildEncoder(cfg, this.weights, location).toModelBytes());
    fs.writeFileSync(decoderFile, buildDecoder(cfg, this.weights, location).toModelBytes());

    const options = {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      enableCpuMemArena: true
    };
    this.encoder = await ort.InferenceSession.create(encoderFile, options);
    this.decoder = await ort.InferenceSession.create(decoderFile, options);
  }

  async release() {
    for (const s of [this.encoder, this.decoder]) {
      try {
        await s?.release();
      } catch {
        /* ignore */
      }
    }
    this.encoder = this.decoder = null;
    this.weights?.close();
  }

  /** Source token ids for one text (target-language token, pieces, </s>). */
  encodeSource(text) {
    const ids = [];
    if (this.targetTokenId !== null) ids.push(this.targetTokenId);
    for (const piece of this.sourceSp.encodeAsPieces(text)) {
      const id = this.vocab[piece];
      ids.push(id === undefined ? this.unkId : id);
    }
    const limit = this.maxPositions - 1;
    if (ids.length > limit) ids.length = limit;
    ids.push(this.eosId);
    return ids;
  }

  decodeTarget(ids) {
    const pieces = [];
    for (const id of ids) {
      if (this.special.has(id)) continue;
      const piece = this.idToPiece[id];
      if (piece !== undefined) pieces.push(piece);
    }
    return SentencePiece.decodePieces(pieces).trim();
  }

  embed(name, ids, positionOffset, out, outOffset) {
    const d = this.cfg.d;
    for (let i = 0; i < ids.length; i++) {
      const o = outOffset + i * d;
      this.weights.readRow(name, ids[i], out, o);
      const p = (positionOffset + i) * d;
      for (let j = 0; j < d; j++) {
        out[o + j] = Math.fround(out[o + j] * this.embedScale) + this.positions[p + j];
      }
    }
  }

  /**
   * Translate texts. Returns one string per input, in order.
   * @param {string[]} texts
   * @param {{beams?: number, maxBatchTokens?: number}} opts
   */
  async translate(texts, { beams = this.defaultBeams, maxBatchTokens = 1024, maxBatch = 8 } = {}) {
    const items = texts.map((text, index) => ({ index, ids: this.encodeSource(text) }));
    items.sort((a, b) => a.ids.length - b.ids.length);
    const results = new Array(texts.length);

    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const outs = await this.generate(batch.map((b) => b.ids), beams);
      batch.forEach((b, i) => {
        results[b.index] = this.decodeTarget(outs[i]);
      });
      batch = [];
    };
    for (const item of items) {
      const longest = Math.max(item.ids.length, ...batch.map((b) => b.ids.length));
      if (batch.length && (batch.length >= maxBatch || longest * (batch.length + 1) > maxBatchTokens)) await flush();
      batch.push(item);
    }
    await flush();
    return results;
  }

  /** Run the encoder for a batch of id lists. */
  async runEncoder(sources) {
    const { ort } = this;
    const d = this.cfg.d;
    const B = sources.length;
    const S = Math.max(...sources.map((s) => s.length));
    const hidden = new Float32Array(B * S * d);
    const bias = new Float32Array(B * S);
    for (let b = 0; b < B; b++) {
      const ids = sources[b];
      this.embed(this.cfg.inputEmbedding, ids, 0, hidden, b * S * d);
      for (let s = 0; s < S; s++) {
        if (s >= ids.length) {
          // Padding: embed the pad token like the reference implementation, and mask it.
          this.embed(this.cfg.inputEmbedding, [this.padId], s, hidden, (b * S + s) * d);
          bias[b * S + s] = MASKED;
        }
      }
    }
    const out = await this.encoder.run({
      hidden: new ort.Tensor("float32", hidden, [B, S, d]),
      bias: new ort.Tensor("float32", bias, [B, 1, 1, S])
    });
    return { out, S, bias };
  }

  /**
   * Beam search (greedy when beams = 1), following the classic Hugging Face
   * algorithm: 2K candidates per sentence, finished hypotheses scored by
   * sum(log p) / length, the pad token never generated, and </s> forced at
   * the length limit.
   */
  async generate(sources, beams) {
    const { ort } = this;
    const { d, decoderLayers, vocabSize: V, heads: H } = this.cfg;
    const Dh = d / H;
    const B = sources.length;
    const K = Math.max(1, beams | 0);
    const { out: enc, S, bias: encBias } = await this.runEncoder(sources);
    const crossSize = H * Dh * S;
    const maxNew = sources.map((s) => Math.min(this.maxPositions - 1, Math.ceil(s.length * 2.5) + 10));

    // Live beams: one entry per decoder row, grouped by sentence (K rows each).
    let beamsLive = [];
    for (let b = 0; b < B; b++) {
      for (let k = 0; k < K; k++) beamsLive.push({ sentence: b, tokens: [this.startId], score: k === 0 ? 0 : NEG_INF, row: -1 });
    }
    const finished = Array.from({ length: B }, () => []);
    const done = new Array(B).fill(false);

    const addHyp = (b, tokens, sumLogProbs, generatedLen) => {
      const list = finished[b];
      const score = sumLogProbs / Math.max(1, generatedLen);
      if (list.length >= K && score <= list[list.length - 1].score) return;
      list.push({ tokens, score });
      list.sort((x, y) => y.score - x.score);
      if (list.length > K) list.pop();
    };

    const copyRows = (src, rowSize, rowMap) => {
      const dst = new Float32Array(rowMap.length * rowSize);
      for (let i = 0; i < rowMap.length; i++) dst.set(src.subarray(rowMap[i] * rowSize, (rowMap[i] + 1) * rowSize), i * rowSize);
      return dst;
    };

    let past = 0;
    let pastK = Array.from({ length: decoderLayers }, () => new Float32Array(0));
    let pastV = Array.from({ length: decoderLayers }, () => new Float32Array(0));
    let layoutKey = "";
    let crossK = [];
    let crossV = [];
    let biasRows = null;

    for (let step = 0; beamsLive.length; step++) {
      const N = beamsLive.length;

      // Encoder-derived inputs only change when a sentence finishes.
      const sentenceOfRow = beamsLive.map((x) => x.sentence);
      const key = sentenceOfRow.join(",");
      if (key !== layoutKey) {
        layoutKey = key;
        crossK = [];
        crossV = [];
        for (let l = 0; l < decoderLayers; l++) {
          crossK.push(copyRows(enc[`cross_k_${l}`].data, crossSize, sentenceOfRow));
          crossV.push(copyRows(enc[`cross_v_${l}`].data, crossSize, sentenceOfRow));
        }
        biasRows = copyRows(encBias, S, sentenceOfRow);
      }

      const hidden = new Float32Array(N * d);
      for (let r = 0; r < N; r++) {
        const toks = beamsLive[r].tokens;
        this.embed(this.cfg.decoderEmbedding, [toks[toks.length - 1]], step, hidden, r * d);
      }
      const feeds = {
        hidden: new ort.Tensor("float32", hidden, [N, 1, d]),
        bias: new ort.Tensor("float32", biasRows, [N, 1, 1, S])
      };
      for (let l = 0; l < decoderLayers; l++) {
        feeds[`past_k_${l}`] = new ort.Tensor("float32", pastK[l], [N, H, Dh, past]);
        feeds[`past_v_${l}`] = new ort.Tensor("float32", pastV[l], [N, H, past, Dh]);
        feeds[`cross_k_${l}`] = new ort.Tensor("float32", crossK[l], [N, H, Dh, S]);
        feeds[`cross_v_${l}`] = new ort.Tensor("float32", crossV[l], [N, H, S, Dh]);
      }
      const res = await this.decoder.run(feeds);
      const logits = res.logits.data;
      past += 1;

      const next = [];
      for (let start = 0; start < N; start += K) {
        const b = beamsLive[start].sentence;
        const forceEos = step + 1 >= maxNew[b];
        const limit = K === 1 ? 1 : 2 * K;
        const top = []; // sorted descending, at most `limit`
        const offer = (score, r, token) => {
          if (top.length === limit && score <= top[limit - 1].score) return;
          let i = top.length < limit ? top.length : limit - 1;
          if (top.length < limit) top.push(null);
          while (i > 0 && top[i - 1].score < score) {
            top[i] = top[i - 1];
            i--;
          }
          top[i] = { score, r, token };
        };

        for (let r = start; r < start + K; r++) {
          const beam = beamsLive[r];
          if (beam.score === NEG_INF) continue;
          if (forceEos) {
            offer(beam.score, r, this.eosId);
            continue;
          }
          const base = r * V;
          let max = NEG_INF;
          // Never generate padding, nor <unk> (which would silently drop a
          // character the vocabulary cannot spell, e.g. a capital "À").
          const skip1 = this.padId;
          const skip2 = this.banUnk ? this.unkId : this.padId;
          for (let t = 0; t < V; t++) if (t !== skip1 && t !== skip2 && logits[base + t] > max) max = logits[base + t];
          let sum = 0;
          for (let t = 0; t < V; t++) if (t !== skip1 && t !== skip2) sum += Math.exp(logits[base + t] - max);
          const offset = beam.score - max - Math.log(sum);
          for (let t = 0; t < V; t++) if (t !== skip1 && t !== skip2) offer(logits[base + t] + offset, r, t);
        }

        const kept = [];
        for (let rank = 0; rank < top.length && kept.length < K; rank++) {
          const c = top[rank];
          if (c.token === this.eosId) {
            if (rank < K) addHyp(b, beamsLive[c.r].tokens.slice(1), c.score, step);
          } else {
            kept.push({ sentence: b, tokens: beamsLive[c.r].tokens.concat(c.token), score: c.score, row: c.r });
          }
        }

        let isDone = forceEos || kept.length === 0;
        if (!isDone && finished[b].length >= K) {
          const best = top.length ? top[0].score : NEG_INF;
          isDone = finished[b][finished[b].length - 1].score >= best / Math.max(1, step);
        }
        if (isDone) {
          done[b] = true;
        } else {
          while (kept.length < K) kept.push({ ...kept[kept.length - 1], score: NEG_INF });
          next.push(...kept);
        }
      }

      const rowMap = next.map((x) => x.row);
      const rowSize = H * Dh * past;
      for (let l = 0; l < decoderLayers; l++) {
        pastK[l] = copyRows(res[`present_k_${l}`].data, rowSize, rowMap);
        pastV[l] = copyRows(res[`present_v_${l}`].data, rowSize, rowMap);
      }
      beamsLive = next;
    }

    return finished.map((list) => (list.length ? list[0].tokens : []));
  }
}
