// test/design.test.js
// Run: node --test test/design.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const css = read("public/css/styles.css");

// The first definition of each custom property on :root
function tokens() {
  const root = css.match(/:root\s*{([^}]*)}/)[1];
  return Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const rgb = (hex) => hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
const mix = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
const luminance = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Every rule as { selectors, body }; rules inside @media and @supports come out too
function rules() {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].trim().split(/,(?![^(]*\))/).map((s) => s.trim()),
    body: m[2]
  }));
}

// The grounds a ring or a scrollbar thumb can sit on
function grounds() {
  const t = tokens();
  const page = rgb(t.bg);
  const card = mix(rgb("#f1ebdd"), 0.022, page);
  return { page, card, field: mix([0, 0, 0], 0.2, card), dialog: rgb(t.surface) };
}

test("text is ivory on warm charcoal", () => {
  const t = tokens();
  for (const name of ["bg", "ivory", "text", "text-body", "muted"]) assert.match(t[name], /^#[0-9a-f]{6}$/i, name);
  const [r, g, b] = rgb(t.bg);
  assert.ok(r + g + b < 3 * 0x22, "the ground stays dark");
  assert.ok(r >= b, "the ground is warm, not blue");
  for (const name of ["ivory", "text", "text-body"]) {
    const [tr, tg, tb] = rgb(t[name]);
    assert.ok(tr > tb && tg > tb && tr - tb <= 0x1c, `${name} is a warm ivory, not yellow or grey-blue`);
  }
});

test("every text colour meets WCAG AA on the page and inside cards", () => {
  const t = tokens();
  const bg = rgb(t.bg);
  const card = mix(rgb("#f1ebdd"), 0.022, bg);
  const input = mix([0, 0, 0], 0.2, card);
  for (const name of ["ivory", "text", "text-body", "text-soft", "muted", "accent", "danger", "success"]) {
    for (const [ground, value] of [["page", bg], ["card", card]]) {
      const ratio = contrast(rgb(t[name]), value);
      assert.ok(ratio >= 4.5, `--${name} on ${ground}: ${ratio.toFixed(2)}`);
    }
  }
  assert.ok(contrast(rgb(t.placeholder), input) >= 4.5, "placeholder text in a field");
});

test("a focus ring follows each control's own corners", () => {
  // A rule that applies on focus may set a radius only at zero specificity
  // (wholly inside :where()) and never !important, so it can never beat .btn,
  // .form-input, .latest a ...
  const focusRules = rules().filter((r) => r.selectors.some((s) => /:focus/.test(s)));
  assert.ok(focusRules.length >= 4);
  for (const { selectors, body } of focusRules) {
    if (!/border-(?:[a-z]+-)*radius\s*:/i.test(body)) continue;
    assert.doesNotMatch(body, /border-(?:[a-z]+-)*radius\s*:[^;]*!\s*important/i, `${selectors.join(", ")} forces its corners on focus`);
    for (const s of selectors) assert.match(s, /^(:where\([^()]*\))+$/, `${s} changes the corners on focus`);
  }
  // The rounded controls carry their own radius, which the outline then follows
  for (const control of [".btn", ".form-input", ".latest a", ".stat-card", ".hamburger", ".nav a", ".admin-nav a", ".share-btn"]) {
    assert.ok(rules().some((r) => r.selectors.includes(control) && /border-radius:\s*(var\(--radius\)|999px|4px)/.test(r.body)), control);
  }
  // The menu button sits on the screen's right edge, so its ring is drawn inside it
  assert.match(css, /\.hamburger:focus-visible\s*{\s*outline-offset: -2px;\s*}/);
});

test("focus rings and the scrollbar thumb stand out at 3:1 on every ground", () => {
  const t = tokens();
  for (const [name, ground] of Object.entries(grounds())) {
    const ring = contrast(rgb(t["focus-ring"]), ground);
    assert.ok(ring >= 3, `focus ring on ${name}: ${ring.toFixed(2)}`);
    const thumb = contrast(rgb(t["scrollbar-thumb"]), ground);
    assert.ok(thumb >= 3, `scrollbar thumb on ${name}: ${thumb.toFixed(2)}`);
  }
  // Every ring drawn on focus is that colour and at least as wide as the field's border
  for (const { selectors, body } of rules()) {
    if (!selectors.some((s) => /:focus/.test(s))) continue;
    const outline = body.match(/outline:\s*([^;]+);/);
    if (outline) assert.match(outline[1], /^[12]px solid var\(--focus-ring\)$/, selectors.join(", "));
  }
  assert.match(css, /a:focus-visible,[^{]*\[tabindex\]:focus-visible\s*{\s*outline: 2px solid var\(--focus-ring\);/);

  // The thumb stays in the warm family, and nothing else sets a fainter one
  const [r, g, b] = rgb(t["scrollbar-thumb"]);
  assert.ok(r >= g && g >= b, "a warm thumb");
  const colors = [...css.matchAll(/scrollbar-color:\s*([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(colors, ["var(--scrollbar-thumb) transparent"]);
});

test("the post editor shows a focus ring on its writing area", () => {
  // Quill 1.3.7 sets .ql-editor { outline: none }, so the ring on its container
  // is the only sign that the post editor has focus
  const editor = rules().filter((r) => r.selectors.includes(".ql-container.ql-snow:focus-within"));
  assert.equal(editor.length, 1, "the post editor's focus ring");
  assert.match(editor[0].body, /outline:\s*2px solid var\(--focus-ring\);/);
  // Nothing on the container takes it away again, here or in the editor page's own styles:
  // no outline of style none/hidden, of zero width or of a transparent colour
  const isEditor = (selector) => /\.ql-container|#quillEditor|#pdfQuillEditor/.test(selector);
  const blanks = (body) =>
    [...body.matchAll(/outline(-style|-width|-color)?\s*:\s*([^;]+)/gi)].some(([, part = "", value]) => {
      const v = value.replace(/!\s*important/i, "").trim().toLowerCase();
      if (part === "-color") return v === "transparent";
      if (part === "-style") return v === "none" || v === "hidden";
      if (part === "-width") return /^0(?:[a-z]+)?$/.test(v);
      return /(^|\s)(none|hidden|transparent|0(?:[a-z]+)?)(\s|$)/.test(v);
    });
  for (const { selectors, body } of rules()) {
    if (selectors.some(isEditor)) assert.ok(!blanks(body), `${selectors.join(", ")} hides the editor's focus ring`);
  }
  // ... and the ring rule sits at the top level, not inside a media query
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const before = bare.slice(0, bare.indexOf(".ql-container.ql-snow:focus-within"));
  assert.equal((before.match(/{/g) || []).length - (before.match(/}/g) || []).length, 0, "the editor's ring is not inside a media query");
  const styles = [...read("views/admin/post-form.ejs").matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  assert.match(styles, /\.ql-container/);
  for (const m of styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (isEditor(m[1])) assert.ok(!blanks(m[2]), `post-form.ejs: ${m[1].trim()} hides the editor's focus ring`);
  }
});

test("the grain is a small static tile, not a live SVG filter", () => {
  const png = fs.readFileSync(path.join(ROOT, "public/img/grain.png"));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 256, "width");
  assert.equal(png.readUInt32BE(20), 256, "height");
  assert.ok(png.length < 64 * 1024, `${png.length} bytes`);
  assert.doesNotMatch(css, /grain-filter|filter:\s*url\(/);
  assert.doesNotMatch(read("views/layout.ejs"), /feTurbulence|grain-filter/);
});

test("every image the stylesheet uses exists", () => {
  const urls = [...css.matchAll(/url\("?(\/public\/[^")]+)"?\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(fs.existsSync(path.join(ROOT, url.replace(/^\/public\//, "public/"))), url);
});

test("the stylesheet is balanced", () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"/g, '""');
  assert.equal((bare.match(/{/g) || []).length, (bare.match(/}/g) || []).length);
});

test("classes used by the templates have styles", () => {
  for (const cls of [
    "visually-hidden", "ornament", "postRule", "list-ornament", "home-ornament", "listPage",
    "footer-site", "not-found", "post-stats", "admin-nav-form", "welcome-loader", "welcome-bar",
    "loader-track", "loader-arc", "pdf-ref-heading", "pdf-ref-entry"
  ]) {
    assert.match(css, new RegExp(`\\.${cls}\\b`), cls);
  }
});

test("verse lines kept in one paragraph read as one block", () => {
  assert.match(css, /\.postContent p:has\(> br\)\s*{\s*line-height: 1\.85;/);
  assert.match(css, /@supports \(text-indent: 1em hanging each-line\)/);
});

test("pasted inline colours cannot hide post text", () => {
  assert.match(css, /\.postContent \[style\*="color"\][^{]*{\s*color: inherit !important;/);
  assert.match(css, /\.postContent \[style\*="background"\]\s*{\s*background-color: transparent !important;/);
});

test("the ornament is decorative and appears in the footer", async () => {
  const ornament = await ejs.renderFile(path.join(ROOT, "views/partials/ornament.ejs"), { ornamentClass: "postRule" });
  assert.match(ornament, /^<div class="ornament postRule" aria-hidden="true"><svg /);
  const plain = await ejs.renderFile(path.join(ROOT, "views/partials/ornament.ejs"), {});
  assert.match(plain, /^<div class="ornament" aria-hidden="true">/);

  const footer = await ejs.renderFile(path.join(ROOT, "views/partials/footer.ejs"), {});
  assert.match(footer, /class="ornament" aria-hidden="true"/);
  assert.match(footer, /<span class="footer-site" data-i18n="siteTitle">The Augustine Journal<\/span>/);
  assert.match(footer, /data-i18n="allRightsReserved"/);
});

test("the post, list and 404 pages keep their structure around the ornament", () => {
  assert.match(read("views/pages/post.ejs"), /include\("\.\.\/partials\/ornament", \{ ornamentClass: "postRule" \}\)/);
  assert.match(read("views/pages/list.ejs"), /class="section card listPage"/);
  assert.match(read("views/pages/not-found.ejs"), /data-i18n="pageNotFoundMessage"/);
  assert.match(read("views/partials/subscribe-modal.ejs"), /class="visually-hidden" for="subscribeEmail"/);
});

// A public path the icons use, as a file in the repository (/favicon.ico is served from public/icons)
const iconFile = (url) => path.join(ROOT, url.split("?")[0] === "/favicon.ico" ? "public/icons/favicon.ico" : url.split("?")[0].replace(/^\//, ""));
const pngSize = (file) => {
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", file);
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
};

test("every icon the pages link to exists at the size it claims", async () => {
  const icons = await ejs.renderFile(path.join(ROOT, "views/partials/icons.ejs"), {});
  const links = [...icons.matchAll(/<link ([^>]+)>/g)].map((m) => ({
    rel: m[1].match(/rel="([^"]+)"/)[1],
    attrs: m[1],
    href: m[1].match(/href="([^"]+)"/)[1]
  }));
  for (const rel of ["icon", "apple-touch-icon", "manifest"]) assert.ok(links.some((l) => l.rel === rel), rel);
  assert.ok(links.some((l) => /type="image\/svg\+xml"/.test(l.attrs)), "an SVG icon for browser tabs");
  for (const { attrs, href } of links) {
    assert.match(href, /\?v=\d+$/, `${href} is versioned so caches pick up a new icon`);
    assert.ok(fs.existsSync(iconFile(href)), href);
    const sizes = attrs.match(/sizes="(\d+x\d+)"/);
    if (sizes && href.split("?")[0].endsWith(".png")) assert.equal(pngSize(iconFile(href)), sizes[1], href);
  }
  assert.equal(pngSize(path.join(ROOT, "public/icons/apple-touch-icon.png")), "180x180");

  const manifest = JSON.parse(read("public/site.webmanifest"));
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"), "a maskable icon for Android");
  for (const icon of manifest.icons) assert.equal(pngSize(iconFile(icon.src)), icon.sizes, icon.src);

  const ico = fs.readFileSync(path.join(ROOT, "public/icons/favicon.ico"));
  assert.deepEqual([ico.readUInt16LE(2), ico.readUInt16LE(4)], [1, 3], "an icon file with 16, 32 and 48 px images");
  assert.deepEqual([0, 1, 2].map((i) => ico[6 + 16 * i]), [16, 32, 48]);
});

test("every page carries the icons, and link previews show the site image", () => {
  assert.match(read("views/layout.ejs"), /include\("partials\/icons"\)/);
  assert.match(read("views/partials/admin-head.ejs"), /include\("icons"\)/);
  assert.match(read("views/unsubscribe.ejs"), /include\("partials\/icons"\)/);
  for (const file of ["views/layout.ejs", "views/post.ejs", "src/routes/public.js"]) {
    assert.match(read(file), /\/public\/icons\/og-image\.jpg/, file);
  }
  const jpg = fs.readFileSync(path.join(ROOT, "public/icons/og-image.jpg"));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, "a JPEG");
  assert.ok(jpg.length < 300 * 1024, `${jpg.length} bytes (WhatsApp drops preview images over about 300 KB)`);
});
