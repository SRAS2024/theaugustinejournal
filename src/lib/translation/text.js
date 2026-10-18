// src/lib/translation/text.js
// Text handling around the translation model: sentence splitting, preparing
// Title Case headings so the model reads them as phrases, and
// target-language typography for the output (quotes, French spacing).

const ABBREVIATIONS = new Set(
  [
    // titles and common abbreviations
    "mr", "mrs", "ms", "dr", "st", "sts", "sr", "jr", "fr", "rev", "revd", "msgr", "fr", "prof", "gen", "gov",
    "sen", "rep", "mt", "mgr", "bros", "co", "corp", "inc", "ltd", "vs", "etc", "cf", "viz", "al", "ca", "approx",
    "no", "nos", "vol", "vols", "ed", "eds", "trans", "pp", "p", "ch", "chap", "fig", "par", "sec", "art", "op",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    // books of the Bible
    "gen", "ex", "exod", "lev", "num", "deut", "josh", "judg", "sam", "kgs", "chr", "neh", "esth", "ps", "pss",
    "prov", "eccl", "eccles", "isa", "jer", "lam", "bar", "ezek", "dan", "hos", "obad", "mic", "nah", "hab",
    "zeph", "hag", "zech", "mal", "tob", "jdt", "wis", "sir", "macc", "matt", "mk", "lk", "jn", "rom", "cor",
    "gal", "eph", "phil", "col", "thess", "tim", "tit", "philem", "heb", "jas", "pet", "jud"
  ]
);

const CLOSERS = "\"”’')]»";
const OPENERS = "\"“‘'([«¿¡";

function isUpperStart(ch) {
  return /[\p{Lu}\p{Lt}0-9]/u.test(ch);
}

/**
 * Split English text into sentences. Returns [{ text, after }] where `after`
 * is the whitespace that followed the sentence in the source.
 */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  const n = text.length;
  // Never split inside a quotation: a quoted passage is translated whole.
  const openQuotes = quoteRanges(text);
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    if (openQuotes(i)) continue;
    // Extend over repeated terminators and closing quotes/brackets.
    let j = i + 1;
    while (j < n && (text[j] === "." || text[j] === "!" || text[j] === "?" || text[j] === "…")) j++;
    while (j < n && CLOSERS.includes(text[j])) j++;
    if (j >= n || !/\s/.test(text[j])) continue;
    let k = j;
    while (k < n && /\s/.test(text[k])) k++;
    if (k >= n) break;
    let m = k;
    while (m < n && OPENERS.includes(text[m])) m++;
    if (m >= n || !isUpperStart(text[m])) continue;

    if (ch === ".") {
      // The word ending at this period.
      let w = i;
      while (w > start && /[\p{L}\p{N}.]/u.test(text[w - 1])) w--;
      const word = text.slice(w, i);
      const bare = word.replace(/\./g, "").toLowerCase();
      if (/^\p{L}$/u.test(word.replace(/\.$/, "").slice(-1)) && /^(\p{L}\.)*\p{L}$/u.test(word)) continue; // initials: "F." "J.R.R."
      if (ABBREVIATIONS.has(bare) || /^(e\.g|i\.e|n\.d|a\.m|p\.m|u\.s|u\.k)$/i.test(word)) continue;
      if (/^\d+$/.test(word) && /^\d/.test(text[m])) continue; // "chapter 3. 4" style numbering
    }

    out.push({ text: text.slice(start, j), after: text.slice(j, k) });
    start = k;
    i = k - 1;
  }
  if (start < n) out.push({ text: text.slice(start), after: "" });
  return out.filter((s) => s.text.length);
}

/**
 * Returns a function telling whether position i lies inside a quotation that
 * is closed later in the same text (unclosed quotes are ignored).
 */
function quoteRanges(text) {
  const ranges = [];
  const stack = [];
  let straightOpen = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\u201c" || c === "\u00ab") stack.push(i);
    else if ((c === "\u201d" || c === "\u00bb") && stack.length) ranges.push([stack.pop(), i]);
    else if (c === '"') {
      if (straightOpen < 0) straightOpen = i;
      else {
        ranges.push([straightOpen, i]);
        straightOpen = -1;
      }
    }
  }
  return (i) => ranges.some(([a, b]) => i > a && i < b - 1);
}

