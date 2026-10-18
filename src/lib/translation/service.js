// src/lib/translation/service.js
// The site's translation service. It knows which content can be translated
// (post titles and bodies, the home page text and notices), keeps every
// translated sentence in the database, and feeds missing sentences to the
// translation engine in the background — visitors waiting on a page first,
// then everything else, so the whole site is already translated before most
// readers arrive.

import crypto from "crypto";
import { nanoid } from "nanoid";
import { getPrisma } from "../db.js";
import { sanitizeRichHtml } from "../sanitize.js";
import { htmlSegments, translateHtml, textSegments, translateText } from "./html.js";
import { buildCaseStats, isTitleCase, sentenceCase, prepareSource, polishTranslation } from "./text.js";
import { MODELS, modelKey } from "./models.js";
import { TranslationEngine } from "./engine.js";
import { TARGET_LANGS, normalizeLang } from "../languages.js";

/** Bump to retranslate everything (e.g. after changing how sentences are prepared). */
const ENGINE_VERSION = 1;
const BATCH_SIZE = 24;
const PRIORITY = { background: 1, visitor: 2, email: 3 };

const enabled = process.env.TRANSLATION_DISABLED !== "true";
const log = (...args) => console.log(...args);

/* ------------------------------------------------------------------ */
/*  Sentence preparation and hashing                                  */
/* ------------------------------------------------------------------ */

let caseStats = new Map();
let statsReady = null;

const primaryKey = (lang) => modelKey(MODELS[lang][0]);

function prepare(source, stats = caseStats) {
  return prepareSource(isTitleCase(source) ? sentenceCase(source, stats) : source);
}

function hashFor(lang, prepared) {
  return crypto
    .createHash("sha256")
    .update(`${ENGINE_VERSION}\n${lang}\n${primaryKey(lang)}\n${prepared}`)
    .digest("hex");
}

const stripTags = (html) => String(html || "").replace(/<[^>]+>/g, " ");

/** Learn which words this journal capitalizes, from the body text of every post. */
async function refreshCaseStats() {
  const prisma = getPrisma();
  const [posts, settings] = await Promise.all([
    prisma.post.findMany({ select: { contentHtml: true } }),
    prisma.siteSettings.findUnique({ where: { id: 1 } })
  ]);
  caseStats = buildCaseStats([...posts.map((p) => stripTags(p.contentHtml)), stripTags(settings?.aboutHtml)]);
}

function ensureStats() {
  if (!statsReady) {
    statsReady = refreshCaseStats().catch((err) => {
      statsReady = null;
      throw err;
    });
  }
  return statsReady;
}

/* ------------------------------------------------------------------ */
/*  Stored translations                                               */
/* ------------------------------------------------------------------ */

const memory = new Map(); // `${lang}:${hash}` -> { text, model }

async function fetchRows(lang, hashes) {
  const result = new Map();
  const missing = [];
  for (const h of hashes) {
    const hit = memory.get(`${lang}:${h}`);
    if (hit) result.set(h, hit);
    else missing.push(h);
  }
  const prisma = getPrisma();
  for (let i = 0; i < missing.length; i += 1000) {
    const rows = await prisma.translation.findMany({
      where: { lang, sourceHash: { in: missing.slice(i, i + 1000) } },
      select: { sourceHash: true, text: true, model: true }
    });
    for (const r of rows) {
      const value = { text: r.text, model: r.model };
      memory.set(`${lang}:${r.sourceHash}`, value);
      result.set(r.sourceHash, value);
    }
  }
  return result;
}

async function storeRows(lang, rows) {
  const prisma = getPrisma();
  await prisma.$transaction(
    rows.map((r) =>
      prisma.translation.upsert({
        where: { lang_sourceHash: { lang, sourceHash: r.hash } },
        create: { id: nanoid(), lang, sourceHash: r.hash, source: r.prepared, text: r.text, model: r.model },
        update: { text: r.text, model: r.model }
      })
    )
  );
  for (const r of rows) memory.set(`${lang}:${r.hash}`, { text: r.text, model: r.model });
}

