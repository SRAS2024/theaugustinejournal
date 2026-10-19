// src/lib/pdf-text.js
//
// Turns an uploaded PDF into the HTML stored for PDF-mode posts.
//
// pdf-parse's default page renderer joins every text line with a single "\n",
// so it loses every paragraph break. extractPdfHtml() therefore reads the
// positioned text items of each page (getTextContent) and rebuilds lines and
// paragraphs from the geometry: vertical gaps, font-size changes, first-line
// and hanging indents, and lines that end short of the right margin.
// pdfTextToHtml() runs the same paragraph -> HTML pass on plain text, where a
// blank line separates paragraphs, "\f" separates pages and leading spaces
// mark a first-line indent.
//
// Output: <div class="pdf-text"> with <p>, <p class="pdf-indent">,
// <h3 class="pdf-ref-heading"> and <p class="pdf-ref-entry"> (see the
// .pdf-text rules in public/css/styles.css). All text is HTML-escaped.

import pdfParse from "pdf-parse";

/* ------------------------------------------------------------------ */
/*  Text helpers                                                       */
/* ------------------------------------------------------------------ */

const LIGATURES = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st"
};

// A References / Bibliography / Works Cited heading (also in the site's other
// languages). Matched against a whole one-line block. Also used by
// post-format.js.
export const REF_HEADING_RE = new RegExp(
  "^(?:references|reference list|bibliography|select bibliography|works?\\s*cited|sources(?:\\s+cited)?" +
  "|referencias|bibliograf[ií]a|refer[eê]ncias|r[ée]f[ée]rences|bibliographie" +
  "|literatur(?:verzeichnis)?|quellen(?:verzeichnis)?|список литературы|литература|источники)$",
  "iu"
);

// Sentence-final punctuation, optionally followed by closing quotes/brackets
// and a footnote number ("...end.3").
const TERMINAL_RE = /[.!?…:;]["'”’»)\]]*\d{0,3}$/u;
// A single capital that is not a one-letter word in the site's languages
// ("I", "A", "O", "Y", Russian "Я"...): when it sits alone on the first line
// of a paragraph it is a drop cap.
const DROP_CAP_RE = /^(?![AEIOUYÀÉАВИКОСУЯ]$)\p{Lu}$/u;
// Anything a section heading or title never ends with.
const HEADING_END_RE = /[.!?…,;:]["'”’»)\]]*$/u;
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or",
  "the", "to", "with", "vs", "de", "del", "la", "las", "los", "el", "y", "e", "o", "da", "do", "das",
  "dos", "em", "le", "les", "des", "du", "et", "à", "au", "aux", "und", "der", "die", "den",
  "dem", "im", "zu", "von", "и", "в", "во", "на", "о", "об", "с", "к", "по"
]);

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Normalise characters pdf.js hands back: ligature glyphs, exotic spaces and
// invisible control characters.
function cleanText(str) {
  return String(str)
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c])
    .replace(/[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u0000-\u0008\u000A-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "");
}

function squash(str) {
  return str.replace(/\s+/g, " ").trim();
}

function endsSentence(text) {
  return TERMINAL_RE.test(text.trim());
}

function hasLetter(text) {
  return /\p{L}/u.test(text);
}

// Titles and headings have at least a short word in them; a lone "I" or a
// stray initial never counts.
function hasWord(text) {
  return text.replace(/[^\p{L}]/gu, "").length >= 3;
}

