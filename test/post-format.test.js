// test/post-format.test.js
// Run: node --test test/post-format.test.js
//
// The real-post checks run on the original HTML of the published posts in
// test/fixtures/published-posts.json ([{ slug, type, contentType,
// contentHtml }, ...], as they were before formatting; they are public on the
// site). POST_DUMP names another dump of the same shape instead.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";

import { formatPost, formatPostHtml } from "../src/lib/post-format.js";
import { sanitizeRichHtml } from "../src/lib/sanitize.js";
import { pdfTextToHtml } from "../src/lib/pdf-text.js";
import { htmlSegments, translateHtml, plainText } from "../src/lib/translation/html.js";
import { planRestore, writeReport } from "../scripts/format-posts.mjs";

const fmt = (html, options) => formatPostHtml(html, options);
const p = (text, cls) => (cls ? `<p class="${cls}">${text}</p>` : `<p>${text}</p>`);
const entry = (text) => p(text, "pdf-ref-entry");
const REFS = '<h3 class="pdf-ref-heading">References</h3>';
// Every word, in order, with all whitespace removed.
const letters = (html) => plainText(html).replace(/\s+/g, "");
const rulesOf = (html) => formatPost(html).changes.map((c) => c.rule);

const link = (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
// The text with its spaces, as a reader sees it.
const words = (html) => plainText(html).replace(/\s+/g, " ").trim();
// What the editor gives back: Quill 1.x reloads every line of a <br>
// paragraph as a paragraph of its own (an empty one stays empty).
const reloaded = (html) => html.replace(/<p( class="[^"]*")?>((?:(?!<\/p>).)*?[^>]<br \/>(?:(?!<\/p>).)*)<\/p>/g,
  (_, cls = "", inner) => inner.split("<br />").map((line) => `<p${cls}>${line}</p>`).join(""));

// Missing or unreadable, it fails the run rather than skipping these checks.
const DUMP = process.env.POST_DUMP || new URL("./fixtures/published-posts.json", import.meta.url);
const realPosts = JSON.parse(fs.readFileSync(DUMP, "utf8")).filter((post) => typeof post.contentHtml === "string");

const CREED = [
  "I believe in one God, the Father almighty,",
  "maker of heaven and earth,",
  "of all things visible and invisible.",
  "I believe in one Lord Jesus Christ,",
  "the Only Begotten Son of God,",
  "born of the Father before all ages.",
  "I believe in one, holy, catholic, and apostolic Church.",
  "I confess one Baptism",
  "for the forgiveness of sins",
  "and the life of the world to come. Amen."
];
const LONG = "These doctrines unite the global Christian community and serve as the necessary criteria for determining what is Christian.";

describe("formatPostHtml: spacing", () => {
  test("drops pasted colours and the spans that carried them", () => {
    assert.equal(fmt('<p><span style="color:rgb(0, 0, 0)">House. </span>Text.</p>'), "<p>House. Text.</p>");
    assert.equal(fmt('<p>A <span style="color:rgb(255, 255, 255)">white</span> word.</p>'), "<p>A white word.</p>");
  });

  test("removes stray tabs and &nbsp;, collapses runs of spaces", () => {
    assert.equal(fmt("<p>\tWhen we look   upon the wind.&nbsp;&nbsp;</p>"), "<p>When we look upon the wind.</p>");
    assert.equal(fmt("<p>Jesus Christ does.&nbsp;Love is greater.</p>"), "<p>Jesus Christ does. Love is greater.</p>");
    assert.equal(fmt("<p>the life of&nbsp;<strong>Saint Augustine</strong> </p>"), "<p>the life of <strong>Saint Augustine</strong></p>");
    assert.equal(fmt("<p>Word <em> </em>word</p>"), "<p>Word word</p>");
  });

  test("keeps a no-break space that glues a short token to a number", () => {
    assert.equal(fmt("<p>See CCC §&nbsp;1601 and p.&nbsp;12, or chapter&nbsp;3.</p>"), "<p>See CCC §\u00A01601 and p.\u00A012, or chapter 3.</p>");
  });

  test("drops empty spacer paragraphs", () => {
    assert.equal(fmt("<p>One.</p><p><br></p><p>&nbsp;</p><p> </p><p><strong></strong></p><p>Two.</p>"), "<p>One.</p><p>Two.</p>");
    assert.equal(fmt("<p>One.</p><p>\u200B</p><p>Two.</p>"), "<p>One.</p><p>Two.</p>");
  });

  test("zero-width spaces go without leaving a space; joiners and non-joiners stay", () => {
    // Quill's cursor placeholder after Bold with the caret inside a word.
    assert.equal(fmt('<p>Lo<strong><span class="ql-cursor">\uFEFF</span></strong>rd Jesus Christ</p>'), "<p>Lord Jesus Christ</p>");
    assert.equal(fmt("<p>\uFEFFGrace\u200B and\u2060 peace to you.</p>"), "<p>Grace and peace to you.</p>");
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    const flag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const coder = "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}";
    assert.equal(fmt(`<p>${family} ${flag} ${coder}</p>`), `<p>${family} ${flag} ${coder}</p>`);
    // Part of the spelling: Persian "mi-khaham", a Devanagari half form, a
    // Malayalam chillu, and a ZWNJ that stops a ligature in German.
    const words = ["\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645", "\u0915\u094D\u200D\u0937", "\u0D28\u0D4D\u200D", "Auf\u200Clage"];
    assert.equal(fmt(`<p>${words.join(" ")}</p>`), `<p>${words.join(" ")}</p>`);
    assert.equal(fmt("<p>Grace\u200C and\u200D peace.</p>"), "<p>Grace\u200C and\u200D peace.</p>");
  });

  test("leaves code untouched", () => {
    const html = '<pre class="ql-syntax">  a  =  1;\n\tb();</pre><p>Use <code>x  y</code> here.</p>';
    assert.equal(fmt(html), html);
  });
});

describe("formatPostHtml: paragraphs", () => {
  test("joins a citation that a line wrap split", () => {
    assert.equal(
      fmt(p("burnt offering in place of his son” (Genesis 22:13, New American Bible") + p("Revised Edition).")),
      p("burnt offering in place of his son” (Genesis 22:13, New American Bible Revised Edition).")
    );
  });

  test("joins a quotation that a line wrap split", () => {
    assert.equal(
      fmt(p("the message is often expressed this way: “Man appointed mortal sorrow; the") + p("Blessed God shall come down teaching.”")),
      p("the message is often expressed this way: “Man appointed mortal sorrow; the Blessed God shall come down teaching.”")
    );
  });

  test("joins a paragraph that continues in lower case", () => {
    const first = "The first names of Scripture point to the same Gospel pattern: His death brings comfort and";
    assert.equal(fmt(p(first) + p("rest.")), p(`${first} rest.`));
    assert.equal(
      fmt(p("Jesus is crucified between criminals. The prophetic pattern continues:") + p("suffering, innocence, substitution.")),
      p("Jesus is crucified between criminals. The prophetic pattern continues: suffering, innocence, substitution.")
    );
  });

  test("repair joins a long paragraph that stops on a bare word, saving does not", () => {
    const first = "Christian writers have also reflected on the Hebrew form of the inscription as a theological sign. In Hebrew, the phrase can be rendered as Yeshua HaNatzri V’Melech";
    const second = "HaYehudim, which produces the initials YHWH. This is significant.";
    assert.equal(fmt(p(first) + p(second), { repair: true }), p(`${first} ${second}`));
    // In a new post the same shape is more likely a forgotten full stop.
    assert.equal(fmt(p(first) + p(second)), p(first) + p(second));
  });

  test("leaves real paragraphs alone", () => {
    const html = [
      p("Napoleon, the great conqueror, wrote:"),
      p("“Alexander the Great, Caesar, Charlemagne, and myself have founded great empires.” (O’Meara, 1822)."),
      p("Barabbas is set free."),
      p("Jesus is condemned."),
      p("The guilty man walks away."),
      p("In peace and love,"),
      p("Your brother in Christ"),
      p("Consider three things:"),
      p("faith,"),
      p("hope,"),
      p("Statement of Doctrine"),
      p("Christianity is the belief that Jesus Christ is the Lord and God of the universe, one with the Father and the Holy Spirit.")
    ].join("");
    assert.equal(fmt(html), html);
  });

  test("never joins across different alignment", () => {
    const html = p("A centered line that goes on and", "ql-align-center") + p("continues here.");
    assert.equal(fmt(html), html);
  });

  test("a post typed with an empty line between paragraphs loses them all, short lines too", () => {
    const blocks = [LONG, "Barabbas is set free.", "Jesus is condemned.", "The guilty man walks away.", LONG, "This is the Gospel.", LONG];
    const tidy = blocks.map((text) => p(text)).join("");
    assert.equal(fmt(blocks.map((text) => p(text)).join("<p><br></p>")), tidy);
    assert.equal(fmt(tidy), tidy);
    assert.equal(fmt(blocks.map((text) => p(text)).join("<p><br></p><p>&nbsp;</p>")), tidy);
  });

  test("never joins across an empty paragraph, which stays so the next save does not either", () => {
    const first = "He came into the world not to condemn the world but to save it, and He did so willingly";
    const second = "because love does not count the cost and never has, as the saints have always shown us.";
    const kept = p(first) + "<p><br /></p>" + p(second);
    assert.equal(fmt(p(first) + "<p><br></p><p>&nbsp;</p>" + p(second)), kept);
    assert.equal(fmt(kept), kept);
  });
});

describe("formatPostHtml: verse", () => {
  test("keeps the lines of a creed as one block with line breaks", () => {
    const html = p(LONG) + p("The Nicene Creed (381 AD)") + CREED.map((line) => p(line)).join("") +
      p("(Council of Nicaea &amp; Council of Constantinople, 381)") + p(LONG);
    assert.equal(
      fmt(html),
      p(LONG) + p("The Nicene Creed (381 AD)") + p(CREED.join("<br />")) + p("(Council of Nicaea &amp; Council of Constantinople, 381)") + p(LONG)
    );
  });

  test("puts verse back together after the editor split it into paragraphs", () => {
    const once = fmt(CREED.map((line) => p(line)).join(""));
    // Quill 1.x has no soft line break: it reloads <br> lines as paragraphs.
    const reloaded = once.replace(/<br \/>/g, "</p><p>");
    assert.equal(fmt(reloaded), once);
  });

  test("an empty paragraph keeps two prayers or stanzas apart, through the editor too", () => {
    const glory = ["Glory be to the Father,", "and to the Son,", "and to the Holy Spirit."];
    const fatima = ["O my Jesus, forgive us our sins,", "save us from the fires of hell;", "lead all souls to Heaven."];
    const lines = (list) => list.map((line) => p(line)).join("");
    const expected = p(glory.join("<br />")) + "<p><br /></p>" + p(fatima.join("<br />"));
    assert.equal(fmt(lines(glory) + "<p><br></p>" + lines(fatima)), expected);
    assert.equal(fmt(expected), expected);
    assert.equal(fmt(reloaded(expected)), expected);
    // Without the empty paragraph they read as one prayer.
    assert.equal(fmt(lines(glory) + lines(fatima)), p([...glory, ...fatima].join("<br />")));
    // A prayer typed with an empty line after every line keeps them: without
    // them its lines would become one block.
    const spaced = glory.map((line) => p(line)).join("<p><br /></p>");
    assert.equal(fmt(glory.map((line) => p(line)).join("<p><br></p>")), spaced);
    assert.equal(fmt(spaced), spaced);
    // A line of prose before a stanza, apart from it, stays apart; one that
    // never runs on into it loses the empty paragraph.
    assert.equal(fmt(p("Let us pray together:") + "<p><br></p>" + lines(glory)), p("Let us pray together:") + "<p><br /></p>" + p(glory.join("<br />")));
    assert.equal(fmt(p("We pray it daily.") + "<p><br></p>" + lines(glory)), p("We pray it daily.") + p(glory.join("<br />")));
  });

  test("groups a very long run of lines in linear time", () => {
    const run = (n) => Array.from({ length: n }, (_, i) => p(`Blessed be the Lord who made line ${i},`)).join("");
    const wrapped = (n) => p("The first paragraph of a long text that a broken import split on every line") +
      Array.from({ length: n }, (_, i) => p(`and line ${i} of it goes on without a full stop, like all the others before it`)).join("");
    const entries = (n) => REFS + p("Lewis, C. S. (1952). Mere Christianity") + Array.from({ length: n }, (_, i) => p(`continued line ${i}`)).join("");
    for (const make of [run, wrapped, entries]) {
      const time = (n) => {
        const html = make(n);
        const start = performance.now();
        fmt(html);
        return performance.now() - start;
      };
      time(500); // warm up
      const small = time(2000);
      const large = time(16000);
      // 8 times the lines: about 8 times the time (a quadratic pass takes 64).
      assert.ok(large < small * 24 + 250, `${make.name}: ${small.toFixed(0)} ms for 2000 lines, ${large.toFixed(0)} ms for 16000`);
    }
  });

  test("a post of 150,000 paragraphs, empty paragraphs or entries does not run out of stack", () => {
    const n = 150000;
    const many = (count, make) => Array.from({ length: count }, (_, i) => make(i)).join("");
    // Short lines that make no verse group: one run of 150,000 lines.
    const lines = many(n, (i) => p(`Line ${i} is here.`));
    assert.equal(fmt(lines), lines);
    assert.equal(fmt(p("One.") + many(n, () => "<p><br></p>") + p("Two.")), p("One.") + p("Two."));
    const entries = REFS + many(n, (i) => entry(`Lewis, C. S. (${1000 + (i % 999)}). Book ${i}.`));
    assert.equal(fmt(entries), entries);
    // A pasted span around 150,000 words and emphases.
    const words = many(n / 2, (i) => `word <em>${i}</em> `);
    assert.equal(fmt(`<p><span style="color:red">${words}</span></p>`), `<p>${words.trim()}</p>`);
  });

  test("indented PDF verse stays indented as a whole", () => {
    const lines = ["O give thanks to the Lord, for he is good,", "for his steadfast love endures forever.", "O give thanks to the God of gods,", "for his steadfast love endures forever."];
    assert.equal(fmt(lines.map((l) => p(l, "pdf-indent")).join("")), p(lines.join("<br />"), "ql-indent-1"));
  });
});

describe("formatPostHtml: section headings", () => {
  const section = (title) => "<p><br></p>" + p(title) + p(LONG);

  test("title lines set off by spacers become headings", () => {
    const html = p(LONG) + section("Statement of Doctrine") + section("Church History") + p("Rejection of the Trinity") + p(LONG);
    assert.equal(
      fmt(html),
      p(LONG) + "<h3>Statement of Doctrine</h3>" + p(LONG) + "<h3>Church History</h3>" + p(LONG) + "<h3>Rejection of the Trinity</h3>" + p(LONG)
    );
  });

  test("a single title-like line is not turned into a heading", () => {
    assert.equal(fmt(p(LONG) + section("Statement of Doctrine")), p(LONG) + p("Statement of Doctrine") + p(LONG));
  });

  test("attributions, Amen, sign-offs and dedications never become headings", () => {
    const signOffs = ["Your Brother in Christ", "Yours in Christ", "Yours Faithfully", "Sincerely Yours", "God Bless You", "In Christ",
      "With Love and Prayers", "Many Blessings", "Pax Christi", "Alleluia, Alleluia", "Yours Faithfully in Christ", "God Bless and Keep You",
      "Peace Be With You All"];
    const html = p(LONG) + section("Statement of Doctrine") + section("Church History") +
      p("“Our heart is restless until it rests in You.”") + p("Saint Augustine of Hippo") + p(LONG) +
      p("Through Christ our Lord.") + p("Amen") + p(LONG) +
      "<blockquote>Love one another as I have loved you.</blockquote>" + p("Saint John the Apostle") + p(LONG) +
      signOffs.map((line) => section(line)).join("");
    const out = fmt(html);
    assert.deepEqual(out.match(/<h3>[^<]*<\/h3>/g), ["<h3>Statement of Doctrine</h3>", "<h3>Church History</h3>"]);
    for (const line of ["Saint Augustine of Hippo", "Amen", "Saint John the Apostle", ...signOffs]) assert.ok(out.includes(p(line)), line);
    // A dedication or a byline opens the post.
    for (const opening of [["For My Mother"], ["By Samuel Simonds"], ["In Loving Memory of My Father"], ["Dedicated to Our Lady"], ["To My Children", "By Samuel Simonds"]]) {
      const post = opening.map((line) => p(line)).join("") + p(LONG) + section("Statement of Doctrine") + section("Church History");
      assert.deepEqual(fmt(post).match(/<h3>[^<]*<\/h3>/g), ["<h3>Statement of Doctrine</h3>", "<h3>Church History</h3>"], opening.join(" / "));
    }
  });

  test("a title that only starts like a sign-off or a dedication is still a title", () => {
    const titles = ["By Grace Alone", "To Our Lady", "For Our Salvation", "In Memory of the Martyrs", "Peace Be With You",
      "Blessings of Obedience", "Faithfully Catholic", "Yourself and the Other", "Dedicated Hearts", "Amen and Alleluia in the Psalms"];
    const html = p(LONG) + section("Statement of Doctrine") + titles.map((title) => section(title)).join("") + section("Church History");
    assert.equal(fmt(html), p(LONG) + ["Statement of Doctrine", ...titles, "Church History"].map((title) => `<h3>${title}</h3>${p(LONG)}`).join(""));
  });

  test("headings a post already has are no evidence for more", () => {
    const html = "<h2>Part One</h2>" + p(LONG) + "<h2>Part Two</h2>" + p(LONG) + p("Through Christ our Lord.") + p("The Sign of Peace") + p(LONG);
    assert.equal(fmt(html), html);
  });
});

describe("formatPostHtml: references", () => {
  test("a centered or bold References paragraph becomes the reference heading", () => {
    for (const heading of ['<p class="ql-align-center">References</p>', '<p class="ql-align-center"><strong>References</strong></p>', "<h2>Works Cited:</h2>", "<p>Bibliography</p>"]) {
      const out = fmt(p(LONG) + heading + p("Lewis, C. S. (1952). Mere Christianity. Geoffrey Bles."));
      assert.match(out, /<h3 class="pdf-ref-heading">(?:References|Works Cited:|Bibliography)<\/h3><p class="pdf-ref-entry">Lewis, C\. S\./, heading);
    }
  });

  test("a sentence that merely starts with References is not a heading", () => {
    const html = p("References to the Psalms run all through the Gospels.") + p(LONG);
    assert.equal(fmt(html), html);
  });

  test("Notes or Sources starts the references only when a citation or a list follows", () => {
    const prose = p(LONG) + p("Notes") + p("Yet, the Lord calls us to more than this, as we will see in the next part of this reflection.") +
      p("A centered line", "ql-align-center");
    assert.equal(fmt(prose), prose);
    assert.equal(fmt("<h2>Sources of Joy</h2>" + p(LONG) + "<h2>Sources</h2>" + p(LONG)), "<h2>Sources of Joy</h2>" + p(LONG) + "<h2>Sources</h2>" + p(LONG));
    assert.equal(
      fmt(p(LONG) + "<h2>Sources</h2>" + p("Lewis, C. S. (1952). Mere Christianity. Geoffrey Bles.")),
      p(LONG) + '<h3 class="pdf-ref-heading">Sources</h3>' + entry("Lewis, C. S. (1952). Mere Christianity. Geoffrey Bles.")
    );
    assert.equal(fmt(p(LONG) + p("Notes") + "<ol><li>See Augustine.</li></ol>"), p(LONG) + '<h3 class="pdf-ref-heading">Notes</h3><ol><li>See Augustine.</li></ol>');
    assert.equal(fmt(p(LONG) + p("Notes") + p("1. Augustine, Confessions 1.1.")), p(LONG) + '<h3 class="pdf-ref-heading">Notes</h3>' + entry("1. Augustine, Confessions 1.1."));
    const url = "https://www.vatican.va/archive/ENG0015/_INDEX.HTM";
    assert.equal(fmt(p(LONG) + p("Sources") + p(url)), p(LONG) + '<h3 class="pdf-ref-heading">Sources</h3>' + entry(link(url)));
  });

  test("a Notes or Sources section of prose stays prose, on every save", () => {
    // Only the start of the next paragraph counts: its wrapped second half
    // (joined on the first save) or a year in its middle is no citation.
    const cases = [
      p("Sources") + p("We drew on many writers for this essay, and the most important of them was the") +
        p("study published in 1995 by the Dominican house of studies, which we follow closely."),
      p("Notes") + p("Some of what follows can be read online, and the best place to begin is the page at") +
        p("https://www.vatican.va/archive/ which has the full text."),
      p("Sources") + p("“The first source we look at is the Catechism, which says that grace is a") + p("participation in the life of God” (CCC 1997)."),
      p("Sources") + p("In 1950 the Pope defined the dogma of the Assumption of Mary into heaven, body and soul."),
      p("Sources") + p("Glory be to the Father,") + p("and to the Son,") + p("and to the Holy Spirit.") + p("Lewis, C. S. (1952). Mere Christianity.")
    ];
    for (const html of cases) {
      const once = fmt(p(LONG) + html + p(LONG));
      assert.doesNotMatch(once, /pdf-ref/, html);
      assert.equal(fmt(once), once, html);
      assert.equal(fmt(reloaded(once)), once, html);
    }
  });

  test("the references end at the next heading; a centred closing line keeps its look", () => {
    const after = "<h3>Further Reading</h3>" + p("The author's closing words, which are not a reference at all but part of the essay.");
    assert.equal(fmt(REFS + p("Augustine, Confessions.") + after), REFS + entry("Augustine, Confessions.") + after);
    const closing = p("<em>Soli Deo Gloria</em>", "ql-align-center");
    assert.equal(fmt(REFS + p("Zalta, E. N. (Ed.). (2025). Hermeneutics.", "ql-align-center") + closing), REFS + entry("Zalta, E. N. (Ed.). (2025). Hermeneutics.") + closing);
  });

  test("entries lose pasted alignment and get the hanging-indent class", () => {
    assert.equal(
      fmt(REFS + p("Zalta, E. N. (Ed.). (2025). Hermeneutics.", "ql-align-center")),
      REFS + entry("Zalta, E. N. (Ed.). (2025). Hermeneutics.")
    );
  });

  test("joins entry lines that a wrap split off", () => {
    const html = REFS +
      p("Missler, C. (2000). Meanings of the names in Genesis 5. Koinonia") +
      p('<span style="color:rgb(0, 0, 0)">House. </span>https://www.khouse.org/articles/2000/genesis-5') +
      p("O’Meara, B. E. (1822). Napoleon in exile; or, A voice from St. Helena. W. Simpkin and R.") +
      p("Marshall.") +
      p("Stoner, P. W. (1958). Science speaks: Scientific proof of the accuracy of prophecy and the Bible.") +
      p("Moody Press. https://sciencespeaks.dstoner.net/Christ_of_Prophecy.html");
    assert.equal(
      fmt(html),
      REFS +
        entry(`Missler, C. (2000). Meanings of the names in Genesis 5. Koinonia House. ${link("https://www.khouse.org/articles/2000/genesis-5")}`) +
        entry("O’Meara, B. E. (1822). Napoleon in exile; or, A voice from St. Helena. W. Simpkin and R. Marshall.") +
        entry(`Stoner, P. W. (1958). Science speaks: Scientific proof of the accuracy of prophecy and the Bible. Moody Press. ${link("https://sciencespeaks.dstoner.net/Christ_of_Prophecy.html")}`)
    );
  });

  test("joins a line that closes a quotation the entry left open", () => {
    assert.equal(fmt(REFS + p("Smith, J. (2001). “On the wrapped") + p("Title of the Thing.” Press.")), REFS + entry("Smith, J. (2001). “On the wrapped Title of the Thing.” Press."));
  });

  test("two entries stay apart when the first has no full stop", () => {
    const html = REFS + entry("Sheen, F. J. Life Is Worth Living") + entry("Pope Benedict XVI. Deus Caritas Est. Vatican, 2005.") +
      entry("Lewis, C. S. Mere Christianity") + entry("Pope Francis. Laudato Si'") + entry("Benedict XVI. Spe Salvi");
    assert.equal(fmt(html), html);
    assert.equal(fmt(html, { repair: true }), html);
    // A short "Name. Title." source is no wrapped tail.
    for (const [first, second] of [["Lewis, C. S. Mere Christianity", "Aquinas. Summa Theologiae."], ["Lewis, C. S. Mere Christianity", "Augustine. Confessions."],
      ["Lewis, C. S. (1952). Mere Christianity", "Chesterton. Orthodoxy."]]) {
      assert.equal(fmt(REFS + p(first) + p(second)), REFS + entry(first) + entry(second), second);
    }
    // A wrapped tail still joins when the entry stopped on a lower-case word, or
    // when the stop inside the tail belongs to a title ("Dr. Sheen.").
    for (const [first, second] of [["Sheen, F. J. (1958). Life of", "Christ. McGraw-Hill."], ["Ratzinger, J. (2000). The Spirit of the", "Liturgy. Ignatius Press."],
      ["Ryan, J. K. (1960). The Confessions. Foreword by Rev", "Dr. Sheen."]]) {
      assert.equal(fmt(REFS + p(first) + p(second)), REFS + entry(`${first} ${second}`), second);
    }
    // An initial and a surname still are.
    assert.equal(fmt(REFS + p("O’Meara, B. E. (1822). Napoleon in exile. W. Simpkin and") + p("R. Marshall.")),
      REFS + entry("O’Meara, B. E. (1822). Napoleon in exile. W. Simpkin and R. Marshall."));
    // The one-off repair of old posts (read by eye) also joins a line after an
    // entry that stopped mid-sentence; saving does not.
    const first = "Edwards, W. D., Gabel, W. J., &amp; Hosmer, F. E. (1986). On the physical death of Jesus";
    const second = "Christ. JAMA, 255(11), 1455-1463.";
    assert.equal(fmt(REFS + p(first) + p(second), { repair: true }), REFS + entry(`${first} ${second}`));
    assert.equal(fmt(REFS + p(first) + p(second)), REFS + entry(first) + entry(second));
  });

  test("keeps separate entries separate", () => {
    const html = REFS +
      entry("Mere Christianity by C. S. Lewis") +
      entry("The Screwtape Letters by C. S. Lewis") +
      entry("Augustine. Confessions.") +
      entry("Aquinas.") +
      entry("Augustine of Hippo. Confessions, Book I, Chapter 1") +
      entry("Martin, Zélie. Quoted in 8 Parenting Lessons from St. Thérèse’s Mom, Aleteia.") +
      entry("Bible Gateway. “Acts 1-3, Revised Standard Version Catholic Edition.”") +
      entry("Lewis, C. S. (1952). Mere Christianity. Geoffrey Bles.") +
      entry("Isaiah 53:5") +
      entry("John 19:30") +
      entry("Romans 8:28");
    assert.equal(fmt(html), html);
  });

  test("a URL on its own line joins the entry before it", () => {
    const url = "https://www.newadvent.org/cathen/15614b.htm";
    assert.equal(
      fmt(REFS + p("New Advent. “Pentecost.” The Catholic Encyclopedia.") + p(`<a href="${url}">${url}</a>`) + p("EWTN. “Novena.”")),
      REFS + entry(`New Advent. “Pentecost.” The Catholic Encyclopedia. ${link(url)}`) + entry("EWTN. “Novena.”")
    );
  });

  test("a list of addresses stays a list of sources", () => {
    const urls = ["https://www.vatican.va/archive/ENG0015/_INDEX.HTM", "https://www.usccb.org/bible/john/3", "https://www.newadvent.org/fathers/1101.htm"];
    assert.equal(fmt(REFS + urls.map((url) => p(url)).join("")), REFS + urls.map((url) => entry(link(url))).join(""));
    assert.equal(fmt(REFS + p("www.vatican.va") + p("www.usccb.org")), REFS + entry("www.vatican.va") + entry("www.usccb.org"));
    assert.equal(fmt(REFS + p("newadvent.org/fathers/1101.htm") + p("usccb.org/bible/john/3")), REFS + entry("newadvent.org/fathers/1101.htm") + entry("usccb.org/bible/john/3"));
    // An address with its description, and a second address after an entry that has one.
    const html = REFS + entry(`${link("https://www.vatican.va/")} – the Holy See`) + entry(`${link("https://www.usccb.org/")} – the bishops`) +
      entry(`Catechism of the Catholic Church. ${link(urls[0])}`) + entry(link(urls[1]));
    assert.equal(fmt(html), html);
    assert.equal(fmt(html, { pdf: true }), `<div class="pdf-text">${html}</div>`);
  });

  test("an address or a DOI on a line of its own is never glued onto the URL before it", () => {
    const catechism = "https://www.vatican.va/archive/ENG0015/_INDEX.HTM";
    assert.equal(
      fmt(REFS + p(`Catechism of the Catholic Church. ${catechism}`) + p("vatican.va/content/francesco/en/encyclicals.html")),
      REFS + entry(`Catechism of the Catholic Church. ${link(catechism)}`) + entry("vatican.va/content/francesco/en/encyclicals.html")
    );
    const article = "https://www.journal.org/article/123";
    assert.equal(
      fmt(REFS + p(`Smith, J. (2010). An article. ${article}`) + p("doi:10.1017/S0028688511000245")),
      REFS + entry(`Smith, J. (2010). An article. ${link(article)} doi:10.1017/S0028688511000245`)
    );
    // A wrap right after "www." is still one address.
    assert.equal(
      fmt(REFS + p("Francis. (2015). Laudato si’. https://www.") + p("vatican.va/content/francesco/en/encyclicals.html")),
      REFS + entry(`Francis. (2015). Laudato si’. ${link("https://www.vatican.va/content/francesco/en/encyclicals.html")}`)
    );
  });

  test("rejoins a URL split across lines, without a space", () => {
    const full = "https://www.cambridge.org/core/journals/article/text-and-history-in-matthew-271617/8611C1015C9CC7122E1A4FABDF7129B9";
    const out = fmt(REFS + p('Moses, R. E. (2012). Jesus Barabbas. <span style="color:rgb(0, 0, 255)">https://www.cambridge.org/core/journals/article/text-and-history-in-matthew-</span>') +
      p("271617/8611C1015C9CC7122E1A4FABDF7129B9"));
    assert.equal(out, REFS + entry(`Moses, R. E. (2012). Jesus Barabbas. <a href="${full}" target="_blank" rel="noopener noreferrer">${full}</a>`));
  });

  test("mends a link that only covers the first half of a split URL", () => {
    const expected = REFS + entry(`Saints. (2013). Doctrine and Covenants. ${link("https://example.org/scriptures/dc-testament/dc")}`);
    assert.equal(fmt(REFS + p('Saints. (2013). Doctrine and Covenants. <a href="https://example.org/scriptures/dc-">https://example.org/scriptures/dc-</a>&nbsp;testament/dc')), expected);
    assert.equal(fmt(REFS + p("Saints. (2013). Doctrine and Covenants. https://example.org/scriptures/dc- testament/dc")), expected);
    assert.equal(fmt(expected), expected);
  });

  test("a link never takes in the next word, and saving again changes nothing", () => {
    const cases = [
      p("Visit https://www.vatican.va/ and/or the USCCB site."),
      p("Watch https://www.ewtn.com/ 24/7, or https://www.ewtn.com/ w/ s/ the rest."),
      p("See https://www.vatican.va/ his/her page."),
      REFS + p("Vatican. https://www.vatican.va/ 10/18/2026."),
      REFS + p('Vatican. <a href="https://www.vatican.va/">https://www.vatican.va/</a> and/or USCCB.'),
      p('Read <a href="https://www.newadvent.org/">https://www.newadvent.org/</a> w/ the Fathers.'),
      p("See https://example.org/scriptures/dc- testament/dc in the body.")
    ];
    for (const html of cases) {
      const once = fmt(html);
      assert.equal(words(once), words(html), html);
      assert.equal(fmt(once), once, html);
      assert.equal(fmt(reloaded(once)), once, html);
      for (const [, href] of once.matchAll(/href="([^"]*)"/g)) assert.match(href, /^https:\/\/[\w.]+\/(?:scriptures\/dc-)?$/, html);
    }
  });

  test("passages listed under a source stay on their own lines", () => {
    const html = REFS + p("The Holy Bible, New American Bible, Revised Edition, Confraternity of Christian Doctrine, Inc.") +
      p(" Isaiah 29:13") + p(" Matthew 8:23 to 27") + p(" 1 John 4:18");
    const expected = REFS + entry("The Holy Bible, New American Bible, Revised Edition, Confraternity of Christian Doctrine, Inc.<br />Isaiah 29:13<br />Matthew 8:23 to 27<br />1 John 4:18");
    assert.equal(fmt(html), expected);
    // The editor reloads the <br> lines as separate entries; saving puts them back.
    assert.equal(fmt(expected.replace(/<br \/>/g, '</p><p class="pdf-ref-entry">')), expected);
  });

  test("everything after the heading is an entry, empty lines go", () => {
    assert.equal(
      fmt('<p class="ql-align-center">References</p><p><br></p><p>Friederich, S. (2017). Fine tuning.</p><p> </p>'),
      REFS + entry("Friederich, S. (2017). Fine tuning.")
    );
  });
});

describe("formatPostHtml: links and kept formatting", () => {
  test("turns plain URLs into links, leaving the sentence punctuation outside", () => {
    assert.equal(
      fmt("<p>See https://bible.usccb.org/bible. Or (https://example.org/a_(b)).</p>"),
      '<p>See <a href="https://bible.usccb.org/bible" target="_blank" rel="noopener noreferrer">https://bible.usccb.org/bible</a>. ' +
        'Or (<a href="https://example.org/a_(b)" target="_blank" rel="noopener noreferrer">https://example.org/a_(b)</a>).</p>'
    );
  });

  test("a link stops before guillemets and an em dash, and leaves a closing ellipsis or en dash outside", () => {
    assert.equal(fmt("<p>Voir «https://www.vatican.va/fr» pour plus.</p>"), `<p>Voir «${link("https://www.vatican.va/fr")}» pour plus.</p>`);
    assert.equal(
      fmt("<p>See https://example.org/x—and more, https://example.org/y… or https://example.org/z–.</p>"),
      `<p>See ${link("https://example.org/x")}—and more, ${link("https://example.org/y")}… or ${link("https://example.org/z")}–.</p>`
    );
    // An en dash inside an address is part of it.
    const war = "https://en.wikipedia.org/wiki/Mexican–American_War";
    assert.equal(fmt(`<p>See ${war} here.</p>`), `<p>See ${link(war)} here.</p>`);
  });

  test("does not touch existing links or bare domains", () => {
    const html = '<p>(<a href="https://www.hawking.org.uk/x?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer">hawking.org.uk</a>) and (drbo.org)</p>';
    assert.equal(fmt(html), html);
  });

  test("keeps Quill formatting: alignment, indent, emphasis, headings, lists, quotes", () => {
    const html = [
      '<h2 class="ql-align-center">A Heading</h2>',
      '<p class="ql-align-justify ql-indent-2"><strong>Bold</strong>, <em>italic</em>, <u>under</u> and <s>strike</s>.</p>',
      '<ol><li>One</li><li class="ql-indent-1">One point one</li></ol>',
      '<blockquote class="ql-align-center">A quotation.</blockquote>',
      '<div class="pdf-text"><p class="pdf-indent">Indented paragraph.</p><p>Plain.</p></div>'
    ].join("");
    assert.equal(fmt(html), html);
  });

  test("the PDF-only placeholder and empty input pass through", () => {
    assert.equal(fmt('<div class="pdf-text"><p>This post is available as a PDF.</p></div>'), '<div class="pdf-text"><p>This post is available as a PDF.</p></div>');
    assert.equal(fmt(""), "");
    assert.equal(fmt(null), "");
  });

  test("still removes unsafe markup", () => {
    assert.equal(fmt('<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:alert(1)">there</a></p>'), "<p>Hi <a>there</a></p>");
  });

  test("describes its changes", () => {
    assert.deepEqual(rulesOf("<p>Done.</p>"), []);
    assert.deepEqual(rulesOf("<p>\tA.</p><p><br></p>"), ["spacing", "empty"]);
    assert.ok(rulesOf(p("The first names of Scripture point to the same Gospel pattern: comfort and") + p("rest.")).includes("merge"));
  });
});

describe("formatPostHtml: PDF imports", () => {
  test("PDF importer output comes through without changes", () => {
    const html = pdfTextToHtml(
      "    An indented first paragraph that is long enough to wrap across lines.\n\n" +
      "A second paragraph.\n\nReferences\n\nDoe, J. (2020). A book. Press.\n\nRoe, R. (2021). Another book. Press."
    );
    assert.equal(fmt(html), sanitizeRichHtml(html).replace(/>\n</g, "><"));
  });
});

describe("formatPostHtml: PDF posts", () => {
  test("keeps a PDF post's text in one pdf-text container", () => {
    const wrapped = '<div class="pdf-text"><p>One.</p><p>Two.</p></div>';
    assert.equal(fmt("<p>One.</p><p>Two.</p>", { pdf: true }), wrapped);
    assert.equal(fmt('<p>One.</p><div class="pdf-text"><p>Two.</p></div>', { pdf: true }), wrapped);
    assert.equal(fmt(wrapped, { pdf: true }), wrapped);
    assert.equal(fmt("", { pdf: true }), "");
    assert.equal(fmt("<p>One.</p>"), "<p>One.</p>");
  });
});

describe("formatPostHtml: the published posts", () => {
  // As scripts/format-posts.mjs formats them.
  const asSaved = (post) => fmt(post.contentHtml, { pdf: post.contentType === "PDF", repair: true });

  test("the fixture holds the posts", () => {
    assert.ok(realPosts.length >= 20, `${realPosts.length} posts in ${DUMP}`);
  });

  test("never changes the words", () => {
    for (const post of realPosts) assert.equal(letters(asSaved(post)), letters(post.contentHtml), post.slug);
  });

  test("is idempotent", () => {
    for (const post of realPosts) {
      const once = asSaved(post);
      assert.equal(fmt(once, { pdf: post.contentType === "PDF" }), once, post.slug);
      assert.equal(fmt(once), once, post.slug);
    }
  });

  test("saving after the editor reloads a post changes nothing", () => {
    for (const post of realPosts) {
      const once = asSaved(post);
      assert.equal(fmt(reloaded(once), { pdf: post.contentType === "PDF" }), once, post.slug);
    }
  });

  test("output survives sanitizing unchanged", () => {
    for (const post of realPosts) {
      const once = fmt(post.contentHtml);
      assert.equal(sanitizeRichHtml(once), once, post.slug);
    }
  });

  test("leaves no colours, tabs, spacer paragraphs or plain References labels", () => {
    for (const post of realPosts) {
      const once = fmt(post.contentHtml);
      assert.doesNotMatch(once, /style=|\t|<p>(?:\s|<br \/>|\u00A0)*<\/p>|<span/, post.slug);
      assert.doesNotMatch(once, /<p[^>]*>(?:<strong>)?References/, post.slug);
    }
  });

  test("the translation engine handles every formatted post, references stay English", () => {
    for (const post of realPosts) {
      const once = fmt(post.contentHtml);
      assert.ok(htmlSegments(once).length > 0, post.slug);
      const out = translateHtml(once, (s) => s);
      assert.equal(out.complete, true, post.slug);
      const entries = once.match(/class="pdf-ref-entry"/g) || [];
      assert.equal((out.html.match(/class="pdf-ref-entry" lang="en"/g) || []).length, entries.length, post.slug);
    }
  });
});

describe("formatPostHtml: saving twice changes nothing", () => {
  test("a quotation that only closes once its wrapped tail is joined", () => {
    const parts = ["“A quote that opens a long sentence which a line wrap then split and",
      "(a bracket opens here and goes on for a while past the end of the line with more words", "closes here.” And more."];
    const html = p(LONG) + parts.map((part) => p(part)).join("") + p(LONG);
    const result = formatPost(html);
    assert.equal(result.html, p(LONG) + p(parts.join(" ")) + p(LONG));
    assert.equal(fmt(result.html), result.html);
    // The change list tells it against the input: one paragraph made of three.
    assert.deepEqual(result.changes, [{ rule: "merge", before: parts.map((part) => p(part)), after: p(parts.join(" ")) }]);
  });

  test("on the published posts with blocks left out and awkward lines put in", () => {
    // Lines that set off the rules near their edges: wraps, quotations and
    // brackets left open, verse, Notes and Sources, entries, split URLs.
    const pieces = [
      "<p><br></p>", "<p><br></p>", "<p>&nbsp;</p>", p("Glory be to the Father,"), p("and to the Son,"), p("and to the Holy Spirit."),
      p("O my Jesus, forgive us our sins,"), p("save us from the fires of hell;"), p("Amen"), p("Saint Augustine of Hippo"),
      p("Notes"), p("Sources"), p("References"), p("https://www.vatican.va/ and/or more"), p("https://www.vatican.va/archive/"),
      p("vatican.va/content/a.html"), p("Lewis, C. S. Mere Christianity"), p("Pope Benedict XVI. Deus Caritas Est."), p("Aquinas. Summa."),
      p("He came into the world not to condemn the world but to save it, and He did so willingly"),
      p("because love does not count the cost and never has, as the saints have shown."),
      p("and he went on in the same way, not stopping for anything at all, until the end of the road"),
      "<h3>A Heading</h3>", p("Soli Deo Gloria", "ql-align-center"), p("In 1950 the Pope defined the dogma of the Assumption of Mary, body and soul."),
      p("Statement of Doctrine"), p("Your Brother in Christ"), p("“A quote that opens a long sentence which a line wrap then split and"),
      p("closes here.” And more."), p("(a bracket opens here and goes on for a while past the end of the line with more words"),
      p("and closes here) after that."), p("Isaiah 53:5"), p("The Holy Bible, Revised Standard Version."), p("https://www.x.org/a-"), p("b/c/d"),
      p("Lo\uFEFFrd"), p("See https://x.org/a—and"), p("Missler, C. (2000). Meanings of the names. Koinonia"), p("House. https://www.khouse.org/a"),
      p("Edwards, W. D. (1986). On the physical death of Jesus"), p("Christ. JAMA, 255(11), 1455-1463."), p(LONG)
    ];
    let seed = 20261018; // fixed, so a failure can be reproduced
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    for (let run = 0; run < 150; run++) {
      const post = pick(realPosts);
      const doc = parseDocument(post.contentHtml);
      const root = doc.children.length === 1 && doc.children[0].name === "div" ? doc.children[0] : doc;
      const blocks = [];
      for (const child of root.children) {
        const roll = random();
        if (roll < 0.06) continue; // a block left out
        if (roll < 0.25) blocks.push(pick(pieces));
        blocks.push(render(child, { encodeEntities: "utf8" }));
      }
      for (let i = 0; i < 6; i++) blocks.splice(Math.floor(random() * (blocks.length + 1)), 0, pick(pieces));
      const html = blocks.join("");
      for (const options of [{}, { repair: true }, { pdf: true }]) {
        const once = fmt(html, options);
        const label = `run ${run} (${post.slug}, ${JSON.stringify(options)})`;
        assert.equal(fmt(once, options), once, label);
        assert.equal(fmt(once, { pdf: options.pdf }), once, label);
        assert.equal(letters(once), letters(html).replaceAll("\uFEFF", ""), label);
      }
    }
  });

  test("the translation engine leaves the same blocks in English as the formatter marks as references", () => {
    const prose = "Yet the Lord calls us to more than this, as we will see in the next part of this reflection.";
    const html = p(LONG) + p("Notes") + p(prose) + p(LONG) + p("References") + p("Lewis, C. S. (1952). Mere Christianity.") +
      "<h3>Further Reading</h3>" + p(prose.replace("Yet", "And")) + p("Sources") + p("Augustine, Confessions.");
    const once = fmt(html);
    assert.equal((once.match(/pdf-ref-heading/g) || []).length, 2, once);
    const out = translateHtml(once, (s) => s.toUpperCase());
    assert.equal(out.complete, true);
    // Everything but the entries is translated: the prose under a plain
    // "Notes", the reference headings and the section after the references.
    assert.equal(
      out.html,
      p(LONG.toUpperCase()) + p("NOTES") + p(prose.toUpperCase()) + p(LONG.toUpperCase()) + '<h3 class="pdf-ref-heading">REFERENCES</h3>' +
        '<p class="pdf-ref-entry" lang="en">Lewis, C. S. (1952). Mere Christianity.</p><h3>FURTHER READING</h3>' + p(prose.replace("Yet", "And").toUpperCase()) +
        '<h3 class="pdf-ref-heading">SOURCES</h3><p class="pdf-ref-entry" lang="en">Augustine, Confessions.</p>'
    );
  });
});

describe("scripts/format-posts.mjs", () => {
  const script = new URL("../scripts/format-posts.mjs", import.meta.url).pathname;
  const runScript = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const slugsOf = (plan) => Object.fromEntries(Object.entries(plan).map(([key, list]) => [key, list.map((post) => post.slug)]));

  test("--restore puts back only the posts that still hold what --apply wrote", () => {
    const backup = {
      recordsWrites: true,
      posts: [
        { id: "1", slug: "formatted", contentHtml: "<p>\tA.</p>", writtenHtml: "<p>A.</p>" },
        { id: "2", slug: "untouched", contentHtml: "<p>B.</p>" },
        { id: "3", slug: "edited", contentHtml: "<p>\tC.</p>", writtenHtml: "<p>C.</p>" },
        { id: "4", slug: "edited-untouched", contentHtml: "<p>D.</p>" },
        { id: "5", slug: "deleted", contentHtml: "<p>E.</p>" }
      ]
    };
    const current = new Map([
      ["1", { contentType: "RICH", contentHtml: "<p>A.</p>" }],
      ["2", { contentType: "RICH", contentHtml: "<p>B.</p>" }],
      ["3", { contentType: "RICH", contentHtml: "<p>C, with a typo fixed.</p>" }],
      ["4", { contentType: "RICH", contentHtml: "<p>D and more.</p>" }]
    ]);
    assert.deepEqual(slugsOf(planRestore(backup, current)), {
      missing: ["deleted"], same: ["untouched"], restore: ["formatted"], edited: ["edited", "edited-untouched"]
    });
  });

  test("an older backup is checked against the formatter's output", () => {
    const backup = { posts: [{ id: "1", slug: "formatted", contentHtml: "<p>\tA.</p>" }, { id: "2", slug: "edited", contentHtml: "<p>\tB.</p>" }] };
    const current = new Map([["1", { contentType: "RICH", contentHtml: "<p>A.</p>" }], ["2", { contentType: "RICH", contentHtml: "<p>B, edited.</p>" }]]);
    assert.deepEqual(slugsOf(planRestore(backup, current)), { missing: [], same: [], restore: ["formatted"], edited: ["edited"] });
  });

  test("--report never replaces the backup, the dump or an existing file without --force", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "format-posts-"));
    try {
      const dump = path.join(dir, "posts.json");
      const dumpText = JSON.stringify([{ slug: "a", contentType: "RICH", contentHtml: "<p>\tA.</p>" }]);
      fs.writeFileSync(dump, dumpText);
      const report = path.join(dir, "report.txt");
      fs.writeFileSync(report, "an earlier report");

      let result = runScript("--from-json", dump, "--report", report);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /already exists/);
      assert.equal(fs.readFileSync(report, "utf8"), "an earlier report");

      result = runScript("--from-json", dump, "--report", dump, "--force");
      assert.equal(result.status, 1, result.stderr);
      assert.equal(fs.readFileSync(dump, "utf8"), dumpText);

      const backup = path.join(dir, "backup.json");
      result = runScript("--apply", "--backup", backup, "--report", backup);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /must not name the backup/);
      assert.equal(fs.existsSync(backup), false);

      result = runScript("--restore", backup, "--force");
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /--backup/);

      result = runScript("--from-json", dump, "--report", report, "--force");
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(report, "utf8"), /^Post formatting dry run/);
      assert.match(fs.readFileSync(report, "utf8"), /Summary: 1 of 1 post\(s\) would change/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--report never lands on the backup or the dump under another name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "format-posts-"));
    try {
      const backup = path.join(dir, "backup.json");
      fs.writeFileSync(backup, "the backup");
      const aliases = [path.join(dir, "hard.json"), path.join(dir, "soft.json")];
      fs.linkSync(backup, aliases[0]);
      fs.symlinkSync(backup, aliases[1]);
      // On a case-insensitive disk (macOS) another spelling is the same file.
      if (fs.existsSync(path.join(dir, "BACKUP.json"))) aliases.push(path.join(dir, "BACKUP.json"));
      for (const alias of aliases) {
        for (const force of [false, true]) {
          assert.match(writeReport(alias, "a report", { force, avoid: [backup] }), /is the backup or the JSON dump/, alias);
          assert.equal(fs.readFileSync(backup, "utf8"), "the backup", alias);
        }
      }
      // An existing file: the reason comes back, not an error.
      const report = path.join(dir, "report.txt");
      fs.writeFileSync(report, "an earlier report");
      assert.match(writeReport(report, "a report", { avoid: [backup] }), /already exists/);
      assert.equal(fs.readFileSync(report, "utf8"), "an earlier report");
      assert.equal(writeReport(report, "a report", { force: true, avoid: [backup] }), null);
      assert.equal(fs.readFileSync(report, "utf8"), "a report");
      assert.equal(writeReport(path.join(dir, "new.txt"), "new", { avoid: [backup, undefined] }), null);

      // The dump under another name is refused before anything runs.
      const dump = path.join(dir, "posts.json");
      fs.writeFileSync(dump, JSON.stringify([{ slug: "a", contentType: "RICH", contentHtml: "<p>\tA.</p>" }]));
      fs.linkSync(dump, path.join(dir, "dump-alias.json"));
      let result = runScript("--from-json", dump, "--report", path.join(dir, "dump-alias.json"), "--force");
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /must not name the backup or the JSON dump/);
      // A report that turns out not to be writable after the run is printed
      // instead: a link to nowhere passes the first check, then exists.
      fs.symlinkSync(path.join(dir, "nowhere", "report.txt"), path.join(dir, "late.txt"));
      result = runScript("--from-json", dump, "--report", path.join(dir, "late.txt"));
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /Summary: 1 of 1 post\(s\) would change/);
      assert.match(result.stderr, /^Report not written: .*late\.txt already exists\. It is printed above\.\n$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runs the same through a symlink to the script", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "format-posts-"));
    try {
      const link = path.join(dir, "format-posts.mjs");
      fs.symlinkSync(script, link);
      const dump = path.join(dir, "posts.json");
      fs.writeFileSync(dump, JSON.stringify([{ slug: "a", contentType: "RICH", contentHtml: "<p>\tA.</p>" }]));
      let result = spawnSync(process.execPath, [link, "--from-json", dump], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Summary: 1 of 1 post\(s\) would change/);
      result = spawnSync(process.execPath, [link, "--apply"], { encoding: "utf8" });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /--apply needs --backup/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
