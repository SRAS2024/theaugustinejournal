// src/routes/public.js
import { Router } from "express";
import { getPrisma } from "../lib/db.js";
import { getIndexNowKey } from "../lib/indexnow.js";
import { plainText } from "../lib/translation/html.js";
import { readSeconds, wordCount, makeReadTicket } from "../lib/reads.js";

const router = Router();

const DEFAULT_SETTINGS = { id: 1, aboutHtml: "", updatedAt: new Date() };

const SECTIONS = {
  blog: { type: "BLOG", pageTitle: "Blog", key: "blog" },
  essays: { type: "ESSAY", pageTitle: "Essays", key: "essays" },
  letters: { type: "LETTER", pageTitle: "Letters", key: "letters" }
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isTableMissingError(err) {
  return err?.code === "P2021";
}

/** Canonical site URL with no trailing slash. */
function getSiteUrl() {
  return (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");
}

/** Serialise a structured-data object safely for inlining in a <script> tag. */
function toJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/** Plain-text summary of post HTML for meta descriptions and structured data. */
function summary(html, max) {
  const text = plainText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** WebSite structured data for the home page. */
function websiteJsonLd(siteUrl) {
  return toJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "The Augustine Journal",
    url: `${siteUrl}/`,
    inLanguage: "en"
  });
}

/** Article structured data for an individual post page. */
function articleJsonLd(post, siteUrl) {
  const url = `${siteUrl}/post/${post.slug}`;
  const description = summary(post.contentHtml, 300);

  const obj = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: new Date(post.postDate).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "en",
    author: { "@type": "Organization", name: "The Augustine Journal" },
    publisher: {
      "@type": "Organization",
      name: "The Augustine Journal",
      logo: { "@type": "ImageObject", url: `${siteUrl}/public/icons/icon-512.png` }
    },
    image: `${siteUrl}/public/icons/og-image.jpg`
  };
  if (description) obj.description = description;
  return toJsonLd(obj);
}

async function safeQuery(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    if (isTableMissingError(err)) return fallback;
    throw err;
  }
}

async function getCommon() {
  const prisma = getPrisma();
  const [settings, notices] = await Promise.all([
    safeQuery(() => prisma.siteSettings.findUnique({ where: { id: 1 } }), null),
    safeQuery(() => prisma.notice.findMany({ orderBy: { order: "asc" }, take: 3 }), [])
  ]);
  return { settings: settings || DEFAULT_SETTINGS, notices };
}

function notFound(res) {
  return res.status(404).render("not-found", { title: "Page not found | The Augustine Journal", active: "" });
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const siteUrl = getSiteUrl();
    const { settings, notices } = await getCommon();
    const latest = await safeQuery(
      () => prisma.post.findFirst({ orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] }),
      null
    );
    res.render("home", {
      settings,
      notices,
      latest,
      canonical: `${siteUrl}/`,
      jsonLd: websiteJsonLd(siteUrl)
    });
  } catch (err) {
    next(err);
  }
});

for (const [path, section] of Object.entries(SECTIONS)) {
  router.get(`/${path}`, async (req, res, next) => {
    try {
      const prisma = getPrisma();
      const posts = await safeQuery(
        () =>
          prisma.post.findMany({
            where: { type: section.type },
            orderBy: [{ postDate: "desc" }, { createdAt: "desc" }],
            select: { id: true, slug: true, title: true, postDate: true, autoTranslateTitle: true }
          }),
        []
      );
      res.render("list", {
        pageTitle: section.pageTitle,
        pageKey: section.key,
        posts,
        canonical: `${getSiteUrl()}/${path}`
      });
    } catch (err) {
      next(err);
    }
  });
}

