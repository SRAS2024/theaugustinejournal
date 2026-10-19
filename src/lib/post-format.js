// src/lib/post-format.js
//
// Brings stored post HTML into one consistent shape, whether it was typed in
// the editor, pasted from Word or Google Docs, or imported from a PDF. Runs
// when a post is saved, behind the editor's "Auto format" button, and in
// scripts/format-posts.mjs for posts that are already published.
//
// It never adds, drops or changes words. Only whitespace, block boundaries,
// line breaks, classes and link wrapping change:
//   - pasted colours and unsafe markup go (sanitizeRichHtml)
//   - stray tabs, &nbsp;, zero-width spaces and doubled spaces are tidied,
//     empty spacer paragraphs are dropped
//   - runs of short verse lines (a creed, a poem) become one paragraph with
//     line breaks
//   - paragraphs that a PDF line wrap split in two are joined again (option
//     repair also joins the cases without a lower-case or bracket clue; it is
//     for the one-off clean-up of old posts, whose report is read by eye)
//   - in a post that marks its sections with short title lines, those lines
//     become headings
//   - the references get the markup of PDF imports: a pdf-ref-heading and one
//     pdf-ref-entry per source, with wrapped lines and split URLs joined and
//     plain URLs turned into links (see .pdf-ref-* in styles.css)
//   - the body of a PDF post sits in one <div class="pdf-text">, as the editor
//     saves it (option pdf)
// Quill alignment and indent classes, emphasis, links, headings, block quotes
// and lists are kept. formatPostHtml(formatPostHtml(x)) === formatPostHtml(x):
// the rules run again on their own output until it stops changing.
//
// An empty paragraph the author left between two stanzas, prayers or
// paragraphs is a boundary: nothing is joined across it. It is dropped where
// nothing would be joined anyway, and kept (as one <p><br></p>) where the
// blocks on either side would otherwise run together the next time.
//
// Quill 1.x has no soft line break, so the editor turns a verse paragraph back
// into one paragraph per line; the rules below are content based, so saving
// puts the lines back together.

import { parseDocument } from "htmlparser2";
import { Element, Text } from "domhandler";
import render from "dom-serializer";

import { sanitizeRichHtml } from "./sanitize.js";
import { REF_HEADING_RE, isTitleCase, stripEnumerator } from "./pdf-text.js";

const TEXT_BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCKS = new Set([...TEXT_BLOCKS, "blockquote", "li", "ul", "ol", "pre", "div", "hr"]);
// Whitespace inside these is kept exactly as written.
const SOLID = new Set(["pre", "code"]);

// Headings the translation engine also treats as the start of the references
// (src/lib/translation/html.js), in addition to the PDF importer's list.
const NOTES_HEADING_RE = /^(?:notes|endnotes|footnotes|citations)$/i;

// Headings that are also ordinary words ("Notes on the Psalms" is not one, but
// a mid-post "Notes" or "Sources" may still be a section of the essay): they
// start the references only when a citation follows (see isReferenceHeading).
const WEAK_HEADING_RE = /^(?:notes|endnotes|footnotes|citations|sources|quellen|источники)$/iu;

// Sentence-final punctuation or a closing quote/bracket: the paragraph ends here.
const CLOSED_END_RE = /[.!?…)\]”"’»]$/u;
// A URL stops at spaces, quotes, guillemets and an em dash; closing
// punctuation it ends on is trimmed off by trimUrl.
const URL_RE = /\bhttps?:\/\/[^\s<>"“”‘’«»‹›—]+/giu;
// A line that is nothing but an address: "https://…", "www.…" or "newadvent.org/…".
const ADDRESS_LINE_RE = /^(?:https?:\/\/|www\.|[\w-]+(?:\.[\w-]+)+\/)\S*$/i;
// Somewhere in the text: "https://…", "www.…" or "newadvent.org/…".
const HAS_URL_RE = /https?:\/\/|\bwww\.|(?:^|\s)[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\//i;

// How a reference entry begins: "Surname, I.", "The Holy Bible, ...", a year
// or "(n.d.)" near the start, or a number.
const AUTHOR_RE = /^\p{Lu}[\p{L}'’-]*(?:\s+(?:\p{Lu}[\p{L}'’-]*|of|the|de|van|von|der|la|le|du|da|and|&))*,\s/u;
// The same, with a capital, a digit or a bracket after the comma: "Lewis, C. S."
// but not "Yet, the Lord" (used to tell a citation from a sentence).
const NAMED_AUTHOR_RE = /^\p{Lu}[\p{L}'’-]*(?:\s+(?:\p{Lu}[\p{L}'’-]*|of|the|de|van|von|der|la|le|du|da|and|&))*,\s+[\p{Lu}\d(]/u;
// An entry of its own: two or more capitalised words and a full stop, then
// the title ("Pope Benedict XVI. Deus Caritas Est.", "Vatican News. …").
const NAME_DOT_RE = /^\p{Lu}[\p{L}'’-]*(?:\s+(?:\p{Lu}[\p{L}'’-]*|of|the|de))+\.\s+\S/u;
const YEAR_RE = /\((?:\d{4}|n\.\s?d\.)/;
const NUMBERED_RE = /^(?:\[\d+\]|\d{1,3}\.\s)/;
// A passage listed under a Bible entry: "Isaiah 29:13", "1 John 4:18".
const LOCATOR_RE = /^(?:[1-4]\s?)?\p{Lu}[\p{L}.’']*(?:\s+\p{L}[\p{L}.’']*)*\s+\d+(?:[:.,]\d+)?/u;
const BIBLE_RE = /\b(?:Bible|Scriptures?|Testament|Biblia|Bíblia|Bibel)\b|Библи/iu;

