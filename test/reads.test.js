// test/reads.test.js
// Run: node --test test/reads.test.js
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import vm from "vm";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import pg from "pg";

process.env.SESSION_SECRET = "reads-test-secret";

const {
  readSeconds, wordCount, makeReadTicket, verifyReadTicket, readerKey, networkTag, networkOf, normalizeDeviceId,
  deviceIdFromCookie, isLikelyBot, recordRead, ticketHash, TICKET_MAX_AGE_MS, NETWORK_READS_PER_DAY
} = await import("../src/lib/reads.js");
const { ownPageJson, isOwnPageRequest } = await import("../src/middleware/csrf.js");

const DEVICE = "3f1c2a9e-5b7d-4c11-9a2e-0d6f8b4e7a21";

describe("reading time", () => {
  test("follows the word-count table", () => {
    const table = [[0, 10], [120, 10], [300, 10], [400, 12.5], [500, 15], [600, 22.5], [700, 30], [1000, 36], [1500, 45], [9000, 45]];
    for (const [words, seconds] of table) assert.equal(readSeconds(words), seconds, `${words} words`);
  });

  test("treats nonsense as an empty post", () => {
    assert.equal(readSeconds(undefined), 10);
    assert.equal(readSeconds(-50), 10);
    assert.equal(readSeconds("abc"), 10);
  });

  test("counts words in post HTML", () => {
    assert.equal(wordCount("<p>Grace and <em>truth</em>.</p><p>— 1 Cor 13</p>"), 6);
    assert.equal(wordCount(""), 0);
  });
});

