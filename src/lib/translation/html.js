// src/lib/translation/html.js
// Turns stored post HTML into sentences for the translation model and puts
// the translated sentences back, keeping the document structure: paragraphs,
// headings, lists, links, line breaks and inline emphasis.
//
// Every paragraph (more precisely: every run of inline content between block
// elements) is translated as a whole or not at all, so a page that is still
// being translated never mixes languages inside one paragraph.

import { parseDocument } from "htmlparser2";
import { Element, Text } from "domhandler";
import render from "dom-serializer";
import { splitSentences, limitLength } from "./text.js";
import { referenceLabel } from "../post-format.js";

const SKIP = new Set([
  "script", "style", "code", "pre", "kbd", "samp", "var", "svg", "math", "textarea", "select",
  "noscript", "iframe", "object", "template", "head"
]);
const BLOCKS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "dl", "dt", "dd", "blockquote", "div",
  "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption", "table",
  "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "details", "summary", "address", "hr",
  "form", "fieldset", "legend", "body", "html"
]);
// Elements that stay exactly as they are (and split the surrounding text).
const ATOMS = new Set(["br", "img", "wbr", "input", "button", "audio", "video", "canvas", "picture", "embed"]);

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"“”‘’]*[^\s<>"“”‘’.,;:!?)\]]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;
const HAS_LETTER = /\p{L}/u;

function isTag(node) {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function noTranslate(el) {
  const attrs = el.attribs || {};
  if (attrs.translate === "no") return true;
  if (Object.prototype.hasOwnProperty.call(attrs, "data-no-translate")) return true;
  return /(^|\s)notranslate(\s|$)/.test(attrs.class || "");
}

function containsBlock(node) {
  for (const child of node.children || []) {
    if (isTag(child) && (BLOCKS.has(child.name) || containsBlock(child))) return true;
  }
  return false;
}

/** Text that should be left as is: URLs, e-mail addresses, numbers and symbols only. */
function looksUntranslatable(text) {
  const t = text.trim();
  if (!HAS_LETTER.test(t)) return true;
  URL_RE.lastIndex = 0;
  const m = URL_RE.exec(t);
  if (m && m[0].length === t.length) return true;
  if (/^(?:\[[^\]]*\]\s*)+$/.test(t)) return true; // footnote markers such as [USCCB][1]
  return /^[\w-]+(\.[\w-]+)+\/?$/.test(t); // bare domains such as hawking.org.uk
}

/* ------------------------------------------------------------------ */
/*  Inline runs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Flatten inline nodes into items: { text, marks } for text and
 * { node, marks } for atoms. `marks` lists the inline ancestor elements
 * (outermost first) inside the run.
 */
function flatten(nodes, marks, out) {
  for (const node of nodes) {
    if (node.type === "text") {
      let last = 0;
      URL_RE.lastIndex = 0;
      for (const m of node.data.matchAll(URL_RE)) {
        if (m.index > last) out.push({ text: node.data.slice(last, m.index), marks });
        out.push({ literal: m[0], marks });
        last = m.index + m[0].length;
      }
      if (last < node.data.length) out.push({ text: node.data.slice(last), marks });
    } else if (isTag(node)) {
      const name = node.name;
      if (ATOMS.has(name) || SKIP.has(name) || noTranslate(node)) {
        out.push({ node, marks });
      } else if (name === "a") {
        const label = textOf(node);
        if (looksUntranslatable(label)) out.push({ node, marks });
        else flatten(node.children || [], marks.concat(node), out);
      } else {
        flatten(node.children || [], marks.concat(node), out);
      }
    } else {
      out.push({ node, marks }); // comments, CDATA …
    }
  }
  return out;
}

function textOf(node) {
  if (node.type === "text") return node.data;
  return (node.children || []).map(textOf).join("");
}

const linkOf = (marks) => marks.find((m) => m.name === "a") || null;
const sameMarks = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

/**
 * Group the items of a run into chunks of text separated by atoms, line
 * breaks and link edges. Each chunk becomes one or more sentences.
 */
