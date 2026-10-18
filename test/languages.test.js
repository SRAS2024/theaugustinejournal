// test/languages.test.js
// Run: node --test test/languages.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_LANGS, TARGET_LANGS, normalizeLang } from "../src/lib/languages.js";
import { MODELS } from "../src/lib/translation/models.js";
import { unsubscribeToken, validUnsubscribeToken } from "../src/lib/unsubscribe.js";

test("the site speaks English, Spanish, Portuguese, French, German and Russian", () => {
  assert.deepEqual(SITE_LANGS, ["en", "es", "pt", "fr", "de", "ru"]);
  assert.deepEqual(TARGET_LANGS, ["es", "pt", "fr", "de", "ru"]);
});

test("normalizeLang", () => {
  assert.equal(normalizeLang("pt-BR"), "pt");
  assert.equal(normalizeLang("RU"), "ru");
  assert.equal(normalizeLang("it"), "en");
  assert.equal(normalizeLang(["es"]), "en");
  assert.equal(normalizeLang(undefined), "en");
});

test("every target language has a pinned model with checksums", () => {
  for (const lang of TARGET_LANGS) {
    assert.ok(MODELS[lang]?.length, `model for ${lang}`);
    for (const m of MODELS[lang]) {
      assert.match(m.revision, /^[0-9a-f]{40}$/);
      const names = Object.keys(m.files);
      assert.ok(names.includes("config.json") && names.includes("vocab.json") && names.includes("source.spm"));
      assert.ok(names.includes("model.safetensors") || names.includes("pytorch_model.bin"));
      for (const f of Object.values(m.files)) assert.match(f.sha256, /^[0-9a-f]{64}$/);
    }
  }
});

test("unsubscribe tokens are bound to the address", () => {
  process.env.UNSUBSCRIBE_SECRET = "test";
  const token = unsubscribeToken("Reader@Example.com");
  assert.ok(validUnsubscribeToken("reader@example.com", token));
  assert.ok(!validUnsubscribeToken("other@example.com", token));
  assert.ok(!validUnsubscribeToken("reader@example.com", "nope"));
});