describe("read tickets", () => {
  const issued = Date.UTC(2026, 9, 18, 12, 0, 0);
  const ticket = makeReadTicket("post_A-1", 12.5, issued);

  test("a ticket verifies for its post once the reading time has passed", () => {
    assert.deepEqual(verifyReadTicket(ticket, "post_A-1", issued + 12_500), { ok: true });
    // Two seconds of grace for clocks and rounding.
    assert.deepEqual(verifyReadTicket(ticket, "post_A-1", issued + 10_600), { ok: true });
  });

  test("is refused for another post", () => {
    assert.equal(verifyReadTicket(ticket, "post_B", issued + 60_000).reason, "wrong_post");
  });

  test("is refused when tampered with", () => {
    const [id, at, tenths, nonce, mac] = ticket.split(".");
    assert.equal(tenths, "125");
    const forged = [
      [id, at, "10", nonce, mac],
      [id, String(issued - 60_000), tenths, nonce, mac],
      ["post_B", at, tenths, nonce, mac],
      [id, at, tenths, nonce.slice(0, -1) + (nonce.endsWith("A") ? "B" : "A"), mac],
      [id, at, tenths, nonce, mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A")],
      [id, at, tenths, nonce, ""],
      [id, at, tenths, mac] // the format without a nonce
    ];
    for (const parts of forged) {
      assert.equal(verifyReadTicket(parts.join("."), parts[0], issued + 60_000).reason, "invalid", parts.join("."));
    }
    for (const junk of [undefined, null, 42, "", "a.b.c", "a.b.c.d", "x".repeat(500)]) {
      assert.equal(verifyReadTicket(junk, "post_A-1", issued + 60_000).reason, "invalid");
    }
  });

  test("two pages served in the same millisecond get different tickets", () => {
    const a = makeReadTicket("post_A-1", 12.5, issued);
    const b = makeReadTicket("post_A-1", 12.5, issued);
    assert.notEqual(a, b);
    assert.notEqual(ticketHash(a), ticketHash(b));
    assert.deepEqual(verifyReadTicket(a, "post_A-1", issued + 12_500), { ok: true });
    assert.deepEqual(verifyReadTicket(b, "post_A-1", issued + 12_500), { ok: true });
    assert.ok(a.length < 120, a);
  });

  test("is refused when signed with another secret", () => {
    process.env.SESSION_SECRET = "another-secret";
    const other = makeReadTicket("post_A-1", 12.5, issued);
    process.env.SESSION_SECRET = "reads-test-secret";
    assert.equal(verifyReadTicket(other, "post_A-1", issued + 60_000).reason, "invalid");
  });

  test("is refused too early", () => {
    assert.equal(verifyReadTicket(ticket, "post_A-1", issued).reason, "too_early");
    assert.equal(verifyReadTicket(ticket, "post_A-1", issued + 10_000).reason, "too_early");
  });

  test("expires after seven days", () => {
    assert.deepEqual(verifyReadTicket(ticket, "post_A-1", issued + TICKET_MAX_AGE_MS), { ok: true });
    assert.equal(verifyReadTicket(ticket, "post_A-1", issued + TICKET_MAX_AGE_MS + 1).reason, "expired");
  });
});

describe("readers", () => {
  const net = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15" };

  test("one device is one reader of a post, wherever it reads from", () => {
    const a = readerKey({ postId: "p1", device: DEVICE, ...net });
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(readerKey({ postId: "p1", device: DEVICE.toUpperCase(), ip: "198.51.100.1", userAgent: "other" }), a);
    assert.notEqual(readerKey({ postId: "p1", device: "9b2e7c1d-0a4f-4e8b-b6c3-1f2d3e4a5b6c", ...net }), a);
  });

  test("a device's reads of different posts cannot be linked", () => {
    assert.notEqual(readerKey({ postId: "p1", device: DEVICE, ...net }), readerKey({ postId: "p2", device: DEVICE, ...net }));
    assert.notEqual(readerKey({ postId: "p1", ...net }), readerKey({ postId: "p2", ...net }));
    assert.notEqual(networkTag({ postId: "p1", ip: net.ip }), networkTag({ postId: "p2", ip: net.ip }));
  });

  test("without a device id the network address and browser are used", () => {
    const fallback = readerKey({ postId: "p1", device: null, ...net });
    assert.notEqual(fallback, readerKey({ postId: "p1", device: DEVICE, ...net }));
    assert.equal(readerKey({ postId: "p1", device: "not-a-uuid", ...net }), fallback);
    assert.equal(readerKey({ postId: "p1", ...net }), fallback);
    assert.notEqual(readerKey({ postId: "p1", ...net, ip: "203.0.113.8" }), fallback);
    assert.notEqual(readerKey({ postId: "p1", ...net, userAgent: "Firefox" }), fallback);
  });

  test("a network is an IPv4 address or an IPv6 /64", () => {
    assert.equal(networkOf("203.0.113.7"), "203.0.113.7");
    assert.equal(networkOf("::ffff:203.0.113.7"), "203.0.113.7");
    assert.equal(networkOf("2001:db8:abcd:12:1:2:3:4"), "2001:db8:abcd:12::/64");
    assert.equal(networkOf("2001:DB8:ABCD:0012:ffff::1"), "2001:db8:abcd:12::/64");
    assert.equal(networkOf("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(networkOf("::1"), "0:0:0:0::/64");
    assert.equal(networkOf("fe80::1%en0"), "fe80:0:0:0::/64");
    assert.equal(networkOf("64:ff9b::203.0.113.7"), "64:ff9b:0:0::/64");
    assert.equal(networkOf(undefined), "unknown");
    // One phone moving through its /64 is one network.
    assert.equal(networkTag({ postId: "p1", ip: "2001:db8:abcd:12::a" }), networkTag({ postId: "p1", ip: "2001:db8:abcd:12::b" }));
    assert.notEqual(networkTag({ postId: "p1", ip: "2001:db8:abcd:12::a" }), networkTag({ postId: "p1", ip: "2001:db8:abcd:13::a" }));
  });

  test("a network is stored as a 16-bit tag, too short to tell which network it was", () => {
    assert.match(networkTag({ postId: "p1", ip: "203.0.113.7" }), /^[0-9a-f]{4}$/);
    const tags = new Set();
    for (let i = 0; i < 4096; i++) tags.add(networkTag({ postId: "p1", ip: `10.0.${i >> 8}.${i & 255}` }));
    assert.ok(tags.size > 3900 && tags.size <= 4096, `${tags.size} tags`); // spread out, rarely shared
  });

  test("device ids must look like UUIDs", () => {
    assert.equal(normalizeDeviceId(DEVICE.toUpperCase()), DEVICE);
    for (const bad of [undefined, 7, "", "abc", `${DEVICE}-extra`, `${DEVICE} `, "x".repeat(65)]) {
      assert.equal(normalizeDeviceId(bad), null, String(bad));
    }
  });

  test("reads the device cookie", () => {
    assert.equal(deviceIdFromCookie(`taj.sid=s%3Aabc; taj_did=${DEVICE}; other=1`), DEVICE);
    assert.equal(deviceIdFromCookie(`xtaj_did=${DEVICE}`), null);
    assert.equal(deviceIdFromCookie("taj_did=junk"), null);
    assert.equal(deviceIdFromCookie(undefined), null);
  });

  test("crawlers, automated browsers and HTTP clients are recognised", () => {
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "facebookexternalhit/1.1",
      "",
      // Crawlers that render with JavaScript and do not say "bot"
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Mobile Safari/537.36 (compatible; GoogleOther)",
      "GoogleOther",
      "Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) BingPreview/1.0b",
      "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0 (compatible; Google-Read-Aloud; +https://support.google.com/webmasters/answer/1061943)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 PTST/250101.000000",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 GTmetrix",
      // HTTP clients with their default user agents
      "curl/8.7.1", "Wget/1.24.5", "python-requests/2.32.3", "Python-urllib/3.12", "python-httpx/0.27.0",
      "Python/3.12 aiohttp/3.9.5", "Go-http-client/1.1", "Go-http-client/2.0", "node", "node-fetch/1.0", "undici",
      "axios/1.7.2", "got (https://github.com/sindresorhus/got)", "okhttp/4.12.0", "Java/17.0.9",
      "Java-http-client/21.0.1", "Apache-HttpClient/4.5.14 (Java/17.0.9)", "libwww-perl/6.72", "HTTPie/3.2.2",
      "PostmanRuntime/7.39.0", "insomnia/2023.5.8", "Deno/1.44.0", "Bun/1.1.12", "Ruby", "Faraday v2.9.0",
      "GuzzleHttp/7", "Dart/3.4 (dart:io)", "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A.240805.005)",
      "MyScript/1 CFNetwork/1494.0.7 Darwin/23.4.0",
      "Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.22621.2506", "Scrapy/2.11.2"
    ];
    const people = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/131.0.2903.68 Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/343.0.695551749 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.29.89 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556; 657427950)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.42.109;FBBV/662447379;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.66.81;]",
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 OPR/86.0.0.0",
      "Opera/9.80 (J2ME/MIDP; Opera Mini/5.1.21214/28.2725; U; ru) Presto/2.8.119 Version/11.10",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 DuckDuckGo/5",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 GSA/15.46.38.29.arm64",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
      "Mozilla/5.0 (Linux; U; Android 13; en-us; KFRAWI Build/TS8A) AppleWebKit/537.36 (KHTML, like Gecko) Silk/131.3.1 like Chrome/131.0.6778.204 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 YaBrowser/24.12.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux; U; Android 12; en-US; V2111 Build/SP1A.210812.003) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.80 UCBrowser/13.7.2.1324 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Vivaldi/7.0"
    ];
    for (const ua of bots) assert.equal(isLikelyBot(ua), true, ua);
    for (const ua of people) assert.equal(isLikelyBot(ua), false, ua);
  });

  test("recordRead reports whether the read was new", async () => {
    let sql = "";
    let values = [];
    const prisma = (rows) => ({ $queryRaw: async (strings, ...v) => { sql = strings.join("?"); values = v; return rows; } });
    const read = { postId: "p", readerKey: "key", networkTag: "a1b2", ticket: "t" };
    assert.equal(await recordRead(prisma([{ id: "p" }]), read), true);
    assert.equal(await recordRead(prisma([]), read), false);
    // Any unique conflict (same reader, or a ticket already used) skips the count.
    assert.match(sql, /ON CONFLICT DO NOTHING/);
    assert.match(sql, /"ticket_hash"/);
    assert.match(sql, /"view_count" = "view_count" \+ 1/);
    // At most NETWORK_READS_PER_DAY in 24 hours from one network.
    assert.match(sql, /"network_tag" = \?\s+AND "created_at" > CURRENT_TIMESTAMP - interval '1 day'/);
    assert.ok(values.includes(NETWORK_READS_PER_DAY) && values.includes("a1b2"));
    assert.ok(values.includes(ticketHash("t")) && !values.includes("t"), "stores the ticket's hash only");
  });

  test("a ticket is stored only as a hash, the same for the same ticket", () => {
    const t = makeReadTicket("p", 10, 0);
    assert.equal(ticketHash(t), ticketHash(t));
    assert.notEqual(ticketHash(t), ticketHash(makeReadTicket("p", 10, 0)));
    assert.match(ticketHash(t), /^[0-9a-f]{64}$/);
  });
});