function letterWords(text) {
  return text.split(/\s+/).map((w) => w.replace(/[^\p{L}'’-]/gu, "")).filter((w) => hasLetter(w));
}

function isAllCaps(text) {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

// "On the Restless Heart", "Memory and Time": every significant word is
// capitalised. Also used by post-format.js.
export function isTitleCase(text) {
  const words = letterWords(text);
  if (!words.length) return false;
  return words.every((w, i) => /^\p{Lu}/u.test(w) || (i > 0 && SMALL_WORDS.has(w.toLowerCase())));
}

// Leading section numbers ("1.", "2.3", "IV.") are ignored by the heading tests.
export function stripEnumerator(text) {
  return text.replace(/^(?:\d+(?:\.\d+)*\.?|[IVXLC]+\.)\s+(?=\p{L})/u, "");
}

function romanToInt(s) {
  const values = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = values[s[i]];
    const next = values[s[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return total;
}

// Value of a page-number line ("7", "- 7 -", "Page 7", "7 of 12", "7/12",
// "vii"), or null. Roman numerals must be lowercase and well formed, so the
// pronoun "I" or a drop-cap letter can never match.
function pageNumberValue(text) {
  const t = squash(text);
  let m = t.match(/^[-–—]?\s*(\d{1,4})\s*[-–—]?$/);
  if (m) return Number(m[1]);
  m = t.match(/^(?:page|pg\.?|p\.|página|pagina|seite|s\.|стр\.?|страница)\s*(\d{1,4})(?:\s*(?:of|de|sur|von|из|\/)\s*\d{1,4})?$/iu);
  if (m) return Number(m[1]);
  m = t.match(/^(\d{1,4})\s*(?:of|de|sur|von|из|\/)\s*\d{1,4}$/iu);
  if (m) return Number(m[1]);
  m = t.match(/^[-–—]?\s*(c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))\s*[-–—]?$/);
  if (m && m[1]) return romanToInt(m[1]);
  return null;
}

// Running headers/footers are compared with their page number masked, so
// "Doe 3" and "Doe 4" are the same line. Other numbers are kept: footnotes
// "3 Ibid." and "7 Ibid." stay different.
function edgeKey(text, pageIndex, pageOffsets) {
  return squash(text).toLowerCase().replace(/\d+/g, (d) => (pageOffsets.has(Number(d) - pageIndex) ? "#" : d));
}

/* ------------------------------------------------------------------ */
/*  Layout: positioned text items -> lines                             */
/* ------------------------------------------------------------------ */

function isHorizontal(t) {
  // Baseline runs left to right; t[2] may be non-zero for slanted (italic) text.
  return t[0] > 0 && t[3] > 0 && Math.abs(t[1]) <= 0.05 * t[0];
}

function finishLine(line) {
  const text = line.text.replace(/\s+$/, "");
  let best = null;
  for (const [size, count] of line.sizes) {
    if (!best || count > best[1]) best = [size, count];
  }
  line.text = text;
  line.size = best ? best[0] : line.refSize;
  line.width = Math.max(0, line.right - line.left);
  delete line.sizes;
  return line;
}

// Lines without geometry, split where the baseline moves (what pdf-parse
// does by default, also for text turned sideways). Used for rotated text and
// as a safety net.
function plainLines(items) {
  const lines = [];
  let lastBase;
  for (const it of items) {
    if (!it || typeof it.str !== "string") continue;
    const t = Array.isArray(it.transform) ? it.transform : null;
    const base = t ? (Math.abs(t[0]) >= Math.abs(t[1]) ? t[5] : t[4]) : lastBase;
    if (!lines.length || base !== lastBase) lines.push({ text: "", plain: true });
    lines[lines.length - 1].text += cleanText(it.str);
    lastBase = base;
  }
  return lines.map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text);
}

// Groups the text items of one page into lines, in content-stream order.
// Superscripts (footnote markers) stay on their line; a drop cap does not.
function collectLines(items) {
  const usable = [];
  let horizontalChars = 0;
  let totalChars = 0;
  for (const it of items) {
    if (!it || typeof it.str !== "string" || !Array.isArray(it.transform)) continue;
    const str = cleanText(it.str);
    if (!str) continue;
    const chars = str.replace(/\s/g, "").length;
    totalChars += chars;
    if (isHorizontal(it.transform)) horizontalChars += chars;
    usable.push({ str, t: it.transform, width: Number(it.width) || 0, chars });
  }
  if (!totalChars) return [];

  // Mostly rotated text: geometry is not usable, keep the plain lines.
  if (horizontalChars < totalChars * 0.5) return plainLines(items);

  const lines = [];
  let line = null;
  for (const it of usable) {
    const t = it.t;
    if (!isHorizontal(t)) continue;
    const size = Math.abs(t[3]);
    if (size < 1) continue;
    const x = t[4];
    const y = t[5];
    const width = it.width > 0 ? it.width : it.str.length * size * 0.5;
    const charW = width / it.str.length;
    const lead = it.str.length - it.str.trimStart().length;
    const trail = it.str.length - it.str.trimEnd().length;

    let same = false;
    if (line) {
      const dy = Math.abs(y - line.refY);
      const small = Math.min(size, line.refSize);
      const big = Math.max(size, line.refSize);
      if (x >= line.left - 2 * small) {
        if (dy <= 0.5 * small) same = true;
        // Superscript / subscript next to normal text.
        else if (big <= 2 * small && dy <= 0.45 * big && x >= line.rawRight - small) same = true;
      }
    }
    if (!same) {
      if (line && line.chars) lines.push(finishLine(line));
      line = {
        text: "",
        left: Infinity,
        right: -Infinity,
        rawRight: x,
        refY: y,
        refSize: size,
        refChars: 0,
        y,
        chars: 0,
        sizes: new Map()
      };
    }

    const gap = x - line.rawRight;
    if (line.text && !/\s$/.test(line.text) && !/^\s/.test(it.str) && gap > 0.15 * Math.min(size, line.refSize)) {
      line.text += " ";
    }
    line.text += line.text ? it.str : it.str.trimStart();
    line.rawRight = Math.max(line.rawRight, x + width);
    if (it.chars) {
      line.left = Math.min(line.left, x + lead * charW);
      line.right = Math.max(line.right, x + width - trail * charW);
      line.chars += it.chars;
      const key = Math.round(size * 2) / 2;
      line.sizes.set(key, (line.sizes.get(key) || 0) + it.chars);
      if (it.chars > line.refChars) {
        // The longest run decides the line's baseline.
        line.refChars = it.chars;
        line.refY = y;
        line.refSize = size;
        line.y = y;
      }
    }
  }
  if (line && line.chars) lines.push(finishLine(line));
  return lines;
}

function weightedMode(entries) {
  const counts = new Map();
  for (const [value, weight] of entries) counts.set(value, (counts.get(value) || 0) + weight);
  let best = null;
  for (const [value, weight] of counts) {
    if (!best || weight > best[1]) best = [value, weight];
  }
  return best ? best[0] : null;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))];
}

// Document-wide typography: body font size, left margin, right edge of the
// text column and the normal distance between two lines of a paragraph.
function measureDocument(pages) {
  const all = pages.flat().filter((l) => !l.plain);
  const bodySize = weightedMode(all.map((l) => [l.size, l.chars])) || 12;
  const body = all.filter((l) => Math.abs(l.size - bodySize) <= bodySize * 0.1);
  // Left margin: the leftmost x where a fair share of the body text starts
  // (not simply the most common one: in a short text with many indented
  // first lines the indent can win).
  const leftWeights = new Map();
  let bodyChars = 0;
  for (const l of body) {
    const key = Math.round(l.left);
    leftWeights.set(key, (leftWeights.get(key) || 0) + l.chars);
    bodyChars += l.chars;
  }
  const common = [...leftWeights].filter(([, w]) => w >= bodyChars * 0.1).map(([x]) => x);
  const left = common.length ? Math.min(...common) : (weightedMode(body.map((l) => [Math.round(l.left), l.chars])) ?? 72);
  const right = percentile(body.map((l) => l.right), 0.9) ?? left + 468;
  const gaps = [];
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1];
      const b = lines[i];
      if (a.plain || b.plain) continue;
      if (Math.abs(a.size - bodySize) > bodySize * 0.1 || Math.abs(b.size - bodySize) > bodySize * 0.1) continue;
      const gap = a.y - b.y;
      if (gap > bodySize * 0.5 && gap < bodySize * 3.5) gaps.push(gap);
    }
  }
  // Line pitch: the tighter end of the gaps, since in a short letter the
  // gaps between paragraphs can outnumber those inside them.
  const pitch = percentile(gaps, 0.25) || bodySize * 1.2;
  // How many lines start at each x position (tab stops, indents).
  const lefts = new Map();
  for (const l of all) {
    const key = Math.round(l.left);
    lefts.set(key, (lefts.get(key) || 0) + 1);
  }
  return { bodySize, left, right: Math.max(right, left + bodySize * 10), pitch, lefts };
}

