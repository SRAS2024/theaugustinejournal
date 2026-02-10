import sanitizeHtml from "sanitize-html";

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
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      span: ["style"],
      p: ["class", "style"],
      div: ["class"],
      h3: ["class"],
      li: ["class"]
    },
    allowedClasses: {
      p: ["pdf-indent", "pdf-ref-entry", "ql-align-center", "ql-align-right", "ql-align-justify",
          "ql-indent-1", "ql-indent-2", "ql-indent-3", "ql-indent-4", "ql-indent-5", "ql-indent-6", "ql-indent-7", "ql-indent-8"],
      div: ["pdf-text"],
      h3: ["pdf-ref-heading", "ql-align-center", "ql-align-right", "ql-align-justify"],
      li: ["ql-indent-1", "ql-indent-2", "ql-indent-3", "ql-indent-4", "ql-indent-5", "ql-indent-6", "ql-indent-7", "ql-indent-8"]
    },
    allowedStyles: {
      span: { "color": [/.*/], "background-color": [/.*/] },
      p: { "text-align": [/^(center|right|justify|left)$/], "padding-left": [/.*/] }
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  });
}
