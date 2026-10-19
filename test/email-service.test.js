// test/email-service.test.js
// Unit tests for the email service and the weekly throwback scheduler.
// No database and no network: fetch is mocked and Prisma is replaced by stubs.
// Run: node --test test/email-service.test.js
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SUPPORTED_LANGS,
  EMAIL_STRINGS,
  normalizeLang,
  escapeHtml,
  buildEmailHtml,
  buildSimpleEmailHtml,
  buildPlainText,
  buildPostUrl,
  buildUnsubscribeUrl,
  resolvePostTitles,
  selectThrowbackPost,
  encodeThrowbackMarker,
  sendEmail,
  sendNewPostEmail,
  sendWeeklyThrowbackEmail,
  sendSubscribeConfirmationEmail,
  sendUnsubscribeConfirmationEmail
} from "../src/lib/email-service.js";
import { validUnsubscribeToken } from "../src/lib/unsubscribe.js";
import {
  DEFAULT_THROWBACK_TIMEZONE,
  throwbackDueAt,
  resolveThrowbackTimeZone,
  claimThrowbackDay,
  releaseThrowbackDay,
  runThrowbackCheck
} from "../src/lib/scheduler.js";

const SITE = "https://theaugustinejournal.com";
// Unsubscribe links are signed; give the signer a key (read at call time).
process.env.UNSUBSCRIBE_SECRET ||= "unit-test-secret";

const savedEnv = { SITE_URL: process.env.SITE_URL, RESEND_API_KEY: process.env.RESEND_API_KEY };
const savedConsole = { log: console.log, warn: console.warn, error: console.error };
const savedFetch = globalThis.fetch;

before(() => {
  process.env.SITE_URL = `${SITE}/`; // trailing slash is trimmed
  process.env.RESEND_API_KEY = "re_test_unit";
  console.log = console.warn = console.error = () => {};
});

after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  Object.assign(console, savedConsole);
  globalThis.fetch = savedFetch;
});

/** Mock Resend: statuses are consumed per call, the last one repeats */
function mockFetch(...statuses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return status === 200
      ? new Response(JSON.stringify({ id: `msg_${calls.length}` }), { status })
      : new Response("error", { status });
  };
  return calls;
}

/** In-memory stand-in for the Prisma models used by the email service */
function stubPrisma({ subscribers = [], posts = [], tracker = null } = {}) {
  const state = { tracker: tracker ? { ...tracker } : null, logs: [] };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const matches = (row, where) => {
    if (!row || where.id !== row.id) return false;
    const cond = where.lastSentDate;
    if (cond === undefined) return true;
    if (typeof cond === "string") return row.lastSentDate === cond;
    return row.lastSentDate !== cond.not;
  };
  return {
    state,
    subscriber: { findMany: async () => subscribers.map(s => ({ ...s })) },
    post: { findMany: async () => posts.map(p => ({ ...p })) },
    emailLog: { create: async ({ data }) => { state.logs.push(data); return data; } },
    throwbackTracker: {
      findUnique: async () => { await tick(); return state.tracker ? { ...state.tracker } : null; },
      createMany: async ({ data }) => {
        await tick();
        if (state.tracker) return { count: 0 };
        state.tracker = { lastSentPostId: "", lastSentDate: "", ...data[0] };
        return { count: 1 };
      },
      updateMany: async ({ where, data }) => {
        await tick();
        if (!matches(state.tracker, where)) return { count: 0 };
        Object.assign(state.tracker, data);
        return { count: 1 };
      },
      upsert: async ({ update, create }) => {
        state.tracker = state.tracker ? { ...state.tracker, ...update } : { lastSentPostId: "", lastSentDate: "", ...create };
        return state.tracker;
      }
    }
  };
}

const post = (id, day, extra = {}) => ({
  id,
  slug: `post-${id.toLowerCase()}`,
  title: `Post ${id}`,
  type: "BLOG",
  postDate: new Date(Date.UTC(2026, 0, day, 12)),
  createdAt: new Date(Date.UTC(2026, 0, day, 12)),
  autoTranslateTitle: true,
  ...extra
});

/* ── Languages ── */

describe("normalizeLang", () => {
  test("keeps the six site languages", () => {
    assert.deepEqual([...SUPPORTED_LANGS], ["en", "es", "pt", "fr", "de", "ru"]);
    for (const lang of SUPPORTED_LANGS) assert.equal(normalizeLang(lang), lang);
  });

  test("drops region subtags, case and whitespace", () => {
    assert.equal(normalizeLang("pt-BR"), "pt");
    assert.equal(normalizeLang(" RU "), "ru");
    assert.equal(normalizeLang("es_MX"), "es");
    assert.equal(normalizeLang("DE"), "de");
  });

  test("maps everything else, including Italian, to en", () => {
    for (const value of ["it", "it-IT", "", "xx", "english", "<script>", undefined, null, 42, {}, ["pt"]]) {
      assert.equal(normalizeLang(value), "en", `normalizeLang(${JSON.stringify(value)})`);
    }
  });
});