// Short capitalised lines that are not section titles: liturgical words,
// attributions and sign-offs. A sign-off is the whole line, so a title that
// only starts like one ("Faithfully Catholic", "Blessings of Obedience",
// "Yourself and the Other") is still a title.
const NOT_A_TITLE_RE = new RegExp(
  "^(?:(?:amen|alleluia|hallelujah|selah|maranatha)[,!. ]*)+$" +
  "|^[—–~-]" +
  "|^your (?:brother|sister|servant|friend|son|daughter)\\b" +
  "|^(?:yours(?: (?:truly|faithfully|sincerely|ever|always))?(?: in (?:christ|jesus|the lord)(?: jesus)?)?" +
  "|(?:sincerely|faithfully|respectfully|cordially)(?: yours)?(?: in christ)?" +
  "|(?:many )?blessings|god bless(?: (?:you|and keep you))?(?: all)?|in christ(?: jesus)?" +
  "|peace (?:and|&) (?:blessings|love|joy)|peace be with you all" +
  "|with (?:love|prayers|gratitude|thanks)(?: (?:and|&) (?:love|prayers|gratitude|thanks|blessings))?(?: in christ)?" +
  "|pax(?: christi| et bonum| tecum| vobis(?:cum)?)?)$",
  "iu"
);
// A dedication or a byline ("For My Mother", "In Loving Memory", "By Samuel
// Simonds"): no title in the first blocks of a post, where they are written.
// Between two sections "To Our Lady" or "By Grace Alone" is one.
const DEDICATION_RE = /^(?:by\s|(?:for|to) (?:my|our|his|her|their)\b|in (?:loving )?memory\b|dedicated\b)/iu;
const OPENING_BLOCKS = 2;
// A quotation on its own line: the line after it is its attribution.
const QUOTE_LINE_RE = /^[“"‘«]/u;

// Zero-width characters with no meaning in the text: Quill's cursor
// placeholder (U+FEFF), the zero-width space and the word joiner pasted text
// carries. The zero-width non-joiner and joiner (U+200C, U+200D) stay: they
// are part of the spelling in Persian and Indic scripts, and of emoji.
const INVISIBLE_RE = /[\u200B\u2060\uFEFF]/g;

const VERSE_LINE_MAX = 80;
const SECTION_TITLE_MAX = 70;

/* ------------------------------------------------------------------ */
/*  DOM helpers                                                        */
/* ------------------------------------------------------------------ */

const isTag = (node) => node?.type === "tag";
const isEl = (node, name) => isTag(node) && node.name === name;
const classesOf = (el) => String(el.attribs?.class || "").split(/\s+/).filter(Boolean);
const hasClass = (el, name) => classesOf(el).includes(name);

function setChildren(parent, children) {
  parent.children = children;
  children.forEach((child, i) => {
    child.parent = parent;
    child.prev = children[i - 1] || null;
    child.next = children[i + 1] || null;
  });
}

function textOf(node) {
  if (node.type === "text") return node.data;
  if (isEl(node, "br")) return "\n";
  return (node.children || []).map(textOf).join("");
}

// A block's text on one line, whitespace collapsed.
const flatText = (node) => textOf(node).replace(/\s+/g, " ").trim();
const hasBreak = (node) => (node.children || []).some((c) => isEl(c, "br") || hasBreak(c));
const html = (node) => render(node, { encodeEntities: "utf8" });

// list.push(...items) passes every item as an argument, which runs out of
// stack for a list of 100,000 or so: a post can have that many blocks.
function append(list, items) {
  for (const item of items) list.push(item);
  return list;
}

function setClasses(el, list) {
  if (list.length) el.attribs.class = list.join(" ");
  else delete el.attribs.class;
}

/**
 * Move the inline content of each `from` to the end of `to`, after its `glue`
 * (text or a node): parts is [[glue, from], ...]. One pass, however many
 * parts, so a long run of lines costs no more than its length.
 */
function joinInline(to, parts) {
  const children = [...to.children];
  for (const [glue, from] of parts) {
    if (typeof glue !== "string") children.push(glue);
    else if (glue) children.push(new Text(glue));
    append(children, from.children);
  }
  setChildren(to, children);
  joinTexts(to);
  tidyWhitespace(to);
}

/* ------------------------------------------------------------------ */
/*  Inline clean-up                                                    */
/* ------------------------------------------------------------------ */

// sanitizeRichHtml leaves <span> without attributes (pasted colours removed):
// they mean nothing any more.
function unwrapSpans(node) {
  const out = [];
  for (const child of node.children || []) {
    if (!isTag(child)) {
      out.push(child);
      continue;
    }
    unwrapSpans(child);
    if (child.name === "span") append(out, child.children);
    else out.push(child);
  }
  setChildren(node, out);
}

function stripInvisible(node) {
  for (const child of node.children || []) {
    if (child.type === "text") child.data = child.data.replace(INVISIBLE_RE, "");
    else if (isTag(child) && !SOLID.has(child.name)) stripInvisible(child);
  }
}

function joinTexts(node) {
  const out = [];
  for (const child of node.children || []) {
    const last = out[out.length - 1];
    if (child.type === "text" && last?.type === "text") {
      last.data += child.data;
      continue;
    }
    if (isTag(child)) joinTexts(child);
    out.push(child);
  }
  setChildren(node, out);
}

const LINE = { line: true }; // a line boundary: <br> or a nested block
const OPAQUE = { opaque: true }; // code: counts as text, spacing untouched
const KEEP_NBSP = "\uE000";

// Runs of whitespace (tabs, &nbsp;, newlines) become one space. A no-break
// space that glues a short token to a number ("§ 1601", "p. 12") stays.
function squashSpaces(text) {
  return text
    .replace(/(^|[\s([])(\S{1,4})\u00A0(?=\d)/gu, `$1$2${KEEP_NBSP}`)
    .replace(/\s+/g, " ")
    .replaceAll(KEEP_NBSP, "\u00A0");
}

function collectFlow(node, out) {
  for (const child of node.children || []) {
    if (child.type === "text") out.push(child);
    else if (!isTag(child)) continue;
    else if (child.name === "br") out.push(LINE);
    else if (SOLID.has(child.name)) out.push(OPAQUE);
    else if (BLOCKS.has(child.name)) {
      out.push(LINE);
      collectFlow(child, out);
      out.push(LINE);
    } else collectFlow(child, out);
  }
  return out;
}

const KEEP_EMPTY = new Set(["br", "hr", ...SOLID]);

function pruneEmpty(node) {
  const kept = (node.children || []).filter((child) => {
    if (child.type === "text") return child.data !== "";
    if (!isTag(child) || KEEP_EMPTY.has(child.name)) return true;
    pruneEmpty(child);
    return child.children.length > 0 || (child.name === "a" && !!child.attribs.name);
  });
  setChildren(node, kept);
}

/** Collapse spaces and trim them at the start and end of every line of a block. */
function tidyWhitespace(block) {
  if (SOLID.has(block.name)) return;
  const flow = collectFlow(block, []);
  let lineStart = true;
  let afterSpace = false;
  for (const item of flow) {
    if (item === LINE || item === OPAQUE) {
      lineStart = item === LINE;
      afterSpace = false;
      continue;
    }
    let text = squashSpaces(item.data);
    if ((lineStart || afterSpace) && text.startsWith(" ")) text = text.slice(1);
    if (text) {
      lineStart = false;
      afterSpace = text.endsWith(" ");
    }
    item.data = text;
  }
  let lineEnd = true;
  for (let i = flow.length - 1; i >= 0; i--) {
    const item = flow[i];
    if (item === LINE || item === OPAQUE) {
      lineEnd = item === LINE;
      continue;
    }
    if (lineEnd) item.data = item.data.replace(/ +$/, "");
    if (item.data) lineEnd = false;
  }
  pruneEmpty(block);
}

// A URL broken across two lines of a reference entry, where only the first
// half became the link: <a>https://x.org/scriptures/dc-</a> testament/dc. The
// rest of the address follows the link directly, or after one space when the
// link stops on a hyphen (a line wrap: a sentence never puts one there; after
// a "/" the next word is just as likely "and/or" or "24/7"). Returns how many
// links were mended.
function mendSplitLinks(node) {
  let mended = 0;
  const kids = node.children || [];
  kids.forEach((a, i) => {
    if (isTag(a) && a.name !== "a") mended += mendSplitLinks(a);
    if (!isEl(a, "a")) return;
    const label = textOf(a);
    const next = kids[i + 1];
    if (a.attribs.href !== label || !/^https?:\/\/\S+$/i.test(label) || next?.type !== "text") return;
    const gap = label.endsWith("-") ? "[ \\u00A0]?" : "";
    const m = new RegExp(`^${gap}([\\w\\-.~%/?#=&+:]*[/=?&%][\\w\\-.~%/?#=&+:]*)(?=$|\\s)`).exec(next.data);
    const tail = m ? m[1].replace(/[.,;:]+$/, "") : "";
    if (!tail) return;
    a.attribs.href = label + tail;
    setChildren(a, [new Text(label + tail)]);
    next.data = next.data.slice(m[0].length - m[1].length + tail.length);
    mended++;
  });
  pruneEmpty(node);
  return mended;
}

// Sentence punctuation, a closing quote or guillemet, a trailing dash or
// ellipsis and an unmatched closing bracket after a URL belong to the text
// around it.
function trimUrl(url) {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    const unmatched = (open, close) => last === close && out.split(open).length < out.split(close).length;
    if (/[.,;:!?'’"”…–»›]/u.test(last) || unmatched("(", ")") || unmatched("[", "]")) out = out.slice(0, -1);
    else return out;
  }
}

function linkTo(url) {
  const a = new Element("a", { href: url }, []);
  setChildren(a, [new Text(url)]);
  return a;
}

/** Turn plain-text http(s) URLs into links. Returns how many were made. */
function linkify(node) {
  let made = 0;
  const out = [];
  for (const child of node.children || []) {
    if (isTag(child)) {
      if (child.name !== "a" && !SOLID.has(child.name)) made += linkify(child);
      out.push(child);
      continue;
    }
    if (child.type !== "text") {
      out.push(child);
      continue;
    }
    let last = 0;
    for (const m of child.data.matchAll(URL_RE)) {
      const url = trimUrl(m[0]);
      if (!/^https?:\/\/[^/]+\.[^/]/i.test(url)) continue;
      if (m.index > last) out.push(new Text(child.data.slice(last, m.index)));
      out.push(linkTo(url));
      last = m.index + url.length;
      made++;
    }
    if (last === 0) out.push(child);
    else if (last < child.data.length) out.push(new Text(child.data.slice(last)));
  }
  setChildren(node, out);
  return made;
}

/* ------------------------------------------------------------------ */
/*  Paragraph rules                                                    */
/* ------------------------------------------------------------------ */

function isEmptyBlock(node) {
  if (!isTag(node) || !(TEXT_BLOCKS.has(node.name) || node.name === "blockquote")) return false;
  return !textOf(node).trim() && !(node.children || []).some((c) => isTag(c) && c.name !== "br" && !isEmptyInline(c));
}

const isEmptyInline = (node) => !textOf(node).trim() && !(node.children || []).some((c) => isTag(c) && SOLID.has(c.name));

const isLine = (node) => isEl(node, "p") && !hasBreak(node) && !/(^|\s)pdf-ref-/.test(node.attribs.class || "");
const classOf = (node) => node.attribs?.class || "";

// A short title line: "Statement of Doctrine", "Rejection of the Trinity".
function isTitleLine(text) {
  return text.length <= SECTION_TITLE_MAX && /^\p{Lu}/u.test(text) && !/[.!?,;:…)\]”"’»]$/u.test(text) &&
    text.split(" ").length <= 9 && isTitleCase(text);
}

// A line of verse: short, with at least two words ("I" or "354" on a line
// of their own are something else).
const isVerseText = (text) => text.length <= VERSE_LINE_MAX && text.split(" ").filter((w) => /\p{L}/u.test(w)).length >= 2;
const isVerseLine = (node) => isLine(node) && isVerseText(flatText(node));

// Does the next short line carry on the sentence of this one (verse)?
const continuesLine = (a, b) => /[,;:]$/.test(a) || /^\p{Ll}/u.test(b);

// Lines [first, last] of a run of short lines (their texts) that read as
// verse: at least three lines, most of them carrying a sentence on to the next.
function verseSpan(texts) {
  if (texts.length < 3) return null;
  const joins = texts.slice(1).map((b, i) => continuesLine(texts[i], b));
  const first = joins.indexOf(true);
  const last = joins.lastIndexOf(true) + 1;
  if (first < 0 || last - first + 1 < 3) return null;
  const count = joins.slice(first, last).filter(Boolean).length;
  return count >= 2 && count >= (last - first) / 2 ? [first, last] : null;
}

/**
 * Runs of short verse lines (a creed, a poem) become one paragraph with <br>s.
 * A run never crosses a block in `breaks` (one that followed an empty
 * paragraph): two stanzas or two prayers stay apart.
 */
function groupVerse(blocks, breaks, log) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const cls = classOf(blocks[i]);
    let j = i;
    while (j < blocks.length && (j === i || !breaks.has(blocks[j])) && isVerseLine(blocks[j]) && classOf(blocks[j]) === cls) j++;
    const run = blocks.slice(i, Math.max(j, i + 1));
    const span = run.length >= 3 ? verseSpan(run.map(flatText)) : null;
    if (!span) {
      append(out, run);
      i += run.length;
      continue;
    }
    const lines = run.slice(span[0], span[1] + 1);
    const verse = lines[0];
    const before = lines.map(html);
    joinInline(verse, lines.slice(1).map((line) => [new Element("br", {}), line]));
    // A PDF's indented verse (one first-line indent per line) stays indented
    // as a whole block.
    if (hasClass(verse, "pdf-indent")) setClasses(verse, ["ql-indent-1"]);
    log("verse", before, html(verse));
    append(out, run.slice(0, span[0]));
    out.push(verse);
    append(out, run.slice(span[1] + 1));
    i += run.length;
  }
  return out;
}

const occurrences = (text, ch) => text.split(ch).length - 1;
const opensMore = (text, open, close) => occurrences(text, open) > occurrences(text, close);
const lastToken = (text) => text.slice(text.lastIndexOf(" ") + 1);
const endsWithUrl = (text) => /^(?:https?:\/\/|www\.)/i.test(lastToken(text));
const endsClosed = (text) => CLOSED_END_RE.test(text.slice(-1));

// What the joining rules ask of a paragraph or an entry, kept up to date as
// lines are joined onto it, so that a long run of joined lines is never read
// again in full: how it starts (head), its last line (how it ends), its
// length, the brackets and quotation marks it leaves open, and whether it has
// a URL or names the Bible.
const HEAD_MAX = 400;
function textInfo(text) {
  return {
    head: text.slice(0, HEAD_MAX),
    last: text,
    length: text.length,
    parens: occurrences(text, "(") - occurrences(text, ")"),
    quotes: occurrences(text, "“") - occurrences(text, "”"),
    url: HAS_URL_RE.test(text),
    bible: BIBLE_RE.test(text)
  };
}

function joinText(info, glue, text) {
  const add = textInfo(text);
  return {
    head: info.head.length < HEAD_MAX ? (info.head + glue + text).slice(0, HEAD_MAX) : info.head,
    last: glue ? text : info.last + text,
    length: info.length + glue.length + text.length,
    parens: info.parens + add.parens,
    quotes: info.quotes + add.quotes,
    url: info.url || add.url,
    bible: info.bible || add.bible
  };
}

// Line b closes a bracket or quotation that a (a textInfo) left open.
const closesOpen = (a, b) => (a.parens > 0 && opensMore(b, ")", "(")) || (a.quotes > 0 && opensMore(b, "”", "“"));

// Was paragraph b split off a by a line wrap (typically a PDF copied into the
// editor)? Only clear cases: a full paragraph stops mid-sentence and b goes on
// in lower case or closes a bracket or quotation a left open. With `repair`,
// also a long paragraph that stops on a bare word: in new writing that is more
// likely a forgotten full stop.
function splitByWrap(a, b, repair) {
  if (!b || a.length < 60 || endsClosed(a.last)) return false;
  if (/^\p{Ll}/u.test(b)) return !isTitleLine(a.head);
  if (closesOpen(a, b)) return true;
  return repair && a.length >= 150 && /[\p{L}\p{N},]$/u.test(a.last.slice(-2)) && !endsWithUrl(a.last) && b.length >= 60 &&
    /^\p{L}/u.test(b);
}

// Can b be joined onto a as one paragraph? A PDF paragraph's first-line indent
// is on its first half only.
const sameKind = (a, b) => isLine(a) && isLine(b) &&
  (classOf(b) === classOf(a) || (classOf(a) === "pdf-indent" && !classOf(b)));

function mergeSplitParagraphs(blocks, breaks, log, repair) {
  const out = [];
  let chain = null; // { block, info, parts, before }: paragraphs being joined
  const finish = () => {
    if (chain?.parts.length) {
      joinInline(chain.block, chain.parts.map((b) => [" ", b]));
      log("merge", chain.before, html(chain.block));
    }
    chain = null;
  };
  for (const b of blocks) {
    if (chain && !breaks.has(b) && sameKind(chain.block, b)) {
      const text = flatText(b);
      if (splitByWrap(chain.info, text, repair)) {
        if (!chain.parts.length) chain.before.push(html(chain.block));
        chain.parts.push(b);
        chain.before.push(html(b));
        chain.info = joinText(chain.info, " ", text);
        continue;
      }
    }
    finish();
    out.push(b);
    if (isLine(b)) chain = { block: b, info: textInfo(flatText(b)), parts: [], before: [] };
  }
  finish();
  return out;
}

// The lines of a block as the editor gives them back: Quill reloads a verse
// paragraph as one paragraph per line.
function editorLines(block) {
  if (!isEl(block, "p") || /(^|\s)pdf-ref-/.test(classOf(block))) return [];
  return textOf(block).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * The blocks that, with the empty paragraphs gone, would go into one verse
 * group with the line before them. Their lines as the editor gives them back
 * fall in a run of verse lines of one class (whatever empty paragraphs are
 * between them), inside the group verseSpan finds in that run, after its
 * first line. A run of short sentences ("Barabbas is set free.") makes no
 * group and leaves no block here.
 */
function insideVerse(blocks) {
  const inside = new Set();
  let lines = [];
  let starts = []; // [block, index in lines of its first line]
  let cls = null;
  const close = () => {
    const span = verseSpan(lines);
    if (span) for (const [block, at] of starts) if (at > span[0] && at <= span[1]) inside.add(block);
    lines = [];
    starts = [];
  };
  for (const block of blocks) {
    const own = editorLines(block);
    if (!own.length || classOf(block) !== cls) close();
    cls = classOf(block);
    own.forEach((line, k) => {
      if (k === 0) starts.push([block, lines.length]);
      if (isVerseText(line)) lines.push(line);
      else close();
    });
  }
  close();
  return inside;
}

// Would block b and the block a before it (with nothing between them) be put
// together by a later save or repair? b would join a verse group with the
// lines before it (`verse`, from insideVerse), or b would be joined to a as
// one paragraph. The empty paragraph between them is kept if so.
const wouldJoin = (a, b, verse) => verse.has(b) || (sameKind(a, b) && splitByWrap(textInfo(flatText(a)), flatText(b), true));

const isBodyHeading = (node) => isTag(node) && /^h[1-4]$/.test(node.name) && !hasClass(node, "pdf-ref-heading");

// A title line between two sections (block `at` of the post): not an
// attribution, sign-off or opening dedication, not the line after a
// quotation, and followed by prose.
function isSectionTitle(block, prev, next, at) {
  if (!isLine(block) || block.attribs.class) return false;
  const text = flatText(block);
  if (!isTitleLine(text) || NOT_A_TITLE_RE.test(text) || (at < OPENING_BLOCKS && DEDICATION_RE.test(text))) return false;
  if (!next || !isLine(next) || flatText(next).length < 100) return false;
  if (!prev) return true;
  if (isEl(prev, "blockquote")) return false;
  if (!isEl(prev, "p")) return true;
  const before = flatText(prev);
  return CLOSED_END_RE.test(before) && !QUOTE_LINE_RE.test(before);
}

/**
 * Short title lines that mark sections become <h3> headings, but only in a
 * post that clearly uses them that way: at least two such lines set off by an
 * empty spacer paragraph. Headings the post already has are no evidence: a
 * post qualifies on its own lines, or the attribution under a quotation in a
 * post with two headings would become one.
 */
function markSections(blocks, spacers, log) {
  const titles = new Set(blocks.filter((b, i) => isSectionTitle(b, blocks[i - 1], blocks[i + 1], i)));
  const evidence = [...titles].filter((b) => spacers.has(b)).length;
  if (!titles.size || evidence < 2) return blocks;
  return blocks.map((b) => {
    if (!titles.has(b)) return b;
    const heading = new Element("h3", {}, []);
    setChildren(heading, b.children);
    log("section-heading", [html(b)], html(heading));
    return heading;
  });
}

/* ------------------------------------------------------------------ */
/*  References                                                         */
/* ------------------------------------------------------------------ */

const startsEntry = (text) => AUTHOR_RE.test(text) || YEAR_RE.test(text.slice(0, 150)) || NUMBERED_RE.test(text);

const isLocator = (text) => text.length <= 40 && text.split(" ").length <= 6 && LOCATOR_RE.test(text) &&
  !YEAR_RE.test(text) && !AUTHOR_RE.test(text) && !HAS_URL_RE.test(text);

// Does this paragraph read as a citation rather than a sentence of the essay
// or a closing line ("Soli Deo Gloria")?
const looksLikeCitation = (text) => NAMED_AUTHOR_RE.test(text) || NAME_DOT_RE.test(text) || YEAR_RE.test(text.slice(0, 150)) ||
  NUMBERED_RE.test(text) || HAS_URL_RE.test(text) || /\b(?:1[5-9]|20)\d\d\b/.test(text) || isLocator(text);

/**
 * Is this line the label of the references? "strong" for References,
 * Bibliography, Works Cited and the like, "weak" for Notes or Sources (also
 * ordinary section names), otherwise null. The translation engine
 * (src/lib/translation/html.js) asks the same question.
 * @param {string} text
 * @returns {"strong" | "weak" | null}
 */
export function referenceLabel(text) {
  const label = stripEnumerator(String(text).replace(/\s+/g, " ").trim()).replace(/\s*:$/, "");
  if (label.length > 40 || !(REF_HEADING_RE.test(label) || NOTES_HEADING_RE.test(label))) return null;
  return WEAK_HEADING_RE.test(label) ? "weak" : "strong";
}

// Does a block open like a citation? Only the start of its first line counts:
// neither verse grouping nor a wrap join (whose first half is 60 characters or
// more) can change it, so the next save decides the same way.
function opensWithCitation(block) {
  const start = textOf(block).split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 60);
  return NAMED_AUTHOR_RE.test(start) || NAME_DOT_RE.test(start) || YEAR_RE.test(start) || NUMBERED_RE.test(start) ||
    /^(?:https?:\/\/|www\.)/i.test(start) || ADDRESS_LINE_RE.test(start) || isLocator(start);
}

/**
 * The label that starts the references: a short line of its own. "Notes" or
 * "Sources" only when a citation or a list follows it.
 */
function isReferenceHeading(node, next) {
  if (!isTag(node) || !TEXT_BLOCKS.has(node.name) || hasBreak(node)) return false;
  if (hasClass(node, "pdf-ref-heading")) return true;
  const label = referenceLabel(flatText(node));
  if (label !== "weak") return label === "strong";
  if (isEl(next, "ol") || isEl(next, "ul")) return true;
  return isEl(next, "p") && (hasClass(next, "pdf-ref-entry") || opensWithCitation(next));
}

// The rest of a URL that a line wrap pushed onto the next line: address
// characters only, with a path or a query in them. A line that is an address
// or a DOI of its own ("newadvent.org/…", "doi:10.…") is another source,
// unless the URL above stops right after "https://" or "www.".
function continuesUrl(prev, text) {
  const url = lastToken(prev.last);
  if (!/^https?:\/\/\S*$/i.test(url) || !/^[\w\-.~%/?#=&+:;@!$,]+$/.test(text) || !/[/=?&%]/.test(text)) return false;
  if (/^(?:https?:|www\.)/i.test(text)) return false;
  if (/^(?:doi:|10\.\d{4,}\/)/i.test(text) || /^[\w-]+(?:\.[\w-]+)+\//.test(text)) return /:\/\/(?:www\.)?$/i.test(url);
  return true;
}

// The wrapped tail of the entry before. An address on its own line belongs to
// the source above it when that source has words and no address yet (a list
// of bare addresses is a list of sources). After a formal citation (author or
// year): a line that goes on in lower case or closes a bracket or quotation
// left open, or a few words ending in a full stop ("Marshall.", "R. Marshall.",
// "Moody Press. https://…", but not "Augustine. Confessions.", a name and a
// title of their own). With `repair` (read by eye), also any line after an
// entry that stopped mid-sentence, unless it opens like an entry of its own
// ("Pope Benedict XVI. …"): on save that is more likely a forgotten full
// stop. A wrapped line is never long, and a passage or a new entry is never a
// tail.
function continuesEntry(prev, text, repair) {
  if (ADDRESS_LINE_RE.test(text)) return !prev.url;
  if (/^(?:https?:\/\/|www\.)/i.test(text)) return false; // an address and its description: a source of its own
  if (!startsEntry(prev.head) || startsEntry(text) || isLocator(text) || isLocator(prev.head)) return false;
  const words = text.replace(URL_RE, "").trim();
  if (words.length > 120) return false;
  if (/^\p{Ll}/u.test(text) || closesOpen(prev, text)) return true;
  if (repair && !endsWithUrl(prev.last) && !endsClosed(prev.last) && !NAME_DOT_RE.test(text)) return true;
  if (words.length > 30 || words.split(" ").length > 3 || !/\.$/.test(words) || /\d{4}/.test(words)) return false;
  // A short tail ending in a full stop ("Marshall.", "Moody Press. <URL>") joins; one
  // that reads "Name. Title." is a source of its own, unless the entry stopped on a
  // lower-case word ("Life of" + "Christ. McGraw-Hill.") or the stop is a title ("Fr. Smith.").
  return /\s\p{Ll}+$/u.test(prev.last) || !/\p{L}{2}\.\s+\p{Lu}/u.test(words.replace(/\b(?:Fr|Dr|Mr|Mrs|Ms|St|Sr|Jr)\.\s/g, ""));
}

function toReferenceHeading(block, log) {
  const text = flatText(block);
  const done = isEl(block, "h3") && block.attribs.class === "pdf-ref-heading" && Object.keys(block.attribs).length === 1 &&
    block.children.length === 1 && block.children[0].type === "text";
  if (done) return block;
  const heading = new Element("h3", { class: "pdf-ref-heading" }, []);
  setChildren(heading, [new Text(text)]);
  log("ref-heading", [html(block)], html(heading));
  return heading;
}

// Entries are left-aligned with a hanging indent (styles.css), whatever
// alignment or indent was pasted with them.
function asEntry(block) {
  const before = block.attribs.class || "";
  setClasses(block, ["pdf-ref-entry"]);
  delete block.attribs.style;
  return before !== block.attribs.class;
}

// A centred or indented line after the references that is no citation (a
// closing prayer, a signature) keeps its own look.
const keepsOwnStyle = (block) => /(?:^|\s)ql-(?:align|indent)-/.test(classOf(block)) && !hasClass(block, "pdf-ref-entry") &&
  !looksLikeCitation(flatText(block));

/**
 * The references: the heading and the blocks after it, up to the next heading
 * of the essay. One pdf-ref-entry per source. Lines a wrap split off an entry
 * are joined back, URLs split across lines are rejoined without a space, and
 * passages listed under an entry stay on their own lines (<br>). Nothing is
 * joined across an empty paragraph (a block in `breaks`); where the entries
 * on either side, as they end up, would be joined by a later save or repair,
 * the entry after it goes into `keep` and the empty paragraph stays.
 */
function formatReferences(blocks, { breaks, keep, log, repair }) {
  if (!blocks.length) return blocks;
  const out = [toReferenceHeading(blocks[0], log)];
  const restyled = new Set();
  const apart = []; // [entry before, entry after] an empty paragraph
  let entry = null; // { block, info, parts, before, rule, underEntry }
  const finish = () => {
    if (entry?.parts.length) {
      joinInline(entry.block, entry.parts);
      log(entry.rule, entry.before, html(entry.block));
    }
  };
  blocks.slice(1).forEach((block, i, rest) => {
    if (!isEl(block, "p") || keepsOwnStyle(block)) {
      finish();
      entry = null;
      out.push(block);
      return;
    }
    if (asEntry(block)) restyled.add(block);
    const text = flatText(block);
    const glue = entry && !breaks.has(block) ? entryGlue(entry.info, text, rest[i + 1], entry.underEntry, repair) : null;
    if (glue === null) {
      finish();
      const previous = entry;
      // An entry saved with its passages listed under it (<br>) is still
      // listing them.
      entry = { block, info: textInfo(text), parts: [], before: [], rule: "", underEntry: hasBreak(block) };
      if (previous && breaks.has(block)) apart.push([previous, entry]);
      out.push(block);
      return;
    }
    if (!entry.parts.length) entry.before.push(html(entry.block));
    entry.parts.push([glue, block]);
    entry.before.push(html(block));
    entry.info = joinText(entry.info, glue === "" ? "" : " ", text);
    entry.underEntry = isTag(glue);
    // One report line per entry, named after its most telling join.
    const rule = glue === "" ? "url-join" : entry.underEntry ? "ref-lines" : "ref-join";
    if (!entry.rule || rule === "url-join" || (rule === "ref-join" && entry.rule === "ref-lines")) entry.rule = rule;
  });
  finish();
  const position = new Map(out.map((b, i) => [b, i]));
  for (const [before, after] of apart) {
    const next = out[position.get(after.block) + 1];
    if (entryGlue(before.info, flatText(after.block), next, before.underEntry, true) !== null) keep.add(after.block);
  }
  const marked = out.filter((b) => restyled.has(b)).length;
  if (marked) log("ref-entries", [], `${marked} reference entr${marked === 1 ? "y" : "ies"} given the hanging-indent style`);
  return out;
}

// How a block with text `text` attaches to the entry before it (`prev`, a
// textInfo): "" (rest of a split URL), a <br> (a passage listed under a
// source), " " (a wrapped line) or null (it is an entry of its own).
function entryGlue(prev, text, next, underEntry, repair) {
  if (continuesUrl(prev, text)) return "";
  const listed = underEntry || (isEl(next, "p") && isLocator(flatText(next)) && prev.bible);
  if (isLocator(text) && listed && !isLocator(prev.head)) return new Element("br", {});
  if (!underEntry && continuesEntry(prev, text, repair)) return " ";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Containers                                                         */
/* ------------------------------------------------------------------ */

function cleanInline(block, log) {
  const before = html(block);
  unwrapSpans(block);
  stripInvisible(block);
  joinTexts(block);
  tidyWhitespace(block);
  const after = html(block);
  if (after !== before) log("spacing", [before], after);
}

/**
 * The rules over a container's blocks: verse and wrapped paragraphs in the
 * body, the references from their heading to the next heading of the essay
 * (there can be body after them), then section headings. Returns the blocks
 * and `keep`, the blocks an empty paragraph has to stay in front of.
 */
function formatFlow(blocks, breaks, log, repair) {
  const keep = new WeakSet();
  const out = [];
  let rest = blocks;
  while (rest.length) {
    let refAt = rest.findIndex((b, i) => isReferenceHeading(b, rest[i + 1]));
    if (refAt < 0) refAt = rest.length;
    const body = mergeSplitParagraphs(groupVerse(rest.slice(0, refAt), breaks, log), breaks, log, repair);
    const verse = insideVerse(body);
    body.forEach((b, i) => {
      if (i && breaks.has(b) && wouldJoin(body[i - 1], b, verse)) keep.add(b);
    });
    append(out, body);
    if (refAt === rest.length) break;
    let end = rest.findIndex((b, i) => i > refAt && isBodyHeading(b));
    if (end < 0) end = rest.length;
    append(out, formatReferences(rest.slice(refAt, end), { breaks, keep, log, repair }));
    rest = rest.slice(end);
  }
  return { blocks: markSections(out, breaks, log), keep };
}

// An empty paragraph as the editor writes it.
const SPACER_HTML = "<p><br></p>";

// The block list of the post itself or of a <div class="pdf-text"> wrapper.
function formatContainer(container, log, repair) {
  const breaks = new WeakSet(); // blocks that came after an empty paragraph
  const spacersBefore = new Map();
  const dropped = [];
  let blocks = [];
  let spacers = [];
  for (const child of container.children || []) {
    if (child.type === "text" && !child.data.trim()) continue; // whitespace between blocks
    if (isEl(child, "div") && hasClass(child, "pdf-text")) formatContainer(child, log, repair);
    else if (isTag(child) && BLOCKS.has(child.name) && !isEmptyBlock(child)) cleanInline(child, log);
    if (isEmptyBlock(child)) {
      spacers.push(child);
      continue;
    }
    if (spacers.length) {
      breaks.add(child);
      if (blocks.length) spacersBefore.set(child, spacers);
      else append(dropped, spacers);
    }
    spacers = [];
    blocks.push(child);
  }
  append(dropped, spacers);

  const result = formatFlow(blocks, breaks, log, repair);
  blocks = [];
  for (const b of result.blocks) {
    if (result.keep.has(b)) {
      const [spacer, ...extra] = spacersBefore.get(b);
      spacersBefore.delete(b);
      const kept = parseDocument(SPACER_HTML).children[0];
      if (html(spacer) !== html(kept)) log("spacing", [html(spacer)], html(kept));
      blocks.push(kept);
      append(dropped, extra);
    }
    blocks.push(b);
  }
  for (const before of spacersBefore.values()) append(dropped, before);
  for (const spacer of dropped) log("empty", [html(spacer)], "");

  let links = 0;
  for (const b of blocks) if (isTag(b)) links += linkify(b);
  if (links) log("links", [], `${links} plain URL${links === 1 ? "" : "s"} made into link${links === 1 ? "" : "s"}`);
  for (const b of blocks) {
    if (!isEl(b, "p") || !hasClass(b, "pdf-ref-entry")) continue;
    const before = html(b);
    if (mendSplitLinks(b)) log("url-join", [before], html(b));
  }
  setChildren(container, blocks);
}

// A PDF post keeps its text in one <div class="pdf-text">, the way the editor
// saves it (public/js/quill-init.js); posts from older imports had none.
function wrapPdfText(doc, log) {
  const isWrapper = (node) => isEl(node, "div") && hasClass(node, "pdf-text");
  const kids = doc.children.filter((c) => !(c.type === "text" && !c.data.trim()));
  if (!kids.length || (kids.length === 1 && isWrapper(kids[0]))) return;
  const wrapper = new Element("div", { class: "pdf-text" }, []);
  setChildren(wrapper, kids.flatMap((c) => (isWrapper(c) ? c.children : [c])));
  setChildren(doc, [wrapper]);
  log("pdf-wrapper", [], "the text of this PDF post put in its pdf-text container, as the editor saves it");
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

// One pass of every rule over the HTML.
function formatOnce(source, pdf, repair) {
  const changes = [];
  const log = (rule, before, after) => changes.push({ rule, before, after });
  const colours = (source.match(/style\s*=\s*["'][^"']*(?:color|background)/gi) || []).length;
  if (colours) log("colours", [], `pasted colour removed from ${colours} place${colours === 1 ? "" : "s"}`);

  const doc = parseDocument(sanitizeRichHtml(source));
  if (pdf) wrapPdfText(doc, log);
  formatContainer(doc, log, repair);
  return { html: sanitizeRichHtml(render(doc, { encodeEntities: "utf8" })), changes };
}

// A block's text, line breaks kept: how a change of a later pass finds the
// change of an earlier one that made its block (the later pass sees it with
// its links made and sanitized).
const blockKey = (blockHtml) => textOf(parseDocument(blockHtml)).replace(/[^\S\n]+/g, " ").trim();

/**
 * The changes of two passes as changes to the first pass's input: a later
 * change to a block that an earlier change made takes over that change's
 * blocks as its own "before" (and its rule, if the later one only tidied
 * spacing).
 */
function combineChanges(earlier, later) {
  const out = earlier.slice();
  const made = new Map(); // block text -> index in out of the change that made the block
  out.forEach((change, i) => {
    const key = change.before.length ? blockKey(change.after) : "";
    if (key) made.set(key, i);
  });
  for (const change of later) {
    if (!change.before.length) {
      out.push(change);
      continue;
    }
    const before = [];
    let rule = change.rule;
    for (const block of change.before) {
      const key = blockKey(block);
      const from = key ? made.get(key) : undefined;
      if (from === undefined) {
        before.push(block);
        continue;
      }
      append(before, out[from].before);
      if (rule === "spacing") rule = out[from].rule;
      out[from] = null;
      made.delete(key);
    }
    out.push({ rule, before, after: change.after });
  }
  return out.filter(Boolean);
}

// The rules can open the way for one another: a line that only joins once
// the paragraph above it has been joined to its tail, say. The passes run
// again on their own output until it stops changing, so that saving a
// formatted post changes nothing: formatPostHtml(formatPostHtml(x)) ===
// formatPostHtml(x). A post that is already formatted takes one pass.
const MAX_PASSES = 4;

/**
 * Formats post HTML and describes what changed.
 * @param {string} dirtyHtml
 * @param {{ pdf?: boolean, repair?: boolean }} [options]
 *   pdf: the body of a PDF post (kept in one <div class="pdf-text">);
 *   repair: also join paragraphs split without a clue (see splitByWrap)
 * @returns {{ html: string, changes: { rule: string, before: string[], after: string }[] }}
 *   changes: what was changed in dirtyHtml, in order
 */
export function formatPost(dirtyHtml, { pdf = false, repair = false } = {}) {
  let input = String(dirtyHtml || "");
  let result = formatOnce(input, pdf, repair);
  for (let pass = 1; pass < MAX_PASSES && result.html !== input; pass++) {
    input = result.html;
    const again = formatOnce(input, pdf, repair);
    if (again.html !== input) result = { html: again.html, changes: combineChanges(result.changes, again.changes) };
  }
  return result;
}

/**
 * Formats post HTML: sanitized, tidy paragraphs, verse lines kept together,
 * references in the site's reference style. Never changes the words.
 * @param {string} dirtyHtml
 * @param {{ pdf?: boolean }} [options] see formatPost
 * @returns {string}
 */
export function formatPostHtml(dirtyHtml, options) {
  return formatPost(dirtyHtml, options).html;
}
