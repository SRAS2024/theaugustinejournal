// test/translation-html.test.js
// Run: node --test test/translation-html.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { htmlSegments, translateHtml, textSegments, translateText, plainText } from "../src/lib/translation/html.js";

const upper = (s) => s.toUpperCase();

describe("htmlSegments", () => {
  test("collects sentences and emphasized phrases, skipping URLs and code", () => {
    const html = '<p>First sentence. Second <em>one</em> here.</p><p>See https://example.com/a now.</p><pre>code here</pre>';
    assert.deepEqual(htmlSegments(html), ["First sentence.", "Second one here.", "one", "See", "now."]);
  });

  test("skips notranslate content and URL-like links", () => {
    const html = '<p><span class="notranslate">Keep</span> this. <a href="https://x.org">x.org</a></p><p translate="no">Never</p>';
    assert.deepEqual(htmlSegments(html), ["this."]);
  });
});

describe("translateHtml", () => {
  test("keeps structure, attributes, links and line breaks", () => {
    const html = '<p class="ql-align-center">\tHello <a href="https://a.org/x" target="_blank">the source</a> world.<br>Next line.</p><ul><li>One <b>two</b></li></ul>';
    const out = translateHtml(html, upper);
    assert.equal(out.complete, true);
    assert.equal(
      out.html,
      '<p class="ql-align-center">\tHELLO <a href="https://a.org/x" target="_blank">THE SOURCE</a> WORLD.<br>NEXT LINE.</p><ul><li>ONE <b>TWO</b></li></ul>'
    );
  });

  test("re-applies emphasis to the translated phrase", () => {
    const out = translateHtml("<p>Read <em>Confessions</em> (Book IV).</p>", (s) => (s === "Confessions" ? "Confesiones" : s.replace("Confessions", "Confesiones")));
    assert.equal(out.html, "<p>Read <em>Confesiones</em> (Book IV).</p>");
  });

  test("a paragraph is only replaced once all of its sentences are translated", () => {
    const html = "<p>One. Two.</p><p>Three.</p>";
    const out = translateHtml(html, (s) => (s === "Two." ? undefined : upper(s)));
    assert.equal(out.html, "<p>One. Two.</p><p>THREE.</p>");
    assert.equal(out.complete, false);
    assert.equal(out.total, 3);
    assert.equal(out.done, 2);
  });

  test("escapes translated text", () => {
    const out = translateHtml("<p>Hello.</p>", () => "<script>alert(1)</script> & co");
    assert.equal(out.html, "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; co</p>");
  });
});

describe("plain text", () => {
  test("textSegments and translateText", () => {
    assert.deepEqual(textSegments("Hello there.  How are you?"), ["Hello there.", "How are you?"]);
    assert.equal(translateText("Hello there. How are you?", upper), "HELLO THERE. HOW ARE YOU?");
    assert.equal(translateText("Hello there. How are you?", () => undefined), null);
  });

  test("plainText separates blocks and decodes entities", () => {
    assert.equal(plainText("<p>Faith &amp; reason.</p><p>Second&nbsp;line</p>"), "Faith & reason. Second line".replace(" ", " "));
  });
});