describe("email strings", () => {
  test("every key has a non-empty string for exactly the six languages", () => {
    for (const [key, map] of Object.entries(EMAIL_STRINGS)) {
      assert.deepEqual(Object.keys(map).sort(), [...SUPPORTED_LANGS].sort(), key);
      for (const lang of SUPPORTED_LANGS) {
        assert.equal(typeof map[lang], "string", `${key}.${lang}`);
        assert.ok(map[lang].trim().length > 0, `${key}.${lang} is empty`);
      }
    }
  });

  test("translated site names", () => {
    assert.deepEqual(EMAIL_STRINGS.siteTitle, {
      en: "The Augustine Journal",
      es: "El Diario Agustiniano",
      pt: "O Diário Agostiniano",
      fr: "Le Journal augustinien",
      de: "Das Augustinische Journal",
      ru: "Августинский журнал"
    });
  });

  test("articles contract after prepositions", () => {
    const all = Object.values(EMAIL_STRINGS).flatMap(map => Object.values(map)).join("\n");
    for (const wrong of ["no O ", "a El ", "au Le ", "des Das ", "des The "]) {
      assert.ok(!all.includes(wrong), `found "${wrong}"`);
    }
    assert.match(EMAIL_STRINGS.subscribedMessage.pt, /no Diário Agostiniano/);
    assert.match(EMAIL_STRINGS.subscribedMessage.es, /al Diario Agustiniano/);
    assert.match(EMAIL_STRINGS.subscribedMessage.fr, /au Journal augustinien/);
  });

  test("Spanish opening marks and French no-break spaces", () => {
    for (const [key, map] of Object.entries(EMAIL_STRINGS)) {
      const es = map.es;
      for (const [open, close] of [["¡", "!"], ["¿", "?"]]) {
        assert.equal(es.split(open).length, es.split(close).length, `es ${key}: ${open}…${close}`);
      }
      assert.ok(!/[^ ][!?:;]/.test(map.fr), `fr ${key} needs a no-break space before ! ? : ;`);
    }
  });

  test("subjects use sentence case outside English", () => {
    assert.equal(EMAIL_STRINGS.newPostTitle.de, "Unser neuester Beitrag");
    for (const lang of ["es", "pt", "fr"]) {
      for (const key of ["newPostTitle", "weeklyThrowbackTitle", "subscribedSubject", "unsubscribedSubject"]) {
        const words = EMAIL_STRINGS[key][lang].split(" ").slice(1);
        for (const word of words) assert.equal(word, word.toLowerCase(), `${key}.${lang}`);
      }
    }
  });
});

/* ── HTML and plain text ── */

describe("buildEmailHtml", () => {
  const nasty = `Augustine on <Confessions> & "Grace" 'x'`;
  const postUrl = `${SITE}/post/a"onmouseover="alert(1)`;
  const unsubscribeUrl = `${SITE}/api/unsubscribe?email=a%40b.com&lang=fr`;
  const html = buildEmailHtml({
    subject: "<Subject>",
    message: "Read <b>this</b> & that",
    postTitle: nasty,
    postUrl,
    unsubscribeUrl,
    lang: "fr"
  });

  test("escapes titles, subjects, messages and URLs", () => {
    assert.ok(!html.includes("<Confessions>"));
    assert.ok(!html.includes("<Subject>"));
    assert.ok(!html.includes("<b>this</b>"));
    assert.ok(!html.includes(`"onmouseover="`));
    assert.ok(html.includes("<title>&lt;Subject&gt;</title>"));
    // the message's last two words are joined by a no-break space (no lone word on a phone's
    // last line); the post title is left as it is (see "no-widow joining" below)
    assert.ok(html.includes("Read &lt;b&gt;this&lt;/b&gt; &amp;\u00a0that</p>"));
    assert.ok(html.includes(`>${escapeHtml(nasty)}</a>`));
    assert.ok(html.includes(`href="${SITE}/post/a&quot;onmouseover=&quot;alert(1)"`));
    assert.ok(html.includes(`href="${SITE}/api/unsubscribe?email=a%40b.com&amp;lang=fr"`));
    // preheader
    assert.ok(html.includes(`Read &lt;b&gt;this&lt;/b&gt; &amp; that — ${escapeHtml(nasty)}`));
  });

  test("uses the PNG cathedral with translated alt text and the language", () => {
    assert.ok(html.includes(`<img src="${SITE}/public/icons/cathedral-email-ivory.png" alt="Cathédrale" width="260" height="140"`));
    assert.ok(!html.includes(".svg"));
    assert.ok(html.includes('<html lang="fr"'));
    assert.ok(html.includes(">Le Journal augustinien</h1>"));
    assert.ok(html.includes(">Se désabonner</a>"));
  });

  test("normalizes the language", () => {
    const it = buildEmailHtml({ subject: "s", message: "m", postTitle: "t", postUrl: "u", unsubscribeUrl: "x", lang: "it" });
    assert.ok(it.includes('<html lang="en"'));
    assert.ok(it.includes('alt="Cathedral"'));
    const ru = buildEmailHtml({ subject: "s", message: "m", postTitle: "t", postUrl: "u", unsubscribeUrl: "x", lang: "ru-RU" });
    assert.ok(ru.includes('<html lang="ru"'));
    assert.ok(ru.includes(">Августинский журнал</h1>"));
    assert.ok(ru.includes('alt="Собор"'));
  });

  test("keeps the dark design: ivory on charcoal, purple accents, the same fonts", () => {
    for (const fragment of ['bgcolor="#131211"', "color:#F1EBDD", "#5B2D8E", "Cormorant Garamond", "Inter", "max-width:600px", "border-radius:8px"]) {
      assert.ok(html.includes(fragment), fragment);
    }
  });
});

