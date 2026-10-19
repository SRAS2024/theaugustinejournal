// src/lib/translation/worker.js
// Child process that runs the translation models. engine.js starts it on
// demand, so the large model memory and the CPU-heavy decoding never live in
// the web server process. After a few idle minutes it tells the engine, which
// disconnects it (unless a job is on its way) and it exits.
//
// Messages in:  { type: "translate", id, lang, texts }
// Messages out: { type: "result", id, outputs, model, alt } | { type: "error", id, message } | { type: "idle" }
// (alt: indices of outputs that came from the language's fallback model)

import path from "path";
import { fileURLToPath } from "url";
import ort from "onnxruntime-node";
import { MarianModel } from "./marian.js";
import { MODELS, modelKey } from "./models.js";
import { ensureModelFiles, pruneModels } from "./hub.js";
import { looksBroken } from "./text.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// Inside the app folder by default: on some hosts /tmp lives in memory.
const MODEL_DIR = process.env.TRANSLATION_MODEL_DIR || path.join(PROJECT_ROOT, ".cache", "translation-models");
const THREADS = Math.max(1, Number(process.env.TRANSLATION_THREADS) || 4);
const BEAMS = Math.max(1, Number(process.env.TRANSLATION_BEAMS) || 4);
const IDLE_MS = Math.max(10_000, Number(process.env.TRANSLATION_IDLE_MS) || 5 * 60 * 1000);

const log = (...args) => console.log(...args);

let loaded = null; // { lang, model, key }
let idleTimer = null;
let busy = 0;
let chain = Promise.resolve();

async function fetchModel(candidate) {
  try {
    return await ensureModelFiles(candidate, MODEL_DIR, { log });
  } catch (err) {
    if (err?.code !== "ENOSPC") throw err;
    log("[translation] disk full; removing other downloaded models and retrying");
    await pruneModels(MODEL_DIR, [candidate]);
    return ensureModelFiles(candidate, MODEL_DIR, { log });
  }
}

async function loadLanguage(lang) {
  if (loaded?.lang === lang) return loaded;
  if (loaded) {
    await loaded.model.release();
    loaded = null;
  }
  const candidates = MODELS[lang] || [];
  if (!candidates.length) throw new Error(`No translation model configured for "${lang}"`);
  const errors = [];
  for (const candidate of candidates) {
    try {
      const started = Date.now();
      const dir = await fetchModel(candidate);
      const model = await MarianModel.load(dir, { ort, threads: THREADS, targetToken: candidate.targetToken });
      loaded = { lang, model, key: modelKey(candidate) };
      log(`[translation] loaded ${loaded.key} for ${lang} in ${Date.now() - started} ms`);
      return loaded;
    } catch (err) {
      errors.push(`${modelKey(candidate)}: ${err.message}`);
      log(`[translation] could not use ${modelKey(candidate)} for ${lang}: ${err.message}`);
    }
  }
  throw new Error(`No translation model could be loaded for ${lang} (${errors.join("; ")})`);
}

/**
 * Translates `texts` with the first fallback model of the language that is not
 * `loadedKey`; null when there is none or it cannot be used.
 */
async function translateWithFallback(lang, loadedKey, texts) {
  const candidate = (MODELS[lang] || []).find((c) => modelKey(c) !== loadedKey);
  if (!candidate) return null;
  let model = null;
  try {
    model = await MarianModel.load(await fetchModel(candidate), { ort, threads: THREADS, targetToken: candidate.targetToken });
    return await model.translate(texts, { beams: BEAMS });
  } catch (err) {
    log(`[translation] fallback ${modelKey(candidate)} for ${lang} unavailable: ${err.message}`);
    return null;
  } finally {
    await model?.release();
  }
}

async function translate(lang, texts) {
  const { model, key } = await loadLanguage(lang);
  const outputs = await model.translate(texts, { beams: BEAMS });
  // Beam search very rarely produces a degenerate sentence, or one that adds
  // something the source does not say. Retry those with greedy decoding, then
  // with the language's other model, and report the ones that still fail as null.
  const brokenIn = (list) => list.filter((i) => looksBroken(texts[i], outputs[i]));
  let suspicious = brokenIn(outputs.map((_, i) => i));
  if (suspicious.length) {
    const retried = await model.translate(suspicious.map((i) => texts[i]), { beams: 1 });
    suspicious.forEach((index, j) => {
      if (!looksBroken(texts[index], retried[j])) outputs[index] = retried[j];
    });
    suspicious = brokenIn(suspicious);
  }
  const alt = [];
  if (suspicious.length) {
    const fallback = await translateWithFallback(lang, key, suspicious.map((i) => texts[i]));
    suspicious.forEach((index, j) => {
      if (fallback && !looksBroken(texts[index], fallback[j])) {
        outputs[index] = fallback[j];
        alt.push(index);
      } else {
        outputs[index] = null;
      }
    });
  }
  return { outputs, model: key, alt };
}

function armIdleTimer() {
  clearTimeout(idleTimer);
  if (busy) return;
  idleTimer = setTimeout(() => {
    if (!busy) process.send?.({ type: "idle" });
  }, IDLE_MS);
}

process.on("message", (msg) => {
  if (!msg || msg.type !== "translate") return;
  busy++;
  clearTimeout(idleTimer);
  chain = chain.then(async () => {
    try {
      const { outputs, model, alt } = await translate(msg.lang, msg.texts);
      process.send?.({ type: "result", id: msg.id, outputs, model, alt });
    } catch (err) {
      process.send?.({ type: "error", id: msg.id, message: err?.message || String(err) });
    } finally {
      busy--;
      armIdleTimer();
    }
  });
});

// Never outlive the web server.
process.on("disconnect", () => process.exit(0));
armIdleTimer();
