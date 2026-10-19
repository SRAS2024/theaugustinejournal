// src/lib/reads.js
// Read counting. A read is counted when a reader has spent the post's reading
// time on the visible page and scrolled a little (public/js/reads.js), once
// per device and post. The post page carries a signed ticket that records
// when it was served, so a read cannot be counted sooner than that time.
// One network (an IP address, or an IPv6 /64) counts at most
// NETWORK_READS_PER_DAY reads of a post a day, so a script that makes up
// device ids cannot inflate a post.
//
// "Post"."view_count" holds the number of reads: the numbers counted as
// views before reads existed are kept as each post's starting count.

import crypto from "crypto";
import net from "net";
import { nanoid } from "nanoid";
import { plainText } from "./translation/html.js";

// Seconds on the page before a read counts, by word count: short enough for
// fast readers, long enough that a glance is not a read.
const READ_TIME_POINTS = [[0, 10], [300, 10], [500, 15], [700, 30]];
const LONG_POST_SECONDS_PER_100_WORDS = 2;
const MAX_READ_SECONDS = 45;

const TICKET_GRACE_MS = 2000;
export const TICKET_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEVICE_COOKIE = "taj_did";
export const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

// Generous: a parish, school or mobile carrier behind one address is not
// undercounted in normal use.
export const NETWORK_READS_PER_DAY = 30;

// Real browsers never send these: crawlers and automated browsers, the
// crawlers that render pages with JavaScript but do not say "bot", and
// HTTP clients used by scripts.
const BOT_UA_RE = new RegExp([
  String.raw`\+https?:\/\/|bot\/|crawl|spider|slurp|headless|lighthouse|phantomjs|facebookexternalhit`,
  String.raw`google-inspectiontool|googleother|storebot-google|google-read-aloud|google web preview|google-pagerenderer`,
  String.raw`feedfetcher-google|mediapartners-google|adsbot-google|apis-google|duplexweb-google|bingpreview|ptst\/|gtmetrix|pingdom`,
  String.raw`\bcurl\/|\bwget\/|python-requests|python-urllib|python-httpx|aiohttp|\bpython\/|go-http-client|^node(?:\/|$)|node-fetch`,
  String.raw`undici|axios\/|\bgot \(|okhttp|^java\/|java-http-client|apache-httpclient|libwww|httpie|postmanruntime|insomnia\/`,
  String.raw`^deno\/|^bun\/|^ruby|faraday|guzzlehttp|^dart\/|^dalvik\/|cfnetwork\/|powershell|scrapy|mechanize`
].join("|"), "i");

function secret() {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || "";
}

function sign(message) {
  return crypto.createHmac("sha256", `reads:${secret()}`).update(message).digest("base64url");
}

