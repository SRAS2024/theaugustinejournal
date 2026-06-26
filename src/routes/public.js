// src/routes/public.js
import { Router } from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { getPrisma } from "../lib/db.js";
import { getIndexNowKey } from "../lib/indexnow.js";

const router = Router();

const DEFAULT_SETTINGS = { id: 1, aboutHtml: "", updatedAt: new Date() };

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

/** WebSite structured data for the home page. */
function websiteJsonLd(siteUrl) {
  return toJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "The Augustine Journal",
    url: `${siteUrl}/`
  });
}

/** Article structured data for an individual post page. */
function articleJsonLd(post, siteUrl) {
  const url = `${siteUrl}/post/${post.slug}`;
  const description = (post.contentHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  const obj = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: new Date(post.postDate).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    author: { "@type": "Organization", name: "The Augustine Journal" },
    publisher: {
      "@type": "Organization",
      name: "The Augustine Journal",
      logo: { "@type": "ImageObject", url: `${siteUrl}/public/icons/icon-512.png` }
    },
    image: `${siteUrl}/public/icons/icon-512.png`
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

router.get("/blog", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { settings, notices } = await getCommon();
    const posts = await safeQuery(
      () => prisma.post.findMany({ where: { type: "BLOG" }, orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] }),
      []
    );
    res.render("list", { pageTitle: "Blog", settings, notices, posts, canonical: `${getSiteUrl()}/blog` });
  } catch (err) {
    next(err);
  }
});

router.get("/essays", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { settings, notices } = await getCommon();
    const posts = await safeQuery(
      () => prisma.post.findMany({ where: { type: "ESSAY" }, orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] }),
      []
    );
    res.render("list", { pageTitle: "Essays", settings, notices, posts, canonical: `${getSiteUrl()}/essays` });
  } catch (err) {
    next(err);
  }
});

router.get("/letters", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { settings, notices } = await getCommon();
    const posts = await safeQuery(
      () => prisma.post.findMany({ where: { type: "LETTER" }, orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] }),
      []
    );
    res.render("list", { pageTitle: "Letters", settings, notices, posts, canonical: `${getSiteUrl()}/letters` });
  } catch (err) {
    next(err);
  }
});

router.get("/post/:slug", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { settings, notices } = await getCommon();
    const post = await safeQuery(
      () => prisma.post.findUnique({ where: { slug: req.params.slug } }),
      null
    );
    if (!post) return res.status(404).send("Post not found.");

    // Track unique view (fire-and-forget, don't block response)
    try {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
      const ua = req.headers["user-agent"] || "";
      const viewerIdentifier = crypto.createHash("sha256").update(`${ip}:${ua}`).digest("hex");

      const existing = await prisma.postView.findUnique({
        where: { postId_viewerIdentifier: { postId: post.id, viewerIdentifier } }
      });

      if (!existing) {
        await prisma.$transaction([
          prisma.postView.create({
            data: { id: nanoid(), postId: post.id, viewerIdentifier }
          }),
          prisma.post.update({
            where: { id: post.id },
            data: { viewCount: { increment: 1 } }
          })
        ]);
      }
    } catch {
      // View tracking should never break the page
    }

    const siteUrl = getSiteUrl();
    res.render("post", { settings, notices, post, siteUrl, jsonLd: articleJsonLd(post, siteUrl) });
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

    const posts = await safeQuery(
      () =>
        prisma.post.findMany({
          select: { slug: true, type: true, updatedAt: true },
          orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
        }),
      []
    );

    const day = (d) => new Date(d).toISOString().split("T")[0];

    // Most recent change overall (for the home page) and per section (for the
    // listing pages) so search engines re-crawl those pages — and discover the
    // new post links on them — whenever a post is added, edited, or removed.
    const latestFor = (filter) => {
      const matches = filter ? posts.filter(filter) : posts;
      if (!matches.length) return null;
      return matches.reduce(
        (max, p) => (p.updatedAt > max ? p.updatedAt : max),
        matches[0].updatedAt
      );
    };

    const staticPages = [
      { path: "/", lastmod: latestFor(null) },
      { path: "/blog", lastmod: latestFor((p) => p.type === "BLOG") },
      { path: "/essays", lastmod: latestFor((p) => p.type === "ESSAY") },
      { path: "/letters", lastmod: latestFor((p) => p.type === "LETTER") }
    ];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of staticPages) {
      xml += "  <url>\n";
      xml += `    <loc>${siteUrl}${page.path}</loc>\n`;
      if (page.lastmod) xml += `    <lastmod>${day(page.lastmod)}</lastmod>\n`;
      xml += "  </url>\n";
    }

    for (const post of posts) {
      xml += "  <url>\n";
      xml += `    <loc>${siteUrl}/post/${post.slug}</loc>\n`;
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
    "",
    "Sitemap: https://theaugustinejournal.com/sitemap.xml"
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