/* ------------------------------------------------------------------ */
/*  Work queue                                                        */
/* ------------------------------------------------------------------ */

let engine = null;
const queue = new Map(); // `${lang}:${hash}` -> job
const inflight = new Map();
const failures = new Map(); // `${lang}:${hash}` -> attempts
let pumping = false;
let retryTimer = null;
let sequence = 0;
let cooldownUntil = 0; // after a failed batch, wait before trying again

/** Queue a prepared sentence; resolves once it is stored (or given up on). */
function enqueue(lang, prepared, hash, priority) {
  const id = `${lang}:${hash}`;
  const existing = queue.get(id) || inflight.get(id);
  if (existing) {
    existing.priority = Math.max(existing.priority, priority);
    return existing.done;
  }
  let resolveDone;
  const job = { id, lang, prepared, hash, priority, seq: sequence++, done: null };
  job.done = new Promise((resolve) => (resolveDone = resolve));
  job.resolve = resolveDone;
  queue.set(id, job);
  setImmediate(pump);
  return job.done;
}

function nextBatch() {
  let best = null;
  for (const job of queue.values()) {
    if (!best || job.priority > best.priority || (job.priority === best.priority && job.seq < best.seq)) best = job;
  }
  if (!best) return null;
  // A visitor or e-mail waiting on a sentence does not wait for background work too.
  return [...queue.values()]
    .filter((j) => j.lang === best.lang && j.priority >= best.priority)
    .sort((a, b) => b.priority - a.priority || a.seq - b.seq)
    .slice(0, BATCH_SIZE);
}