function chunk(items) {
  const parts = []; // { kind: 'chunk', tokens: [...] } | { kind: 'keep', item }
  let current = null;
  for (const item of items) {
    if (item.text === undefined) {
      current = null;
      parts.push({ kind: "keep", item });
      continue;
    }
    if (current && linkOf(current.tokens[current.tokens.length - 1].marks) !== linkOf(item.marks)) current = null;
    if (!current) {
      current = { kind: "chunk", tokens: [] };
      parts.push(current);
    }
    current.tokens.push(item);
  }
  return parts;
}

/**
 * Describe one chunk as sentences. Returns { lead, trail, sentences } where each
 * sentence is { source, marks, spans } — spans are emphasized sub-phrases
 * ({ source, marks }) to re-apply after translating the plain sentence.
 */
function describeChunk(tokens) {
  const full = tokens.map((t) => t.text).join("");
  const lead = full.match(/^\s*/)[0];
  const trail = full.slice(lead.length).match(/\s*$/)[0];
  const coreStart = lead.length;
  const coreEnd = full.length - trail.length;
  if (coreEnd <= coreStart) return { lead: full, trail: "", sentences: [], full };

  // Character -> token index.
  const owner = new Int32Array(full.length);
  let pos = 0;
  tokens.forEach((t, i) => {
    owner.fill(i, pos, pos + t.text.length);
    pos += t.text.length;
  });

  const core = full.slice(coreStart, coreEnd);
  const pieces = [];
  let offset = coreStart;
  for (const s of splitSentences(core)) {
    for (const part of limitLength(s.text)) {
      const start = Math.min(offset, coreEnd);
      pieces.push({ start, end: Math.min(start + part.text.length, coreEnd) });
      offset += part.text.length + part.after.length;
    }
    offset = pieces[pieces.length - 1].end + s.after.length;
  }

  let prevEnd = -1;
  const sentences = pieces.filter(({ start, end }) => end > start).map(({ start, end }) => {
    const raw = full.slice(start, end);
    // What separated it from the previous piece: normally a space, nothing
    // where a long sentence was cut at "word —next".
    const gap = prevEnd < 0 || start > prevEnd ? " " : "";
    prevEnd = end;
    // Marks used by the non-space characters of this sentence, with char counts.
    const runs = [];
    for (let c = start; c < end; c++) {
      const t = tokens[owner[c]];
      const last = runs[runs.length - 1];
      if (last && sameMarks(last.marks, t.marks)) last.end = c + 1;
      else runs.push({ marks: t.marks, start: c, end: c + 1 });
    }
    // The sentence's base formatting is what all of its words share; other
    // formatting becomes spans that are re-applied after translation.
    const visibleRuns = runs.filter((r) => HAS_LETTER.test(full.slice(r.start, r.end)));
    let base = (visibleRuns[0] || runs[0]).marks;
    for (const r of visibleRuns) {
      let k = 0;
      while (k < base.length && k < r.marks.length && base[k] === r.marks[k]) k++;
      base = base.slice(0, k);
    }
    const spans = visibleRuns
      .filter((r) => !sameMarks(r.marks, base))
      .map((r) => ({ source: full.slice(r.start, r.end).trim(), marks: r.marks }));
    return { source: raw.replace(/\s+/g, " ").trim(), marks: base, spans, gap };
  });
  return { lead, trail, sentences, full };
}

/* ------------------------------------------------------------------ */
/*  Building nodes                                                    */
/* ------------------------------------------------------------------ */

function cloneShallow(el) {
  return new Element(el.name, { ...el.attribs }, []);
}

/** Build DOM nodes from items, nesting runs that share the same mark elements. */
function build(items, depth = 0) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.marks.length > depth) {
      const el = item.marks[depth];
      let j = i;
      while (j < items.length && items[j].marks.length > depth && items[j].marks[depth] === el) j++;
      const clone = cloneShallow(el);
      clone.children = build(items.slice(i, j), depth + 1);
      for (const c of clone.children) c.parent = clone;
      out.push(clone);
      i = j;
    } else {
      out.push(item.node || new Text(item.text ?? item.literal));
      i++;
    }
  }
  return out;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Place each emphasized phrase's translation inside the translated sentence. */
