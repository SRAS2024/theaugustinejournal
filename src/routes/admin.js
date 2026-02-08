// src/routes/admin.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pdfParse from "pdf-parse";
import slugify from "slugify";
import { nanoid } from "nanoid";

import { getPrisma } from "../lib/db.js";
import { requireAdmin } from "../middleware/auth.js";
import { ensureUploadsDir, getUploadsDir } from "../lib/uploads.js";
import { sanitizeRichHtml } from "../lib/sanitize.js";
import { isValidAdminUser, verifyAdminPassword } from "../lib/security.js";

const router = Router();

/* ------------------------------------------------------------------ */
/*  File uploads                                                      */
/* ------------------------------------------------------------------ */

ensureUploadsDir();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, getUploadsDir());
  },
  filename(_req, file, cb) {
    const base = slugify(path.parse(file.originalname).name, { lower: true, strict: true });
    cb(null, `${base}-${nanoid(8)}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (path.extname(file.originalname).toLowerCase() !== ".pdf") {
      return cb(new Error("Only PDF uploads are allowed."));
    }
    cb(null, true);
  }
});

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const ALLOWED_POST_TYPES = ["BLOG", "ESSAY", "LETTER"];
const SCHEMA_NOT_READY = "Database schema is not ready yet. Please refresh in a moment.";

function isTableMissingError(err) {
  return err?.code === "P2021";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeSlug(title) {
  const base = slugify(title, { lower: true, strict: true });
  return base.length ? base : nanoid(10);
}

function pdfTextToHtml(rawText) {
  if (!rawText || !rawText.trim()) {
    return "<p>PDF uploaded, but no selectable text was found.</p>";
  }

  const blocks = rawText.split(/\n\s*\n/).filter((b) => b.trim());

  const html = blocks
    .map((block, i) => {
      const trimmed = block.trim();
      const lines = trimmed.split("\n");
      const nextBlock = blocks[i + 1]?.trim();

      // Detect heading: short block (1-2 lines, under 100 chars)
      if (lines.length <= 2 && trimmed.length < 100) {
        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]{2,}/.test(trimmed);
        if (isAllCaps) {
          return `<h3>${escapeHtml(trimmed)}</h3>`;
        }
        // Short single line followed by a longer block → likely a subheading
        if (lines.length === 1 && trimmed.length < 60 && nextBlock && nextBlock.length > trimmed.length * 2) {
          return `<h4>${escapeHtml(trimmed)}</h4>`;
        }
      }

      // Preserve original whitespace per line (indentation, alignment)
      const escaped = block
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("\n");

      return `<p>${escaped}</p>`;
    })
    .join("\n");

  return `<div class="pdf-text">${html}</div>`;
}

function deletePdfFile(pdfPath) {
  if (!pdfPath) return;
  const fsPath = path.join(getUploadsDir(), path.basename(pdfPath));
  if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
}

/* ------------------------------------------------------------------ */
/*  Auth routes (no admin session required)                           */
/* ------------------------------------------------------------------ */

router.get("/login", (_req, res) => {
  res.render("admin/login", { error: "" });
});

router.post("/login", async (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");

  if (!isValidAdminUser(username)) {
    return res.status(401).render("admin/login", { error: "Invalid credentials." });
  }

  const ok = await verifyAdminPassword(password);
  if (!ok) return res.status(401).render("admin/login", { error: "Invalid credentials." });

  req.session.admin = { isLoggedIn: true, name: "Ryan" };
  res.redirect("/admin/welcome");
});

/* ------------------------------------------------------------------ */
/*  Protected routes                                                  */
/* ------------------------------------------------------------------ */

router.get("/", requireAdmin, (_req, res) => res.redirect("/admin/dashboard"));

router.post("/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("taj.sid");
    res.redirect("/admin/login");
  });
});

router.get("/welcome", requireAdmin, (_req, res) => {
  res.render("admin/welcome");
});

/* ---------- Dashboard ---------- */

router.get("/dashboard", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const [settings, notices, postCount, blogCount, essayCount, letterCount] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
      prisma.notice.findMany({ orderBy: { order: "asc" }, take: 3 }),
      prisma.post.count(),
      prisma.post.count({ where: { type: "BLOG" } }),
      prisma.post.count({ where: { type: "ESSAY" } }),
      prisma.post.count({ where: { type: "LETTER" } })
    ]);
    res.render("admin/dashboard", {
      settings,
      notices,
      postCount,
      blogCount,
      essayCount,
      letterCount,
      saved: req.query.saved === "true"
    });
  } catch (err) {
    if (isTableMissingError(err)) {
      return res.render("admin/dashboard", {
        settings: { id: 1, aboutHtml: "", updatedAt: new Date() },
        notices: [],
        postCount: 0,
        blogCount: 0,
        essayCount: 0,
        letterCount: 0,
        saved: req.query.saved === "true",
        error: ""
      });
    }
    next(err);
  }
});

/* ---------- Site settings ---------- */

router.get("/settings", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const [settings, notices] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
      prisma.notice.findMany({ orderBy: { order: "asc" } })
    ]);
    res.render("admin/edit-settings", {
      settings,
      notices,
      error: "",
      saved: req.query.saved === "true"
    });
  } catch (err) {
    if (isTableMissingError(err)) {
      return res.render("admin/edit-settings", {
        settings: { id: 1, aboutHtml: "", updatedAt: new Date() },
        notices: [],
        error: "",
        saved: req.query.saved === "true"
      });
    }
    next(err);
  }
});

router.post("/settings", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const aboutHtml = sanitizeRichHtml(String(req.body.aboutHtml || ""));
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: { aboutHtml },
      create: { id: 1, aboutHtml }
    });
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

/* ---------- Notices ---------- */

router.post("/notices/add", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const message = String(req.body.message || "").trim();
    if (!message) return res.redirect("/admin/settings");
    const count = await prisma.notice.count();
    if (count >= 3) return res.redirect("/admin/settings");
    await prisma.notice.create({ data: { id: nanoid(), message, order: count + 1 } });
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/notices/:id/update", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const message = String(req.body.message || "").trim();
    await prisma.notice.update({ where: { id: req.params.id }, data: { message } });
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/notices/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    await prisma.notice.delete({ where: { id: req.params.id } });
    const notices = await prisma.notice.findMany({ orderBy: { order: "asc" } });
    for (let i = 0; i < notices.length; i++) {
      await prisma.notice.update({ where: { id: notices[i].id }, data: { order: i + 1 } });
    }
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

/* ---------- Posts list ---------- */

router.get("/posts", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const type = String(req.query.type || "ALL");
    const where = ALLOWED_POST_TYPES.includes(type) ? { type } : undefined;
    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
    });
    res.render("admin/posts", { posts, filter: type, saved: req.query.saved === "true" });
  } catch (err) {
    if (isTableMissingError(err)) {
      return res.render("admin/posts", {
        posts: [],
        filter: String(req.query.type || "ALL"),
        saved: req.query.saved === "true"
      });
    }
    next(err);
  }
});

/* ---------- Post create ---------- */

router.get("/posts/new", requireAdmin, (_req, res) => {
  res.render("admin/post-form", {
    mode: "create",
    post: { type: "BLOG", postDate: new Date().toISOString().slice(0, 10) },
    error: ""
  });
});

router.post("/posts/create", requireAdmin, upload.single("pdfFile"), async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const postDateRaw = String(req.body.postDate || "").trim();
    const contentMode = String(req.body.contentMode || "RICH");

    if (!type || !ALLOWED_POST_TYPES.includes(type)) {
      return res.status(400).render("admin/post-form", { mode: "create", post: null, error: "Choose a post type." });
    }
    if (!title) {
      return res.status(400).render("admin/post-form", { mode: "create", post: null, error: "Title is required." });
    }

    const postDate = postDateRaw ? new Date(postDateRaw) : new Date();
    if (Number.isNaN(postDate.getTime())) {
      return res.status(400).render("admin/post-form", { mode: "create", post: null, error: "Invalid date." });
    }

    let contentType = "RICH";
    let contentHtml = "";
    let pdfPath = null;

    if (contentMode === "PDF") {
      if (!req.file) {
        return res.status(400).render("admin/post-form", {
          mode: "create", post: null, error: "PDF file is required for PDF mode."
        });
      }
      const fileFullPath = path.join(getUploadsDir(), req.file.filename);
      const dataBuffer = fs.readFileSync(fileFullPath);
      const parsed = await pdfParse(dataBuffer);
      contentType = "PDF";
      contentHtml = pdfTextToHtml((parsed.text || "").trim());
      pdfPath = `/uploads/${req.file.filename}`;
    } else {
      const richHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));
      if (!richHtml.replace(/<[^>]+>/g, "").trim().length) {
        return res.status(400).render("admin/post-form", {
          mode: "create", post: null, error: "Content is required in editor mode."
        });
      }
      contentHtml = richHtml;
    }

    let slug = makeSlug(title);
    const collision = await prisma.post.findUnique({ where: { slug } });
    if (collision) slug = `${slug}-${nanoid(6)}`;

    await prisma.post.create({
      data: { id: nanoid(), slug, type, title, postDate, contentType, contentHtml, pdfPath }
    });

    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    console.error(err);
    res.status(500).send("Failed to create post.");
  }
});

/* ---------- Post edit ---------- */

router.get("/posts/:id/edit", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).send("Not found.");
    res.render("admin/post-form", { mode: "edit", post, error: "" });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/posts/:id/update", requireAdmin, upload.single("pdfFile"), async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const id = req.params.id;
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) return res.status(404).send("Not found.");

    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const postDateRaw = String(req.body.postDate || "").trim();
    const contentMode = String(req.body.contentMode || (existing.contentType === "PDF" ? "PDF" : "RICH"));

    if (!type || !ALLOWED_POST_TYPES.includes(type)) {
      return res.status(400).render("admin/post-form", { mode: "edit", post: existing, error: "Choose a post type." });
    }
    if (!title) {
      return res.status(400).render("admin/post-form", { mode: "edit", post: existing, error: "Title is required." });
    }

    const postDate = postDateRaw ? new Date(postDateRaw) : new Date();
    if (Number.isNaN(postDate.getTime())) {
      return res.status(400).render("admin/post-form", { mode: "edit", post: existing, error: "Invalid date." });
    }

    let contentType = existing.contentType;
    let contentHtml = existing.contentHtml;
    let pdfPath = existing.pdfPath;

    if (contentMode === "PDF") {
      contentType = "PDF";
      if (req.file) {
        deletePdfFile(existing.pdfPath);
        const fileFullPath = path.join(getUploadsDir(), req.file.filename);
        const dataBuffer = fs.readFileSync(fileFullPath);
        const parsed = await pdfParse(dataBuffer);
        contentHtml = pdfTextToHtml((parsed.text || "").trim());
        pdfPath = `/uploads/${req.file.filename}`;
      }
    } else {
      contentType = "RICH";
      const richHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));
      if (!richHtml.replace(/<[^>]+>/g, "").trim().length) {
        return res.status(400).render("admin/post-form", {
          mode: "edit", post: existing, error: "Content is required in editor mode."
        });
      }
      contentHtml = richHtml;
      deletePdfFile(existing.pdfPath);
      pdfPath = null;
    }

    let newSlug = existing.slug;
    if (String(req.body.regenerateSlug || "") === "on") {
      newSlug = makeSlug(title);
      const collision = await prisma.post.findUnique({ where: { slug: newSlug } });
      if (collision && collision.id !== existing.id) newSlug = `${newSlug}-${nanoid(6)}`;
    }

    await prisma.post.update({
      where: { id },
      data: { slug: newSlug, type, title, postDate, contentType, contentHtml, pdfPath }
    });

    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    console.error(err);
    res.status(500).send("Failed to update post.");
  }
});

/* ---------- Post delete ---------- */

router.post("/posts/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.redirect("/admin/posts");
    deletePdfFile(post.pdfPath);
    await prisma.post.delete({ where: { id: req.params.id } });
    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

export default router;