/* ── No lone last word, and nothing wider than a phone ── */

describe("no-widow joining", () => {
  const messageOf = message => buildSimpleEmailHtml({ subject: "s", message, lang: "de" }).match(/t-message"[^>]*>([^<]*)<\/p>/)[1];
  const titleOf = postTitle => buildEmailHtml({ subject: "s", message: "m", postTitle, postUrl: "u", lang: "de" }).match(/<a [^>]*tx-ivory[^>]*>([^<]*)<\/a>/)[1];

  test("joins the message's last two words only when they are short together (22 characters)", () => {
    assert.equal(messageOf("Look at abcdefghijk abcdefghijk"), "Look at abcdefghijk\u00a0abcdefghijk");
    assert.equal(messageOf("Look at abcdefghijkl abcdefghijk"), "Look at abcdefghijkl abcdefghijk");
    // a long word before a short last word stays breakable: one run of both would not fit a phone
    assert.equal(messageOf("Augustinus und die Auferstehungsverheißung Christi"), "Augustinus und die Auferstehungsverheißung Christi");
    assert.equal(messageOf("Amen"), "Amen");
    assert.equal(messageOf("Amen "), "Amen ");
    assert.equal(messageOf("Thanks  all"), "Thanks  all");
    // a no-break space already in the text counts as part of its word
    assert.equal(messageOf("Merci pour votre abonnement au Journal augustinien\u00a0!"), "Merci pour votre abonnement au Journal\u00a0augustinien\u00a0!");
  });

  test("never joins the post title, which can be any length", () => {
    for (const title of ["The Face of God", "Augustinus und die Auferstehungsverheißung Christi", "О достопримечательностях Рима", "Transubstantiation Explained"]) {
      assert.equal(titleOf(title), escapeHtml(title));
    }
    // a no-break space the author typed is kept
    assert.equal(titleOf("Pourquoi prier\u00a0?"), "Pourquoi prier\u00a0?");
  });

  test("a word too long for a phone breaks inside the post button instead of widening the card", () => {
    const html = buildEmailHtml({ subject: "s", message: "m", postTitle: "Donaudampfschifffahrtsgesellschaftskapitän", postUrl: "u", lang: "de" });
    const style = html.match(/<a [^>]*tx-ivory[^>]*style="([^"]*)"/)[1];
    assert.ok(style.includes("word-break:break-word;"), style);
    assert.ok(style.includes("overflow-wrap:break-word;"), style);
  });

  test("below 360px the card and the post button have less padding, so a long word fits whole", () => {
    const html = buildEmailHtml({ subject: "s", message: "m", postTitle: "Auferstehungsverheißung", postUrl: "u", lang: "de" });
    const link = html.match(/<a [^>]*tx-ivory[^>]*>/)[0];
    assert.match(link, /class="[^"]*\bpad-button\b/);
    assert.ok(link.includes("padding:14px 28px;"), "the inline padding (every other width) is unchanged");
    assert.ok(html.includes('class="bg-panel pad-panel"'));
    // the rules sit in the Gmail block, after the 520px block, which they override and which is unchanged
    const gmailBlock = html.match(/<style>[\s\S]*?<\/style>/g).find(block => block.includes("u + .body"));
    const wide = gmailBlock.indexOf("@media screen and (max-width:520px){");
    const narrow = gmailBlock.indexOf("@media screen and (max-width:374px){");
    assert.ok(wide > 0 && narrow > wide, "374px block after the 520px block");
    assert.ok(gmailBlock.slice(wide, narrow).includes(".pad-panel{padding:0 22px 38px!important;}"));
    assert.ok(!gmailBlock.slice(wide, narrow).includes(".pad-button"));
    const rules = gmailBlock.slice(narrow, gmailBlock.indexOf("\n}", narrow));
    assert.ok(rules.includes(".pad-panel{padding:0 16px 38px!important;}"), rules);
    assert.ok(rules.includes(".pad-button{padding:14px!important;}"), rules);
  });

  test("every message in the six languages keeps its last two words together", () => {
    for (const key of ["newPostMessage", "weeklyThrowbackMessage", "subscribedMessage", "unsubscribedMessage"]) {
      for (const lang of SUPPORTED_LANGS) {
        const message = EMAIL_STRINGS[key][lang];
        const space = message.lastIndexOf(" ");
        const joined = `${message.slice(0, space)}\u00a0${message.slice(space + 1)}`;
        assert.ok(buildSimpleEmailHtml({ subject: "s", message, lang }).includes(`>${escapeHtml(joined)}</p>`), `${key}.${lang}`);
      }
    }
  });
});

/* ── Email markup that holds up in every mail app ── */

