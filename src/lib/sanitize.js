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
      "span"
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      span: ["style"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  });
}
