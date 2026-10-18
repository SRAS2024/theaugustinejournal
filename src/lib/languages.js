// src/lib/languages.js
// The languages the site is available in. English is the original; the
// others are produced by the self-hosted translation engine.

export const SITE_LANGS = ["en", "es", "pt", "fr", "de", "ru"];
export const TARGET_LANGS = SITE_LANGS.filter((l) => l !== "en");

/** Map any language tag ("pt-BR", "RU", "it") to a site language, defaulting to English. */
export function normalizeLang(lang) {
  if (typeof lang !== "string") return "en";
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return SITE_LANGS.includes(base) ? base : "en";
}