function applySpans(translated, sentence, lookup) {
  let pieces = [{ text: translated, marks: sentence.marks }];
  for (const span of sentence.spans) {
    const phrase = lookup(span.source);
    if (!phrase) continue;
    const needle = phrase.replace(/[.!?;:,]+$/, "").trim();
    if (needle.length < 2) continue;
    // Whole words only: "es" must not match inside "Esto".
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, "iu");
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.marks !== sentence.marks) continue;
      const m = re.exec(p.text);
      if (!m) continue;
      const at = m.index;
      const before = p.text.slice(0, at);
      const match = m[0];
      const after = p.text.slice(at + match.length);
      const replacement = [];
      if (before) replacement.push({ text: before, marks: sentence.marks });
      replacement.push({ text: match, marks: span.marks });
      if (after) replacement.push({ text: after, marks: sentence.marks });
      pieces.splice(i, 1, ...replacement);
      break;
    }
  }
  return pieces;
}

/* ------------------------------------------------------------------ */
/*  Walking the document                                              */
/* ------------------------------------------------------------------ */

const hasClass = (el, name) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(el.attribs?.class || "");
const hasBreak = (node) => (node.children || []).some((c) => (isTag(c) && c.name === "br") || hasBreak(c));
const TEXT_BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

// The reference list as the post formatter (src/lib/post-format.js) marks it.
// It starts at a pdf-ref-heading, which the formatter gives every label it
// takes for the start of the references ("Notes" or "Sources" too, when a
// citation follows), or at a line of its own reading References,
// Bibliography, Works Cited or the like. "Notes" or "Sources" without the
// class is a section of the essay. The list ends at the next heading of the
// essay (h1-h4 without the class).
function isReferenceHeading(el) {
  if (hasClass(el, "pdf-ref-heading")) return true;
  return TEXT_BLOCKS.has(el.name) && !hasBreak(el) && referenceLabel(textOf(el)) === "strong";
}

const isBodyHeading = (el) => /^h[1-4]$/.test(el.name) && !hasClass(el, "pdf-ref-heading");

/** Bibliography entries stay in their original language. */
function keepEnglish(el) {
  if (el.attribs && !el.attribs.lang) el.attribs.lang = "en";
}

/**
 * Visit every inline run. `onRun(items, parent, nodes)` may return
 * replacement nodes for the run. The reference list, from its heading (which
 * is translated) to the next heading of the essay, is left untranslated.
 */
function walk(container, onRun, state = { references: false }) {
  const children = container.children || [];
  const next = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const replacement = onRun(run);
    for (const node of replacement || run) next.push(node); // no spread: runs can be huge
    run = [];
  };
  for (const child of children) {
    if (isTag(child) && (SKIP.has(child.name) || noTranslate(child))) {
      flush();
      next.push(child);
    } else if (isTag(child) && (BLOCKS.has(child.name) || containsBlock(child))) {
      flush();
      if (state.references && isBodyHeading(child)) state.references = false;
      if (state.references || hasClass(child, "pdf-ref-entry")) {
        keepEnglish(child);
      } else {
        // Checked on the English text, before the heading itself is translated.
        const heading = isReferenceHeading(child);
        walk(child, onRun, state);
        if (heading) state.references = true;
      }
      next.push(child);
    } else if (state.references) {
      flush();
      next.push(child);
    } else {
      run.push(child);
    }
  }
  flush();
  container.children = next;
  for (const c of next) c.parent = container;
}

function runSentences(nodes) {
  const items = flatten(nodes, [], []);
  return chunk(items).map((part) => (part.kind === "chunk" ? { ...part, desc: describeChunk(part.tokens) } : part));
}

/** All source strings (sentences and emphasized phrases) in an HTML fragment. */
export function htmlSegments(html) {
  const doc = parseDocument(String(html || ""));
  const out = new Set();
  walk(doc, (nodes) => {
    for (const part of runSentences(nodes)) {
      if (part.kind !== "chunk") continue;
      for (const s of part.desc.sentences) {
        if (looksUntranslatable(s.source)) continue;
        out.add(s.source);
        for (const span of s.spans) if (!looksUntranslatable(span.source)) out.add(span.source);
      }
    }
    return null;
  });
  return [...out];
}