describe("requests from the site's own pages", () => {
  const req = (headers, { json = true, protocol = "https", method = "POST" } = {}) => ({
    method,
    protocol,
    hostname: "theaugustinejournal.com",
    get: (h) => headers[h.toLowerCase()],
    is: () => json
  });
  const run = (r) => new Promise((resolve) => ownPageJson(r, {}, (err) => resolve(err || null)));

  test("a fetch from a page here passes", async () => {
    assert.equal(isOwnPageRequest(req({ "sec-fetch-site": "same-origin" })), true);
    // Older Safari sends no Sec-Fetch-Site, only Origin.
    assert.equal(isOwnPageRequest(req({ origin: "https://theaugustinejournal.com" })), true);
    assert.equal(await run(req({ "sec-fetch-site": "same-origin", origin: "https://theaugustinejournal.com" })), null);
  });

  test("a request that does not show where it comes from is refused", async () => {
    assert.equal(isOwnPageRequest(req({})), false, "no Sec-Fetch-Site and no Origin: a script");
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "none" },
      { origin: "null" },
      { origin: "https://evil.example" },
      { origin: "https://theaugustinejournal.com.evil.example" },
      { origin: "http://theaugustinejournal.com" },
      { origin: "not a url" }
    ]) {
      assert.equal(isOwnPageRequest(req(headers)), false, JSON.stringify(headers));
    }
    assert.equal((await run(req({})))?.code, "EBADCSRFTOKEN");
    assert.equal((await run(req({ "sec-fetch-site": "same-origin" }, { json: false })))?.code, "EBADCSRFTOKEN");
    assert.equal(await run(req({}, { method: "GET" })), null);
  });
});