describe("reference lists", () => {
  test("entries after a References heading stay in English; the heading is translated", () => {
    const html = '<p>Body text.</p><p class="ql-align-center"><strong>References</strong></p><p>Sheen, F. J. (2019). The demonic today.</p><p>Catholic Church. (1997).</p>';
    assert.deepEqual(htmlSegments(html), ["Body text.", "References"]);
    const out = translateHtml(html, upper);
    assert.equal(out.complete, true);
    assert.equal(
      out.html,
      '<p>BODY TEXT.</p><p class="ql-align-center"><strong>REFERENCES</strong></p><p lang="en">Sheen, F. J. (2019). The demonic today.</p><p lang="en">Catholic Church. (1997).</p>'
    );
  });

  test("PDF reference entries are kept as they are", () => {
    const html = '<div class="pdf-text"><p>Body.</p><h3 class="pdf-ref-heading">Works Cited</h3><p class="pdf-ref-entry">Augustine. Confessions.</p></div>';
    assert.deepEqual(htmlSegments(html), ["Body.", "Works Cited"]);
  });

  test("References, Bibliography, Works Cited and the like start the list, whatever their markup", () => {
    for (const heading of ["<h2>References</h2>", "<p><strong>Bibliography</strong></p>", "<p>Works Cited:</p>", "<h3>1. References</h3>",
      "<p>Sources Cited</p>", "<p>Références</p>", "<h2>Literaturverzeichnis</h2>"]) {
      assert.equal(htmlSegments(`<p>Body text.</p>${heading}<p>Sheen, F. J. (2019). The demonic today.</p>`).length, 2, heading);
    }
    // A sentence that starts like one is body text.
    assert.deepEqual(htmlSegments("<p>References to the Psalms run all through it.</p><p>Body text.</p>"), ["References to the Psalms run all through it.", "Body text."]);
  });

  test("Notes, Sources and the like start the list only as the formatter's reference heading", () => {
    const prose = "Yet the Lord calls us to more than this.";
    for (const label of ["Notes", "Sources", "Endnotes", "Footnotes:", "Citations"]) {
      // A section of the essay: the formatter found no citation after it.
      assert.deepEqual(htmlSegments(`<p>Body text.</p><p>${label}</p><p>${prose}</p>`), ["Body text.", label, prose], label);
      assert.deepEqual(htmlSegments(`<p>Body text.</p><h2>${label}</h2><p>${prose}</p>`), ["Body text.", label, prose], label);
      const refs = `<p>Body text.</p><h3 class="pdf-ref-heading">${label}</h3><p>Augustine. Confessions.</p>`;
      assert.deepEqual(htmlSegments(refs), ["Body text.", label], label);
      assert.equal(translateHtml(refs, upper).html, `<p>BODY TEXT.</p><h3 class="pdf-ref-heading">${upper(label)}</h3><p lang="en">Augustine. Confessions.</p>`);
    }
  });

  test("the list ends at the next heading of the essay, and translation goes on", () => {
    const html = '<div class="pdf-text"><p>Body.</p><h3 class="pdf-ref-heading">References</h3><p class="pdf-ref-entry">Augustine. Confessions.</p>' +
      "<h5>Older editions</h5><p>Augustine. Confessions, 1912.</p>" +
      "<h3>Further Reading</h3><p>Read the Fathers.</p><h2>Bibliography</h2><p>Lewis, C. S. (1952).</p><h4>A Last Word</h4><p>Pray for us.</p></div>";
    assert.deepEqual(htmlSegments(html), ["Body.", "References", "Further Reading", "Read the Fathers.", "Bibliography", "A Last Word", "Pray for us."]);
    const out = translateHtml(html, upper);
    assert.equal(out.complete, true);
    assert.match(out.html, /<h5 lang="en">Older editions<\/h5><p lang="en">Augustine\. Confessions, 1912\.<\/p>/);
    assert.match(out.html, /<h3>FURTHER READING<\/h3><p>READ THE FATHERS\.<\/p><h2>BIBLIOGRAPHY<\/h2><p lang="en">Lewis, C\. S\. \(1952\)\.<\/p><h4>A LAST WORD<\/h4><p>PRAY FOR US\.<\/p>/);
  });
});

describe("review regressions", () => {
  test("a long sentence cut at ' —' keeps every character in place", () => {
    const text = `${"word ".repeat(50)}end —start ${"more ".repeat(50)}fin.`;
    const html = `<p>${text} Next sentence here.</p>`;
    const segs = htmlSegments(html);
    assert.ok(segs.some((s) => s.startsWith("start ")));
    assert.ok(segs.includes("Next sentence here."));
    const out = translateHtml(`<p>${text}</p>`, (s) => s);
    assert.equal(out.complete, true);
    assert.equal(out.html, `<p>${text}</p>`);
  });

  test("emphasis is placed on a whole word, not inside another word", () => {
    const lookup = (s) => ({ "This is true.": "Esto es verdad.", is: "es" })[s];
    assert.equal(translateHtml("<p>This <em>is</em> true.</p>", lookup).html, "<p>Esto <em>es</em> verdad.</p>");
  });

  test("URLs in plain text are never sent to the model", () => {
    const text = "Register at https://example.org/form?id=3 today!";
    assert.deepEqual(textSegments(text), ["Register at", "today!"]);
    const map = { "Register at": "Inscrivez-vous sur", "today!": "aujourd’hui !" };
    assert.equal(translateText(text, (s) => map[s]), "Inscrivez-vous sur https://example.org/form?id=3 aujourd’hui !");
    assert.equal(translateText("Write to info@example.org.", (s) => ({ "Write to": "Escriba a" })[s]), "Escriba a info@example.org.");
  });
});

test("the reference list is detected even when the heading itself gets translated", () => {
  const html = "<p>Body text.</p><h3>References</h3><p>Sheen, F. J. (2019). The demonic today.</p>";
  const map = { "Body text.": "Texto.", References: "Referencias" };
  const out = translateHtml(html, (s) => map[s]);
  assert.equal(out.complete, true);
  assert.equal(out.html, '<p>Texto.</p><h3>Referencias</h3><p lang="en">Sheen, F. J. (2019). The demonic today.</p>');
});

test("footnote markers are left as they are", () => {
  assert.deepEqual(htmlSegments("<p>Bishops agree.</p><p>[USCCB][1]</p>"), ["Bishops agree."]);
  assert.deepEqual(htmlSegments("<p>[usccb][1] [note 2]</p>"), []);
  assert.equal(translateHtml("<p>See this.</p><p>[usccb][1] [note 2]</p>", (t) => t.toUpperCase()).html, "<p>SEE THIS.</p><p>[usccb][1] [note 2]</p>");
});