async function pump() {
  if (pumping || !enabled || Date.now() < cooldownUntil) return;
  pumping = true;
  try {
    for (;;) {
      const batch = nextBatch();
      if (!batch) break;
      const lang = batch[0].lang;
      for (const job of batch) {
        queue.delete(job.id);
        inflight.set(job.id, job);
      }
      try {
        engine ||= new TranslationEngine({ log });
        const { outputs, model } = await engine.run(lang, batch.map((j) => j.prepared));
        const rows = batch.map((job, i) => ({
          hash: job.hash,
          prepared: job.prepared,
          // A sentence the model could not translate is kept in English.
          text: outputs[i] ?? job.prepared,
          model: outputs[i] == null ? `${model}#untranslated` : model
        }));
        await storeRows(lang, rows);
        for (const job of batch) {
          inflight.delete(job.id);
          job.resolve(true);
        }
      } catch (err) {
        log(`[translation] batch of ${batch.length} (${lang}) failed: ${err.message}`);
        for (const job of batch) {
          inflight.delete(job.id);
          const attempts = (failures.get(job.id) || 0) + 1;
          failures.set(job.id, attempts);
          if (attempts < 4) {
            job.seq += 1e6; // retry after the rest of the queue
            queue.set(job.id, job);
          } else {
            job.resolve(false);
          }
        }
        // Give a crashed worker or an unreachable model host a moment
        // (new visitor requests must not retry any sooner).
        cooldownUntil = Date.now() + 60 * 1000;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(pump, 60 * 1000 + 50);
        retryTimer.unref?.();
        break;
      }
    }
  } finally {
    pumping = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Content                                                           */
/* ------------------------------------------------------------------ */

const isHtmlKey = (key) => key === "site:about" || key.endsWith(":body");
// The site never asks for more than one or two bodies at once; each costs real CPU.
const MAX_HTML_KEYS = 4;

const KEY_RE = /^(?:post:([\w-]{1,64}):(title|body)|site:about|notice:([\w-]{1,64}))$/;

/** Load the translatable content behind each key. */
async function loadContent(keys) {
  const prisma = getPrisma();
  const postIds = new Set();
  const noticeIds = new Set();
  let about = false;
  for (const key of keys) {
    const m = KEY_RE.exec(key);
    if (!m) continue;
    if (m[1]) postIds.add(m[1]);
    else if (m[3]) noticeIds.add(m[3]);
    else about = true;
  }
  const [posts, notices, settings] = await Promise.all([
    postIds.size
      ? prisma.post.findMany({
          where: { id: { in: [...postIds] } },
          select: { id: true, title: true, contentHtml: true, autoTranslateTitle: true }
        })
      : [],
    noticeIds.size ? prisma.notice.findMany({ where: { id: { in: [...noticeIds] } } }) : [],
    about ? prisma.siteSettings.findUnique({ where: { id: 1 } }) : null
  ]);
  const byPost = new Map(posts.map((p) => [p.id, p]));
  const byNotice = new Map(notices.map((n) => [n.id, n]));
  const out = [];
  for (const key of keys) {
    const m = KEY_RE.exec(key);
    if (!m) continue;
    if (m[1]) {
      const post = byPost.get(m[1]);
      if (!post) continue;
      if (m[2] === "title") {
        if (post.autoTranslateTitle !== false) out.push({ key, kind: "text", value: post.title });
      } else {
        out.push({ key, kind: "html", value: post.contentHtml || "" });
      }
    } else if (m[3]) {
      const notice = byNotice.get(m[3]);
      if (notice) out.push({ key, kind: "text", value: notice.message });
    } else if (settings) {
      out.push({ key, kind: "html", value: settings.aboutHtml || "" });
    }
  }
  return out;
}

function sourcesOf(item) {
  return item.kind === "html" ? htmlSegments(item.value) : textSegments(item.value);
}

/** Everything the site can translate (used by the background pass). */
async function allContent() {
  const prisma = getPrisma();
  const [posts, notices, settings] = await Promise.all([
    prisma.post.findMany({ select: { id: true, title: true, contentHtml: true, autoTranslateTitle: true } }),
    prisma.notice.findMany(),
    prisma.siteSettings.findUnique({ where: { id: 1 } })
  ]);
  const items = [];
  for (const p of posts) {
    if (p.autoTranslateTitle !== false) items.push({ kind: "text", value: p.title });
    items.push({ kind: "html", value: p.contentHtml || "" });
  }
  for (const n of notices) items.push({ kind: "text", value: n.message });
  if (settings) items.push({ kind: "html", value: settings.aboutHtml || "" });
  return items;
}

/**
 * Render the translated version of content items for one language. Missing
 * sentences are queued with `priority` and the item is reported incomplete.
 */
async function renderItems(lang, items, priority, stats) {
  if (!stats) {
    await ensureStats();
    stats = caseStats;
  }
  const prepared = new Map(); // source -> { prepared, hash }
  const seg = (source) => {
    let s = prepared.get(source);
    if (!s) {
      const p = prepare(source, stats);
      s = { prepared: p, hash: hashFor(lang, p) };
      prepared.set(source, s);
    }
    return s;
  };
  for (const item of items) for (const source of sourcesOf(item)) seg(source);

  const rows = await fetchRows(lang, [...new Set([...prepared.values()].map((s) => s.hash))]);
  const lookup = (source) => {
    const s = seg(source);
    const row = rows.get(s.hash);
    if (!row) return undefined;
    // The model could not translate it: show the author's own wording.
    if (row.model.endsWith("#untranslated")) return source;
    return polishTranslation(source, row.text, lang);
  };

  const waits = [];
  for (const s of prepared.values()) {
    if (!rows.has(s.hash)) waits.push(enqueue(lang, s.prepared, s.hash, priority));
  }

  const results = {};
  for (const item of items) {
    if (item.kind === "html") {
      const r = translateHtml(item.value, lookup);
      results[item.key] = { html: sanitizeRichHtml(r.html), complete: r.complete, progress: r.total ? r.done / r.total : 1 };
    } else {
      const text = translateText(item.value, lookup);
      results[item.key] = text === null ? { complete: false, progress: 0 } : { text, complete: true, progress: 1 };
    }
  }
  return { results, waits, stats };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Translations of the requested content keys, e.g. "post:<id>:title",
 * "post:<id>:body", "site:about", "notice:<id>".
 */
export async function getTranslations(langInput, keys) {
  const lang = normalizeLang(langInput);
  let htmlKeys = 0;
  const unique = [...new Set(keys)]
    .filter((k) => KEY_RE.test(k) && (!isHtmlKey(k) || ++htmlKeys <= MAX_HTML_KEYS))
    .slice(0, 80);
  if (!enabled || lang === "en" || !unique.length) return { lang, items: {}, pending: false };
  const items = await loadContent(unique);
  const { results } = await renderItems(lang, items, PRIORITY.visitor);
  return { lang, items: results, pending: Object.values(results).some((r) => !r.complete) };
}

/** Translate a plain-text value (e.g. a post title for an e-mail), waiting up to `timeoutMs`. */
export async function translatePlainText(text, langInput, { timeoutMs = 60_000 } = {}) {
  const lang = normalizeLang(langInput);
  if (!enabled || lang === "en" || !String(text || "").trim()) return text;
  const item = { key: "x", kind: "text", value: text };
  const first = await renderItems(lang, [item], PRIORITY.email);
  if (first.results.x.complete) return first.results.x.text;
  let timer;
  await Promise.race([Promise.all(first.waits), new Promise((r) => (timer = setTimeout(r, timeoutMs)))]);
  clearTimeout(timer);
  // Same case statistics as the first pass, so the sentences hash the same
  // even if a background pass refreshed them meanwhile.
  const { results } = await renderItems(lang, [item], PRIORITY.email, first.stats);
  return results.x.complete ? results.x.text : text;
}

/** Translate a post title for an e-mail, honouring the post's "auto translate title" setting. */
export function translatePostTitle(post, lang, options) {
  if (!post || post.autoTranslateTitle === false) return Promise.resolve(post?.title || "");
  return translatePlainText(post.title, lang, options);
}

let backfillTimer = null;
let backfillRunning = false;
let backfillAgain = false;

/** Queue every sentence of the site that is not translated yet (low priority). */
async function backfill() {
  if (!enabled) return;
  if (backfillRunning) {
    backfillAgain = true;
    return;
  }
  backfillRunning = true;
  try {
    statsReady = null;
    await ensureStats();
    const items = await allContent();
    const sources = new Set();
    for (const item of items) for (const s of sourcesOf(item)) sources.add(s);
    let queued = 0;
    for (const lang of TARGET_LANGS) {
      const primary = primaryKey(lang);
      const segs = [...sources].map((s) => {
        const p = prepare(s);
        return { prepared: p, hash: hashFor(lang, p) };
      });
      const rows = await fetchRows(lang, [...new Set(segs.map((s) => s.hash))]);
      const seen = new Set();
      for (const s of segs) {
        if (seen.has(s.hash)) continue;
        seen.add(s.hash);
        const row = rows.get(s.hash);
        // Missing, left untranslated, or produced by a fallback model while the
        // main one was unavailable.
        if (!row || !row.model.startsWith(primary) || row.model.endsWith("#untranslated")) {
          enqueue(lang, s.prepared, s.hash, PRIORITY.background);
          queued++;
        }
      }
    }
    if (queued) log(`[translation] queued ${queued} sentence translation(s) in the background`);
  } catch (err) {
    log("[translation] background pass failed:", err?.message || err);
  } finally {
    backfillRunning = false;
    if (backfillAgain) {
      backfillAgain = false;
      scheduleBackfill();
    }
  }
}

/** Call after content changes; translations are prepared shortly afterwards. */
export function scheduleBackfill(delayMs = 5000) {
  if (!enabled) return;
  clearTimeout(backfillTimer);
  backfillTimer = setTimeout(() => {
    backfill().catch(() => {});
  }, delayMs);
  backfillTimer.unref?.();
}

export function startTranslationService() {
  if (!enabled) {
    log("[translation] disabled (TRANSLATION_DISABLED=true)");
    return;
  }
  scheduleBackfill(20_000);
}

export function stopTranslationService() {
  clearTimeout(backfillTimer);
  clearTimeout(retryTimer);
  engine?.stop();
}