describe("email markup", () => {
  const emails = [];
  for (const lang of SUPPORTED_LANGS) {
    const unsubscribeUrl = buildUnsubscribeUrl(`reader@${lang}.example`, lang);
    emails.push(
      buildEmailHtml({ subject: EMAIL_STRINGS.newPostTitle[lang], message: EMAIL_STRINGS.newPostMessage[lang], postTitle: "The Face of God", postUrl: buildPostUrl("the-face-of-god"), unsubscribeUrl, lang }),
      buildEmailHtml({ subject: EMAIL_STRINGS.weeklyThrowbackTitle[lang], message: EMAIL_STRINGS.weeklyThrowbackMessage[lang], postTitle: "A Case for God ".repeat(12), postUrl: buildPostUrl("a-case-for-god"), unsubscribeUrl, lang }),
      buildSimpleEmailHtml({ subject: EMAIL_STRINGS.subscribedSubject[lang], message: EMAIL_STRINGS.subscribedMessage[lang], unsubscribeUrl, lang }),
      buildSimpleEmailHtml({ subject: EMAIL_STRINGS.unsubscribedSubject[lang], message: EMAIL_STRINGS.unsubscribedMessage[lang], lang })
    );
  }
  const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) || [];
  const styleOf = tag => (tag.match(/style="([^"]*)"/) || [])[1] || "";

  test("stays well under Gmail's 102 KB clipping limit", () => {
    for (const html of emails) assert.ok(Buffer.byteLength(html) < 40 * 1024, `${Buffer.byteLength(html)} bytes`);
  });

  test("solid hex colours only, and no CSS that mail apps drop", () => {
    for (const html of emails) {
      for (const banned of [/rgba?\(/i, /hsla?\(/i, /var\(--/, /display:\s*(flex|grid)/i, /position:\s*(absolute|relative|fixed)/i, /@import/i]) {
        assert.ok(!banned.test(html), String(banned));
      }
      for (const [, value] of html.matchAll(/(?:bgcolor="|[;"]color:|background-color:)([^;"!]*)/g)) {
        assert.match(value, /^#[0-9A-Fa-f]{6}$/, value);
      }
    }
  });

  test("tables are presentational; images are sized PNGs with alt text", () => {
    for (const html of emails) {
      for (const table of tags(html, "table")) {
        for (const attr of ['role="presentation"', 'cellpadding="0"', 'cellspacing="0"', 'border="0"']) assert.ok(table.includes(attr), `${attr} in ${table}`);
      }
      for (const img of tags(html, "img")) {
        assert.match(img, /src="https:\/\/[^"]+\.png"/);
        assert.match(img, / alt="[^"]*"/);
        assert.match(img, / width="\d+" height="\d+"/);
        assert.match(styleOf(img), /display:block;/);
        assert.match(styleOf(img), /border:0;/);
      }
      for (const td of tags(html, "td")) assert.ok(!/(^|;)margin/.test(styleOf(td)), td);
      // no CSS url(): Gmail has dropped whole style attributes that contain one
      assert.ok(!/url\(/.test(html.replace(/<style>[\s\S]*?<\/style>/g, "")), "url() in an inline style");
      for (const [, src] of html.matchAll(/ background="([^"]*)"/g)) assert.match(src, /^https:\/\/[^"]+\.png$/);
    }
  });

  test("the cathedral is fluid up to 260px, so a blocked image never widens a phone", () => {
    for (const html of emails) {
      const img = tags(html, "img").find(tag => tag.includes("cathedral-email-ivory.png"));
      assert.ok(img.includes(' width="260" height="140"'), "Outlook for Windows sizes it from the attributes");
      assert.ok(styleOf(img).includes("width:100%;max-width:260px;height:auto;"), img);
      assert.ok(!/(^|;)width:260px/.test(styleOf(img)), img);
    }
  });

  test("every text element sets its own colour, font, size and line height", () => {
    for (const html of emails) {
      for (const tag of [...tags(html, "h1"), ...tags(html, "p"), ...tags(html, "a")]) {
        for (const prop of ["color:#", "font-family:", "font-size:", "line-height:"]) assert.ok(styleOf(tag).includes(prop), `${prop} in ${tag}`);
      }
    }
  });

  test("coloured cells carry bgcolor and the same inline colour", () => {
    for (const html of emails) {
      for (const tag of html.match(/<(?:td|table|body)\b[^>]*bgcolor="[^"]*"[^>]*>/g)) {
        const color = tag.match(/bgcolor="([^"]+)"/)[1];
        assert.ok(styleOf(tag).includes(`background-color:${color};`), tag);
      }
    }
  });

  test("Outlook gets a 600px ghost table, 96 DPI and font fallbacks", () => {
    const [html] = emails;
    assert.ok(html.includes('<!--[if mso]><table role="presentation" align="center" width="600"'));
    assert.ok(html.includes("<o:PixelsPerInch>96</o:PixelsPerInch>"));
    assert.ok(html.includes("mso-font-alt:Georgia") && html.includes("mso-font-alt:Arial"));
    assert.ok(html.includes("max-width:600px"));
    assert.equal((html.match(/<!--\[if/g) || []).length, (html.match(/<!\[endif\]-->/g) || []).length);
  });

  test("dark modes: color-scheme declared, colours pinned for Gmail and Outlook", () => {
    for (const html of emails) {
      assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
      assert.ok(html.includes('<meta name="supported-color-schemes" content="light dark">'));
      assert.ok(html.includes("a[x-apple-data-detectors]"));
      assert.ok(html.includes('<body class="body"'), "Gmail's u + .body selector needs the class");
      for (const cls of new Set([...html.matchAll(/class="[^"]*\b(bg-[A-Za-z]+)/g)].map(m => m[1]))) {
        assert.ok(html.includes(`u + .body .${cls}{background-image:linear-gradient(`), cls);
        assert.ok(html.includes(`[data-ogsb] .${cls},.${cls}[data-ogsb]{background-color:`), cls);
      }
      for (const cls of new Set([...html.matchAll(/class="[^"]*\b(tx-[A-Za-z]+)/g)].map(m => m[1]))) {
        assert.ok(html.includes(`[data-ogsc] .${cls},.${cls}[data-ogsc]{color:`), cls);
      }
      // every text block is wrapped in Gmail's blend layers
      assert.equal(html.split('<div class="gm-screen"><div class="gm-diff">').length - 1, tags(html, "h1").length + tags(html, "p").length + (html.includes("<!-- Post link -->") ? 1 : 0));
    }
  });

  test("Gmail rules stay apart from the selectors Gmail rejects", () => {
    const [html] = emails;
    const gmailBlock = html.match(/<style>[\s\S]*?<\/style>/g).find(block => block.includes("u + .body"));
    assert.ok(gmailBlock);
    assert.ok(!/\[data-|:root|x-apple|#MessageViewBody/.test(gmailBlock));
  });

  test("hidden preheader", () => {
    const [html] = emails;
    assert.match(html, /<div style="display:none;mso-hide:all;[^"]*max-height:0;[^"]*overflow:hidden;[^"]*">Check out our newest post\. — The Face of God/);
  });

  test("the artwork exists as 2x PNGs; the old cathedral stays for emails already sent", () => {
    const pngSize = file => {
      const buf = readFileSync(new URL(`../public/icons/${file}`, import.meta.url));
      assert.equal(buf.toString("ascii", 1, 4), "PNG", file);
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    };
    assert.deepEqual(pngSize("cathedral-email-ivory.png"), { width: 520, height: 280 }); // shown at 260 × 140
    assert.deepEqual(pngSize("ornament-email.png"), { width: 320, height: 24 }); // shown at 160 × 12
    assert.ok(pngSize("grain-email.png").width > 0);
    assert.deepEqual(pngSize("cathedral-email.png"), { width: 520, height: 280 });
    const [html] = emails;
    for (const file of ["cathedral-email-ivory.png", "ornament-email.png", "grain-email.png"]) assert.ok(html.includes(`${SITE}/public/icons/${file}`), file);
  });
});

describe("buildSimpleEmailHtml", () => {
  test("adds the unsubscribe footer only with a URL", () => {
    const withLink = buildSimpleEmailHtml({ subject: "S", message: "M", unsubscribeUrl: `${SITE}/api/unsubscribe?email=x&lang=de`, lang: "de" });
    assert.ok(withLink.includes(">Abmelden</a>"));
    const without = buildSimpleEmailHtml({ subject: "S", message: "M", lang: "de" });
    assert.ok(!without.includes("/api/unsubscribe"));
    assert.ok(without.includes("M — Das Augustinische Journal"));
  });
});

describe("buildPlainText", () => {
  const postUrl = buildPostUrl("on-grace");
  const unsubscribeUrl = buildUnsubscribeUrl("a+b@example.com", "en");
  const text = buildPlainText({
    message: EMAIL_STRINGS.newPostMessage.en,
    postTitle: "Faith & Reason <Part 1>",
    postUrl,
    unsubscribeUrl,
    lang: "en"
  });

  test("contains the message, title, post link and unsubscribe link", () => {
    assert.equal(text, [
      "The Augustine Journal",
      "Check out our newest post.",
      `Faith & Reason <Part 1>\n${SITE}/post/on-grace`,
      `Don't want to receive emails? Unsubscribe: ${buildUnsubscribeUrl("a+b@example.com", "en")}`
    ].join("\n\n"));
  });

  test("has no CSS, markup or entities", () => {
    for (const fragment of ["{", "color-scheme", "<a", "<p", "&amp;", "&#", "&zwnj;", "&nbsp;"]) {
      assert.ok(!text.includes(fragment), fragment);
    }
  });

  test("French colon takes a no-break space; simple emails have no post block", () => {
    const fr = buildPlainText({ message: "M", unsubscribeUrl: "U", lang: "fr" });
    assert.equal(fr, "Le Journal augustinien\n\nM\n\nVous ne souhaitez plus recevoir nos e-mails ? Se désabonner : U");
    assert.equal(buildPlainText({ message: "M", lang: "xx" }), "The Augustine Journal\n\nM");
  });
});

describe("URLs", () => {
  test("unsubscribe URL encodes email and language", () => {
    const tokenOf = (url) => new URL(url).searchParams.get("token");
    const a = buildUnsubscribeUrl("A+b@x.com", "pt-BR");
    assert.ok(a.startsWith(`${SITE}/api/unsubscribe?email=A%2Bb%40x.com&lang=pt&token=`));
    assert.ok(validUnsubscribeToken("a+b@x.com", tokenOf(a)), "token verifies for the (case-insensitive) address");
    const b = buildUnsubscribeUrl("a&lang=ru@x.com", "it");
    assert.ok(b.startsWith(`${SITE}/api/unsubscribe?email=a%26lang%3Dru%40x.com&lang=en&token=`));
    assert.equal(new URL(b).searchParams.get("email"), "a&lang=ru@x.com");
    assert.ok(!validUnsubscribeToken("someone-else@x.com", tokenOf(b)), "token is bound to the address");
  });

  test("post URL encodes the slug", () => {
    assert.equal(buildPostUrl("on-grace"), `${SITE}/post/on-grace`);
    assert.equal(buildPostUrl("a b/c"), `${SITE}/post/a%20b%2Fc`);
  });
});

/* ── Title translation ── */

describe("resolvePostTitles", () => {
  test("calls titleFor once per distinct non-English language", async () => {
    const calls = [];
    const titles = await resolvePostTitles(post("A", 1), ["fr", "fr", "en", "pt-BR", "it", "pt"], async lang => {
      calls.push(lang);
      return `  ${lang} title  `;
    });
    assert.deepEqual(calls, ["fr", "pt"]);
    assert.equal(titles.get("fr"), "fr title");
    assert.equal(titles.get("pt"), "pt title");
    assert.equal(titles.get("en"), "Post A");
  });

  test("errors, empty results and non-strings fall back to the original title", async () => {
    const titles = await resolvePostTitles(post("A", 1), ["fr", "de", "ru", "es"], lang => {
      if (lang === "fr") throw new Error("boom");
      if (lang === "de") return Promise.reject(new Error("async boom"));
      if (lang === "ru") return "   ";
      return 42;
    });
    for (const lang of ["fr", "de", "ru", "es"]) assert.equal(titles.get(lang), "Post A");
  });

  test("a slow translator cannot exceed the total time budget", async () => {
    const started = Date.now();
    const titles = await resolvePostTitles(post("A", 1), ["fr", "de", "ru"], lang =>
      new Promise(resolve => setTimeout(() => resolve(`${lang} late`), lang === "fr" ? 10 : 400)), { budgetMs: 100 });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 300, `took ${elapsed} ms`);
    assert.equal(titles.get("fr"), "fr late");
    assert.equal(titles.get("de"), "Post A");
    assert.equal(titles.get("ru"), "Post A");
  });

  test("autoTranslateTitle === false keeps the original title", async () => {
    let called = false;
    const titles = await resolvePostTitles(post("A", 1, { autoTranslateTitle: false }), ["fr"], () => { called = true; return "x"; });
    assert.equal(called, false);
    assert.equal(titles.get("fr"), "Post A");
  });
});

/* ── Throwback rotation ── */

describe("selectThrowbackPost", () => {
  const posts = [post("C", 3), post("A", 1), post("E", 5), post("B", 2), post("D", 4)];
  const marker = p => encodeThrowbackMarker(p);

  test("needs at least two posts", () => {
    assert.equal(selectThrowbackPost([], ""), null);
    assert.equal(selectThrowbackPost([post("A", 1)], ""), null);
  });

  test("starts at the oldest, moves forward, skips the newest and wraps", () => {
    assert.equal(selectThrowbackPost(posts, "").id, "A");
    assert.equal(selectThrowbackPost(posts, marker(post("A", 1))).id, "B");
    assert.equal(selectThrowbackPost(posts, marker(post("C", 3))).id, "D");
    assert.equal(selectThrowbackPost(posts, marker(post("D", 4))).id, "A"); // E is newest
  });

  test("continues after a deleted last-sent post", () => {
    const withoutC = posts.filter(p => p.id !== "C");
    assert.equal(selectThrowbackPost(withoutC, marker(post("C", 3))).id, "D");
  });

  test("continues after a last-sent post that is now the newest", () => {
    const redated = posts.map(p => (p.id === "B" ? post("B", 9) : p));
    assert.equal(selectThrowbackPost(redated, marker(post("B", 2))).id, "C");
  });

  test("understands legacy markers that hold only the id", () => {
    assert.equal(selectThrowbackPost(posts, "B").id, "C");
    assert.equal(selectThrowbackPost(posts, "gone").id, "A");
  });

  test("with two posts the older one is always sent", () => {
    const two = [post("A", 1), post("B", 2)];
    assert.equal(selectThrowbackPost(two, marker(two[0])).id, "A");
  });
});

/* ── Thursday / time zone ── */

describe("throwbackDueAt", () => {
  test("defaults to America/Chicago", () => {
    assert.equal(DEFAULT_THROWBACK_TIMEZONE, "America/Chicago");
    assert.equal(resolveThrowbackTimeZone(undefined), "America/Chicago");
    assert.equal(resolveThrowbackTimeZone("  "), "America/Chicago");
    assert.equal(resolveThrowbackTimeZone("Not/AZone"), "America/Chicago");
    assert.equal(resolveThrowbackTimeZone("America/Sao_Paulo"), "America/Sao_Paulo");
  });

  test("Thursday from 09:00 Chicago time (daylight saving, UTC-5)", () => {
    assert.deepEqual(throwbackDueAt(new Date("2026-10-22T13:59:00Z")), { due: false, localDate: "2026-10-22", weekday: "Thu", hour: 8 });
    assert.deepEqual(throwbackDueAt(new Date("2026-10-22T14:00:00Z")), { due: true, localDate: "2026-10-22", weekday: "Thu", hour: 9 });
    assert.deepEqual(throwbackDueAt(new Date("2026-10-23T04:59:00Z")), { due: true, localDate: "2026-10-22", weekday: "Thu", hour: 23 });
    assert.deepEqual(throwbackDueAt(new Date("2026-10-23T05:00:00Z")), { due: false, localDate: "2026-10-23", weekday: "Fri", hour: 0 });
  });

  test("Thursday from 09:00 Chicago time (standard time, UTC-6)", () => {
    assert.equal(throwbackDueAt(new Date("2026-01-15T14:59:00Z")).due, false);
    assert.equal(throwbackDueAt(new Date("2026-01-15T15:00:00Z")).due, true);
  });

  test("UTC Thursday that is still Wednesday in Chicago is not due", () => {
    const r = throwbackDueAt(new Date("2026-10-22T01:00:00Z"));
    assert.equal(r.due, false);
    assert.equal(r.weekday, "Wed");
    assert.equal(r.localDate, "2026-10-21");
  });

  test("other zones and midnight", () => {
    assert.deepEqual(throwbackDueAt(new Date("2026-10-22T00:30:00Z"), "UTC"), { due: false, localDate: "2026-10-22", weekday: "Thu", hour: 0 });
    assert.equal(throwbackDueAt(new Date("2026-10-22T06:00:00Z"), "Europe/Moscow").due, true); // 09:00 MSK
    assert.equal(throwbackDueAt(new Date("2026-10-22T05:59:00Z"), "Europe/Moscow").due, false);
  });
});

/* ── Daily claim ── */

describe("scheduler claim", () => {
  test("creates the tracker row and claims once per local date", async () => {
    const prisma = stubPrisma();
    assert.deepEqual(await claimThrowbackDay(prisma, "2026-10-22"), { claimed: true, previousDate: "" });
    assert.deepEqual(await claimThrowbackDay(prisma, "2026-10-22"), { claimed: false });
    assert.equal(await releaseThrowbackDay(prisma, "2026-10-22", ""), true);
    assert.equal(await releaseThrowbackDay(prisma, "2026-10-22", ""), false);
    assert.equal(prisma.state.tracker.lastSentDate, "");
  });

  test("overlapping checks send only once", async () => {
    const prisma = stubPrisma({ tracker: { id: 1, lastSentPostId: "", lastSentDate: "2026-10-15" } });
    let sends = 0;
    const send = async () => { sends++; await new Promise(r => setTimeout(r, 20)); return { total: 2, sent: 2, failed: 0 }; };
    const now = new Date("2026-10-22T15:00:00Z");
    const results = await Promise.all([1, 2, 3].map(() => runThrowbackCheck({ now, prisma, send })));
    assert.equal(sends, 1);
    assert.deepEqual(results.map(r => r.status).sort(), ["already-sent", "already-sent", "sent"]);
    assert.equal(prisma.state.tracker.lastSentDate, "2026-10-22");
  });

  test("a completely failed send releases the claim; an empty run keeps it", async () => {
    const prisma = stubPrisma({ tracker: { id: 1, lastSentPostId: "", lastSentDate: "2026-10-15" } });
    const now = new Date("2026-10-22T15:00:00Z");
    const failed = await runThrowbackCheck({ now, prisma, send: async () => ({ total: 3, sent: 0, failed: 3 }) });
    assert.equal(failed.status, "failed");
    assert.equal(prisma.state.tracker.lastSentDate, "2026-10-15");

    await assert.rejects(runThrowbackCheck({ now, prisma, send: async () => { throw new Error("db down"); } }), /db down/);
    assert.equal(prisma.state.tracker.lastSentDate, "2026-10-15");

    const empty = await runThrowbackCheck({ now, prisma, send: async () => ({ total: 0, sent: 0, failed: 0 }) });
    assert.equal(empty.status, "nothing-to-send");
    assert.equal(prisma.state.tracker.lastSentDate, "2026-10-22");
  });

  test("not due outside Thursday morning", async () => {
    const r = await runThrowbackCheck({ now: new Date("2026-10-21T15:00:00Z"), prisma: {}, send: () => assert.fail("sent") });
    assert.equal(r.status, "not-due");
  });
});

/* ── Sending ── */

describe("sendEmail", () => {
  test("posts HTML, plain text and one-click unsubscribe headers", async () => {
    const calls = mockFetch(200);
    const ok = await sendEmail({ to: "a@b.com", subject: "S", html: "<p>h</p>", text: "t", unsubscribeUrl: `${SITE}/api/unsubscribe?email=a%40b.com&lang=en`, tag: "new_post" });
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_unit");
    const body = calls[0].body;
    assert.deepEqual(body.to, ["a@b.com"]);
    assert.equal(body.text, "t");
    assert.equal(body.headers["List-Unsubscribe"], `<${SITE}/api/unsubscribe?email=a%40b.com&lang=en>`);
    assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.deepEqual(body.tags, [{ name: "category", value: "new_post" }]);
  });

  test("returns false on a client error without retrying", async () => {
    const calls = mockFetch(403);
    assert.equal(await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "t" }), false);
    assert.equal(calls.length, 1);
  });

  test("retries a rate-limited request", async () => {
    const calls = mockFetch(429, 200);
    assert.equal(await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "t" }), true);
    assert.equal(calls.length, 2);
  });

  test("returns false without an API key", async () => {
    const calls = mockFetch(200);
    delete process.env.RESEND_API_KEY;
    try {
      assert.equal(await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "t" }), false);
    } finally {
      process.env.RESEND_API_KEY = "re_test_unit";
    }
    assert.equal(calls.length, 0);
  });

  test("confirmation emails return the delivery result and use the language", async () => {
    let calls = mockFetch(200);
    assert.equal(await sendSubscribeConfirmationEmail({ email: "a@b.com", language: "es" }), true);
    assert.equal(calls[0].body.subject, "Suscripción confirmada");
    assert.match(calls[0].body.text, /¡Gracias por suscribirte al Diario Agustiniano!/);
    assert.ok(calls[0].body.text.endsWith(buildUnsubscribeUrl("a@b.com", "es")));
    calls = mockFetch(403);
    assert.equal(await sendUnsubscribeConfirmationEmail({ email: "a@b.com", language: "it" }), false);
    assert.equal(calls[0].body.subject, "Unsubscribed");
    assert.equal(calls[0].body.headers["List-Unsubscribe"], undefined);
  });
});