/**
 * Rebuild the fragment with translations. `lookup(source)` returns the
 * finished translation of a sentence or undefined. A run is only replaced when
 * every sentence in it has a translation.
 * @returns {{ html: string, complete: boolean, total: number, done: number }}
 */
export function translateHtml(html, lookup) {
  const doc = parseDocument(String(html || ""));
  let total = 0;
  let done = 0;
  walk(doc, (nodes) => {
    const parts = runSentences(nodes);
    let needed = 0;
    let have = 0;
    for (const part of parts) {
      if (part.kind !== "chunk") continue;
      for (const s of part.desc.sentences) {
        if (looksUntranslatable(s.source)) continue;
        needed++;
        if (lookup(s.source) !== undefined) have++;
      }
    }
    total += needed;
    done += have;
    if (!needed || have < needed) return null;

    const items = [];
    for (const part of parts) {
      if (part.kind === "keep") {
        items.push(part.item);
        continue;
      }
      const { lead, trail, sentences, full } = part.desc;
      const edgeMarks = part.tokens[0].marks;
      if (!sentences.length) {
        items.push({ text: full, marks: edgeMarks });
        continue;
      }
      if (lead) items.push({ text: lead, marks: edgeMarks });
      sentences.forEach((s, i) => {
        if (i > 0 && s.gap) items.push({ text: s.gap, marks: s.marks.length <= sentences[i - 1].marks.length ? s.marks : sentences[i - 1].marks });
        if (looksUntranslatable(s.source)) {
          items.push({ text: s.source, marks: s.marks });
          return;
        }
        const translated = lookup(s.source);
        const pieces = s.spans.length ? applySpans(translated, s, lookup) : [{ text: translated, marks: s.marks }];
        for (const piece of pieces) items.push(piece);
      });
      if (trail) items.push({ text: trail, marks: part.tokens[part.tokens.length - 1].marks });
    }
    return build(items);
  });
  return { html: render(doc, { encodeEntities: "utf8" }), complete: done === total, total, done };
}

/** Split text around URLs and e-mail addresses, which are never translated. */
function urlPieces(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ literal: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The translatable pieces of a plain-text value, in order. */
function textParts(text) {
  const out = [];
  for (const s of splitSentences(String(text || "").replace(/\s+/g, " ").trim())) {
    const pieces = [];
    for (const part of limitLength(s.text)) {
      for (const piece of urlPieces(part.text)) {
        if (piece.literal !== undefined) pieces.push({ keep: piece.literal });
        else {
          const lead = piece.text.match(/^\s*/)[0];
          const core = piece.text.trim();
          const trail = core ? piece.text.match(/\s*$/)[0] : "";
          if (!core || looksUntranslatable(core)) pieces.push({ keep: piece.text });
          else pieces.push({ lead, source: core, trail });
        }
      }
      pieces.push({ keep: part.after });
    }
    out.push(pieces);
  }
  return out;
}

/** Sentences of a plain-text value (titles, notices). */
export function textSegments(text) {
  return textParts(text).flatMap((pieces) => pieces.filter((p) => p.source).map((p) => p.source));
}

/** Translate a plain-text value; returns null until every sentence is available. */
export function translateText(text, lookup) {
  const sentences = [];
  for (const pieces of textParts(text)) {
    let out = "";
    for (const p of pieces) {
      if (p.keep !== undefined) {
        out += p.keep;
        continue;
      }
      const t = lookup(p.source);
      if (t === undefined) return null;
      out += p.lead + t + p.trail;
    }
    sentences.push(out.trim());
  }
  return sentences.join(" ");
}

/** Readable plain text of an HTML fragment (blocks separated by spaces, entities decoded). */
export function plainText(html) {
  const doc = parseDocument(String(html || ""));
  const parts = [];
  const visit = (node) => {
    if (node.type === "text") {
      parts.push(node.data);
      return;
    }
    if (!isTag(node) && node.type !== "root") return;
    if (isTag(node) && (SKIP.has(node.name) && node.name !== "pre" && node.name !== "code")) return;
    const block = isTag(node) && (BLOCKS.has(node.name) || node.name === "br");
    if (block) parts.push(" ");
    for (const child of node.children || []) visit(child);
    if (block) parts.push(" ");
  };
  visit(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}