/**
 * Break very long sentences at clause boundaries so the model never sees an
 * input longer than about `maxChars` characters.
 */
export function limitLength(sentence, maxChars = 480) {
  if (sentence.length <= maxChars) return [{ text: sentence, after: "" }];
  for (const re of [/;\s+/g, /:\s+/g, /,\s+/g, /\s+—\s*|\s*—\s+/g, /\s+/g]) {
    const cuts = [];
    let m;
    while ((m = re.exec(sentence))) cuts.push({ at: m.index, end: m.index + m[0].length });
    if (!cuts.length) continue;
    // Prefer the cut closest to the middle.
    const mid = sentence.length / 2;
    cuts.sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid));
    const c = cuts[0];
    const sep = sentence.slice(c.at, c.end);
    const head = sentence.slice(0, c.at) + sep.trimEnd();
    const tail = sentence.slice(c.end);
    if (!head.trim() || !tail.trim()) continue;
    const left = limitLength(head, maxChars);
    // The whitespace that really follows the cut (none for "word —next").
    left[left.length - 1].after = sep.match(/\s+$/)?.[0] ?? "";
    return [...left, ...limitLength(tail, maxChars)];
  }
  return [{ text: sentence, after: "" }];
}

/* ------------------------------------------------------------------ */
/*  Title Case                                                        */
/* ------------------------------------------------------------------ */

const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off", "on",
  "per", "to", "up", "via", "with", "from", "into", "onto", "upon", "over", "than", "vs"
]);

// Words this journal always capitalizes, even before the corpus statistics
// have been gathered.
const ALWAYS_PROPER = new Set([
  "god", "lord", "christ", "jesus", "mary", "spirit", "holy", "trinity", "father", "son", "savior", "saviour",
  "messiah", "gospel", "gospels", "scripture", "scriptures", "bible", "church", "eucharist", "lady", "virgin",
  "pope", "saint", "st", "catholic", "christian", "christians", "christianity", "augustine", "i"
]);

const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

/**
 * Corpus statistics: for each lower-cased word, how often it appears
 * capitalized vs. lower-case in the middle of a sentence.
 */
export function buildCaseStats(texts) {
  const stats = new Map();
  for (const text of texts) {
    for (const s of splitSentences(String(text || "").replace(/\s+/g, " "))) {
      let first = true;
      for (const m of s.text.matchAll(WORD_RE)) {
        const word = m[0];
        if (first) {
          first = false;
          continue;
        }
        const key = word.toLowerCase();
        const entry = stats.get(key) || { upper: 0, lower: 0 };
        if (/^\p{Lu}/u.test(word)) entry.upper++;
        else entry.lower++;
        stats.set(key, entry);
      }
    }
  }
  return stats;
}

