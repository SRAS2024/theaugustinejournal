// src/lib/indexnow.js
// IndexNow notification — instantly tells participating search engines
// (Bing, DuckDuckGo, Yandex, Seznam, Naver, Yep, …) that a URL was added,
// updated, or removed, so new posts get crawled promptly instead of waiting
// for the next scheduled sitemap re-crawl.
//
// IndexNow needs a verification key that is publicly reachable at
// `https://<host>/<key>.txt`. We generate one per process (overridable with
// the INDEXNOW_KEY env var) and serve it from the public router. Each ping
// is fully fire-and-forget: any failure is logged and swallowed so it can
// never affect the admin response.
import crypto from "crypto";

const KEY = (process.env.INDEXNOW_KEY || crypto.randomBytes(16).toString("hex"))
  .replace(/[^a-zA-Z0-9-]/g, "")
  .slice(0, 128);

const TYPE_PATH = { BLOG: "/blog", ESSAY: "/essays", LETTER: "/letters" };

function siteUrl() {
  return (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");
}

// IndexNow verifies the key by fetching it from the live host, so there is no
// point pinging when the site is only reachable on localhost (e.g. local dev).
function isPublicHost(url) {
  return !/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url);
}

/** The IndexNow verification key for this process. */
export function getIndexNowKey() {
  return KEY;
}

/**
 * Submit one or more absolute URLs to IndexNow. Always resolves; never throws.
 */
export async function submitUrls(urls) {
  try {
    if (process.env.INDEXNOW_DISABLED === "true") return;

    const list = [...new Set((Array.isArray(urls) ? urls : [urls]).filter(Boolean))];
    if (!list.length) return;

    const base = siteUrl();
    if (!isPublicHost(base)) return;

    const host = new URL(base).host;
    const resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: KEY,
        keyLocation: `${base}/${KEY}.txt`,
        urlList: list
      })
    });

    if (resp.ok || resp.status === 202) {
      console.log(`[indexnow] Submitted ${list.length} URL(s) (status ${resp.status}).`);
    } else {
      console.warn(`[indexnow] Submit returned ${resp.status} for host ${host}.`);
    }
  } catch (err) {
    console.warn("[indexnow] Submit failed:", err?.message || err);
  }
}

/**
 * Notify search engines about a post change. Submits the post URL plus the
 * section listing and home page (which both change when a post is added,
 * updated, or removed). Always resolves; never throws.
 */
export function submitPost(post) {
  if (!post || !post.slug) return Promise.resolve();
  const base = siteUrl();
  const urls = [
    `${base}/post/${post.slug}`,
    `${base}${TYPE_PATH[post.type] || ""}`,
    `${base}/`
  ];
  return submitUrls(urls);
}
