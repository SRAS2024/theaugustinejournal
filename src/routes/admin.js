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
import { sendNewPostEmail, sendUnsubscribeConfirmationEmail } from "../lib/email-service.js";

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

  /* ── Phase 1: aggressively strip page numbers & repeated headers/footers ── */
  const rawLines = rawText.split("\n");

  const pageNumLine = [
    /^\s*\d{1,4}\s*$/,                    // "5"
    /^\s*[ivxlc]+\s*$/i,                  // "iv", "XII"
    /^\s*[-–—]\s*\d{1,4}\s*[-–—]\s*$/,   // "- 5 -"
    /^\s*page\s+\d{1,4}\s*$/i,            // "Page 5"
    /^\s*\d{1,4}\s*of\s*\d{1,4}\s*$/i,   // "5 of 10"
  ];

  // Count normalised short lines to find running headers/footers (threshold: 2)
  const freq = {};
  for (const l of rawLines) {
    const t = l.trim();
    if (!t || t.length > 120) continue;
    const norm = t.replace(/^\d{1,4}\s+/, "").replace(/\s+\d{1,4}$/, "").trim();
    if (norm) freq[norm] = (freq[norm] || 0) + 1;
  }
  const repeated = new Set(
    Object.entries(freq).filter(([, c]) => c >= 2).map(([t]) => t)
  );

  const cleaned = rawLines.filter((l) => {
    const t = l.trim();
    if (!t) return true; // keep blank lines for paragraph splitting
    if (pageNumLine.some((r) => r.test(t))) return false;
    const norm = t.replace(/^\d{1,4}\s+/, "").replace(/\s+\d{1,4}$/, "").trim();
    if (norm && repeated.has(norm)) return false;
    return true;
  });

  /* ── Phase 2: split into paragraph blocks ── */
  const blocks = cleaned.join("\n").split(/\n\s*\n/)
    .map((b) => b.trim()).filter(Boolean)
    .filter((b) => !/^\d{1,4}$/.test(b) && !/^[ivxlc]+$/i.test(b));

  /* ── Phase 3: convert blocks to HTML ── */
  /*  NO headings, NO page numbers, NO repeated titles.
   *  Only exception: References / Bibliography / Works Cited heading.       */
  let inReferences = false;
  const htmlParts = [];

  // Skip the first block if it looks like a title (the post already has a
  // title from the database, so repeating it inside the body is redundant).
  let startIndex = 0;
  if (blocks.length > 0) {
    const first = blocks[0].split("\n").map((l) => l.trim()).join(" ").replace(/\s{2,}/g, " ");
    const sentences = (first.match(/[.!?](?:\s|$)/g) || []).length;
    if (sentences < 3 && first.length < 300) startIndex = 1;
  }

  for (let i = startIndex; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split("\n");
    const joined = lines.map((l) => l.trim()).join(" ").replace(/\s{2,}/g, " ");

    /* References / Bibliography / Works Cited heading — the ONLY heading kept */
    if (/^(references|bibliography|works?\s*cited|sources)$/i.test(joined)) {
      inReferences = true;
      htmlParts.push(`<h3 class="pdf-ref-heading">References</h3>`);
      continue;
    }

    /* Skip any block that looks like a standalone heading / section title
       (ALL-CAPS, very short, or single-line with < 60 chars and no period) */
    if (!inReferences && lines.length <= 2 && joined.length < 80) {
      const isAllCaps = joined === joined.toUpperCase() && /[A-Z]{2,}/.test(joined);
      const looksLikeHeading = !joined.includes(".") && joined.length < 60;
      if (isAllCaps || looksLikeHeading) continue;
    }

    /* Reference entry */
    if (inReferences) {
      htmlParts.push(`<p class="pdf-ref-entry">${escapeHtml(joined)}</p>`);
    } else {
      /* Normal body paragraph — use first-line indent for continuation feel */
      const indent = lines[0].match(/^(\s{3,})/)?.[1]?.length || 0;
      const cls = indent ? ' class="pdf-indent"' : "";
      htmlParts.push(`<p${cls}>${escapeHtml(joined)}</p>`);
    }
  }

  return `<div class="pdf-text">${htmlParts.filter(Boolean).join("\n")}</div>`;
}