/* ------------------------------------------------------------------ */
/*  public/js/reads.js in a simulated browser                         */
/* ------------------------------------------------------------------ */

const READS_JS = fs.readFileSync(new URL("../public/js/reads.js", import.meta.url), "utf8");

// responses: what each POST gets in turn, a status code or "offline" (the
// fetch fails); after the last one, 200.
function browser({ seconds = 10, scrollHeight = 3000, innerHeight = 800, stored = null, cookie = "", blocked = false, responses = [] } = {}) {
  let clock = 1_000_000;
  let timers = [];
  let nextTimer = 1;
  const listeners = {};
  const sent = [];
  const observers = [];
  const store = new Map(stored ? [["taj.device", stored]] : []);
  let cookieJar = cookie;

  const on = (type, fn) => { (listeners[type] ||= new Set()).add(fn); };
  const off = (type, fn) => listeners[type]?.delete(fn);
  const fire = (type) => [...(listeners[type] || [])].forEach((fn) => fn());
  const ticket = makeReadTicket("post-1", seconds, clock);

  const document = {
    visibilityState: "visible",
    scrollingElement: { scrollHeight },
    querySelector: () => ({ getAttribute: (n) => ({ "data-read-ticket": ticket, "data-read-seconds": String(seconds) })[n] ?? null }),
    addEventListener: on,
    removeEventListener: off
  };
  Object.defineProperty(document, "cookie", {
    get() { if (blocked) throw new Error("SecurityError"); return cookieJar; },
    set(v) { if (blocked) throw new Error("SecurityError"); const [pair] = v.split(";"); cookieJar = pair; }
  });
  const window = {
    pageYOffset: 0,
    innerHeight,
    addEventListener: on,
    removeEventListener: off,
    fetch: (url, init) => {
      sent.push({ url, init, body: JSON.parse(init.body) });
      const answer = responses[sent.length - 1] ?? 200;
      return answer === "offline" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve({ status: answer });
    },
    ResizeObserver: class {
      constructor(fn) { this.fn = fn; this.active = false; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    }
  };
  const localStorage = {
    getItem: (k) => { if (blocked) throw new Error("SecurityError"); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error("SecurityError"); store.set(k, String(v)); }
  };
  const context = {
    window, document, localStorage, location: { protocol: "https:" },
    crypto: { randomUUID: () => DEVICE },
    fetch: window.fetch,
    ResizeObserver: window.ResizeObserver,
    Date: { now: () => clock },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.push({ id, at: clock + ms, fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); }
  };
  vm.runInNewContext(READS_JS, context);

  return {
    sent, store, listeners, ticket,
    get cookie() { return cookieJar; },
    advance(ms) {
      const end = clock + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        clock = due.at;
        due.fn();
      }
      clock = end;
    },
    scrollTo(y) { window.pageYOffset = y; fire("scroll"); },
    hide() { document.visibilityState = "hidden"; fire("visibilitychange"); },
    show() { document.visibilityState = "visible"; fire("visibilitychange"); },
    resize(h) { window.innerHeight = h; fire("resize"); },
    reflow(height) { document.scrollingElement.scrollHeight = height; observers.filter((o) => o.active).forEach((o) => o.fn([])); },
    get watching() { return observers.some((o) => o.active); }
  };
}

