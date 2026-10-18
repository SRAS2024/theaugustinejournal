// src/lib/translation/sentencepiece.js
// A self-contained SentencePiece (unigram) tokenizer.
//
// It reads the binary `*.spm` model files that ship with every OPUS-MT model
// and reproduces what the reference C++ library does when encoding:
//   1. normalization with the model's precompiled character map (nmt_nfkc),
//      including its whitespace rules (strip, collapse, dummy "▁" prefix),
//   2. a Viterbi search over the unigram lattice for the most likely pieces.
// Decoding pieces back to text is a simple join that turns "▁" into spaces.

const SPACE_SYMBOL = "▁"; // ▁
const UNK_PENALTY = 10.0;

const PIECE_NORMAL = 1;
const PIECE_UNKNOWN = 2;
const PIECE_CONTROL = 3;
const PIECE_USER_DEFINED = 4;
const PIECE_UNUSED = 5;
const PIECE_BYTE = 6;

/* ------------------------------------------------------------------ */
/*  Minimal protobuf reader (only what sentencepiece_model.proto uses) */
/* ------------------------------------------------------------------ */

function readVarint(buf, state) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (state.pos >= buf.length) throw new Error("Truncated protobuf varint");
    const byte = buf[state.pos++];
    result += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return result;
    shift += 7;
    if (shift > 63) throw new Error("Invalid protobuf varint");
  }
}

