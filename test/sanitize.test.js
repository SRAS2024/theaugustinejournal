// test/sanitize.test.js
// Run: node --test test/sanitize.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sanitizeRichHtml } from "../src/lib/sanitize.js";
import { pdfTextToHtml } from "../src/lib/pdf-text.js";

const clean = (html) => sanitizeRichHtml(html);

describe("sanitizeRichHtml: Quill formatting", () => {
  test("keeps alignment and indent classes on every block Quill formats", () => {
    for (const tag of ["p", "h1", "h2", "h3", "h4", "li", "blockquote"]) {
      for (const cls of ["ql-align-center", "ql-align-right", "ql-align-justify", "ql-indent-1", "ql-indent-8"]) {
        const html = tag === "li" ? `<ul><li class="${cls}">x</li></ul>` : `<${tag} class="${cls}">x</${tag}>`;
        assert.equal(clean(html), html, `${tag}.${cls}`);
      }
    }
    assert.equal(clean('<h2 class="ql-align-center ql-indent-2">T</h2>'), '<h2 class="ql-align-center ql-indent-2">T</h2>');
  });

  test("drops classes that are not on the allow-list", () => {
    assert.equal(clean('<p class="ql-indent-9 ql-size-huge evil">x</p>'), "<p>x</p>");
    assert.equal(clean('<h1 class="pdf-indent ql-align-center">x</h1>'), '<h1 class="ql-align-center">x</h1>');
    assert.equal(clean('<span class="ql-font-serif">x</span>'), "<span>x</span>");
  });

  test("keeps Quill 1.3.7 code blocks", () => {
    const html = '<pre class="ql-syntax" spellcheck="false">const x = 1;\n  indented();\n</pre>';
    assert.equal(clean(html), '<pre class="ql-syntax">const x = 1;\n  indented();\n</pre>');
    assert.equal(clean("<pre>plain &lt;code&gt;</pre>"), "<pre>plain &lt;code&gt;</pre>");
  });

  test("keeps a typical Quill document unchanged", () => {
    const html = [
      '<h1 class="ql-align-center">Title</h1>',
      "<p><strong>Bold</strong>, <em>italic</em>, <u>under</u> and <s>strike</s>.</p>",
      "<p><br></p>",
      '<ol><li>One</li><li class="ql-indent-1">One point one</li></ol>',
      '<ul><li class="ql-align-right">Right</li></ul>',
      '<blockquote class="ql-align-center">Quote</blockquote>',
      '<p class="ql-align-justify ql-indent-2">Justified and indented.</p>',
      '<p><a href="https://example.com/x" target="_blank" rel="noopener noreferrer">link</a></p>'
    ].join("");
    // sanitize-html writes void tags as <br />.
    assert.equal(clean(html), html.replace("<br>", "<br />"));
  });
});

