import sanitizeHtml from "sanitize-html";

// Classes the Quill 1.3.7 toolbar puts on blocks: alignment and indent.
const QUILL_BLOCK_CLASSES = [
  "ql-align-center",
  "ql-align-right",
  "ql-align-justify",
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `ql-indent-${n}`)
];

// lang is kept only as lang="en" (see keepEnglishLang).
const LANG_EN = "lang";

const TEXT_ALIGN = [/^(?:left|center|right|justify)$/];
// Small, plain lengths only (no calc(), var() or huge values).
const SAFE_PADDING = [/^(?:0|(?:\d|[1-9]\d|1\d\d|2[0-3]\d|240)(?:\.\d{1,2})?px|(?:\d|1[0-5])(?:\.\d{1,2})?r?em)$/];

// External links open in a new tab without access to window.opener;
// mailto:, tel: and links inside the site open normally.
function transformLink(tagName, attribs) {
  const out = {};
  const href = typeof attribs.href === "string" ? attribs.href.trim() : "";
  if (href) out.href = href;
  if (attribs.name) out.name = attribs.name;
  if (/^(?:https?:)?\/\//i.test(href)) {
    out.target = "_blank";
    out.rel = "noopener noreferrer";
  }
  return { tagName, attribs: out };
}

// Any other lang value is dropped rather than left as an empty attribute.
function keepEnglishLang(tagName, attribs) {
  if (attribs.lang === undefined) return { tagName, attribs };
  const { lang, ...rest } = attribs;
  return { tagName, attribs: String(lang).trim().toLowerCase() === "en" ? { ...rest, lang: "en" } : rest };
}

export function sanitizeRichHtml(dirtyHtml) {
  return sanitizeHtml(dirtyHtml, {
    allowedTags: [
      "p",
      "br",
      "b",
      "i",
      "em",
      "strong",
      "u",
      "s",
      "blockquote",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "a",
      "code",
      "pre",
      "span",
      "div"
    ],
    // lang="en" marks reference entries that stay English on translated pages.
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      p: ["class", "style", LANG_EN],
      h1: ["class", "style", LANG_EN],
      h2: ["class", "style", LANG_EN],
      h3: ["class", "style", LANG_EN],
      h4: ["class", "style", LANG_EN],
      li: ["class", "style", LANG_EN],
      blockquote: ["class", "style", LANG_EN],
      pre: ["class"],
      div: ["class", LANG_EN]
    },
    allowedClasses: {
      p: [...QUILL_BLOCK_CLASSES, "pdf-indent", "pdf-ref-entry"],
      h1: QUILL_BLOCK_CLASSES,
      h2: QUILL_BLOCK_CLASSES,
      h3: [...QUILL_BLOCK_CLASSES, "pdf-ref-heading"],
      h4: QUILL_BLOCK_CLASSES,
      li: QUILL_BLOCK_CLASSES,
      blockquote: QUILL_BLOCK_CLASSES,
      pre: ["ql-syntax"],
      div: ["pdf-text"]
    },
    // No color or background-color: pasted Word/Docs colors (black text,
    // white boxes) are unreadable on the site's dark background.
    allowedStyles: {
      p: { "text-align": TEXT_ALIGN, "padding-left": SAFE_PADDING },
      h1: { "text-align": TEXT_ALIGN },
      h2: { "text-align": TEXT_ALIGN },
      h3: { "text-align": TEXT_ALIGN },
      h4: { "text-align": TEXT_ALIGN },
      li: { "text-align": TEXT_ALIGN },
      blockquote: { "text-align": TEXT_ALIGN }
    },
    // Quill's link tool accepts the same four protocols.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: transformLink,
      "*": keepEnglishLang
    }
  });
}