function linesStartingNear(doc, x) {
  const key = Math.round(x);
  return (doc.lefts.get(key - 1) || 0) + (doc.lefts.get(key) || 0) + (doc.lefts.get(key + 1) || 0);
}

// A large initial letter followed by the rest of its first word on the first
// line ("L" + "ate have I loved you"): glue it back on and give the lines that
// wrap around it the paragraph's real left edge.
function mergeDropCaps(lines, doc) {
  for (const cap of lines) {
    if (cap.plain || cap.removed) continue;
    if (!/^["“‘'«]?\p{Lu}$/u.test(cap.text.trim())) continue;
    if (cap.size < doc.bodySize * 1.6) continue;
    let target = null;
    for (const l of lines) {
      if (l === cap || l.plain || l.removed) continue;
      if (l.size > cap.size / 1.6) continue;
      if (l.left < cap.right - 2 || l.left > cap.right + 3 * l.size) continue;
      if (l.y < cap.y - 0.3 * l.size || l.y > cap.y + cap.size) continue;
      if (!target || l.y > target.y) target = l;
    }
    if (!target) continue;
    const wrapLeft = target.left;
    target.text = cap.text.trim() + target.text;
    for (const l of lines) {
      if (l === cap || l.plain || l.removed) continue;
      if (Math.abs(l.left - wrapLeft) <= 2 && l.y <= target.y && l.y >= cap.y - 0.6 * cap.size) {
        l.left = cap.left;
        l.width = l.right - l.left;
      }
    }
    target.chars += 1;
    cap.removed = true;
  }
  return lines.filter((l) => !l.removed);
}

function firstWordWidth(line) {
  const text = line.text.trim();
  const word = text.split(/\s+/)[0] || "";
  return text.length ? line.width * (word.length / text.length) : 0;
}

function isCentered(line, doc) {
  const leftGap = line.left - doc.left;
  const rightGap = doc.right - line.right;
  const tol = Math.max(1.5 * line.size, 0.05 * (doc.right - doc.left));
  if (leftGap <= 2 * line.size || rightGap <= 2 * line.size || Math.abs(leftGap - rightGap) > tol) return false;
  // A short first line at a paragraph indent can look centered; centered
  // lines practically never share their start position with other lines.
  return linesStartingNear(doc, line.left) < 3;
}

// Lines of the page in the same column as `line`: same type size, starting
// at its x or up to 4em to the left of it (the column margin of an indented
// line). Very long pages are not searched.
function columnMates(lines, line, thr) {
  if (lines.length > 2000) return [];
  return lines.filter((l) => l !== line && !l.plain && !l.centered &&
    Math.abs(l.size - line.size) <= line.size * 0.1 &&
    l.left <= line.left + thr && l.left >= line.left - 4 * line.size);
}

// Where the line could have ended: the right edge of its paragraph, block
// quote or column.
function localRight(lines, i, doc, thr) {
  const line = lines[i];
  // The lines just above and below that start at the same x, when they all
  // end at the same place (justified text, a block quote, a column).
  // Ragged lines that merely look alike (a psalm's verses) do not count.
  const near = [];
  for (const dir of [-1, 1]) {
    let prev = line;
    for (let j = i + dir, n = 0; j >= 0 && j < lines.length && n < 4; j += dir, n++) {
      const l = lines[j];
      if (l.plain || l.centered) break;
      const gap = dir < 0 ? l.y - prev.y : prev.y - l.y;
      if (gap <= 0 || gap > doc.pitch * 1.3 * (Math.max(l.size, prev.size) / doc.bodySize)) break;
      if (Math.abs(l.size - line.size) > line.size * 0.1) break;
      if (Math.abs(l.left - line.left) > thr) break;
      near.push(l.right);
      prev = l;
    }
  }
  if (near.length >= 2 && Math.max(...near) - Math.min(...near) <= 0.5 * line.size) {
    return Math.max(line.right, ...near);
  }
  // Otherwise the column as a whole. Verse or an address block, whose lines
  // all stop short, is measured against the body text around it.
  const mates = columnMates(lines, line, thr).map((l) => l.right);
  if (mates.length >= 3) return Math.max(line.right, percentile(mates, 0.9));
  return Math.max(line.right, doc.right);
}

// Left edge of the column a line sits in (the page margin when it has no
// neighbours to go by).
function columnLeft(lines, line, doc, thr) {
  const mates = columnMates(lines, line, thr);
  return Math.min(line.left, mates.length >= 3 ? Math.min(...mates.map((l) => l.left)) : doc.left);
}

// Did `prev` end before the margin for a reason other than "the next word
// did not fit"? Then it is the last line of a paragraph (or a forced break).
function endedEarly(prev, next, doc) {
  if (/[\p{L}][-\u2010\u00AD]$/u.test(prev.text)) return false; // hyphenated: the word continues
  const avail = prev.centered ? doc.right - doc.left : prev.localRight - prev.left;
  const shortfall = avail - prev.width;
  const need = 0.25 * prev.size + firstWordWidth(next);
  if (shortfall <= need + 0.5 * prev.size) return false;
  // Without sentence punctuation only a clearly short line counts, so ragged
  // right text with an under-estimated next word is never split.
  return endsSentence(prev.text) || shortfall > 0.3 * (doc.right - doc.left);
}

// Splits one page's lines into paragraph blocks.
function segmentPage(lines, doc) {
  const blocks = [];
  const thr = Math.max(0.8 * doc.bodySize, 4);
  for (const line of lines) {
    if (!line.plain) line.centered = isCentered(line, doc);
  }
  lines.forEach((line, i) => {
    if (!line.plain) line.localRight = localRight(lines, i, doc, thr);
  });

  let block = null;
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;
    let split = !block;
    if (block && (cur.plain || prev.plain)) {
      split = cur.plain !== prev.plain;
    } else if (block) {
      split = startsNewParagraph(prev, cur, block, doc, thr, lines);
    }
    if (split) {
      block = { lines: [] };
      blocks.push(block);
    }
    block.lines.push(cur);
  }

  for (const b of blocks) describeBlock(b, doc, thr, lines);
  return blocks;
}

function startsNewParagraph(prev, cur, block, doc, thr, lines) {
  const gap = prev.y - cur.y;
  const small = Math.min(prev.size, cur.size);
  const big = Math.max(prev.size, cur.size);
  if (gap < 0.4 * small) {
    // Up to the top of the next column: like a page break, the paragraph
    // goes on unless the last line ended short or the new one is indented.
    const nextColumn = cur.left > prev.right && big / small <= 1.1 && !prev.centered && !cur.centered;
    if (nextColumn && !endedEarly(prev, cur, doc) && cur.left - columnLeft(lines, cur, doc, thr) <= thr) return false;
    // Anything else out of order (a footer drawn first...) starts afresh.
    return true;
  }
  // Font size change: heading, title, footnote.
  if (big / small > 1.1) return true;
  // Extra vertical space.
  if (gap > doc.pitch * 1.3 * (big / doc.bodySize)) return true;

  if (prev.centered && cur.centered) return endedEarly(prev, cur, doc);
  if (prev.centered !== cur.centered) return true;
  if (endedEarly(prev, cur, doc)) return true;

  const dx = cur.left - prev.left;
  if (dx > thr) {
    // A full first line at the margin and the following ones indented: a
    // hanging indent (bibliography entry).
    if (block.lines.length === 1 && prev.left - columnLeft(lines, prev, doc, thr) <= thr) {
      block.hanging = true;
      return false;
    }
    return true; // first-line indent of a new paragraph
  }
  if (dx < -thr) {
    // Back to the margin after an indented first line: same paragraph.
    // After two or more indented lines (hanging indent, block quote): new one.
    return block.lines.length > 1;
  }
  return false;
}

function describeBlock(block, doc, thr, pageLines) {
  const lines = block.lines;
  if (lines.some((l) => l.plain)) {
    block.size = null;
    block.centered = false;
    block.indent = false;
    return;
  }
  const size = weightedMode(lines.map((l) => [l.size, l.chars])) || doc.bodySize;
  block.size = size / doc.bodySize;
  block.centered = lines.every((l) => l.centered);
  const first = lines[0];
  // How far the first line starts right of its column's margin (if clearly).
  const offset = first.left - columnLeft(pageLines, first, doc, thr);
  block.firstOffset = offset > thr ? offset : 0;
  if (block.centered || block.hanging) {
    block.indent = false;
  } else if (lines.length > 1) {
    block.indent = first.left - lines[1].left > thr;
  } else {
    block.indent = offset > thr && offset < 0.3 * (doc.right - doc.left);
  }
}

// Top-most and bottom-most lines of a page: the only places where page
// numbers and running headers/footers are looked for.
function edgeLines(lines, byPosition) {
  const ordered = byPosition ? [...lines].sort((a, b) => b.y - a.y) : lines;
  const picked = new Set([...ordered.slice(0, 2), ...ordered.slice(-2)]);
  return [...picked];
}

function layoutDocument(rawPages) {
  const pages = rawPages.map((p) => p || []);
  const doc = measureDocument(pages);
  return {
    layout: true,
    doc,
    pages: pages.map((lines) => {
      const merged = mergeDropCaps(lines, doc);
      const positioned = merged.length && merged.every((l) => !l.plain);
      return { blocks: segmentPage(merged, doc), edges: edgeLines(merged, positioned) };
    })
  };
}

/* ------------------------------------------------------------------ */
/*  Plain text -> pages of blocks                                      */
/* ------------------------------------------------------------------ */

function parseRawText(rawText) {
  const text = String(rawText || "").replace(/\r\n?/g, "\n");
  return {
    layout: false,
    pages: text.split("\f").map((pageText) => {
      const blocks = [];
      const all = [];
      for (const chunk of pageText.split(/\n[ \t\u00A0]*\n/)) {
        const rawLines = chunk.split("\n").filter((l) => l.trim());
        if (!rawLines.length) continue;
        const lines = rawLines.map((raw) => ({ text: cleanText(raw).trim() })).filter((l) => l.text);
        if (!lines.length) continue;
        blocks.push({
          lines,
          indent: /^(?:\t|[ \u00A0]{2,})\S/.test(rawLines[0]),
          size: null,
          centered: false
        });
        all.push(...lines);
      }
      return { blocks, edges: edgeLines(all, false) };
    })
  };
}

/* ------------------------------------------------------------------ */
/*  Shared: pages of blocks -> HTML                                    */
/* ------------------------------------------------------------------ */

// Removes page numbers and running headers/footers. Only the top/bottom two
// lines of each page are candidates. A number must follow the page sequence;
// a text line must repeat at the edge of at least half of the pages.
function stripPageFurniture(pages) {
  const n = pages.length;
  const numbers = [];
  pages.forEach((page, pi) => {
    for (const line of page.edges) {
      const value = pageNumberValue(line.text);
      if (value !== null) numbers.push({ line, offset: value - pi });
    }
  });
  if (n === 1) {
    for (const c of numbers) if (c.offset === 1) c.line.removed = true;
  } else {
    const counts = new Map();
    for (const c of numbers) counts.set(c.offset, (counts.get(c.offset) || 0) + 1);
    const minCount = Math.max(2, Math.ceil(n * 0.3));
    for (const c of numbers) if (counts.get(c.offset) >= minCount) c.line.removed = true;

    // Numbers inside edge lines that follow the page sequence ("Doe 3").
    const minPages = Math.max(2, Math.ceil(n * 0.5));
    const offsetPages = new Map();
    pages.forEach((page, pi) => {
      for (const line of page.edges) {
        for (const d of line.text.match(/\d+/g) || []) {
          const offset = Number(d) - pi;
          if (!offsetPages.has(offset)) offsetPages.set(offset, new Set());
          offsetPages.get(offset).add(pi);
        }
      }
    });
    const pageOffsets = new Set([...offsetPages].filter(([, set]) => set.size >= minPages).map(([offset]) => offset));

    const keyOf = (line, pi) => {
      const text = squash(line.text);
      return text && text.length <= 150 ? edgeKey(text, pi, pageOffsets) : null;
    };
    const pagesWithKey = new Map();
    pages.forEach((page, pi) => {
      const keys = new Set();
      for (const line of page.edges) {
        const key = line.removed ? null : keyOf(line, pi);
        if (key) keys.add(key);
      }
      for (const key of keys) pagesWithKey.set(key, (pagesWithKey.get(key) || 0) + 1);
    });
    pages.forEach((page, pi) => {
      for (const line of page.edges) {
        const key = line.removed ? null : keyOf(line, pi);
        if (key && (pagesWithKey.get(key) || 0) >= minPages) line.removed = true;
      }
    });
  }
  for (const page of pages) {
    for (const block of page.blocks) block.lines = block.lines.filter((l) => !l.removed);
    page.blocks = page.blocks.filter((b) => b.lines.length);
  }
}

function lastLine(block) {
  return block.lines[block.lines.length - 1];
}

// Joins a paragraph that runs over a page break.
function mergeAcrossPages(pages, model) {
  const { layout, doc } = model;
  const bodyBlocks = pages.flatMap((p) => p.blocks).filter((b) => b.lines.length > 1 && !b.centered);
  const indented = bodyBlocks.filter((b) => b.indent).length;
  const usesIndent = bodyBlocks.length >= 3 && indented >= bodyBlocks.length * 0.6;

  let prevPage = null;
  for (const page of pages) {
    if (!page.blocks.length) continue;
    if (prevPage) {
      // Skip footnotes (smaller type) at the foot of the previous page.
      let target = null;
      for (let i = prevPage.blocks.length - 1; i >= 0; i--) {
        const b = prevPage.blocks[i];
        if (layout && b.size !== null && b.size < 0.92) continue;
        target = b;
        break;
      }
      const next = page.blocks[0];
      if (target && canContinue(target, next, layout, doc, usesIndent)) {
        target.lines.push(...next.lines);
        page.blocks.shift();
      }
    }
    if (page.blocks.length) prevPage = page;
  }
}

function canContinue(prev, next, layout, doc, usesIndent) {
  if (prev.centered || next.centered) return false;
  if (prev.size !== null && next.size !== null && Math.abs(prev.size - next.size) > 0.1) return false;
  const tail = lastLine(prev);
  const head = next.lines[0];
  if (layout && prev.hanging && prev.lines.length > 1 && head.left !== undefined) {
    // A hanging-indent entry goes on only with another indented line; a
    // line back at the margin starts the next entry.
    const hangLeft = prev.lines[1].left;
    return Math.abs(head.left - hangLeft) <= Math.max(0.8 * doc.bodySize, 4) && !endedEarly(tail, head, doc);
  }
  if (next.indent) return false;
  const prevText = tail.text.trim();
  if (/\p{L}[-\u2010\u00AD]$/u.test(prevText)) return true;
  const startsLower = /^\p{Ll}/u.test(head.text.trim());
  if (layout && tail.width !== undefined && head.width !== undefined) {
    if (endedEarly(tail, head, doc)) return false;
    if (!endsSentence(prevText)) return true;
    return usesIndent || startsLower;
  }
  if (!endsSentence(prevText)) return startsLower || prev.lines.length > 1;
  return usesIndent && next.lines.length > 1 && startsLower;
}

// Words written with a hyphen somewhere in the middle of a line, so a
// compound broken at its own hyphen ("well-" / "known") keeps it.
function hyphenVocabulary(blocks) {
  const vocab = new Set();
  for (const b of blocks) {
    for (const l of b.lines) {
      const words = l.text.trim().split(/\s+/);
      words.forEach((w, i) => {
        if (i === words.length - 1 && /-$/.test(w)) return;
        const clean = w.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
        if (clean) vocab.add(clean);
      });
    }
  }
  return vocab;
}

function joinLines(lines, vocab) {
  let out = "";
  for (const l of lines) {
    const line = squash(l.text);
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    if (DROP_CAP_RE.test(out) && /^\p{Ll}/u.test(line)) {
      // A drop cap that came out as its own line: "L" + "ate have I loved".
      out += line;
      continue;
    }
    if (out.endsWith("\u00AD")) {
      out = out.slice(0, -1) + line;
      continue;
    }
    const lastWord = out.slice(out.lastIndexOf(" ") + 1);
    const looksLikeUrl = /:\/\/|www\.|\//.test(lastWord);
    const hyphen = out.match(/(\p{L}+)[-\u2010]$/u);
    if (hyphen && /\p{Ll}[-\u2010]$/u.test(out) && /^\p{Ll}/u.test(line) && !looksLikeUrl) {
      // Line-break hyphen inside a word: "theo-" + "logical" -> "theological".
      const tail = line.match(/^\p{L}+/u)[0];
      const compound = `${hyphen[1]}-${tail}`.toLowerCase();
      const solid = `${hyphen[1]}${tail}`.toLowerCase();
      out = vocab.has(compound) && !vocab.has(solid) ? out + line : out.slice(0, -1) + line;
      continue;
    }
    if (/[-\u2010–—/]$/.test(out) && !/\s[-–—]$/.test(out)) {
      // "Judeo-" + "Christian", "1054–" + "1204", a dash, or a broken URL.
      out += line;
      continue;
    }
    out += ` ${line}`;
  }
  return out.replace(/\u00AD/g, "");
}

function normalizedTitle(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isBodyBlock(block) {
  return block && (block.lines.length > 1 || block.text.length >= 80);
}

// The post already shows its title, so the PDF's own title (and a "By ..."
// line under it) is not repeated in the body.
function findTitleBlocks(blocks, model, title) {
  const skip = new Set();
  if (blocks.length < 2) return skip;
  const wanted = normalizedTitle(title);
  const firstPage = blocks.filter((b) => b.page === 0);
  const leading = [];
  for (const b of firstPage) {
    if (leading.length >= 6) break;
    leading.push(b);
    if (isBodyBlock(b) && b.text.length >= 200) break;
  }

  let titleBlock = null;
  if (wanted) {
    titleBlock = leading.find((b) => {
      const got = normalizedTitle(b.text);
      return got === wanted || (got.startsWith(`${wanted} `) && b.lines.length <= 3);
    }) || null;
  }
  if (!titleBlock) {
    const looksLikeTitle = (b) => b.lines.length <= 3 && b.text.length <= 200 && hasWord(b.text) &&
      !HEADING_END_RE.test(b.text) && !REF_HEADING_RE.test(b.text);
    if (model.layout) {
      titleBlock = leading.find((b) => looksLikeTitle(b) && b.size !== null &&
        (b.size >= 1.15 || (b.centered && (isTitleCase(b.text) || isAllCaps(b.text))))) || null;
    } else {
      const b = blocks[0];
      if (b.page === 0 && looksLikeTitle(b) && !/\d/.test(b.text) && (isTitleCase(b.text) || isAllCaps(b.text))) {
        titleBlock = b;
      }
    }
  }
  if (!titleBlock) return skip;
  skip.add(titleBlock);
  const after = blocks[blocks.indexOf(titleBlock) + 1];
  if (after && after.lines.length === 1 && /^(?:[Bb]y|[Pp]or|[Pp]ar|[Vv]on)\s+\p{Lu}/u.test(after.text) &&
      letterWords(after.text).length <= 8 && !endsSentence(after.text)) {
    skip.add(after);
  }
  return skip;
}

// A section heading inside the body ("Introduction", "Memory and Time").
// PDF posts keep only the References heading, so these are dropped. Short
// paragraphs such as salutations, questions and signatures are never matched.
function isSectionHeading(block, next, model) {
  if (!next || !isBodyBlock(next)) return false;
  const text = block.text;
  const core = stripEnumerator(text);
  if (!hasWord(core)) return false;
  const words = letterWords(core).length;
  if (model.layout && block.size !== null && block.size >= 1.1) {
    // Set in a larger type: a heading even when it asks a question.
    if (/[.,;:…]["'”’»)\]]*$/u.test(text)) return false;
    return block.lines.length <= 2 && words <= 14 && text.length <= 120;
  }
  if (HEADING_END_RE.test(text)) return false;
  if (model.layout && block.size !== null) {
    if (block.lines.length !== 1 || words > 10) return false;
    return isAllCaps(core) || (block.centered && isTitleCase(core));
  }
  if (block.lines.length !== 1 || words > 8 || text.length > 60 || /\d/.test(core)) return false;
  return isTitleCase(core) || isAllCaps(core);
}

// How a bibliography entry begins: "Surname, ...", "[3]" or "3. ".
const ENTRY_START_RE = /^(?:\p{Lu}[\p{L}'’-]+,\s|\[\d+\]|\d{1,3}\.\s)/u;

function isReferenceHeading(block) {
  if (block.lines.length !== 1) return false;
  const text = squash(block.lines[0].text);
  return text.length <= 60 && REF_HEADING_RE.test(stripEnumerator(text).replace(/\s*:$/, ""));
}

// Several bibliography entries that ended up in one block (no spacing and
// no hanging indent between them): a line that ends an entry followed by a
// line that starts with "Surname," "[3]" or "3." at the entry's left edge.
function splitReferenceBlock(block) {
  if (block.lines.length < 2) return [block];
  const first = block.lines[0];
  const parts = [];
  let current = [];
  block.lines.forEach((line, i) => {
    const prevText = i > 0 ? block.lines[i - 1].text.trim() : "";
    const startsEntry = ENTRY_START_RE.test(line.text.trim());
    const atEntryEdge = line.left === undefined || line.left - first.left <= 0.8 * line.size;
    if (current.length && /[.)]$/.test(prevText) && startsEntry && atEntryEdge) {
      parts.push({ ...block, lines: current });
      current = [];
    }
    current.push(line);
  });
  parts.push({ ...block, lines: current });
  return parts;
}

// In a hanging-indent bibliography an indented line never starts an entry:
// glue such a line back onto the entry before it (the paragraph pass may have
// split it off when two entries sat on consecutive lines).
function joinHangingContinuations(blocks, doc) {
  const start = blocks.findIndex((b) => isReferenceHeading(b));
  if (start < 0) return blocks;
  const refs = blocks.slice(start + 1);
  if (!refs.some((b) => b.hanging)) return blocks;
  const maxIndent = 0.3 * (doc.right - doc.left);
  const out = blocks.slice(0, start + 1);
  for (const b of refs) {
    const prev = out[out.length - 1];
    const continues = prev !== blocks[start] && !b.centered && b.firstOffset > 0 && b.firstOffset < maxIndent &&
      Math.abs(b.size - prev.size) <= 0.1 && !ENTRY_START_RE.test(b.lines[0].text.trim());
    if (continues) {
      prev.lines.push(...b.lines);
      continue;
    }
    out.push(b);
  }
  return out;
}

function pagesToHtml(model, options = {}) {
  const { pages } = model;
  stripPageFurniture(pages);
  mergeAcrossPages(pages, model);

  let blocks = [];
  pages.forEach((page, pi) => {
    for (const b of page.blocks) blocks.push({ ...b, page: pi });
  });
  let inRefs = false;
  blocks = blocks.flatMap((b) => {
    if (isReferenceHeading(b)) {
      inRefs = true;
      return [b];
    }
    return inRefs ? splitReferenceBlock(b) : [b];
  });
  if (model.layout) blocks = joinHangingContinuations(blocks, model.doc);

  const vocab = hyphenVocabulary(blocks);
  for (const b of blocks) b.text = joinLines(b.lines, vocab);
  blocks = blocks.filter((b) => b.text);
  if (!blocks.length) return "";

  const skip = findTitleBlocks(blocks, model, options.title);
  const parts = [];
  let inReferences = false;
  blocks.forEach((block, i) => {
    if (skip.has(block)) return;
    const text = block.text;
    if (isReferenceHeading(block)) {
      inReferences = true;
      parts.push(`<h3 class="pdf-ref-heading">${escapeHtml(text.replace(/\s*:$/, ""))}</h3>`);
      return;
    }
    if (inReferences) {
      parts.push(`<p class="pdf-ref-entry">${escapeHtml(text)}</p>`);
      return;
    }
    if (isSectionHeading(block, blocks[i + 1], model)) return;
    parts.push(block.indent ? `<p class="pdf-indent">${escapeHtml(text)}</p>` : `<p>${escapeHtml(text)}</p>`);
  });

  // Everything looked like a title or heading: keep it all rather than
  // returning an empty post.
  if (!parts.length) {
    for (const b of blocks) parts.push(`<p>${escapeHtml(b.text)}</p>`);
  }
  return `<div class="pdf-text">${parts.join("\n")}</div>`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Converts plain text to PDF-post HTML. Paragraphs are separated by blank
 * lines, pages by "\f"; a first line starting with 2+ spaces or a tab is a
 * first-line indent. Returns "" when there is no text.
 * @param {string} rawText
 * @param {{title?: string}} [options] title: the post title, dropped from the body
 */
export function pdfTextToHtml(rawText, options = {}) {
  if (!rawText || !String(rawText).trim()) return "";
  return pagesToHtml(parseRawText(rawText), options);
}

/**
 * Extracts the text of a PDF and returns PDF-post HTML, or "" when the PDF
 * has no selectable text (for example a scanned image). Rejects when the PDF
 * cannot be parsed (corrupt, password protected).
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @param {{title?: string}} [options] title: the post title, dropped from the body
 */
export async function extractPdfHtml(buffer, options = {}) {
  // pdf.js misreads small PDFs passed as a pooled Node Buffer (non-zero
  // byteOffset), so always hand it a standalone copy.
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer.slice(0)) : new Uint8Array(buffer);
  const pages = [];
  await pdfParse(data, {
    pagerender(pageData) {
      return pageData
        .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((content) => {
          const items = content.items || [];
          let lines;
          try {
            lines = collectLines(items);
          } catch (err) {
            console.error("[pdf-text] page layout failed, using plain lines:", err?.message || err);
            lines = plainLines(items);
          }
          pages[pageData.pageIndex] = lines;
          return lines.map((l) => l.text).join("\n");
        });
    }
  });
  const filled = Array.from(pages, (lines) => lines || []);
  if (!filled.some((lines) => lines.length)) return "";
  try {
    return pagesToHtml(layoutDocument(filled), options);
  } catch (err) {
    // A layout heuristic must never cost the admin the text itself.
    console.error("[pdf-text] layout failed, using plain text:", err?.message || err);
    return pdfTextToHtml(filled.map((lines) => lines.map((l) => l.text).join("\n")).join("\f"), options);
  }
}