describe("sanitizeRichHtml: PDF formatting", () => {
  test("keeps the PDF wrapper and its classes where they belong", () => {
    const html = '<div class="pdf-text"><p class="pdf-indent">Body.</p><p>Plain.</p>' +
      '<h3 class="pdf-ref-heading">Works Cited</h3><p class="pdf-ref-entry">Entry.</p></div>';
    assert.equal(clean(html), html);
  });

  test("does not let PDF classes move to other tags", () => {
    assert.equal(clean('<p class="pdf-ref-heading pdf-text">x</p>'), "<p>x</p>");
    assert.equal(clean('<div class="pdf-indent">x</div>'), "<div>x</div>");
    assert.equal(clean('<h2 class="pdf-ref-heading">x</h2>'), "<h2>x</h2>");
  });

  test("pdf-text output survives sanitizing unchanged", () => {
    const html = pdfTextToHtml(
      "     An indented paragraph with <tags> & \"quotes\" that's long.\n\nReferences\n\nDoe, Jane. A Book. 2020."
    );
    // Quotes need no escaping in text, so sanitize-html writes them plainly.
    assert.equal(clean(html), html.replaceAll("&quot;", '"').replaceAll("&#039;", "'"));
    assert.match(clean(html), /&lt;tags&gt; &amp; "quotes" that's long\./);
  });
});

describe("sanitizeRichHtml: links", () => {
  test("external http(s) links open in a new tab without opener access", () => {
    assert.equal(
      clean('<a href="https://example.com">x</a>'),
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>'
    );
    assert.equal(
      clean('<a href="HTTP://example.com" target="_self" rel="opener">x</a>'),
      '<a href="HTTP://example.com" target="_blank" rel="noopener noreferrer">x</a>'
    );
    assert.equal(
      clean('<a href="//example.com/p">x</a>'),
      '<a href="//example.com/p" target="_blank" rel="noopener noreferrer">x</a>'
    );
  });

  test("tel: and mailto: links keep their href and get no target", () => {
    assert.equal(clean('<a href="tel:+15551234567" target="_blank">Call the parish</a>'), '<a href="tel:+15551234567">Call the parish</a>');
    assert.equal(
      clean('<a href="mailto:office@example.com" target="_blank" rel="noopener noreferrer">Write</a>'),
      '<a href="mailto:office@example.com">Write</a>'
    );
  });

  test("links inside the site open normally", () => {
    assert.equal(clean('<a href="/post/our-lady" target="_blank">x</a>'), '<a href="/post/our-lady">x</a>');
    assert.equal(clean('<a name="notes">x</a>'), '<a name="notes">x</a>');
  });

  test("dangerous schemes lose their href", () => {
    for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x"]) {
      assert.equal(clean(`<a href="${href}">x</a>`), "<a>x</a>", href);
    }
  });
});

describe("sanitizeRichHtml: styles", () => {
  test("drops pasted text and background colors", () => {
    assert.equal(clean('<span style="color:rgb(0, 0, 0)">Moody Press.</span>'), "<span>Moody Press.</span>");
    assert.equal(clean('<span style="background-color:#fff;color:white">x</span>'), "<span>x</span>");
    assert.equal(clean('<p style="color:#000;text-align:center">x</p>'), '<p style="text-align:center">x</p>');
    assert.equal(clean('<h2 style="background-color:white">x</h2>'), "<h2>x</h2>");
  });

  test("keeps text-align", () => {
    for (const tag of ["p", "h1", "h3", "blockquote"]) {
      assert.equal(clean(`<${tag} style="text-align:right">x</${tag}>`), `<${tag} style="text-align:right">x</${tag}>`);
    }
    assert.equal(clean('<p style="text-align:expression(alert(1))">x</p>'), "<p>x</p>");
  });

  test("keeps padding-left only when it is a small plain length", () => {
    for (const value of ["0", "40px", "2.5em", "1.5rem", "240px", "15em"]) {
      assert.equal(clean(`<p style="padding-left:${value}">x</p>`), `<p style="padding-left:${value}">x</p>`, value);
    }
    for (const value of ["9999px", "-40px", "calc(100% - 1px)", "var(--x)", "20%", "100vw", "16em", "url(x)"]) {
      assert.equal(clean(`<p style="padding-left:${value}">x</p>`), "<p>x</p>", value);
    }
  });
});

describe("sanitizeRichHtml: unsafe markup", () => {
  test("removes scripts, event handlers, frames and images", () => {
    assert.equal(clean('<p onclick="alert(1)">x<script>alert(1)</script></p>'), "<p>x</p>");
    assert.equal(clean('<img src="x" onerror="alert(1)"><iframe src="https://example.com"></iframe>'), "");
    assert.equal(clean("<style>p{color:black}</style><p>x</p>"), "<p>x</p>");
    assert.equal(clean('<div class="pdf-text" style="color:black" id="x">x</div>'), '<div class="pdf-text">x</div>');
  });
});

describe("sanitizeRichHtml: lang", () => {
  test('keeps lang="en" (untranslated references) and drops other values', () => {
    assert.equal(
      sanitizeRichHtml('<p lang="en" class="pdf-ref-entry">Sheen</p><li lang="fr">x</li><span lang="en">y</span>'),
      '<p class="pdf-ref-entry" lang="en">Sheen</p><li>x</li><span>y</span>'
    );
  });
});