function deletePdfFile(pdfPath) {
  if (!pdfPath) return;
  const fsPath = path.join(getUploadsDir(), path.basename(pdfPath));
  if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
}

async function savePdfToDb(filename, filePath) {
  const prisma = getPrisma();
  const data = fs.readFileSync(filePath);
  await prisma.pdfFile.upsert({
    where: { filename },
    update: { data, size: data.length },
    create: {
      id: nanoid(),
      filename,
      data,
      mimeType: "application/pdf",
      size: data.length
    }
  });
}

async function deletePdfFromDb(pdfPath) {
  if (!pdfPath) return;
  const filename = path.basename(pdfPath);
  const prisma = getPrisma();
  try {
    await prisma.pdfFile.delete({ where: { filename } });
  } catch {
    // Record may not exist yet (uploaded before this feature was added)
  }
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

  req.session.admin = { isLoggedIn: true, name: process.env.ADMIN_USERNAME };
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
    const [settings, notices, postCount, blogCount, essayCount, letterCount, subscriberCount] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
      prisma.notice.findMany({ orderBy: { order: "asc" }, take: 3 }),
      prisma.post.count(),
      prisma.post.count({ where: { type: "BLOG" } }),
      prisma.post.count({ where: { type: "ESSAY" } }),
      prisma.post.count({ where: { type: "LETTER" } }),
      prisma.subscriber.count()
    ]);
    res.render("admin/dashboard", {
      settings,
      notices,
      postCount,
      blogCount,
      essayCount,
      letterCount,
      subscriberCount,
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
        subscriberCount: 0,
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

/* ---------- Subscribers ---------- */

router.get("/subscribers", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.render("admin/subscribers", { subscribers });
  } catch (err) {
    if (isTableMissingError(err)) {
      return res.render("admin/subscribers", { subscribers: [] });
    }
    next(err);
  }
});

/* ---------- Subscriber delete (admin unsubscribe) ---------- */

router.post("/subscribers/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || !(await verifyAdminPassword(password))) {
      return res.status(401).json({ success: false, error: "Incorrect password." });
    }

    const prisma = getPrisma();
    const subscriber = await prisma.subscriber.findUnique({ where: { id: req.params.id } });
    if (!subscriber) return res.status(404).json({ success: false, error: "Subscriber not found." });
    await prisma.subscriber.delete({ where: { id: req.params.id } });

    // Send unsubscribe confirmation email (fire-and-forget)
    sendUnsubscribeConfirmationEmail({ email: subscriber.email, language: subscriber.language }).catch(err => {
      console.error("[admin] Failed to send unsubscribe confirmation email:", err?.message || err);
    });

    res.json({ success: true });
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

/* ---------- PDF text extraction (AJAX) ---------- */

router.post("/posts/extract-pdf", requireAdmin, upload.single("pdfFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file provided." });
    }
    const fileFullPath = path.join(getUploadsDir(), req.file.filename);
    const dataBuffer = fs.readFileSync(fileFullPath);
    const parsed = await pdfParse(dataBuffer);
    const html = pdfTextToHtml((parsed.text || "").trim());

    // Persist PDF binary in the database so it survives redeployments
    await savePdfToDb(req.file.filename, fileFullPath);

    res.json({ html, filename: req.file.filename, pdfPath: `/uploads/${req.file.filename}` });
  } catch (err) {
    console.error("[extract-pdf]", err);
    res.status(500).json({ error: "Failed to extract PDF text." });
  }
});

/* ---------- Post create ---------- */