describe("reads.js in the browser", () => {
  test("no read before the reading time, none without scrolling, exactly one after both", () => {
    const b = browser({ seconds: 15 });
    b.advance(14_000);
    b.scrollTo(400);
    assert.equal(b.sent.length, 0, "scrolled but too soon");
    b.advance(2_000);
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].url, "/api/posts/post-1/read");
    assert.equal(b.sent[0].init.keepalive, true);
    assert.deepEqual(b.sent[0].body, { ticket: b.ticket, device: DEVICE });
    b.scrollTo(1200);
    b.advance(60_000);
    assert.equal(b.sent.length, 1, "sent only once");
    assert.equal(Object.values(b.listeners).reduce((n, set) => n + set.size, 0), 0, "stops listening");
  });

  test("time first, then a slight scroll", () => {
    const b = browser({ seconds: 10 });
    b.advance(30_000);
    b.scrollTo(100);
    assert.equal(b.sent.length, 0, "100px is less than the 150px needed");
    b.scrollTo(160);
    assert.equal(b.sent.length, 1);
  });

  test("scrolling back up counts as scrolling too", () => {
    const b = browser({ seconds: 10 });
    b.scrollTo(900);
    b.scrollTo(0);
    b.advance(10_100);
    assert.equal(b.sent.length, 1);
  });

  test("a page with little to scroll needs a quarter of it", () => {
    const b = browser({ seconds: 10, scrollHeight: 1200, innerHeight: 800 }); // 400px to scroll
    b.advance(11_000);
    b.scrollTo(90);
    assert.equal(b.sent.length, 0);
    b.scrollTo(101);
    assert.equal(b.sent.length, 1);
  });

  test("a short post that cannot scroll needs only the time", () => {
    const b = browser({ seconds: 10, scrollHeight: 900, innerHeight: 800 });
    b.advance(9_900);
    assert.equal(b.sent.length, 0);
    b.advance(200);
    assert.equal(b.sent.length, 1);
  });

  test("a window made taller can waive the scroll", () => {
    const b = browser({ seconds: 10, scrollHeight: 1000, innerHeight: 700 });
    b.advance(12_000);
    assert.equal(b.sent.length, 0);
    b.resize(900);
    assert.equal(b.sent.length, 1);
  });

  test("a post that becomes too short to scroll needs only the time", () => {
    const b = browser({ seconds: 10, scrollHeight: 1400, innerHeight: 800 });
    b.advance(12_000);
    assert.equal(b.sent.length, 0);
    assert.equal(b.watching, true);
    b.reflow(850);
    assert.equal(b.sent.length, 1);
    assert.equal(b.watching, false, "stops watching the size");
  });

  test("time in a hidden tab does not count", () => {
    const b = browser({ seconds: 10 });
    b.scrollTo(500);
    b.advance(6_000);
    b.hide();
    b.advance(120_000);
    assert.equal(b.sent.length, 0);
    b.show();
    b.advance(3_900);
    assert.equal(b.sent.length, 0);
    b.advance(200);
    assert.equal(b.sent.length, 1);
  });

  test("the cookie restores localStorage and the other way round", () => {
    const fromCookie = browser({ cookie: `taj_did=${DEVICE.replace("3f1c", "aaaa")}`, scrollHeight: 500 });
    fromCookie.advance(11_000);
    assert.equal(fromCookie.sent[0].body.device, DEVICE.replace("3f1c", "aaaa"));
    assert.equal(fromCookie.store.get("taj.device"), DEVICE.replace("3f1c", "aaaa"));

    const fromStorage = browser({ stored: DEVICE.replace("3f1c", "bbbb"), scrollHeight: 500 });
    fromStorage.advance(11_000);
    assert.equal(fromStorage.sent[0].body.device, DEVICE.replace("3f1c", "bbbb"));
    assert.equal(fromStorage.cookie, `taj_did=${DEVICE.replace("3f1c", "bbbb")}`);
  });

  test("blocked storage and cookies still send a read, without a device id", () => {
    const b = browser({ blocked: true, scrollHeight: 500 });
    b.advance(11_000);
    assert.equal(b.sent.length, 1);
    assert.deepEqual(b.sent[0].body, { ticket: b.ticket });
  });

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  test("a read lost to a network error, a 5xx or a 429 is sent again with the same ticket", async () => {
    const b = browser({ scrollHeight: 500, responses: ["offline", 503, 429, 200] });
    b.advance(10_100);
    assert.equal(b.sent.length, 1);
    await settle();
    b.advance(2_900);
    assert.equal(b.sent.length, 1, "waits before trying again");
    b.advance(200);
    assert.equal(b.sent.length, 2);
    await settle();
    b.advance(15_000);
    assert.equal(b.sent.length, 3);
    await settle();
    b.advance(60_000);
    assert.equal(b.sent.length, 4);
    await settle();
    b.advance(600_000);
    await settle();
    assert.equal(b.sent.length, 4, "stops once the read is in");
    for (const s of b.sent) assert.deepEqual(s.body, { ticket: b.ticket, device: DEVICE });
  });

  test("gives up after four more tries", async () => {
    const b = browser({ scrollHeight: 500, responses: Array(10).fill("offline") });
    b.advance(10_100);
    for (let i = 0; i < 10; i++) { await settle(); b.advance(200_000); }
    assert.equal(b.sent.length, 5);
  });

  test("a read that was answered is not sent again", async () => {
    for (const status of [200, 403, 400]) {
      const b = browser({ scrollHeight: 500, responses: [status] });
      b.advance(10_100);
      await settle();
      b.advance(600_000);
      assert.equal(b.sent.length, 1, String(status));
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Against a local database (skipped without one)                    */
/* ------------------------------------------------------------------ */

// DATABASE_URL from the environment or .env, used only when it points at
// this machine and answers: the tests add two posts and remove them (and
// their reads).
async function localDatabaseUrl() {
  let url = process.env.DATABASE_URL;
  const envFile = new URL("../.env", import.meta.url);
  if (!url && fs.existsSync(envFile)) url = dotenv.parse(fs.readFileSync(envFile)).DATABASE_URL;
  try {
    if (!url || !["localhost", "127.0.0.1", "[::1]", ""].includes(new URL(url).hostname)) return null;
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    await client.end();
    return url;
  } catch {
    return null;
  }
}

const DB_URL = await localDatabaseUrl();
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("against the local database", { skip: DB_URL ? false : "no local database" }, () => {
  let prisma, server, base, disconnect;
  const posts = [`readtest${nanoid(10)}`, `readtest${nanoid(10)}`];
  const device = () => crypto.randomUUID();
  const oldTicket = (postId) => makeReadTicket(postId, 10, Date.now() - 20_000);
  const count = async (postId) => (await prisma.post.findUnique({ where: { id: postId }, select: { viewCount: true } })).viewCount;
  const rows = (postId) => prisma.$queryRaw`SELECT "reader_key", "network_tag", "ticket_hash" FROM "post_reads" WHERE "post_id" = ${postId}`;
  const read = (postId, { reader = device(), ip = "203.0.113.50", ticket = oldTicket(postId) } = {}) =>
    recordRead(prisma, { postId, ticket, readerKey: readerKey({ postId, device: reader }), networkTag: networkTag({ postId, ip }) });

  function post(path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), ...headers }
      }, (res) => {
        let text = "";
        res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text || "null") }));
      });
      req.on("error", reject);
      req.end(data);
    });
  }

  before(async () => {
    process.env.DATABASE_URL = DB_URL;
    const db = await import("../src/lib/db.js");
    prisma = db.getPrisma();
    disconnect = db.disconnectPrisma;
    for (const id of posts) {
      await prisma.post.create({
        data: { id, slug: id.toLowerCase(), type: "BLOG", title: "Read test", contentType: "RICH", contentHtml: "<p>Test.</p>", postDate: new Date("2000-01-01") }
      });
    }
    const { default: express } = await import("express");
    const { default: api } = await import("../src/routes/api.js");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use((req, _res, next) => { req.session = req.get("x-test-admin") ? { admin: { isLoggedIn: true } } : {}; next(); });
    app.use("/api", api);
    app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.code || "error" }));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (prisma) await prisma.post.deleteMany({ where: { id: { in: posts } } }); // and their reads
    if (server) await new Promise((resolve) => server.close(resolve));
    if (disconnect) await disconnect();
  });

  test("recordRead counts a reader once and a ticket once, and keeps the counter in step", async () => {
    const [p] = posts;
    const reader = device();
    const ticket = oldTicket(p);
    assert.equal(await read(p, { reader, ticket }), true);
    assert.equal(await read(p, { reader, ticket }), false, "same reader, same ticket");
    assert.equal(await read(p, { reader }), false, "same reader, new ticket");
    assert.equal(await read(p, { ticket }), false, "used ticket, made-up device");
    assert.equal(await read(p), true, "another reader");
    assert.equal(await read(`missing${nanoid(8)}`), false, "no such post");
    assert.equal(await count(p), 2);
    const stored = await rows(p);
    assert.equal(stored.length, 2);
    assert.ok(stored.every((r) => /^[0-9a-f]{64}$/.test(r.ticket_hash) && r.network_tag === networkTag({ postId: p, ip: "203.0.113.50" })));
  });

  test("one device reading two posts leaves rows that do not share a key", async () => {
    const reader = device();
    for (const p of posts) assert.equal(await read(p, { reader, ip: "198.51.100.9" }), true);
    const [a, b] = await Promise.all(posts.map((p) => rows(p)));
    const shared = a.filter((r) => b.some((o) => o.reader_key === r.reader_key));
    assert.deepEqual(shared, []);
  });

  test("one network counts at most NETWORK_READS_PER_DAY reads of a post a day", async () => {
    const p = posts[1];
    const ip = "192.0.2.77";
    const before = await count(p);
    for (let i = 0; i < NETWORK_READS_PER_DAY; i++) assert.equal(await read(p, { ip }), true, `read ${i + 1}`);
    assert.equal(await read(p, { ip }), false, "over the cap");
    // (Another network with another tag: 1 in 65,536 networks share it.)
    const other = ["192.0.2.78", "192.0.2.79", "192.0.2.80"].find((o) => networkTag({ postId: p, ip: o }) !== networkTag({ postId: p, ip }));
    assert.equal(await read(p, { ip: other }), true, "another network");
    assert.equal(await read(posts[0], { ip }), true, "another post");
    assert.equal(await count(p), before + NETWORK_READS_PER_DAY + 1);

    // A day later the network counts again.
    await prisma.$executeRaw`UPDATE "post_reads" SET "created_at" = "created_at" - interval '25 hours' WHERE "post_id" = ${p}`;
    assert.equal(await read(p, { ip }), true);
    assert.equal(await count(p), (await rows(p)).length);
  });

  test("the read route counts a page's read once, and refuses scripts before the limiter", async () => {
    const [p] = posts;
    const page = { "user-agent": CHROME, "sec-fetch-site": "same-origin", "x-forwarded-for": "198.51.100.200" };
    const url = `/api/posts/${p}/read`;
    const before = await count(p);

    // No Sec-Fetch-Site and no Origin: a script, refused without using the quota.
    const bare = await post(url, { ticket: oldTicket(p), device: device() }, { "user-agent": CHROME, "x-forwarded-for": page["x-forwarded-for"] });
    assert.equal(bare.status, 403);
    assert.equal(bare.headers["ratelimit-remaining"], undefined);
    const cross = await post(url, { ticket: oldTicket(p) }, { ...page, "sec-fetch-site": "cross-site" });
    assert.equal(cross.status, 403);

    const reader = device();
    const first = await post(url, { ticket: oldTicket(p), device: reader }, page);
    assert.deepEqual([first.status, first.body], [200, { counted: true }]);
    assert.equal(first.headers["ratelimit-remaining"], "119", "the refused requests used none of the quota");
    assert.match(first.headers["set-cookie"]?.[0] || "", new RegExp(`^taj_did=${reader};`));
    assert.equal(first.headers["cache-control"], "no-store");

    // Reloading the page (a new ticket) on the same device does not count again.
    assert.deepEqual((await post(url, { ticket: oldTicket(p), device: reader }, page)).body, { counted: false });
    // Nor does the device cookie alone.
    assert.deepEqual((await post(url, { ticket: oldTicket(p) }, { ...page, cookie: `taj_did=${reader}` })).body, { counted: false });

    // Older Safari: no Sec-Fetch-Site, an Origin header for this site.
    const { "sec-fetch-site": _site, ...olderSafari } = page;
    assert.deepEqual((await post(url, { ticket: oldTicket(p), device: device() }, { ...olderSafari, origin: base })).body, { counted: true });

    // Not counted: too early, another post's ticket, a script's user agent, the author.
    const notCounted = [
      [{ ticket: makeReadTicket(p, 10), device: device() }, page],
      [{ ticket: oldTicket(posts[1]), device: device() }, page],
      [{ ticket: oldTicket(p), device: device() }, { ...page, "user-agent": "curl/8.7.1" }],
      [{ ticket: oldTicket(p), device: device() }, { ...page, "user-agent": "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)" }],
      [{ ticket: oldTicket(p), device: device() }, { ...page, "x-test-admin": "1" }]
    ];
    for (const [body, headers] of notCounted) {
      const res = await post(url, body, headers);
      assert.deepEqual([res.status, res.body], [200, { counted: false }], JSON.stringify(headers));
    }
    assert.equal(await count(p), before + 2);
  });
});

describe("wording", () => {
  test("the count is called reads in all six languages", () => {
    const i18n = fs.readFileSync(new URL("../public/js/i18n.js", import.meta.url), "utf8");
    assert.doesNotMatch(i18n, /viewsCount/);
    const block = /readsCount: \{([\s\S]*?)\n {4}\},/.exec(i18n)?.[1] || "";
    for (const lang of ["en", "es", "pt", "fr", "de", "ru"]) assert.match(block, new RegExp(`\\b${lang}: \\{ one: "\\{n\\}`), lang);
    assert.match(block, /ru: \{ one: "\{n\} прочтение", few: "\{n\} прочтения", many: "\{n\} прочтений"/);

    const admin = fs.readFileSync(new URL("../views/admin/posts.ejs", import.meta.url), "utf8");
    assert.match(admin, /data-i18n-count="readsCount"/);
    assert.match(admin, /'read' : 'reads'/);
    assert.doesNotMatch(admin, /'view' : 'views'/);
  });
});