router.get("/post/:slug", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const post = await safeQuery(
      () => prisma.post.findUnique({ where: { slug: req.params.slug } }),
      null
    );
    if (!post) {
      // An old URL from before the slug was regenerated?
      const redirect = await safeQuery(
        () => prisma.postRedirect.findUnique({ where: { slug: req.params.slug }, include: { post: { select: { slug: true } } } }),
        null
      );
      if (redirect?.post) {
        // Permanent for search engines, but not cached by browsers (a slug
        // may later be changed back).
        res.set("Cache-Control", "no-store");
        return res.redirect(301, `/post/${encodeURIComponent(redirect.post.slug)}`);
      }
      return notFound(res);
    }

    // Opening the page is not a read: public/js/reads.js posts the ticket
    // once the reader has spent the reading time on it and scrolled.
    const siteUrl = getSiteUrl();
    const seconds = Math.round(readSeconds(wordCount(post.contentHtml)) * 10) / 10;
    res.render("post", {
      post,
      siteUrl,
      description: summary(post.contentHtml, 200),
      jsonLd: articleJsonLd(post, siteUrl),
      readSeconds: seconds,
      readTicket: makeReadTicket(post.id, seconds)
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Sitemap                                                           */
/* ------------------------------------------------------------------ */

router.get("/sitemap.xml", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const siteUrl = getSiteUrl();

    const [posts, { settings, notices }] = await Promise.all([
      safeQuery(
        () =>
          prisma.post.findMany({
            select: { slug: true, type: true, updatedAt: true },
            orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
          }),
        []
      ),
      getCommon()
    ]);

    const day = (d) => new Date(d).toISOString().split("T")[0];
    const latest = (dates) => dates.filter(Boolean).reduce((max, d) => (!max || d > max ? d : max), null);

    // Most recent change overall (for the home page) and per section (for the
    // listing pages) so search engines re-crawl those pages — and discover the
    // new post links on them — whenever a post is added, edited, or removed.
    const latestFor = (type) => latest(posts.filter((p) => !type || p.type === type).map((p) => p.updatedAt));

    const staticPages = [
      { path: "/", lastmod: latest([latestFor(null), settings?.updatedAt, ...notices.map((n) => n.updatedAt)]) },
      { path: "/blog", lastmod: latestFor("BLOG") },
      { path: "/essays", lastmod: latestFor("ESSAY") },
      { path: "/letters", lastmod: latestFor("LETTER") }
    ];

    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of staticPages) {
      xml += "  <url>\n";
      xml += `    <loc>${esc(siteUrl + page.path)}</loc>\n`;
      if (page.lastmod) xml += `    <lastmod>${day(page.lastmod)}</lastmod>\n`;
      xml += "  </url>\n";
    }

    for (const post of posts) {
      xml += "  <url>\n";
      xml += `    <loc>${esc(`${siteUrl}/post/${encodeURIComponent(post.slug)}`)}</loc>\n`;
      xml += `    <lastmod>${day(post.updatedAt)}</lastmod>\n`;
      xml += "  </url>\n";
    }

    xml += "</urlset>";

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Robots.txt                                                        */
/* ------------------------------------------------------------------ */

router.get("/robots.txt", (_req, res) => {
  const lines = [
    "User-agent: *",
    "Disallow: /admin",
    "Disallow: /api/",
    "",
    `Sitemap: ${getSiteUrl()}/sitemap.xml`
  ];
  res.set("Content-Type", "text/plain");
  res.send(lines.join("\n"));
});

/* ------------------------------------------------------------------ */
/*  IndexNow key verification file                                    */
/*  Search engines fetch this to confirm we own the key used when     */
/*  pinging them about new/updated/removed posts.                     */
/* ------------------------------------------------------------------ */

const INDEXNOW_KEY = getIndexNowKey();

router.get(`/${INDEXNOW_KEY}.txt`, (_req, res) => {
  res.set("Content-Type", "text/plain");
  res.send(INDEXNOW_KEY);
});

/* ------------------------------------------------------------------ */
/*  BIMI brand logo (sender icon for email clients)                   */
/* ------------------------------------------------------------------ */

router.get("/.well-known/bimi", (_req, res) => {
  res.redirect(301, "/public/icons/favicon.svg");
});

export default router;