describe("sendNewPostEmail", () => {
  const subscribers = [
    { email: "fr@x.com", language: "fr" },
    { email: "ru@x.com", language: "ru" },
    { email: "it@x.com", language: "it" }
  ];

  test("counts deliveries, translates titles per language and logs", async () => {
    const calls = mockFetch(200, 403, 200);
    const prisma = stubPrisma({ subscribers });
    const asked = [];
    const result = await sendNewPostEmail(post("A", 1, { title: "On <Grace>" }), {
      prisma,
      titleFor: async lang => { asked.push(lang); return `${lang}: <Grace>`; }
    });
    assert.deepEqual(result, { total: 3, sent: 2, failed: 1 });
    assert.deepEqual(asked, ["fr", "ru"]);
    assert.equal(prisma.state.logs.length, 1);
    assert.equal(prisma.state.logs[0].type, "NEW_POST");

    const [fr, ru, it] = calls.map(c => c.body);
    assert.equal(fr.subject, "Notre dernière publication");
    assert.ok(fr.html.includes(">fr: &lt;Grace&gt;</a>"));
    assert.ok(fr.text.includes(`fr: <Grace>\n${SITE}/post/post-a`));
    assert.ok(fr.text.includes(buildUnsubscribeUrl("fr@x.com", "fr")));
    assert.equal(ru.subject, "Наша новая публикация");
    assert.equal(it.subject, "Our Latest Post");
    assert.ok(it.html.includes(">On &lt;Grace&gt;</a>"));
    assert.equal(it.headers["List-Unsubscribe"], `<${buildUnsubscribeUrl("it@x.com", "en")}>`);
  });

  test("writes no log when nothing was delivered", async () => {
    mockFetch(403);
    const prisma = stubPrisma({ subscribers });
    const result = await sendNewPostEmail(post("A", 1), { prisma });
    assert.deepEqual(result, { total: 3, sent: 0, failed: 3 });
    assert.equal(prisma.state.logs.length, 0);
  });

  test("no subscribers", async () => {
    const calls = mockFetch(200);
    assert.deepEqual(await sendNewPostEmail(post("A", 1), { prisma: stubPrisma() }), { total: 0, sent: 0, failed: 0 });
    assert.equal(calls.length, 0);
  });
});