function sameString(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ */
/*  Reading time                                                      */
/* ------------------------------------------------------------------ */

/** Number of words in post HTML. */
export function wordCount(html) {
  return plainText(html).split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Seconds a reader must spend on a post of `words` words for a read to count. */
export function readSeconds(words) {
  const w = Math.max(0, Number(words) || 0);
  const [lastWords, lastSeconds] = READ_TIME_POINTS[READ_TIME_POINTS.length - 1];
  if (w >= lastWords) {
    return Math.min(MAX_READ_SECONDS, lastSeconds + ((w - lastWords) / 100) * LONG_POST_SECONDS_PER_100_WORDS);
  }
  for (let i = 1; i < READ_TIME_POINTS.length; i++) {
    const [w0, s0] = READ_TIME_POINTS[i - 1];
    const [w1, s1] = READ_TIME_POINTS[i];
    if (w <= w1) return s0 + ((s1 - s0) * (w - w0)) / (w1 - w0);
  }
  return lastSeconds;
}

/* ------------------------------------------------------------------ */
/*  Read tickets                                                      */
/* ------------------------------------------------------------------ */

/**
 * Signed "postId.issuedAt.tenths.nonce.mac" ticket, embedded in the post
 * page: issuedAt in milliseconds, the reading time in tenths of a second,
 * and a random nonce so that two pages served in the same millisecond get
 * different tickets (each ticket counts once).
 */
export function makeReadTicket(postId, seconds, now = Date.now()) {
  const payload = `${postId}.${Math.floor(now)}.${Math.round(seconds * 10)}.${nanoid(12)}`;
  return `${payload}.${sign(`ticket:${payload}`)}`;
}

/**
 * Checks a ticket for `postId`. Returns { ok: true } or { ok: false, reason }
 * with reason "invalid", "wrong_post", "too_early" or "expired".
 */
export function verifyReadTicket(ticket, postId, now = Date.now()) {
  if (typeof ticket !== "string" || ticket.length > 200 || !secret()) return { ok: false, reason: "invalid" };
  const parts = ticket.split(".");
  if (parts.length < 5) return { ok: false, reason: "invalid" };
  const [issuedAt, tenths, nonce, mac] = parts.slice(-4);
  const ticketPostId = parts.slice(0, -4).join(".");
  if (!/^\d{1,15}$/.test(issuedAt) || !/^\d{1,4}$/.test(tenths) || !/^[\w-]{8,32}$/.test(nonce)) {
    return { ok: false, reason: "invalid" };
  }
  if (!sameString(mac, sign(`ticket:${parts.slice(0, -1).join(".")}`))) return { ok: false, reason: "invalid" };
  if (ticketPostId !== String(postId)) return { ok: false, reason: "wrong_post" };

  const age = now - Number(issuedAt);
  if (age > TICKET_MAX_AGE_MS) return { ok: false, reason: "expired" };
  if (age < Number(tenths) * 100 - TICKET_GRACE_MS) return { ok: false, reason: "too_early" };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Readers                                                           */
/* ------------------------------------------------------------------ */

/** The device id in its canonical form, or null when it is not one. */
export function normalizeDeviceId(value) {
  if (typeof value !== "string" || value.length > 64 || !DEVICE_ID_RE.test(value)) return null;
  return value.toLowerCase();
}

/** The device id cookie from a raw Cookie header, or null. */
export function deviceIdFromCookie(header) {
  const match = /(?:^|;\s*)taj_did=([^;]*)/.exec(String(header || ""));
  return match ? normalizeDeviceId(match[1].trim()) : null;
}

function keyed(postId, source) {
  return crypto.createHmac("sha256", secret()).update(`${postId}|${source}`).digest("hex");
}

/**
 * Who is reading a post, as a keyed hash: the device id when the browser
 * keeps one, otherwise the network address and browser (less exact, never
 * stored raw). The post is part of the hash, so one device's reads of
 * different posts cannot be linked.
 */
export function readerKey({ postId, device, ip, userAgent }) {
  const id = normalizeDeviceId(device);
  return keyed(postId, id ? `device:${id}` : `net:${ip || "unknown"}|${userAgent || ""}`);
}

/**
 * The network a request comes from: the IPv4 address, or the /64 of an IPv6
 * address (one household or phone usually has a whole /64).
 */
export function networkOf(ip) {
  const address = String(ip || "").trim().toLowerCase().split("%")[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];
  if (!net.isIPv6(address)) return address || "unknown";
  const groups = (part) => (part ? part.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])) : []);
  const [head, tail] = address.includes("::") ? address.split("::") : [address, ""];
  const h = groups(head);
  const t = groups(tail);
  const full = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  return `${full.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/**
 * A short keyed tag of the reader's network for one post, for the daily cap
 * in recordRead. 16 bits: tens of thousands of IPv4 addresses share each tag,
 * so it never identifies a network, and unrelated networks reading the same
 * post rarely share one (and would together need the whole cap).
 */
export function networkTag({ postId, ip }) {
  return keyed(postId, `network:${networkOf(ip)}`).slice(0, 4);
}

export function isLikelyBot(userAgent) {
  return !userAgent || BOT_UA_RE.test(userAgent);
}

/** Stored instead of the ticket itself, so each ticket can count only once. */
export function ticketHash(ticket) {
  return crypto.createHash("sha256").update(String(ticket)).digest("hex");
}

/**
 * Counts one read of a post, at most once per reader and once per ticket (a
 * copied ticket cannot be replayed with made-up device ids), and at most
 * NETWORK_READS_PER_DAY times in 24 hours from one network. One statement, so
 * the counter always matches the stored reads; raw SQL so the post's
 * updatedAt (sitemap lastmod, dateModified) is not touched. Two reads racing
 * at the cap can both count: the cap limits abuse, it is not an exact number.
 * Returns whether the read was counted.
 */
export async function recordRead(prisma, { postId, readerKey: key, networkTag: network, ticket }) {
  const id = String(postId);
  const rows = await prisma.$queryRaw`
    WITH recent AS (
      SELECT count(*) AS "reads" FROM "post_reads"
      WHERE "post_id" = ${id} AND "network_tag" = ${network}
        AND "created_at" > CURRENT_TIMESTAMP - interval '1 day'
    ),
    inserted AS (
      INSERT INTO "post_reads" ("id", "post_id", "reader_key", "ticket_hash", "network_tag")
      SELECT ${nanoid()}, "id", ${key}, ${ticketHash(ticket)}, ${network} FROM "Post"
      WHERE "id" = ${id} AND (SELECT "reads" FROM recent) < ${NETWORK_READS_PER_DAY}
      ON CONFLICT DO NOTHING
      RETURNING "post_id"
    )
    UPDATE "Post" SET "view_count" = "view_count" + 1
    WHERE "id" IN (SELECT "post_id" FROM inserted)
    RETURNING "id"`;
  return rows.length > 0;
}