/** Iterate over the fields of one protobuf message. */
function* fields(buf, start = 0, end = buf.length) {
  const state = { pos: start };
  while (state.pos < end) {
    const key = readVarint(buf, state);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) {
      yield { field, wire, value: readVarint(buf, state) };
    } else if (wire === 1) {
      const pos = state.pos;
      state.pos += 8;
      yield { field, wire, pos };
    } else if (wire === 2) {
      const len = readVarint(buf, state);
      const pos = state.pos;
      state.pos += len;
      if (state.pos > end) throw new Error("Truncated protobuf field");
      yield { field, wire, pos, len };
    } else if (wire === 5) {
      const pos = state.pos;
      state.pos += 4;
      yield { field, wire, pos };
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}`);
    }
  }
}

function parseModelProto(buf) {
  const pieces = [];
  let modelType = 1; // UNIGRAM
  let byteFallback = false;
  const normalizer = {
    name: "",
    charsmap: null,
    addDummyPrefix: true,
    removeExtraWhitespaces: true,
    escapeWhitespaces: true
  };
  let treatWhitespaceAsSuffix = false;

  for (const f of fields(buf)) {
    if (f.field === 1 && f.wire === 2) {
      let piece = "";
      let score = 0;
      let type = PIECE_NORMAL;
      for (const g of fields(buf, f.pos, f.pos + f.len)) {
        if (g.field === 1 && g.wire === 2) piece = buf.toString("utf8", g.pos, g.pos + g.len);
        else if (g.field === 2 && g.wire === 5) score = buf.readFloatLE(g.pos);
        else if (g.field === 3 && g.wire === 0) type = g.value;
      }
      pieces.push({ piece, score, type });
    } else if (f.field === 2 && f.wire === 2) {
      for (const g of fields(buf, f.pos, f.pos + f.len)) {
        if (g.field === 3 && g.wire === 0) modelType = g.value;
        else if (g.field === 24 && g.wire === 0) treatWhitespaceAsSuffix = g.value !== 0;
        else if (g.field === 35 && g.wire === 0) byteFallback = g.value !== 0;
      }
    } else if (f.field === 3 && f.wire === 2) {
      for (const g of fields(buf, f.pos, f.pos + f.len)) {
        if (g.field === 1 && g.wire === 2) normalizer.name = buf.toString("utf8", g.pos, g.pos + g.len);
        else if (g.field === 2 && g.wire === 2) normalizer.charsmap = buf.subarray(g.pos, g.pos + g.len);
        else if (g.field === 3 && g.wire === 0) normalizer.addDummyPrefix = g.value !== 0;
        else if (g.field === 4 && g.wire === 0) normalizer.removeExtraWhitespaces = g.value !== 0;
        else if (g.field === 5 && g.wire === 0) normalizer.escapeWhitespaces = g.value !== 0;
      }
    }
  }

  return { pieces, modelType, byteFallback, normalizer, treatWhitespaceAsSuffix };
}

/* ------------------------------------------------------------------ */
/*  Precompiled character map (Darts-clone double-array trie)          */
/* ------------------------------------------------------------------ */

class PrecompiledCharsMap {
  constructor(blob) {
    if (!blob || blob.length < 4) {
      this.units = null;
      return;
    }
    const trieSize = blob.readUInt32LE(0);
    if (trieSize % 4 !== 0 || 4 + trieSize > blob.length) {
      throw new Error("Invalid precompiled charsmap");
    }
    this.units = new Uint32Array(trieSize / 4);
    for (let i = 0; i < this.units.length; i++) this.units[i] = blob.readUInt32LE(4 + i * 4);
    this.normalized = blob.subarray(4 + trieSize);
  }

  /** Longest rule matching a prefix of bytes[pos..]: { length, replacement } or null. */
  longestMatch(bytes, pos) {
    const units = this.units;
    if (!units) return null;
    let nodePos = 0;
    let unit = units[nodePos];
    nodePos ^= offsetOf(unit);
    let best = null;
    for (let i = pos; i < bytes.length; i++) {
      const c = bytes[i];
      nodePos ^= c;
      unit = units[nodePos];
      if (unit === undefined || labelOf(unit) !== c) break;
      nodePos ^= offsetOf(unit);
      if ((unit >>> 8) & 1) {
        const value = units[nodePos] & 0x7fffffff;
        best = { length: i + 1 - pos, value };
      }
    }
    if (!best) return null;
    let end = best.value;
    while (end < this.normalized.length && this.normalized[end] !== 0) end++;
    return { length: best.length, replacement: this.normalized.toString("utf8", best.value, end) };
  }
}

function offsetOf(unit) {
  return ((unit >>> 10) << ((unit & (1 << 9)) >>> 6)) >>> 0;
}

function labelOf(unit) {
  return (unit & ((1 << 31) | 0xff)) >>> 0;
}

/** Byte length of the UTF-8 sequence starting at bytes[pos], or 0 if malformed. */
function utf8CharLength(bytes, pos) {
  const b = bytes[pos];
  let len = 0;
  if (b < 0x80) return 1;
  if (b >= 0xc2 && b <= 0xdf) len = 2;
  else if (b >= 0xe0 && b <= 0xef) len = 3;
  else if (b >= 0xf0 && b <= 0xf4) len = 4;
  else return 0;
  if (pos + len > bytes.length) return 0;
  for (let i = 1; i < len; i++) {
    if ((bytes[pos + i] & 0xc0) !== 0x80) return 0;
  }
  const cp = Buffer.from(bytes.subarray(pos, pos + len)).toString("utf8").codePointAt(0);
  if (cp === 0xfffd) return 0; // overlong or surrogate encodings decode to U+FFFD
  return len;
}

/* ------------------------------------------------------------------ */
/*  Tokenizer                                                         */
/* ------------------------------------------------------------------ */

export class SentencePiece {
  /** @param {Buffer} modelBytes contents of a .spm file */
  constructor(modelBytes) {
    const model = parseModelProto(Buffer.from(modelBytes));
    if (model.modelType !== 1) throw new Error("Only unigram SentencePiece models are supported");
    if (model.treatWhitespaceAsSuffix) throw new Error("treat_whitespace_as_suffix is not supported");

    this.byteFallback = model.byteFallback;
    this.normalizerSpec = model.normalizer;
    this.charsmap = new PrecompiledCharsMap(model.normalizer.charsmap);

    this.trie = new Map();
    this.pieceIndex = new Map();
    let minScore = Infinity;
    let maxScore = -Infinity;
    this.unkPiece = null;
    model.pieces.forEach((p, id) => {
      this.pieceIndex.set(p.piece, id);
      if (p.type === PIECE_UNKNOWN) this.unkPiece = p.piece;
      if (p.type === PIECE_NORMAL) {
        if (p.score < minScore) minScore = p.score;
        if (p.score > maxScore) maxScore = p.score;
      }
    });
    this.minScore = minScore;
    this.maxScore = maxScore;
    this.unkScore = Math.fround(minScore - UNK_PENALTY);

    for (const p of model.pieces) {
      if (p.type !== PIECE_NORMAL && p.type !== PIECE_USER_DEFINED && p.type !== PIECE_UNUSED) continue;
      if (!p.piece) continue;
      let node = this.trie;
      for (const ch of p.piece) {
        let next = node.get(ch);
        if (!next) {
          next = new Map();
          node.set(ch, next);
        }
        node = next;
      }
      const score =
        p.type === PIECE_USER_DEFINED
          ? Math.fround(Buffer.byteLength(p.piece, "utf8") * maxScore - 0.1)
          : p.score;
      node.set("", { piece: p.piece, score, unused: p.type === PIECE_UNUSED });
    }
  }

  /** Apply the model's normalization rules, returning the "▁"-escaped string. */
  normalize(text) {
    const spec = this.normalizerSpec;
    const bytes = Buffer.from(String(text), "utf8");
    let pos = 0;

    const nextPrefix = () => {
      const match = this.charsmap.longestMatch(bytes, pos);
      if (match) return { str: match.replacement, len: match.length };
      const len = utf8CharLength(bytes, pos);
      if (len === 0) return { str: "�", len: 1 };
      return { str: bytes.toString("utf8", pos, pos + len), len };
    };

    if (spec.removeExtraWhitespaces) {
      while (pos < bytes.length) {
        const p = nextPrefix();
        if (p.str !== " ") break;
        pos += p.len;
      }
    }
    if (pos >= bytes.length) return "";

    let out = "";
    if (spec.addDummyPrefix) out += spec.escapeWhitespaces ? SPACE_SYMBOL : " ";

    let prevSpace = spec.removeExtraWhitespaces;
    while (pos < bytes.length) {
      const p = nextPrefix();
      let sp = p.str;
      if (prevSpace && spec.removeExtraWhitespaces) {
        while (sp.startsWith(" ")) sp = sp.slice(1);
      }
      if (sp.length) {
        out += spec.escapeWhitespaces ? sp.replace(/ /g, SPACE_SYMBOL) : sp;
        prevSpace = sp.endsWith(" ");
      }
      pos += p.len;
      if (!spec.removeExtraWhitespaces) prevSpace = false;
    }

    if (spec.removeExtraWhitespaces) {
      const space = spec.escapeWhitespaces ? SPACE_SYMBOL : " ";
      while (out.endsWith(space)) out = out.slice(0, -space.length);
    }
    return out;
  }

  /** Encode text into pieces (strings). Unknown characters come back as their own surface. */
  encodeAsPieces(text) {
    const normalized = this.normalize(text);
    if (!normalized) return [];
    const chars = Array.from(normalized);
    const n = chars.length;
    const bestScore = new Float64Array(n + 1);
    const startsAt = new Int32Array(n + 1).fill(-1);
    const isUnk = new Uint8Array(n + 1);

    for (let start = 0; start < n; start++) {
      if (start > 0 && startsAt[start] === -1) continue; // unreachable (never happens: unk covers every char)
      const base = bestScore[start];
      let node = this.trie;
      let hasSingle = false;
      for (let end = start; end < n; end++) {
        node = node.get(chars[end]);
        if (!node) break;
        const leaf = node.get("");
        if (leaf && !leaf.unused) {
          const candidate = Math.fround(leaf.score + base);
          const target = end + 1;
          if (startsAt[target] === -1 || candidate > bestScore[target]) {
            bestScore[target] = candidate;
            startsAt[target] = start;
            isUnk[target] = 0;
          }
          if (end === start) hasSingle = true;
        }
      }
      if (!hasSingle) {
        const target = start + 1;
        const candidate = Math.fround(this.unkScore + base);
        if (startsAt[target] === -1 || candidate > bestScore[target]) {
          bestScore[target] = candidate;
          startsAt[target] = start;
          isUnk[target] = 1;
        }
      }
    }

    const result = [];
    let end = n;
    while (end > 0) {
      const start = startsAt[end];
      result.push({ piece: chars.slice(start, end).join(""), unk: isUnk[end] === 1 });
      end = start;
    }
    result.reverse();

    if (this.byteFallback) {
      // Unknown characters are spelled out as their UTF-8 bytes ("<0xE2>" …).
      const out = [];
      for (const r of result) {
        if (!r.unk) {
          out.push(r.piece);
          continue;
        }
        for (const b of Buffer.from(r.piece, "utf8")) {
          out.push(`<0x${b.toString(16).toUpperCase().padStart(2, "0")}>`);
        }
      }
      return out;
    }

    // Merge consecutive unknown pieces, like the reference implementation.
    const merged = [];
    for (const r of result) {
      const last = merged[merged.length - 1];
      if (r.unk && last && last.unk) last.piece += r.piece;
      else merged.push({ ...r });
    }
    return merged.map((r) => r.piece);
  }

  /** Join pieces back into text; byte pieces such as "<0xE2>" are reassembled. */
  static decodePieces(pieces) {
    let text = "";
    let bytes = [];
    const flushBytes = () => {
      if (bytes.length) {
        text += Buffer.from(bytes).toString("utf8");
        bytes = [];
      }
    };
    for (const piece of pieces) {
      const m = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece);
      if (m) {
        bytes.push(parseInt(m[1], 16));
      } else {
        flushBytes();
        text += piece;
      }
    }
    flushBytes();
    text = text.replace(/▁/g, " ");
    if (text.startsWith(" ")) text = text.slice(1);
    return text;
  }
}
