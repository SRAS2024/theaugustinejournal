// test/translation-text.test.js
// Run: node --test test/translation-text.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  splitSentences,
  limitLength,
  isTitleCase,
  sentenceCase,
  buildCaseStats,
  polishTranslation,
  looksBroken
} from "../src/lib/translation/text.js";

const texts = (s) => splitSentences(s).map((x) => x.text);

describe("splitSentences", () => {
  test("splits ordinary sentences and keeps closing quotes", () => {
    assert.deepEqual(texts("He said, “Peace be with you.” Then he left. Was he afraid? No!"), [
      "He said, “Peace be with you.”",
      "Then he left.",
      "Was he afraid?",
      "No!"
    ]);
  });

  test("does not split after abbreviations, initials or Bible books", () => {
    assert.deepEqual(texts("St. Teresa of Ávila wrote it. Sheen, F. J. (2019, August 31). See cf. Matt. 5:8 and Rom. 8:38."), [
      "St. Teresa of Ávila wrote it.",
      "Sheen, F. J. (2019, August 31).",
      "See cf. Matt. 5:8 and Rom. 8:38."
    ]);
  });

  test("keeps the whitespace between sentences", () => {
    const parts = splitSentences("One.  Two.");
    assert.deepEqual(parts, [{ text: "One.", after: "  " }, { text: "Two.", after: "" }]);
  });
});

describe("limitLength", () => {
  test("breaks very long sentences at a clause boundary", () => {
    const s = `${"a ".repeat(200)}; ${"b ".repeat(200)}`;
    const parts = limitLength(s, 480);
    assert.ok(parts.length >= 2);
    assert.equal(parts.map((p) => p.text + p.after).join(""), s);
    for (const p of parts) assert.ok(p.text.length <= 480);
  });

  test("leaves short sentences alone", () => {
    assert.deepEqual(limitLength("Short."), [{ text: "Short.", after: "" }]);
  });
});

describe("Title Case handling", () => {
  const stats = buildCaseStats(["We must bear our cross daily, as one carries one’s cross. The face of God shines."]);

  test("detects headings written in Title Case", () => {
    assert.equal(isTitleCase("To Bear One’s Cross"), true);
    assert.equal(isTitleCase("The Passion of the Lord"), true);
    assert.equal(isTitleCase("Check out our latest post"), false);
  });

  test("lower-cases common words but keeps proper nouns", () => {
    assert.equal(sentenceCase("To Bear One’s Cross", stats), "To bear one’s cross");
    assert.equal(sentenceCase("The Face of God", stats), "The face of God");
    assert.equal(sentenceCase("Our Lady of Fatima", buildCaseStats(["She appeared at Fatima in 1917."])), "Our Lady of Fatima");
    assert.equal(sentenceCase("The Great Divide", stats), "The great divide");
    assert.equal(sentenceCase("To the Broken", stats), "To the broken");
  });
});

describe("polishTranslation", () => {
  test("uses each language's quotation marks", () => {
    assert.equal(polishTranslation("He said “peace”.", 'Er sagte "Friede".', "de"), "Er sagte „Friede“.");
    assert.equal(polishTranslation("He said “peace”.", 'Он сказал "мир".', "ru"), "Он сказал «мир».");
  });

  test("French spacing before ; : ! ? and inside guillemets", () => {
    const out = polishTranslation("Really?", "Vraiment ?", "fr");
    assert.equal(out, "Vraiment ?");
    assert.equal(polishTranslation("x: “y”", "Il dit : « oui »", "fr"), "il dit : « oui »");
  });

  test("keeps verse references and URLs intact in French", () => {
    assert.equal(polishTranslation("See John 20:19.", "Voir Jean 20:19.", "fr"), "Voir Jean 20:19.");
  });

  test("follows the source's capitalization and missing final period", () => {
    assert.equal(polishTranslation("To bear", "carregar a cruz", "pt"), "Carregar a cruz");
    assert.equal(polishTranslation("read more at", "Lea más en.", "es"), "lea más en");
  });
});

describe("looksBroken", () => {
  test("accepts repetition that is in the source", () => {
    const src = "Sin does not have the final word, death does not have the final word, and failure does not have the final word.";
    const out = "El pecado no tiene la última palabra, la muerte no tiene la última palabra y el fracaso no tiene la última palabra.";
    assert.equal(looksBroken(src, out), false);
  });

  test("rejects empty, truncated and looping output", () => {
    assert.equal(looksBroken("Hello there, my friend.", ""), true);
    assert.equal(looksBroken("This is a fairly long sentence about grace and mercy.", "Esto."), true);
    assert.equal(looksBroken("He went home.", "y se fue a casa y se fue a casa y se fue a casa y se fue a casa y se fue a casa"), true);
  });
});

