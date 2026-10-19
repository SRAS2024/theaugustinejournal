// test/pdf-text.test.js
// Run: node --test test/pdf-text.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import { extractPdfHtml, pdfTextToHtml } from "../src/lib/pdf-text.js";
import { formatPostHtml } from "../src/lib/post-format.js";
import { plainText } from "../src/lib/translation/html.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function decode(str) {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// HTML -> [{ tag, cls, text }] for the blocks pdf-text emits.
function blocksOf(html) {
  assert.match(html, /^<div class="pdf-text">[\s\S]*<\/div>$/);
  return [...html.matchAll(/<(p|h3)(?: class="([^"]*)")?>([\s\S]*?)<\/\1>/g)].map((m) => ({
    tag: m[1],
    cls: m[2] || "",
    text: decode(m[3])
  }));
}

const p = (text, cls = "") => ({ tag: "p", cls, text });
const refHeading = (text) => ({ tag: "h3", cls: "pdf-ref-heading", text });
const ref = (text) => ({ tag: "p", cls: "pdf-ref-entry", text });

/* ------------------------------------------------------------------ */
/*  A tiny PDF writer: Courier text at exact positions                 */
/* ------------------------------------------------------------------ */

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 72;
const SIZE = 12;
const CHAR_W = SIZE * 0.6; // Courier advance width
const COLUMN_CHARS = 65; // 65 * 7.2pt = 468pt = 6.5in column
const PITCH = 14;

