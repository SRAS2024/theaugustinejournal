// test/translation-engine.test.js
// End-to-end check of the translation engine with a real model. Skipped unless
// TRANSLATION_TEST_MODEL_DIR points at a downloaded model directory, e.g. the
// Spanish one created by the app under TRANSLATION_MODEL_DIR:
//   TRANSLATION_TEST_MODEL_DIR=.cache/translation-models/Helsinki-NLP--opus-mt-tc-big-en-es@8f4d49241896 \
//   node --test test/translation-engine.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { SentencePiece } from "../src/lib/translation/sentencepiece.js";

const dir = process.env.TRANSLATION_TEST_MODEL_DIR;
const skip = !dir || !fs.existsSync(path.join(dir, "config.json"));

test("tokenizer round-trips text", { skip }, () => {
  const sp = new SentencePiece(fs.readFileSync(path.join(dir, "source.spm")));
  const pieces = sp.encodeAsPieces("  For what is more beautiful in life than peace?  ");
  assert.equal(SentencePiece.decodePieces(pieces), "For what is more beautiful in life than peace?");
});

test("translates a sentence", { skip, timeout: 120_000 }, async () => {
  const ort = (await import("onnxruntime-node")).default;
  const { MarianModel } = await import("../src/lib/translation/marian.js");
  const model = await MarianModel.load(dir, { ort, threads: 2 });
  try {
    const [out] = await model.translate(["Peace be with you."], { beams: 4 });
    assert.ok(out && out.length > 5, `got "${out}"`);
  } finally {
    await model.release();
  }
});