describe("source preparation and reference rules", async () => {
  const { prepareSource } = await import("../src/lib/translation/text.js");

  test("verse ranges written out become hyphenated", () => {
    assert.equal(prepareSource("(cf. Luke 12:51 through 53) and Genesis 2:4 through 3:24 and John 21:15 to 17"),
      "(cf. Luke 12:51-53) and Genesis 2:4-3:24 and John 21:15-17");
  });

  test("the Advocate becomes the Paraclete; other uses are untouched", () => {
    assert.equal(prepareSource("Christ promised the Advocate. We advocate for peace."), "Christ promised the Paraclete. We advocate for peace.");
  });

  test("era markers follow each language", () => {
    assert.equal(polishTranslation("Hippo (393 AD).", "Hipona (393 dC).", "es"), "Hipona (393 d. C.).");
    assert.equal(polishTranslation("in 325 AD.", "Murió en el año 325 d.", "es"), "murió en el año 325 d. C.");
    assert.equal(polishTranslation("He died in 325 AD.", "Ele morreu em 325 d.C.", "pt"), "Ele morreu em 325 d.C.");
    assert.equal(polishTranslation("He died in 325 AD.", "Il meurt en 325 après JC.", "fr"), "Il meurt en 325 apr. J.-C.");
    assert.equal(polishTranslation("He died in 325 AD.", "Умер в 325 году.", "ru"), "Умер в 325 году н. э.");
    assert.equal(polishTranslation("He died in 325 AD.", "Er starb 325 n. Chr.", "de"), "Er starb 325 n. Chr.");
  });

  test("Bible version tags dropped or swapped by the model are restored", () => {
    assert.equal(polishTranslation("(Matthew 25:40, DRB)", "(Mateo 25:40)", "es"), "(Mateo 25:40, DRB)");
    assert.equal(polishTranslation("(Genesis 2:4-3:24, DRB)", "(Génesis 2:4-3:24, RVR60)", "es"), "(Génesis 2:4-3:24, DRB)");
    assert.equal(polishTranslation("(John 3:16, ESV)", "(Jean 3:16, ESV)", "fr"), "(Jean 3:16, ESV)");
    assert.equal(polishTranslation("1 Corinthians 15:6", "1 Corintios 15: 6", "es"), "1 Corintios 15:6");
  });

  test("terms: the Passion and the Paraclete", () => {
    assert.equal(polishTranslation("The Passion proves that.", "Die Leidenschaft beweist das.", "de"), "Die Passion beweist das.");
    assert.equal(polishTranslation("The Passion proves that.", "La pasión lo demuestra.", "es"), "La Pasión lo demuestra.");
    assert.equal(polishTranslation("The Paraclete is near.", "Der Paraclete ist nah.", "de"), "Der Paraklet ist nah.");
  });

  test("Spanish solo, Russian dashes, lowercase fragments", () => {
    assert.equal(polishTranslation("Not only this.", "No sólo esto.", "es"), "No solo esto.");
    assert.equal(polishTranslation("This - that.", "Это - то.", "ru"), "Это — то.");
    assert.equal(polishTranslation("and peace.", "И мир.", "ru"), "и мир.");
  });

  test("quotations are not split into sentences", () => {
    assert.deepEqual(texts("He said, “Go. Sin no more.” Then he left."), ["He said, “Go. Sin no more.”", "Then he left."]);
  });
});

describe("review regressions", () => {
  test("limitLength records no separator that is not in the source", () => {
    const long = `${"word ".repeat(50)}end —start ${"more ".repeat(50)}fin.`;
    const parts = limitLength(long);
    assert.ok(parts.length > 1);
    assert.equal(parts.map((p) => p.text + p.after).join(""), long);
  });

  test("German fragments keep capitalized nouns; function words are lowered", () => {
    assert.equal(polishTranslation(", grace is a gift.", ", Gnade ist ein Geschenk.", "de"), ", Gnade ist ein Geschenk.");
    assert.equal(polishTranslation("prayer", "Gebet", "de"), "Gebet");
    assert.equal(polishTranslation("the theology of grace", "Die Theologie der Gnade", "de"), "die Theologie der Gnade");
    assert.equal(polishTranslation("the prayer", "La oración", "es"), "la oración");
  });

  test("era markers go on the year, not on an equal chapter or verse number", () => {
    assert.equal(
      polishTranslation("Chapter 4 covers the events of 4 BC.", "El capítulo 4 cubre los acontecimientos del 4 a.C.", "es"),
      "El capítulo 4 cubre los acontecimientos del 4 a. C."
    );
    assert.equal(
      polishTranslation("Psalm 51:4 dates from 4 BC.", "El Salmo 51:4 data del 4 a.C.", "es"),
      "El Salmo 51:4 data del 4 a. C."
    );
    // No marker from the model and the number is ambiguous: left alone.
    assert.equal(
      polishTranslation("Chapter 4 covers the events of 4 BC.", "El capítulo 4 cubre los acontecimientos del 4.", "es"),
      "El capítulo 4 cubre los acontecimientos del 4."
    );
    assert.equal(polishTranslation("He died in AD 430 or 430 AD.", "Murió en 430.", "es"), "Murió en 430 d. C.");
  });

  test("French keeps conviction as a belief", () => {
    assert.equal(polishTranslation("Conviction", "Condamnation", "fr"), "Conviction");
    assert.equal(polishTranslation("Our convictions reveal much.", "Nos condamnations en disent long.", "fr"), "Nos convictions en disent long.");
    assert.equal(polishTranslation("His conviction in court was unjust.", "Sa condamnation par le tribunal était injuste.", "fr"), "Sa condamnation par le tribunal était injuste.");
  });

  test("German Paraklet also for the Advocate rewrite", () => {
    assert.equal(polishTranslation("Christ promised the Advocate.", "Christus versprach den Paraclete.", "de"), "Christus versprach den Paraklet.");
  });
});