function pdfString(text) {
  return `(${text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

// pages: [[{ x, y, size, text }]] -> PDF bytes (Uint8Array view of a Buffer)
function buildPdf(pages) {
  const objects = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  pages.forEach((items, i) => {
    const content = items
      .map((it) => `BT /F1 ${it.size} Tf ${it.rotated ? "0 1 -1 0" : "1 0 0 1"} ${it.x.toFixed(2)} ${it.y.toFixed(2)} Tm ` +
        `${pdfString(it.text)} Tj ET`)
      .join("\n");
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// Greedy word wrap, like a word processor with ragged-right text.
function wrap(text, firstChars, chars) {
  const lines = [];
  let cur = "";
  let max = firstChars;
  for (const word of text.split(" ")) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= max) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
      max = chars;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Lays paragraphs out top to bottom with no space between them unless
// spaceBefore says so; a paragraph that does not fit continues on the next
// page. A block is { text } (wrapped) or { lines } (forced line breaks).
function typeset(blocks, { top = 700, bottom = 80, header, pageNumbers = true } = {}) {
  const pages = [[]];
  let y = top;
  const newPage = () => {
    pages.push([]);
    y = top;
  };
  for (const b of blocks) {
    y -= b.spaceBefore || 0;
    const size = b.size || SIZE;
    if (b.center) {
      const width = b.text.length * size * 0.6;
      pages[pages.length - 1].push({ x: (PAGE_W - width) / 2, y, size, text: b.text });
      y -= size * 1.2;
      continue;
    }
    const indentChars = b.indent ? 5 : 0;
    const lines = b.lines || wrap(b.text, COLUMN_CHARS - indentChars, COLUMN_CHARS - (b.hanging ? 5 : 0));
    lines.forEach((line, i) => {
      if (y < bottom) newPage();
      let x = LEFT;
      if (i === 0 && b.indent) x += 5 * CHAR_W;
      if (i > 0 && b.hanging) x += 5 * CHAR_W;
      pages[pages.length - 1].push({ x, y, size, text: line });
      y -= PITCH;
    });
  }
  pages.forEach((items, i) => {
    if (header) items.unshift({ x: LEFT, y: 750, size: 9, text: header });
    if (pageNumbers) items.push({ x: 300, y: 40, size: 9, text: String(i + 1) });
  });
  return pages;
}

const ESSAY_A = "Augustine teaches that the human heart is restless until it rests in God, and he returns " +
  "to this theme in almost every book of the Confessions with great patience and with disarming candor. " +
  "I think his honesty about his own wandering is what makes the book so consoling for readers today.";
const ESSAY_B = "Centuries later the same longing would shape the Church in ways Augustine could not have " +
  "foreseen. His writings became a common inheritance, read by monks and reformers, by philosophers " +
  "and by ordinary believers who simply wanted to pray, and each generation found in him a companion " +
  "for its own questions about time, memory, grace and freedom, and about the God who had been " +
  "seeking them long before they began to seek him in return.";
const REF_1 = "Brown, Peter. Augustine of Hippo: A Biography. Revised edition with a new epilogue. " +
  "Berkeley: University of California Press, 2000.";
const REF_2 = "Wills, Garry. Saint Augustine. New York: Viking, 1999.";

function samplePdf() {
  return typeset([
    { text: "On Memory", size: 20, center: true },
    { text: ESSAY_A, indent: true, spaceBefore: 24 },
    { lines: ["Who sought whom?", "I", "did not seek you first."] },
    { lines: ["Dates to remember:", "354", "386", "430"] },
    { text: ESSAY_B, indent: true },
    { lines: [
      "O give thanks to the Lord, for he is good,",
      "for his steadfast love endures forever.",
      "O give thanks to the God of gods,",
      "for his steadfast love endures forever."
    ], spaceBefore: 14 },
    { text: "Works Cited", spaceBefore: 14 },
    { text: REF_1, hanging: true },
    { text: REF_2, hanging: true }
  ], { header: "The Augustine Journal", top: 700, bottom: 520 });
}

/* ------------------------------------------------------------------ */
/*  pdfTextToHtml: plain text                                          */
/* ------------------------------------------------------------------ */

describe("pdfTextToHtml", () => {
  test("returns an empty string when there is no text", () => {
    assert.equal(pdfTextToHtml(""), "");
    assert.equal(pdfTextToHtml("  \n\f \n "), "");
    assert.equal(pdfTextToHtml(null), "");
  });

  test("wraps paragraphs in .pdf-text and escapes all text", () => {
    const html = pdfTextToHtml("Use <b>bold</b> & \"quotes\" with care.\nIt's fine.\n\n<script>alert(1)</script> is text.");
    assert.equal(
      html,
      '<div class="pdf-text"><p>Use &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot; with care. It&#039;s fine.</p>\n' +
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; is text.</p></div>"
    );
  });

  test("keeps the word I, drop caps, real numbers and short body lines", () => {
    const text = [
      "L\nate have I loved you, O Beauty ever ancient, ever new.",
      "It was\nI\nwho wandered, and in 1054 the Church was divided.",
      "1054",
      "C\nivil and civic life were not enough for him.",
      "I"
    ].join("\n\n");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("Late have I loved you, O Beauty ever ancient, ever new."),
      p("It was I who wandered, and in 1054 the Church was divided."),
      p("1054"),
      p("Civil and civic life were not enough for him."),
      p("I")
    ]);
  });

  test("strips page numbers only at the top or bottom of a page", () => {
    const text = [
      "First page body text that goes on for a while and ends here.\n\n1",
      "- 2 -\nSecond page body text, still going on for a while.\n\n12",
      "Third page body text.\n\nPage 3",
      "ix\n\nFourth page body text.\n\n4 of 9"
    ].join("\f");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("First page body text that goes on for a while and ends here."),
      p("Second page body text, still going on for a while."),
      p("12"),
      p("Third page body text."),
      p("ix"),
      p("Fourth page body text.")
    ]);
  });

  test("removes running headers/footers repeated at page edges, keeps repeated body lines", () => {
    const page = (n, body) => `The Augustine Journal\n\n${body}\n\nDoe ${n}`;
    const refrain = "for his steadfast love endures forever.";
    const text = [
      page(1, `O give thanks to the Lord, for he is good,\n${refrain}\n\nAmen.\n\n3 Ibid.`),
      page(2, `O give thanks to the God of gods,\n${refrain}\n\nAmen.\n\n7 Ibid.`),
      page(3, `O give thanks to the Lord of lords,\n${refrain}\n\nAmen.\n\nThe end of the reading.`)
    ].join("\f");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p(`O give thanks to the Lord, for he is good, ${refrain}`),
      p("Amen."),
      p("3 Ibid."),
      p(`O give thanks to the God of gods, ${refrain}`),
      p("Amen."),
      p("7 Ibid."),
      p(`O give thanks to the Lord of lords, ${refrain}`),
      p("Amen."),
      p("The end of the reading.")
    ]);
  });

  test("a one-page PDF never loses repeated lines", () => {
    const text = "Amen.\n\nWe pray.\n\nAmen.\n\nWe pray.";
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [p("Amen."), p("We pray."), p("Amen."), p("We pray.")]);
  });

  test("keeps every block of a short one-page letter", () => {
    const text = [
      "Dear Brothers and Sisters in Christ,",
      "Thank you for your prayers this year. Let us keep praying for one another.",
      "What, then, shall we do?",
      "We shall love one another as He has loved us.",
      "Yours in Christ,",
      "Father John"
    ].join("\n\n");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("Dear Brothers and Sisters in Christ,"),
      p("Thank you for your prayers this year. Let us keep praying for one another."),
      p("What, then, shall we do?"),
      p("We shall love one another as He has loved us."),
      p("Yours in Christ,"),
      p("Father John")
    ]);
    // A single short paragraph is returned as is.
    assert.deepEqual(blocksOf(pdfTextToHtml("Dear friends, thank you for your prayers. Let us keep praying.")), [
      p("Dear friends, thank you for your prayers. Let us keep praying.")
    ]);
  });

  test("drops a title, its byline and section headings, but not short paragraphs", () => {
    const body = "Augustine teaches that the human heart is restless until it rests in God. This is a summons.";
    const text = [
      "On the Restless Heart",
      "By Jane Doe",
      "Introduction",
      body,
      "Memory and Time",
      `${body}\nIt calls the soul beyond the passing goods of the world.`,
      "What, then, is time?",
      body,
      "Dear friends,",
      body,
      "Amen"
    ].join("\n\n");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p(body),
      p(`${body} It calls the soul beyond the passing goods of the world.`),
      p("What, then, is time?"),
      p(body),
      p("Dear friends,"),
      p(body),
      p("Amen")
    ]);
  });

  test("keeps a first block that is not a title, and uses the post title when given", () => {
    const body = "Augustine teaches that the human heart is restless until it rests in God. This is a summons.";
    assert.deepEqual(blocksOf(pdfTextToHtml(`October 18, 2026\n\n${body}`)), [p("October 18, 2026"), p(body)]);
    assert.deepEqual(blocksOf(pdfTextToHtml(`a quiet beginning\n\n${body}`)), [p("a quiet beginning"), p(body)]);
    assert.deepEqual(
      blocksOf(pdfTextToHtml(`What Is Time? Notes on Book XI\n\n${body}`, { title: "What is time? Notes on Book XI" })),
      [p(body)]
    );
  });

  test("joins hyphenated line breaks correctly", () => {
    const text = [
      "The theo-\nlogical virtues are faith, hope, and charity.",
      "A well-known saint; the well-\nknown saint again.",
      "The Judeo-\nChristian tradition, the years 1054–\n1204, and an em dash—\nlike this.",
      "A soft\u00AD\nhyphen and a spaced dash -\nstay apart.",
      "See https://example.com/some-\npage for the text."
    ].join("\n\n");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("The theological virtues are faith, hope, and charity."),
      p("A well-known saint; the well-known saint again."),
      p("The Judeo-Christian tradition, the years 1054–1204, and an em dash—like this."),
      p("A softhyphen and a spaced dash - stay apart."),
      p("See https://example.com/some-page for the text.")
    ]);
  });

  test("marks first-line indents with pdf-indent", () => {
    const text = "     An indented first line\ncontinues here.\n\nA paragraph without indent.\n\n\tA tab-indented paragraph.";
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("An indented first line continues here.", "pdf-indent"),
      p("A paragraph without indent."),
      p("A tab-indented paragraph.", "pdf-indent")
    ]);
  });

  test("merges a paragraph broken by a page break", () => {
    const text = [
      "Augustine teaches that the human heart is restless until it\nrests in God, and that this restlessness is",
      "not a defect but a summons.\n\nA new paragraph starts here.",
      "Another one starts on the next page."
    ].join("\f");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("Augustine teaches that the human heart is restless until it rests in God, and that this restlessness is not a defect but a summons."),
      p("A new paragraph starts here."),
      p("Another one starts on the next page.")
    ]);
  });

  test("styles the References section and keeps the author's heading", () => {
    const text = [
      "Augustine teaches that the human heart is restless until it rests in God. This is a summons.",
      "Works Cited",
      "Augustine. Confessions. Translated by Henry Chadwick. Oxford: Oxford\nUniversity Press, 1991.\nBrown, Peter. Augustine of Hippo. Berkeley: University of California\nPress, 2000.",
      "Wills, Garry. Saint Augustine. Viking, 1999."
    ].join("\n\n");
    assert.deepEqual(blocksOf(pdfTextToHtml(text)), [
      p("Augustine teaches that the human heart is restless until it rests in God. This is a summons."),
      refHeading("Works Cited"),
      ref("Augustine. Confessions. Translated by Henry Chadwick. Oxford: Oxford University Press, 1991."),
      ref("Brown, Peter. Augustine of Hippo. Berkeley: University of California Press, 2000."),
      ref("Wills, Garry. Saint Augustine. Viking, 1999.")
    ]);
    for (const heading of ["References", "Bibliography:", "Sources", "Referências", "Bibliographie", "Литература"]) {
      const html = pdfTextToHtml(`Some body text that is long enough to be a paragraph of the essay.\n\n${heading}\n\nAn entry.`);
      assert.deepEqual(blocksOf(html).slice(1), [refHeading(heading.replace(/:$/, "")), ref("An entry.")]);
    }
  });

  test("keeps everything when every block looks like a heading", () => {
    assert.deepEqual(blocksOf(pdfTextToHtml("Introduction")), [p("Introduction")]);
  });
});

/* ------------------------------------------------------------------ */
/*  extractPdfHtml: real PDF bytes                                     */
/* ------------------------------------------------------------------ */

const SAMPLE_EXPECTED = [
  p(ESSAY_A, "pdf-indent"),
  p("Who sought whom?"),
  p("I"),
  p("did not seek you first."),
  p("Dates to remember:"),
  p("354"),
  p("386"),
  p("430"),
  p(ESSAY_B, "pdf-indent"),
  p("O give thanks to the Lord, for he is good,"),
  p("for his steadfast love endures forever."),
  p("O give thanks to the God of gods,"),
  p("for his steadfast love endures forever."),
  refHeading("Works Cited"),
  ref(REF_1),
  ref(REF_2)
];

describe("extractPdfHtml", () => {
  test("the synthetic sample really exercises the layout cases", () => {
    const pages = samplePdf();
    assert.ok(pages.length >= 2, "the sample spans pages");
    const lastOnPage1 = pages[0].filter((it) => it.size === SIZE).pop().text;
    assert.ok(!/[.!?]$/.test(lastOnPage1), "a paragraph runs over the page break");
    const lines = pages.flat().map((it) => it.text);
    assert.ok(lines.some((l) => /^I /.test(l)), "a line starts with the word I");
    assert.ok(buildPdf(pages).length < 4096, "small enough to hit the pdf.js Buffer bug");
  });

  test("rebuilds paragraphs, indents, references and strips page furniture", async () => {
    const bytes = buildPdf(samplePdf());
    assert.deepEqual(blocksOf(await extractPdfHtml(bytes)), SAMPLE_EXPECTED);
  });

  test("accepts a pooled Buffer, a Uint8Array and an ArrayBuffer", async () => {
    const bytes = buildPdf(samplePdf());
    // Like fs.readFileSync on a small file: a view into a larger pool.
    const pool = Buffer.alloc(bytes.length + 512);
    bytes.copy(pool, 37);
    const pooled = pool.subarray(37, 37 + bytes.length);
    assert.notEqual(pooled.byteOffset, 0);
    const copy = new Uint8Array(bytes);
    const arrayBuffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    for (const input of [pooled, copy, arrayBuffer]) {
      assert.deepEqual(blocksOf(await extractPdfHtml(input)), SAMPLE_EXPECTED);
    }
    // The input is not modified.
    assert.deepEqual(Buffer.from(copy), bytes);
  });

  test("uses the post title to drop a body-size title line", async () => {
    const pages = typeset([
      { text: "A Letter to the Faithful" },
      { text: "Dear Brothers and Sisters in Christ,", spaceBefore: 14 },
      { text: "I write to you at the start of this holy season with gratitude for your faithfulness, and I ask you to remember the poor.", spaceBefore: 14 },
      { text: "Yours in Christ,", spaceBefore: 14 },
      { text: "Father John" }
    ], { pageNumbers: false });
    const body = [
      p("Dear Brothers and Sisters in Christ,"),
      p("I write to you at the start of this holy season with gratitude for your faithfulness, and I ask you to remember the poor."),
      p("Yours in Christ,"),
      p("Father John")
    ];
    assert.deepEqual(blocksOf(await extractPdfHtml(buildPdf(pages))), [p("A Letter to the Faithful"), ...body]);
    assert.deepEqual(blocksOf(await extractPdfHtml(buildPdf(pages), { title: "A letter to the faithful" })), body);
  });

  test("keeps the text of a page set in rotated type", async () => {
    const pages = [[
      { x: 100, y: 100, size: 12, rotated: true, text: "Sideways text on a landscape table." },
      { x: 120, y: 100, size: 12, rotated: true, text: "A second sideways line." }
    ]];
    const blocks = blocksOf(await extractPdfHtml(buildPdf(pages)));
    assert.deepEqual(blocks.map((b) => b.text), ["Sideways text on a landscape table. A second sideways line."]);
  });

  test("handles accented text and translated reference headings", async () => {
    const corpo = "Agostinho ensina que o coração humano está inquieto até descansar em Deus, e essa " +
      "inquietação não é um defeito, mas um chamado que conduz a alma além dos bens passageiros.";
    const pages = typeset([
      { text: corpo, indent: true },
      { text: "Referências", spaceBefore: 14 },
      { text: "Agostinho. Confissões. Tradução de Maria Luiza Jardim Amarante. São Paulo: Paulus, 1997.", hanging: true }
    ], { pageNumbers: false });
    assert.deepEqual(blocksOf(await extractPdfHtml(buildPdf(pages))), [
      p(corpo, "pdf-indent"),
      refHeading("Referências"),
      ref("Agostinho. Confissões. Tradução de Maria Luiza Jardim Amarante. São Paulo: Paulus, 1997.")
    ]);
  });

  test("returns an empty string for a PDF without text", async () => {
    assert.equal(await extractPdfHtml(buildPdf([[]])), "");
    assert.equal(await extractPdfHtml(buildPdf([[{ x: 300, y: 40, size: 9, text: " " }]])), "");
  });

  test("rejects bytes that are not a PDF", async () => {
    await assert.rejects(extractPdfHtml(Buffer.from("this is not a pdf at all")));
  });
});

/* ------------------------------------------------------------------ */
/*  Fixtures printed by headless Chrome / CoreText (optional)          */
/* ------------------------------------------------------------------ */

// Each <name>.pdf has a <name>.expected.json ([{ tag, cls, text }]) and may
// have a <name>.options.json passed to extractPdfHtml.
const FIXTURES = process.env.PDF_FIXTURES_DIR ||
  "/private/tmp/claude-501/-Users-ryansimonds/4ee4b904-4d1e-410e-b7f0-697a84c8a36a/scratchpad/pdf-fixtures";

describe("extractPdfHtml on printed PDF fixtures", () => {
  const names = fs.existsSync(FIXTURES)
    ? fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".pdf")).map((f) => f.slice(0, -4))
      .filter((name) => fs.existsSync(path.join(FIXTURES, `${name}.expected.json`)))
    : [];
  if (!names.length) {
    test("fixtures", { skip: `no fixtures in ${FIXTURES}` }, () => {});
    return;
  }
  for (const name of names.sort()) {
    test(name, async () => {
      const read = (ext) => fs.readFileSync(path.join(FIXTURES, name + ext));
      const optionsFile = path.join(FIXTURES, `${name}.options.json`);
      const options = fs.existsSync(optionsFile) ? JSON.parse(fs.readFileSync(optionsFile, "utf8")) : {};
      const expected = JSON.parse(read(".expected.json").toString("utf8"));
      assert.deepEqual(blocksOf(await extractPdfHtml(read(".pdf"), options)), expected);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Saving an import: post-format.js                                   */
/* ------------------------------------------------------------------ */

// Every word, in order, with all whitespace removed.
const letters = (html) => plainText(html).replace(/\s+/g, "");

async function importedHtml() {
  const html = [await extractPdfHtml(buildPdf(samplePdf()))];
  if (fs.existsSync(FIXTURES)) {
    for (const f of fs.readdirSync(FIXTURES).filter((name) => name.endsWith(".pdf")).sort()) {
      html.push(await extractPdfHtml(fs.readFileSync(path.join(FIXTURES, f))));
    }
  }
  return html;
}

describe("formatPostHtml on imported PDFs", () => {
  test("keeps the import's structure and only gathers the verse lines", async () => {
    const formatted = formatPostHtml(await extractPdfHtml(buildPdf(samplePdf())));
    const verse = SAMPLE_EXPECTED.slice(9, 13).map((b) => b.text).join("<br />");
    const expected = [...SAMPLE_EXPECTED.slice(0, 9), p(verse), ...SAMPLE_EXPECTED.slice(13)];
    assert.deepEqual(blocksOf(formatted), expected);
  });

  test("never changes the words and is idempotent", async () => {
    for (const html of await importedHtml()) {
      const once = formatPostHtml(html);
      assert.equal(letters(once), letters(html));
      assert.equal(formatPostHtml(once), once);
    }
  });
});
