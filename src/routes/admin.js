import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pdfParse from "pdf-parse";
import slugify from "slugify";
import { nanoid } from "nanoid";

import { getPrisma } from "../lib/db.js";
import { requireAdmin } from "../middleware/auth.js";
import { ensureUploadsDir } from "../lib/uploads.js";
import { sanitizeRichHtml } from "../lib/sanitize.js";
import { isValidAdminUser, verifyAdminPassword } from "../lib/security.js";

const router = Router();

const uploadsDir = ensureUploadsDir();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeBase = slugify(path.parse(file.originalname).name, { lower: true, strict: true });
    cb(null, `${safeBase}-${nanoid(8)}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".pdf") return cb(new Error("Only PDF uploads are allowed."));
    cb(null, true);
  }
});

const ALLOWED_POST_TYPES = ["BLOG", "ESSAY", "LETTER"];

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
  return base.length ? `${base}` : nanoid(10);
}

function pdfTextToHtml(rawText) {
  if (!rawText || !rawText.trim()) {
    return "<p>PDF uploaded, but no selectable text was found.</p>";
  }
  const paragraphs = rawText.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      const escaped = escapeHtml(trimmed).replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .filter((p) => p.length > 0)
    .join("\n");
}

router.get("/", requireAdmin, (req, res) => res.redirect("/admin/dashboard"));

router.get("/login", (req, res) => {
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

router.post("/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("taj.sid");
    res.redirect("/admin/login");
  });
});

router.get("/welcome", requireAdmin, (req, res) => {
  res.render("admin/welcome");
});

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

    const saved = req.query.saved === "true";
    res.render("admin/dashboard", {
      settings,
      notices,
      postCount,
      blogCount,
      essayCount,
      letterCount,
      saved
    });
  } catch (err) {
    if (isTableMissingError(err)) {
      const saved = req.query.saved === "true";
      return res.render("admin/dashboard", {
        settings: { id: 1, aboutHtml: "", updatedAt: new Date() },
        notices: [],
        postCount: 0,
        blogCount: 0,
        essayCount: 0,
        letterCount: 0,
        saved,
        error: ""
      });
    }
    next(err);
  }
});

router.get("/settings", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();

    const [settings, notices] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
      prisma.notice.findMany({ orderBy: { order: "asc" } })
    ]);

    const saved = req.query.saved === "true";
    res.render("admin/edit-settings", { settings, notices, error: "", saved });
  } catch (err) {
    if (isTableMissingError(err)) {
      const saved = req.query.saved === "true";
      return res.render("admin/edit-settings", {
        settings: { id: 1, aboutHtml: "", updatedAt: new Date() },
        notices: [],
        error: "",
        saved
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
    if (isTableMissingError(err)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    next(err);
  }
});

router.post("/notices/add", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();

    const message = String(req.body.message || "").trim();
    if (!message) return res.redirect("/admin/settings");

    const count = await prisma.notice.count();
    if (count >= 3) return res.redirect("/admin/settings");

    await prisma.notice.create({
      data: { id: nanoid(), message, order: count + 1 }
    });

    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    next(err);
  }
});

router.post("/notices/:id/update", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const message = String(req.body.message || "").trim();
    await prisma.notice.update({
      where: { id: req.params.id },
      data: { message }
    });
    res.redirect("/admin/settings?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
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
    if (isTableMissingError(err)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    next(err);
  }
});

router.get("/posts", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();

    const type = String(req.query.type || "ALL");
    const where =
      type === "BLOG"
        ? { type: "BLOG" }
        : type === "ESSAY"
          ? { type: "ESSAY" }
          : type === "LETTER"
            ? { type: "LETTER" }
            : undefined;

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
    });

    const saved = req.query.saved === "true";
    res.render("admin/posts", { posts, filter: type, saved });
  } catch (err) {
    if (isTableMissingError(err)) {
      const saved = req.query.saved === "true";
      return res.render("admin/posts", { posts: [], filter: String(req.query.type || "ALL"), saved });
    }
    next(err);
  }
});

router.get("/posts/new", requireAdmin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.render("admin/post-form", {
    mode: "create",
    post: { type: "BLOG", postDate: today },
    error: ""
  });
});

router.get("/posts/:id/edit", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).send("Not found.");
    res.render("admin/post-form", {
      mode: "edit",
      post,
      error: ""
    });
  } catch (err) {
    if (isTableMissingError(err)) {
      return res.status(503).send("Database schema is not ready yet. Please refresh in a moment.");
    }
    next(err);
  }
});

router.post("/posts/create", requireAdmin, upload.single("pdfFile"), async (req, res) => {
  const prisma = getPrisma();

  try {
    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const postDateRaw = String(req.body.postDate || "").trim();
    const contentMode = String(req.body.contentMode || "RICH");

    if (!type || !ALLOWED_POST_TYPES.includes(type)) {
      return res.status(400).render("admin/post-form", {
        mode: "create",
        post: null,
        error: "Choose a post type."
      });
    }
    if (!title) {
      return res.status(400).render("admin/post-form", {
        mode: "create",
        post: null,
        error: "Title is required."
      });
    }

    const postDate = postDateRaw ? new Date(postDateRaw) : new Date();
    if (Number.isNaN(postDate.getTime())) {
      return res.status(400).render("admin/post-form", {
        mode: "create",
        post: null,
        error: "Invalid date."
      });
    }

    let contentType = "RICH";
    let contentHtml = "";
    let pdfPath = null;

    if (contentMode === "PDF") {
      if (!req.file) {
        return res.status(400).render("admin/post-form", {
          mode: "create",
          post: null,
          error: "PDF file is required for PDF mode."
        });
      }

      const fileFullPath = path.join(uploadsDir, req.file.filename);
      const dataBuffer = fs.readFileSync(fileFullPath);
      const parsed = await pdfParse(dataBuffer);

      const rawText = (parsed.text || "").trim();
      contentType = "PDF";
      contentHtml = pdfTextToHtml(rawText);
      pdfPath = `/uploads/${req.file.filename}`;
    } else {
      const richHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));
      const hasContent = richHtml.replace(/<[^>]+>/g, "").trim().length > 0;
      if (!hasContent) {
        return res.status(400).render("admin/post-form", {
          mode: "create",
          post: null,
          error: "Content is required in editor mode."
        });
      }
      contentType = "RICH";
      contentHtml = richHtml;
    }

    const slugBase = makeSlug(title);

    let slug = slugBase;
    const collision = await prisma.post.findUnique({ where: { slug } });
    if (collision) slug = `${slugBase}-${nanoid(6)}`;

    await prisma.post.create({
      data: {
        id: nanoid(),
        slug,
        type,
        title,
        postDate,
        contentType,
        contentHtml,
        pdfPath
      }
    });

    res.redirect("/admin/posts?saved=true");
  } catch (e) {
    if (isTableMissingError(e)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    console.error(e);
    res.status(500).send("Failed to create post.");
  }
});

router.post("/posts/:id/update", requireAdmin, upload.single("pdfFile"), async (req, res) => {
  const prisma = getPrisma();

  const id = req.params.id;

  let existing;
  try {
    existing = await prisma.post.findUnique({ where: { id } });
  } catch (e) {
    if (isTableMissingError(e)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    throw e;
  }

  if (!existing) return res.status(404).send("Not found.");

  try {
    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const postDateRaw = String(req.body.postDate || "").trim();
    const contentMode = String(
      req.body.contentMode || (existing.contentType === "PDF" ? "PDF" : "RICH")
    );

    if (!type || !ALLOWED_POST_TYPES.includes(type)) {
      return res.status(400).render("admin/post-form", {
        mode: "edit",
        post: existing,
        error: "Choose a post type."
      });
    }
    if (!title) {
      return res.status(400).render("admin/post-form", {
        mode: "edit",
        post: existing,
        error: "Title is required."
      });
    }

    const postDate = postDateRaw ? new Date(postDateRaw) : new Date();
    if (Number.isNaN(postDate.getTime())) {
      return res.status(400).render("admin/post-form", {
        mode: "edit",
        post: existing,
        error: "Invalid date."
      });
    }

    let contentType = existing.contentType;
    let contentHtml = existing.contentHtml;
    let pdfPath = existing.pdfPath;

    if (contentMode === "PDF") {
      contentType = "PDF";

      if (req.file) {
        if (existing.pdfPath) {
          const oldFsPath = path.join(uploadsDir, path.basename(existing.pdfPath));
          if (fs.existsSync(oldFsPath)) fs.unlinkSync(oldFsPath);
        }

        const fileFullPath = path.join(uploadsDir, req.file.filename);
        const dataBuffer = fs.readFileSync(fileFullPath);
        const parsed = await pdfParse(dataBuffer);

        const rawText = (parsed.text || "").trim();
        contentHtml = pdfTextToHtml(rawText);
        pdfPath = `/uploads/${req.file.filename}`;
      }
    } else {
      contentType = "RICH";
      const richHtml = sanitizeRichHtml(String(req.body.contentHtml || ""));
      const hasContent = richHtml.replace(/<[^>]+>/g, "").trim().length > 0;
      if (!hasContent) {
        return res.status(400).render("admin/post-form", {
          mode: "edit",
          post: existing,
          error: "Content is required in editor mode."
        });
      }
      contentHtml = richHtml;
      pdfPath = null;

      if (existing.pdfPath) {
        const oldFsPath = path.join(uploadsDir, path.basename(existing.pdfPath));
        if (fs.existsSync(oldFsPath)) fs.unlinkSync(oldFsPath);
      }
    }

    const newSlugBase = makeSlug(title);
    let newSlug = existing.slug;

    if (String(req.body.regenerateSlug || "") === "on") {
      newSlug = newSlugBase;
      const collision = await prisma.post.findUnique({ where: { slug: newSlug } });
      if (collision && collision.id !== existing.id) newSlug = `${newSlugBase}-${nanoid(6)}`;
    }

    await prisma.post.update({
      where: { id },
      data: {
        slug: newSlug,
        type,
        title,
        postDate,
        contentType,
        contentHtml,
        pdfPath
      }
    });

    res.redirect("/admin/posts?saved=true");
  } catch (e) {
    if (isTableMissingError(e)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    console.error(e);
    res.status(500).send("Failed to update post.");
  }
});

router.post("/posts/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrisma();

    const id = req.params.id;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return res.redirect("/admin/posts");

    if (post.pdfPath) {
      const oldFsPath = path.join(uploadsDir, path.basename(post.pdfPath));
      if (fs.existsSync(oldFsPath)) fs.unlinkSync(oldFsPath);
    }

    await prisma.post.delete({ where: { id } });
    res.redirect("/admin/posts?saved=true");
  } catch (err) {
    if (isTableMissingError(err)) {
      return res
        .status(503)
        .send("Database schema is not ready yet. Please refresh in a moment.");
    }
    next(err);
  }
});

export default router;