describe("sendWeeklyThrowbackEmail", () => {
  const posts = [post("A", 1), post("B", 2), post("C", 3)];
  const subscribers = [{ email: "de@x.com", language: "de" }, { email: "es@x.com", language: "es" }];

  test("advances the rotation and logs only after a delivery", async () => {
    mockFetch(200);
    const prisma = stubPrisma({ subscribers, posts, tracker: { id: 1, lastSentPostId: encodeThrowbackMarker(posts[0]), lastSentDate: "2026-10-22" } });
    const asked = [];
    const result = await sendWeeklyThrowbackEmail({ prisma, titleFor: async (p, lang) => { asked.push(`${p.id}:${lang}`); return `${p.title} (${lang})`; } });
    assert.deepEqual(result, { total: 2, sent: 2, failed: 0, postId: "B" });
    assert.deepEqual(asked, ["B:de", "B:es"]);
    assert.equal(prisma.state.tracker.lastSentPostId, encodeThrowbackMarker(posts[1]));
    assert.equal(prisma.state.tracker.lastSentDate, "2026-10-22"); // owned by the scheduler
    assert.equal(prisma.state.logs[0].type, "WEEKLY_THROWBACK");
    assert.equal(prisma.state.logs[0].postId, "B");
  });

  test("keeps the rotation when every email fails", async () => {
    const calls = mockFetch(403);
    const marker = encodeThrowbackMarker(posts[0]);
    const prisma = stubPrisma({ subscribers, posts, tracker: { id: 1, lastSentPostId: marker, lastSentDate: "" } });
    const result = await sendWeeklyThrowbackEmail({ prisma });
    assert.deepEqual(result, { total: 2, sent: 0, failed: 2, postId: "B" });
    assert.equal(prisma.state.tracker.lastSentPostId, marker);
    assert.equal(prisma.state.logs.length, 0);
    assert.equal(calls[0].body.subject, "Wöchentlicher Rückblick");
    assert.equal(calls[1].body.subject, "Retrospectiva semanal");
  });

  test("nothing to send with fewer than two posts", async () => {
    const calls = mockFetch(200);
    const result = await sendWeeklyThrowbackEmail({ prisma: stubPrisma({ subscribers, posts: [posts[0]] }) });
    assert.deepEqual(result, { total: 0, sent: 0, failed: 0, postId: null });
    assert.equal(calls.length, 0);
  });
});
