// src/routes/admin.js
import express, { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import slugify from "slugify";
import { nanoid } from "nanoid";

import { getPrisma } from "../lib/db.js";
import { requireAdmin } from "../middleware/auth.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { ensureUploadsDir, getUploadsDir } from "../lib/uploads.js";
import { sanitizeRichHtml } from "../lib/sanitize.js";
import { formatPostHtml } from "../lib/post-format.js";
import { extractPdfHtml } from "../lib/pdf-text.js";
import { isValidAdminUser, verifyAdminPassword } from "../lib/security.js";
import { sendNewPostEmail, sendUnsubscribeConfirmationEmail } from "../lib/email-service.js";
import { submitPost } from "../lib/indexnow.js";
import { scheduleBackfill, translatePostTitle } from "../lib/translation/service.js";

const router = Router();

/* ------------------------------------------------------------------ */
/*  File uploads                                                      */
/* ------------------------------------------------------------------ */

ensureUploadsDir();

const MAX_PDF_BYTES = 15 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, getUploadsDir());
  },
  filename(_req, file, cb) {
    const base = slugify(path.parse(file.originalname).name, { lower: true, strict: true }) || "document";
    cb(null, `${base.slice(0, 80)}-${nanoid(8)}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_PDF_BYTES, fieldSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const isPdfName = path.extname(file.originalname).toLowerCase() === ".pdf";
    const isPdfType = ["application/pdf", "application/x-pdf", "application/octet-stream"].includes(file.mimetype);
    if (!isPdfName || !isPdfType) {
      const err = new Error("Only PDF uploads are allowed.");
      err.code = "NOT_PDF";
      return cb(err);
    }
    cb(null, true);
  }
});

/** Error code for an upload problem, as understood by public/js/admin.js. */
function uploadErrorCode(err) {
  if (err?.code === "NOT_PDF") return "not_pdf";
  if (err?.code === "LIMIT_FILE_SIZE") return "too_large";
  return "failed";
}

/** Run multer, turning its errors into req.uploadError instead of a 500. */
function pdfUpload(req, res, next) {
  upload.single("pdfFile")(req, res, (err) => {
    if (err) req.uploadError = err;
    next();
  });
}

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const ALLOWED_POST_TYPES = ["BLOG", "ESSAY", "LETTER"];
const SCHEMA_NOT_READY = "Database schema is not ready yet. Please refresh in a moment.";

const ERRORS = {
  errChooseType: "Choose a post type.",
  errTitleRequired: "Title is required.",
  errInvalidDate: "Invalid date.",
  errPdfRequired: "PDF file is required for PDF mode.",
  errContentRequired: "Content is required in editor mode.",
  pdfNotPdf: "Only PDF files can be uploaded.",
  pdfTooLarge: "The PDF is larger than 15 MB.",
  pdfExtractFailed: "Failed to extract PDF text. Please try again.",
  errSaveFailed: "The post could not be saved. Please try again."
};

function isTableMissingError(err) {
  return err?.code === "P2021";
}

function siteUrl() {
  return (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");
}

function makeSlug(title) {
  const base = slugify(title, { lower: true, strict: true }).slice(0, 120).replace(/-+$/, "");
  return base.length ? base : nanoid(10);
}

const hasText = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

// Post bodies are sanitized and formatted (paragraphs, verse, references)
// whenever they are saved, so new and edited posts always come out the same.
const postHtml = (raw, options) => formatPostHtml(String(raw || ""), options);

// Body of a PDF post whose PDF has no selectable text (e.g. a scan): the
// reader opens the original PDF from the post page.
const PDF_ONLY_HTML = '<div class="pdf-text"><p>This post is available as a PDF.</p></div>';

function parsePostDate(raw) {
  if (!raw) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Form fields from the request, used to re-render the form after an error. */
function formPost(req, existing) {
  const body = req.body || {};
  const autoTranslateRaw = body.autoTranslateTitle;
  return {
    ...(existing || {}),
    type: String(body.type || existing?.type || ""),
    title: String(body.title ?? existing?.title ?? ""),
    postDate: String(body.postDate || "") || existing?.postDate || new Date(),
    contentType: String(body.contentMode || "") === "PDF" ? "PDF" : "RICH",
    contentHtml: String(body.contentHtml ?? existing?.contentHtml ?? ""),
    pdfPath: String(body.pdfPath || "") || existing?.pdfPath || null,
    autoTranslateTitle: Array.isArray(autoTranslateRaw) ? autoTranslateRaw.includes("true") : autoTranslateRaw === "true"
  };
}

function renderForm(res, status, { mode, post, errorKey }) {
  return res.status(status).render("admin/post-form", {
    mode,
    post,
    error: errorKey ? ERRORS[errorKey] || errorKey : "",
    errorKey: errorKey || ""
  });
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  fs.promises.rm(file.path, { force: true }).catch(() => {});
}

function deletePdfFile(pdfPath) {
  if (!pdfPath) return;
  const fsPath = path.join(getUploadsDir(), path.basename(pdfPath));
  fs.promises.rm(fsPath, { force: true }).catch(() => {});
}

async function savePdfToDb(filename, filePath) {
  const prisma = getPrisma();
  const data = await fs.promises.readFile(filePath);
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
  await getPrisma().pdfFile.deleteMany({ where: { filename } });
}

/** Delete a PDF that no post references any more (database copy and disk cache). */
async function discardPdf(pdfPath) {
  if (!pdfPath) return;
  try {
    const stillUsed = await getPrisma().post.count({ where: { pdfPath } });
    if (stillUsed) return;
    await deletePdfFromDb(pdfPath);
    deletePdfFile(pdfPath);
  } catch (err) {
    console.error("[admin] Failed to remove old PDF:", err?.message || err);
  }
}

/** A PDF path previously returned by the extract endpoint (and stored in the database). */
async function knownPdfPath(raw) {
  const value = String(raw || "").trim();
  const m = /^\/uploads\/([\w.-]+\.pdf)$/i.exec(value);
  if (!m) return null;
  const record = await getPrisma().pdfFile.findUnique({ where: { filename: m[1] }, select: { id: true } });
  return record ? value : null;
}

/**
 * Turn an uploaded PDF into post HTML and store it. Returns { html, pdfPath }
 * or { errorKey } when the file is unusable.
 */
async function ingestPdf(file, title = "") {
  try {
    const buffer = await fs.promises.readFile(file.path);
    const html = postHtml(await extractPdfHtml(buffer, { title }), { pdf: true });
    await savePdfToDb(file.filename, file.path);
    return { html, pdfPath: `/uploads/${file.filename}` };
  } catch (err) {
    console.error("[admin] PDF processing failed:", err?.message || err);
    removeUploadedFile(file);
    return { errorKey: "pdfExtractFailed" };
  }
}

function notifyNewPost(post) {
  sendNewPostEmail(post, {
    titleFor: (lang) => translatePostTitle(post, lang, { timeoutMs: 60_000 })
  }).catch((err) => {
    console.error("[admin] Failed to send new post email:", err?.message || err);
  });
}

/* ------------------------------------------------------------------ */
/*  Auth routes (no admin session required)                           */
/* ------------------------------------------------------------------ */

/** Rate-limit key: the client IP, with IPv6 addresses grouped by /64 network. */
function clientKey(req) {
  const ip = String(req.ip || "");
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip;
  const full = ip.split("::");
  const head = full[0] ? full[0].split(":") : [];
  const tail = full.length > 1 && full[1] ? full[1].split(":") : [];
  const groups = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  return `${groups.slice(0, 4).join(":")}::/64`;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: clientKey,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render("admin/login", { error: "Too many sign-in attempts. Please wait a few minutes and try again.", errorKey: "tooManyAttempts" });
  }
});

router.get("/login", (req, res) => {
  if (req.session?.admin?.isLoggedIn) return res.redirect("/admin/dashboard");
  res.render("admin/login", { error: "" });
});

router.post("/login", loginLimiter, verifyCsrf, async (req, res, next) => {
  try {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    // Always check the password so both failures take the same time.
    const [userOk, passwordOk] = [isValidAdminUser(username), await verifyAdminPassword(password)];
    if (!userOk || !passwordOk) {
      return res.status(401).render("admin/login", { error: "Invalid credentials.", errorKey: "invalidCredentials" });
    }

    // A fresh session ID on sign-in (prevents session fixation).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.admin = { isLoggedIn: true, name: process.env.ADMIN_USERNAME };
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.redirect("/admin/welcome");
      });
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Protected routes                                                  */
/* ------------------------------------------------------------------ */

router.get("/", requireAdmin, (_req, res) => res.redirect("/admin/dashboard"));

router.post("/logout", requireAdmin, verifyCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("taj.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
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
    const [notices, postCount, blogCount, essayCount, letterCount, subscriberCount] = await Promise.all([
      prisma.notice.findMany({ orderBy: { order: "asc" }, take: 3 }),
      prisma.post.count(),
      prisma.post.count({ where: { type: "BLOG" } }),
      prisma.post.count({ where: { type: "ESSAY" } }),
      prisma.post.count({ where: { type: "LETTER" } }),
      prisma.subscriber.count()
    ]);
    res.render("admin/dashboard", {
      notices,
      postCount,
      blogCount,
      essayCount,
      letterCount,
      subscriberCount,
      saved: req.query.saved === "true"
    });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
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
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/settings", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const aboutHtml = sanitizeRichHtml(String(req.body.aboutHtml || ""));
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: { aboutHtml },
      create: { id: 1, aboutHtml }
    });
    scheduleBackfill();
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

/* ---------- Notices ---------- */

const noticeText = (req) => String(req.body.message || "").replace(/\s+/g, " ").trim().slice(0, 500);

router.post("/notices/add", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const message = noticeText(req);
    if (!message) return res.redirect("/admin/settings");
    let created = false;
    try {
      created = await prisma.$transaction(async (tx) => {
        const count = await tx.notice.count();
        if (count >= 3) return false;
        await tx.notice.create({ data: { id: nanoid(), message, order: count + 1 } });
        return true;
      }, { isolationLevel: "Serializable" });
    } catch (err) {
      if (err?.code !== "P2034") throw err; // a simultaneous add won; keep the limit
    }
    if (created) scheduleBackfill();
    res.redirect(created ? "/admin/settings?saved=true" : "/admin/settings");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/notices/:id/update", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const message = noticeText(req);
    if (!message) return res.redirect("/admin/settings");
    const { count } = await prisma.notice.updateMany({ where: { id: req.params.id }, data: { message } });
    if (count) scheduleBackfill();
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/notices/:id/delete", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.notice.deleteMany({ where: { id: req.params.id } });
      const notices = await tx.notice.findMany({ orderBy: { order: "asc" } });
      for (let i = 0; i < notices.length; i++) {
        await tx.notice.update({ where: { id: notices[i].id }, data: { order: i + 1 } });
      }
    });
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
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

/* ---------- Subscriber delete (admin unsubscribe) ---------- */

router.post("/subscribers/:id/delete", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    if (!password || !(await verifyAdminPassword(password))) {
      return res.status(401).json({ success: false, error: "Incorrect password." });
    }

    const prisma = getPrisma();
    const subscriber = await prisma.subscriber.findUnique({ where: { id: req.params.id } });
    if (!subscriber) return res.status(404).json({ success: false, error: "Subscriber not found." });
    await prisma.subscriber.deleteMany({ where: { id: req.params.id } });

    // Send unsubscribe confirmation email (fire-and-forget)
    sendUnsubscribeConfirmationEmail({ email: subscriber.email, language: subscriber.language }).catch(err => {
      console.error("[admin] Failed to send unsubscribe confirmation email:", err?.message || err);
    });

    res.json({ success: true });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).json({ success: false, error: SCHEMA_NOT_READY });
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
      orderBy: [{ postDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, slug: true, title: true, type: true, postDate: true, contentType: true, viewCount: true, shareCount: true }
    });
    res.render("admin/posts", { posts, filter: ALLOWED_POST_TYPES.includes(type) ? type : "ALL", saved: req.query.saved === "true" });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

/* ---------- PDF text extraction (AJAX) ---------- */

router.post("/posts/extract-pdf", requireAdmin, pdfUpload, verifyCsrf, async (req, res) => {
  if (req.uploadError) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: req.uploadError.message, code: uploadErrorCode(req.uploadError) });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No PDF file provided.", code: "no_file" });
  }
  const result = await ingestPdf(req.file, String(req.body?.title || ""));
  if (result.errorKey) return res.status(422).json({ error: ERRORS[result.errorKey], code: "failed" });
  if (!hasText(result.html)) {
    return res.json({ html: "", code: "no_text", filename: req.file.filename, pdfPath: result.pdfPath });
  }
  res.json({ html: result.html, filename: req.file.filename, pdfPath: result.pdfPath });
});

/* ---------- Auto format (AJAX) ---------- */

// The editor's "Auto format" button: the editor HTML, formatted the way it
// will be saved. It accepts as much as saving does (the post form's 25 MB
// field), with room for JSON escaping; server.js leaves this body to it.
const formatBody = express.json({ limit: "50mb" });

router.post("/posts/format", requireAdmin, formatBody, verifyCsrf, (req, res) => {
  const source = req.body?.html;
  if (typeof source !== "string") return res.status(400).json({ error: "No content to format." });
  res.json({ html: postHtml(source) });
});

/* ---------- Post create ---------- */

router.get("/posts/new", requireAdmin, (_req, res) => {
  res.render("admin/post-form", {
    mode: "create",
    post: { type: "", postDate: new Date().toISOString().slice(0, 10), autoTranslateTitle: true, contentType: "RICH" },
    error: "",
    errorKey: ""
  });
});

router.post("/posts/create", requireAdmin, pdfUpload, verifyCsrf, async (req, res) => {
  const fail = (status, errorKey) => {
    removeUploadedFile(req.file);
    return renderForm(res, status, { mode: "create", post: formPost(req), errorKey });
  };
  try {
    if (req.uploadError) return fail(400, uploadErrorCode(req.uploadError) === "too_large" ? "pdfTooLarge" : "pdfNotPdf");

    const prisma = getPrisma();
    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const contentMode = String(req.body.contentMode || "RICH");
    const autoTranslateTitle = formPost(req).autoTranslateTitle;

    if (!ALLOWED_POST_TYPES.includes(type)) return fail(400, "errChooseType");
    if (!title) return fail(400, "errTitleRequired");
    const postDate = parsePostDate(String(req.body.postDate || "").trim());
    if (!postDate) return fail(400, "errInvalidDate");

    let contentType = "RICH";
    let contentHtml = "";
    let pdfPath = null;

    if (contentMode === "PDF") {
      const editedHtml = postHtml(req.body.contentHtml, { pdf: true });
      contentType = "PDF";
      if (req.file) {
        // New file uploaded with the form (fallback when the AJAX extraction was not used)
        const result = await ingestPdf(req.file, title);
        if (result.errorKey) return fail(422, result.errorKey);
        contentHtml = hasText(editedHtml) ? editedHtml : result.html;
        pdfPath = result.pdfPath;
      } else {
        // PDF was already uploaded via AJAX; the admin edited the extracted text
        pdfPath = await knownPdfPath(req.body.pdfPath);
        contentHtml = editedHtml;
      }
      if (!pdfPath) return fail(400, "errPdfRequired");
      if (!hasText(contentHtml)) contentHtml = PDF_ONLY_HTML;
    } else {
      contentHtml = postHtml(req.body.contentHtml);
      if (!hasText(contentHtml)) return fail(400, "errContentRequired");
    }

    let slug = makeSlug(title);
    const [collision, redirect] = await Promise.all([
      prisma.post.findUnique({ where: { slug } }),
      prisma.postRedirect.findUnique({ where: { slug } })
    ]);
    if (collision || redirect) slug = `${slug}-${nanoid(6)}`;

    const newPost = await prisma.post.create({
      data: { id: nanoid(), slug, type, title, postDate, contentType, contentHtml, pdfPath, autoTranslateTitle }
    });

    // Prepare translations, e-mail subscribers and notify search engines (all in the background).
    scheduleBackfill(1000);
    notifyNewPost(newPost);
    submitPost(newPost).catch(() => {});

    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    console.error(err);
    return fail(500, "errSaveFailed");
  }
});

/* ---------- Post edit ---------- */

router.get("/posts/:id/edit", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).render("not-found", { title: "Page not found | The Augustine Journal", active: "" });
    res.render("admin/post-form", { mode: "edit", post, error: "", errorKey: "" });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    next(err);
  }
});

router.post("/posts/:id/update", requireAdmin, pdfUpload, verifyCsrf, async (req, res) => {
  let existing = null;
  let ingestedPdfPath = null; // a PDF sent with this request and stored
  const fail = async (status, errorKey) => {
    removeUploadedFile(req.file);
    // A PDF uploaded earlier through the extraction step stays: the re-shown
    // form still points at it (unused uploads are cleaned up after a day).
    if (ingestedPdfPath) await discardPdf(ingestedPdfPath);
    return renderForm(res, status, { mode: "edit", post: formPost(req, existing), errorKey });
  };
  try {
    const prisma = getPrisma();
    const id = req.params.id;
    existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      removeUploadedFile(req.file);
      return res.status(404).render("not-found", { title: "Page not found | The Augustine Journal", active: "" });
    }
    if (req.uploadError) return fail(400, uploadErrorCode(req.uploadError) === "too_large" ? "pdfTooLarge" : "pdfNotPdf");

    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const contentMode = String(req.body.contentMode || (existing.contentType === "PDF" ? "PDF" : "RICH"));
    const autoTranslateTitle = formPost(req, existing).autoTranslateTitle;

    if (!ALLOWED_POST_TYPES.includes(type)) return fail(400, "errChooseType");
    if (!title) return fail(400, "errTitleRequired");
    const postDate = parsePostDate(String(req.body.postDate || "").trim());
    if (!postDate) return fail(400, "errInvalidDate");

    let contentType = existing.contentType;
    let contentHtml = existing.contentHtml;
    let pdfPath = existing.pdfPath;

    if (contentMode === "PDF") {
      contentType = "PDF";
      const editedHtml = postHtml(req.body.contentHtml, { pdf: true });
      const submittedPdfPath = String(req.body.pdfPath || "").trim();

      if (req.file) {
        // New PDF sent with the form: process and store it before touching the post.
        const result = await ingestPdf(req.file, title);
        if (result.errorKey) return fail(422, result.errorKey);
        ingestedPdfPath = result.pdfPath;
        pdfPath = result.pdfPath;
        contentHtml = hasText(editedHtml) ? editedHtml : result.html;
      } else if (submittedPdfPath && submittedPdfPath !== existing.pdfPath) {
        // Replaced via the AJAX extraction
        pdfPath = await knownPdfPath(submittedPdfPath);
        if (!pdfPath) return fail(400, "errPdfRequired");
        contentHtml = hasText(editedHtml) ? editedHtml : "";
      } else if (hasText(editedHtml)) {
        // No new file, but the admin edited the existing content
        contentHtml = editedHtml;
      }
      if (!pdfPath) return fail(400, "errPdfRequired");
      if (!hasText(contentHtml)) contentHtml = PDF_ONLY_HTML;
    } else {
      contentType = "RICH";
      const richHtml = postHtml(req.body.contentHtml);
      if (!hasText(richHtml)) return fail(400, "errContentRequired");
      contentHtml = richHtml;
      pdfPath = null;
    }

    let newSlug = existing.slug;
    if (String(req.body.regenerateSlug || "") === "on") {
      newSlug = makeSlug(title);
      if (newSlug !== existing.slug) {
        const [collision, redirect] = await Promise.all([
          prisma.post.findUnique({ where: { slug: newSlug } }),
          prisma.postRedirect.findUnique({ where: { slug: newSlug } })
        ]);
        // Another post's current or former address stays that post's.
        if ((collision && collision.id !== existing.id) || (redirect && redirect.postId !== existing.id)) {
          newSlug = `${newSlug}-${nanoid(6)}`;
        }
      }
    }

    const updatedPost = await prisma.$transaction(async (tx) => {
      const post = await tx.post.update({
        where: { id },
        data: { slug: newSlug, type, title, postDate, contentType, contentHtml, pdfPath, autoTranslateTitle }
      });
      if (newSlug !== existing.slug) {
        // Keep the old address working (and drop this post's own redirect
        // when it moves back to a former address).
        await tx.postRedirect.deleteMany({ where: { slug: newSlug, postId: id } });
        await tx.postRedirect.upsert({
          where: { slug: existing.slug },
          update: { postId: id },
          create: { slug: existing.slug, postId: id }
        });
      }
      return post;
    });

    // The previous PDF is only removed once the post no longer points at it.
    if (existing.pdfPath && existing.pdfPath !== updatedPost.pdfPath) await discardPdf(existing.pdfPath);

    scheduleBackfill(1000);
    // Notify search engines so the updated post (and an old URL) get re-crawled
    submitPost(updatedPost).catch(() => {});
    if (existing.slug !== updatedPost.slug || existing.type !== updatedPost.type) {
      submitPost(existing).catch(() => {});
    }

    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).send(SCHEMA_NOT_READY);
    console.error(err);
    return fail(500, "errSaveFailed");
  }
});

/* ---------- Post delete ---------- */

router.post("/posts/:id/delete", requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    if (!password || !(await verifyAdminPassword(password))) {
      return res.status(401).json({ success: false, error: "Incorrect password." });
    }

    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ success: false, error: "Post not found." });
    await prisma.post.delete({ where: { id: req.params.id } });
    await discardPdf(post.pdfPath);

    // Notify search engines so the removed URL is re-crawled (now a 404)
    // and the section/home pages are refreshed.
    submitPost(post).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    if (isTableMissingError(err)) return res.status(503).json({ success: false, error: SCHEMA_NOT_READY });
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Housekeeping                                                      */
/* ------------------------------------------------------------------ */

/**
 * Remove uploaded PDFs that no post uses (e.g. a PDF extracted while
 * creating a post that was then cancelled). Only files older than a day.
 */
export async function cleanupOrphanPdfs() {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [files, posts] = await Promise.all([
    prisma.pdfFile.findMany({ where: { createdAt: { lt: cutoff } }, select: { filename: true } }),
    prisma.post.findMany({ where: { pdfPath: { not: null } }, select: { pdfPath: true } })
  ]);
  const used = new Set(posts.map((p) => path.basename(p.pdfPath)));
  const orphans = files.map((f) => f.filename).filter((f) => !used.has(f));
  if (!orphans.length) return 0;
  await prisma.pdfFile.deleteMany({ where: { filename: { in: orphans } } });
  for (const filename of orphans) deletePdfFile(`/uploads/${filename}`);
  console.log(`[admin] Removed ${orphans.length} unused PDF upload(s).`);
  return orphans.length;
}

export default router;
