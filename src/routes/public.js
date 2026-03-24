// src/routes/public.js
import { Router } from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { getPrisma } from "../lib/db.js";

const router = Router();

const DEFAULT_SETTINGS = { id: 1, aboutHtml: "", updatedAt: new Date() };

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isTableMissingError(err) {
  return err?.code === "P2021";
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
    const { settings, notices } = await getCommon();
    const latest = await safeQuery(
      () => prisma.post.findFirst({ orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] }),
      null
    );
    res.render("home", { settings, notices, latest });
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
    res.render("list", { pageTitle: "Blog", settings, notices, posts });
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
    res.render("list", { pageTitle: "Essays", settings, notices, posts });
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
    res.render("list", { pageTitle: "Letters", settings, notices, posts });
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

    res.render("post", { settings, notices, post });
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
    const siteUrl = (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");

    const posts = await safeQuery(
      () =>
        prisma.post.findMany({
          select: { slug: true, updatedAt: true },
          orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
        }),
      []
    );

    const staticPages = ["/", "/blog", "/essays", "/letters"];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of staticPages) {
      xml += `  <url><loc>${siteUrl}${page}</loc></url>\n`;
    }

    for (const post of posts) {
      const lastmod = post.updatedAt.toISOString().split("T")[0];
      xml += "  <url>\n";
      xml += `    <loc>${siteUrl}/post/${post.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
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
/*  BIMI brand logo (sender icon for email clients)                   */
/* ------------------------------------------------------------------ */

router.get("/.well-known/bimi", (_req, res) => {
  res.redirect(301, "/public/icons/favicon.svg");
});

export default router;