router.get("/posts/new", requireAdmin, (_req, res) => {
  res.render("admin/post-form", {
    mode: "create",
    post: { type: "BLOG", postDate: new Date().toISOString().slice(0, 10), autoTranslateTitle: true },
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
    const autoTranslateRaw = req.body.autoTranslateTitle;
    const autoTranslateTitle = Array.isArray(autoTranslateRaw)
      ? autoTranslateRaw.includes("true")
      : autoTranslateRaw === "true";

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
      // Check for pre-extracted PDF path (from AJAX extraction workflow)
      const existingPdfPath = String(req.body.pdfPath || "").trim();
      const editedHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));

      if (req.file) {
        // New file uploaded via form (fallback path)
        const fileFullPath = path.join(getUploadsDir(), req.file.filename);
        const dataBuffer = fs.readFileSync(fileFullPath);
        const parsed = await pdfParse(dataBuffer);
        contentType = "PDF";
        contentHtml = editedHtml && editedHtml.replace(/<[^>]+>/g, "").trim().length
          ? editedHtml
          : pdfTextToHtml((parsed.text || "").trim());
        pdfPath = `/uploads/${req.file.filename}`;
        // Persist PDF binary in the database so it survives redeployments
        await savePdfToDb(req.file.filename, fileFullPath);
      } else if (existingPdfPath && editedHtml.replace(/<[^>]+>/g, "").trim().length) {
        // PDF was already uploaded via AJAX; admin edited the extracted text
        contentType = "PDF";
        contentHtml = editedHtml;
        pdfPath = existingPdfPath;
      } else {
        return res.status(400).render("admin/post-form", {
          mode: "create", post: null, error: "PDF file is required for PDF mode."
        });
      }
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

    const newPost = await prisma.post.create({
      data: { id: nanoid(), slug, type, title, postDate, contentType, contentHtml, pdfPath, autoTranslateTitle }
    });

    // Fire-and-forget: send new post notification email
    sendNewPostEmail(newPost).catch(err => {
      console.error("[admin] Failed to send new post email:", err?.message || err);
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
    const autoTranslateRaw = req.body.autoTranslateTitle;
    const autoTranslateTitle = Array.isArray(autoTranslateRaw)
      ? autoTranslateRaw.includes("true")
      : autoTranslateRaw === "true";

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
      const editedHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));
      const newPdfPath = String(req.body.pdfPath || "").trim();

      if (req.file) {
        await deletePdfFromDb(existing.pdfPath);
        deletePdfFile(existing.pdfPath);
        const fileFullPath = path.join(getUploadsDir(), req.file.filename);
        const dataBuffer = fs.readFileSync(fileFullPath);
        const parsed = await pdfParse(dataBuffer);
        contentHtml = editedHtml && editedHtml.replace(/<[^>]+>/g, "").trim().length
          ? editedHtml
          : pdfTextToHtml((parsed.text || "").trim());
        pdfPath = `/uploads/${req.file.filename}`;
        // Persist PDF binary in the database so it survives redeployments
        await savePdfToDb(req.file.filename, fileFullPath);
      } else if (newPdfPath) {
        // PDF uploaded via AJAX, previous PDF replaced
        if (newPdfPath !== existing.pdfPath) {
          await deletePdfFromDb(existing.pdfPath);
          deletePdfFile(existing.pdfPath);
        }
        pdfPath = newPdfPath;
        if (editedHtml.replace(/<[^>]+>/g, "").trim().length) {
          contentHtml = editedHtml;
        }
      } else if (editedHtml.replace(/<[^>]+>/g, "").trim().length) {
        // No new file, but admin edited existing content
        contentHtml = editedHtml;
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
      await deletePdfFromDb(existing.pdfPath);
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
      data: { slug: newSlug, type, title, postDate, contentType, contentHtml, pdfPath, autoTranslateTitle }
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
    const { password } = req.body;
    if (!password || !(await verifyAdminPassword(password))) {
      return res.status(401).json({ success: false, error: "Incorrect password." });
    }

    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ success: false, error: "Post not found." });
    await deletePdfFromDb(post.pdfPath);
    deletePdfFile(post.pdfPath);
    await prisma.post.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

export default router;