/** Is this short text written in Title Case (a heading or post title)? */
export function isTitleCase(text) {
  const t = text.trim();
  if (!t || t.length > 140 || /[.!?]["”’)]*$/.test(t) && t.split(/\s+/).length > 12) return false;
  const words = t.match(WORD_RE) || [];
  if (words.length < 2 || words.length > 14) return false;
  const content = words.slice(1).filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  if (!content.length) return false;
  const capitalized = content.filter((w) => /^\p{Lu}/u.test(w));
  return capitalized.length / content.length >= 0.75;
}

/**
 * Turn "To Bear One’s Cross" into "To bear one’s cross" (keeping proper nouns),
 * which machine translation reads as a phrase instead of a list of names.
 */
export function sentenceCase(text, stats = new Map()) {
  let index = 0;
  return text.replace(WORD_RE, (word) => {
    const i = index++;
    if (i === 0) return word;
    if (word.length > 1 && word === word.toUpperCase()) return word; // acronyms
    if (!/^\p{Lu}/u.test(word)) return word;
    const key = word.toLowerCase();
    const base = key.replace(/['’]s$/, "");
    if (ALWAYS_PROPER.has(base)) return word;
    if (/\p{Lu}/u.test(word.slice(1))) return word; // names such as "McDonald"
    const s = stats.get(key) || stats.get(base);
    // Words the journal itself capitalizes mid-sentence are proper nouns
    // ("Passion", "Fatima"); everything else is a common word. (Half
    // lower-cased titles such as "The great Divide" translate worst of all.)
    return s && s.upper > 0 && s.upper >= s.lower ? word : word.toLowerCase();
  });
}

export function capitalizeFirst(text) {
  return text.replace(/^(\P{L}*)(\p{Ll})/u, (_, pre, ch) => pre + ch.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Source preparation                                                */
/* ------------------------------------------------------------------ */

/**
 * Rewrite a few English conventions the models handle poorly:
 *  - verse ranges written out ("John 20:19 through 23") become "20:19-23",
 *  - "the Advocate" (the Holy Spirit) becomes "the Paraclete", which the
 *    models translate as the theological term rather than "lawyer".
 */
export function prepareSource(text) {
  return String(text)
    .replace(/\b(\d+):(\d+)\s+(?:through|thru|to)\s+(\d+)(?::(\d+))?\b/g, (_, c1, v1, x, v2) =>
      v2 ? `${c1}:${v1}-${x}:${v2}` : `${c1}:${v1}-${x}`
    )
    .replace(/\b(the|The|our|Our|another|Another)\s+Advocate\b/g, "$1 Paraclete");
}

/* ------------------------------------------------------------------ */
/*  Output typography                                                 */
/* ------------------------------------------------------------------ */

const NNBSP = "\u202f"; // narrow no-break space (French typography)

const QUOTES = {
  es: ["\u201c", "\u201d"],
  pt: ["\u201c", "\u201d"],
  fr: ["\u00ab" + NNBSP, NNBSP + "\u00bb"],
  de: ["\u201e", "\u201c"],
  ru: ["\u00ab", "\u00bb"]
};

/** Replace straight double quotes with the target language's quotation marks. */
function smartQuotes(text, lang) {
  const q = QUOTES[lang];
  let out = text;
  if (q) {
    let open = false;
    out = text.replace(/"/g, (_, offset) => {
      const prev = offset > 0 ? text[offset - 1] : " ";
      if (open) {
        open = false;
        return q[1];
      }
      if (offset === 0 || /[\s([{\-\u2014\u2013/]/.test(prev)) {
        open = true;
        return q[0];
      }
      return q[1]; // a stray closing quote
    });
  }
  // Apostrophes between letters become typographic.
  return out.replace(/(\p{L})'(\p{L})/gu, "$1\u2019$2");
}

/** French puts a narrow no-break space before ; : ! ? and inside guillemets. */
function frenchSpacing(text) {
  return text
    .replace(/[ \u00a0\u202f]*([;:!?\u00bb]+)/g, (m, p, offset, whole) => {
      const before = whole.slice(0, offset);
      if (!before) return m;
      // Keep times and verse references (10:30, 20:19) and URLs (https://) intact.
      if (p[0] === ":" && (/\d$/.test(before) || whole.startsWith("//", offset + m.length))) return m;
      return NNBSP + p;
    })
    .replace(/\u00ab[ \u00a0\u202f]*/g, "\u00ab" + NNBSP);
}

/**
 * Final touches on one translated sentence: whitespace, the source's casing of
 * the first letter and its lack of final punctuation (for fragments around
 * links), and target-language quotation marks and spacing.
 */
export function polishTranslation(source, text, lang) {
  let out = text.replace(/\s+/g, " ").trim();
  const firstSrc = (source.match(/\p{L}/u) || [""])[0];
  const isUpper = (c) => c && c === c.toUpperCase() && c !== c.toLowerCase();
  const isLower = (c) => c && c === c.toLowerCase() && c !== c.toUpperCase();
  if (isUpper(firstSrc)) out = capitalizeFirst(out);
  else if (isLower(firstSrc) && (lang !== "de" || GERMAN_LOWER_STARTS.has(firstWord(out)))) {
    // A fragment (after a link, a link label …) keeps its lower-case start.
    // German capitalizes every noun, so there only function words are lowered.
    out = out.replace(/^(\P{L}*)(\p{Lu})(?=\p{Ll}|[^\p{L}]|$)/u, (_, pre, ch) => pre + ch.toLowerCase());
  }
  out = fixReferences(source, out, lang);
  out = fixTerms(source, out, lang);
  const srcEnd = source.trim().slice(-1);
  if (srcEnd && !/[.!?\u2026:;"\u201d\u2019\u00bb)\]]/.test(srcEnd) && /[^.]\.$/.test(out)) out = out.slice(0, -1);
  out = smartQuotes(out, lang);
  if (lang === "fr") out = frenchSpacing(out);
  if (lang === "ru") out = out.replace(/ - /g, " \u2014 ");
  if (lang === "es") out = out.replace(/\b([Ss])ólo\b/g, "$1olo");
  return out;
}

// German words that are written lower-case inside a sentence (articles,
// pronouns, prepositions, conjunctions, common verbs and adverbs).
const GERMAN_LOWER_STARTS = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner " +
    "und oder aber denn sondern doch dass ob wenn als wie weil da damit sowie sowohl weder noch " +
    "in im ins an am ans auf aus bei beim mit nach seit von vom zu zum zur durch für gegen ohne um " +
    "über unter vor hinter neben zwischen während wegen trotz bis ab außer " +
    "er sie es wir ihr ich du man sich ihn ihm ihnen uns euch mich mir dich dir " +
    "sein seine seinen seinem seiner seines ihre ihren ihrem ihrer ihres unser unsere unseren unserem " +
    "dies diese dieser dieses diesen diesem jede jeder jedes jeden jedem alle allen aller " +
    "welche welcher welches was wer wo wann warum " +
    "ist sind war waren wird werden wurde wurden hat haben hatte hatten kann können muss müssen " +
    "soll sollen will wollen sagt sagte sagen gibt nicht auch nur so noch schon sehr immer nie hier dort dann"
  ).split(" ")
);

const firstWord = (text) => (text.match(/\p{L}+/u) || [""])[0].toLowerCase();

const ERA = {
  es: { ad: "d. C.", bc: "a. C." },
  pt: { ad: "d.C.", bc: "a.C." },
  fr: { ad: "apr. J.-C.", bc: "av. J.-C." },
  de: { ad: "n. Chr.", bc: "v. Chr." },
  ru: { ad: "н.\u00a0э.", bc: "до н.\u00a0э." }
};
// Ways the models write era markers after a year (removed before the standard form is added).
const ERA_VARIANTS = /^(?:\s*(?:AD|A\.D\.|BC|B\.C\.|d\.?\s*C\.?|dC|a\.?\s*C\.?|aC|[da]\.(?=\s|$|[,;:)])|apr(?:ès|\.)\s*J\.?-?C\.?|av(?:ant|\.)\s*J\.?-?C\.?|après\s+JC|avant\s+JC|n\.\s*Chr\.|v\.\s*Chr\.|до\s+н\.\s*э\.|н\.\s*э\.))+/u;

const BIBLE_VERSIONS = /\b(ESV|DRB|DR|NABRE|NAB|RSV-2CE|RSV-CE|RSVCE|RSV|KJV|NKJV|NIV|NRSV|NRSVCE|NASB|NJB|JB|USCCB|CCC)\b/;

/**
 * Bible references and dates: no space after a chapter colon, the source's
 * era markers in the target language's style, and Bible version tags (which
 * the models sometimes drop or swap for a local edition) put back.
 */
function fixReferences(source, out, lang) {
  let text = out.replace(/(\d):\s+(\d)/g, "$1:$2");

  const era = ERA[lang];
  if (era) {
    const years = [...source.matchAll(/(?<![\w-])(\d{1,4})\s*(A\.D\.|AD|B\.C\.|BC)\b/g)];
    for (const [, year, marker] of years) {
      const kind = /^B/.test(marker) ? "bc" : "ad";
      // The year itself, not the same number used as a chapter or verse.
      const re = new RegExp(`(?<![\\d:])${year}(?!\\d|:\\d)`, "gu");
      const ruPrefix = (rest) => (lang === "ru" ? (/^\s*г(?:\.|од[уа]?)/u.exec(rest) || [""])[0] : "");
      const hits = [...text.matchAll(re)].map((m) => m.index + year.length);
      const marked = hits.find((at) => {
        const rest = text.slice(at);
        return ERA_VARIANTS.test(rest.slice(ruPrefix(rest).length));
      });
      // Without a marker from the model, only an unambiguous year gets one.
      const at = marked ?? (hits.length === 1 ? hits[0] : undefined);
      if (at === undefined) continue;
      let rest = text.slice(at);
      const prefix = ruPrefix(rest);
      rest = rest.slice(prefix.length);
      const variant = ERA_VARIANTS.exec(rest);
      if (variant) rest = rest.slice(variant[0].length);
      text = `${text.slice(0, at)}${prefix || ""}\u00a0${era[kind]}${rest.startsWith(".") && era[kind].endsWith(".") ? rest.slice(1) : rest}`;
    }
  }

  // "(Matthew 25:40, DRB)" -> keep "DRB" in the translated citation.
  for (const m of source.matchAll(/\(([^()]*?\d+:\d+[^()]*?),\s*([A-Z][A-Z0-9-]{1,7})\)/g)) {
    const version = m[2];
    if (!BIBLE_VERSIONS.test(version) || text.includes(version)) continue;
    const verse = (/\d+:\d+/.exec(m[1]) || [""])[0];
    const open = text.indexOf("(", Math.max(0, text.indexOf(verse) - 60));
    const close = open >= 0 ? text.indexOf(")", open) : -1;
    if (open < 0 || close < 0 || !text.slice(open, close).includes(verse)) continue;
    let inner = text.slice(open + 1, close).replace(/,\s*[A-Z][A-Z0-9-]{1,7}\s*$/, "");
    text = `${text.slice(0, open + 1)}${inner}, ${version}${text.slice(close)}`;
  }
  return text;
}

/** Theological terms the models render as everyday words. */
function fixTerms(source, out, lang) {
  let text = out;
  if (/\bPassion\b/.test(source)) {
    if (lang === "de") text = text.replace(/\bLeidenschaft\b/g, "Passion");
    if (lang === "es") text = text.replace(/\bpasión\b/g, "Pasión");
    if (lang === "fr") text = text.replace(/\bpassion\b/g, "Passion");
    if (lang === "pt") text = text.replace(/\bpaixão\b/g, "Paixão");
  }
  // "Conviction" here is a firm belief ("conviction"), not a court sentence.
  if (lang === "fr" && /\bconvictions?\b/i.test(source) && !/\b(?:condemn\w*|court|guilty|jury|criminal)\b/i.test(source)) {
    text = text.replace(/\b([Cc])ondamnation(s?)\b/g, (_, c, plural) => `${c}onviction${plural}`);
  }
  // The English spelling (also from prepareSource's "Advocate" rewrite).
  if (lang === "de") text = text.replace(/\bParaclete\b/g, "Paraklet");
  return text;
}

/** The most times any 4-word sequence occurs in the text. */
function maxRepeat(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const counts = new Map();
  let max = 0;
  for (let i = 0; i + 4 <= words.length; i++) {
    const g = words.slice(i, i + 4).join(" ");
    const c = (counts.get(g) || 0) + 1;
    counts.set(g, c);
    if (c > max) max = c;
  }
  return max;
}

/** Heuristic check that a translation is not degenerate (empty, truncated or looping). */
export function looksBroken(source, output) {
  const src = String(source || "").trim();
  const out = String(output || "").trim();
  if (!out) return true;
  if (src.length >= 12 && (out.length < src.length * 0.3 || out.length > src.length * 3.5 + 20)) return true;
  // A phrase repeated more often than anything in the source (a decoding loop).
  const outRepeat = maxRepeat(out);
  return outRepeat >= 4 && outRepeat > maxRepeat(src) + 1;
}
