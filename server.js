// server.js
import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import PgSession from "connect-pg-simple";
import pg from "pg";
import rateLimit from "express-rate-limit";

import { attachLocals } from "./src/middleware/attachLocals.js";
import { csrfTokens } from "./src/middleware/csrf.js";
import * as viewHelpers from "./src/lib/view-helpers.js";

/* ------------------------------------------------------------------ */
/*  Validate required admin credentials                               */
/* ------------------------------------------------------------------ */

const missingVars = ["ADMIN_USERNAME", "ADMIN_PASSWORD"].filter(
  (key) => !process.env[key]
);
if (missingVars.length) {
  throw new Error(
    `Missing required environment variable(s): ${missingVars.join(", ")}. ` +
    "Set them in a .env file (local) or as Railway Variables (production)."
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 8080;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn("[startup] SESSION_SECRET is not set: admin sessions will not survive a restart.");
}

let appReady = false;
let pgPool = null;

/* ------------------------------------------------------------------ */
/*  View engine                                                       */
/* ------------------------------------------------------------------ */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
Object.assign(app.locals, viewHelpers);
app.set("trust proxy", 1);
app.disable("x-powered-by");

/* ------------------------------------------------------------------ */
/*  Canonical host + HTTPS enforcement                                */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  const host = req.hostname;
  if (host === "www.theaugustinejournal.com" || (host === "theaugustinejournal.com" && req.protocol === "http")) {
    return res.redirect(301, `https://theaugustinejournal.com${req.originalUrl}`);
  }
  next();
});

/* ------------------------------------------------------------------ */
/*  Security headers (scripts must carry the per-response nonce)      */
/* ------------------------------------------------------------------ */

app.use((_req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`, "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // No referrer leaves the site; same-origin requests keep their Origin
    // header (with "no-referrer" browsers send "Origin: null" on POSTs).
    referrerPolicy: { policy: "same-origin" }
  })
);

/* ------------------------------------------------------------------ */
/*  Common middleware                                                  */
/* ------------------------------------------------------------------ */

// Log paths without query strings: unsubscribe links carry e-mail addresses.
morgan.token("path", (req) => (req.originalUrl || req.url || "").split("?")[0]);
app.use(
  morgan(':remote-addr - :remote-user [:date[clf]] ":method :path HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"')
);

/* ------------------------------------------------------------------ */
/*  Health check (503 until the database and routes are ready)        */
/* ------------------------------------------------------------------ */

app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(appReady ? 200 : 503).send(appReady ? "ok" : "starting");
});

// Serve /favicon.ico from the icons directory (browsers request this by default)
app.get("/favicon.ico", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "icons", "favicon.ico"));
});

app.use("/public", express.static(path.join(__dirname, "public")));

// Serve PDFs: try filesystem first (for freshly uploaded files), then fall
// back to the database so that PDFs survive ephemeral-filesystem redeployments.
const UPLOADS_DIR = path.join(__dirname, "uploads");
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    fallthrough: true,
    setHeaders: (res) => res.set("X-Robots-Tag", "noindex")
  })
);
app.get("/uploads/:filename", async (req, res) => {
  if (!appReady) return res.status(503).set("Retry-After", "5").send("Starting up.");
  try {
    const { getPrisma } = await import("./src/lib/db.js");
    const record = await getPrisma().pdfFile.findUnique({
      where: { filename: req.params.filename }
    });
    if (!record) return res.status(404).send("File not found.");

    // Re-create the file on disk so future requests are served by express.static
    const safeName = path.basename(record.filename);
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOADS_DIR, safeName), record.data);
    } catch (err) {
      console.warn("[uploads] Could not cache PDF on disk:", err.message);
    }

    res.set("Content-Type", record.mimeType);
    res.set("Content-Length", String(record.data.length));
    res.set("Cache-Control", "public, max-age=86400");
    res.set("X-Robots-Tag", "noindex");
    res.send(Buffer.from(record.data));
  } catch (err) {
    console.error("[uploads] Error serving PDF from database:", err.message);
    res.status(500).send("Error loading file.");
  }
});

/* ------------------------------------------------------------------ */
/*  Google Search Console verification                                */
/* ------------------------------------------------------------------ */

app.get("/google0292583cfdf40074.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "google0292583cfdf40074.html"));
});

/* ------------------------------------------------------------------ */
/*  503 gate — while DB is not ready, keep the port responsive        */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  if (appReady) return next();
  res.setHeader("Retry-After", "5");
  return res.status(503).send(
    "The Augustine Journal is starting up. Please refresh in a moment."
  );
});

// The editor's Auto format request (POST /admin/posts/format) carries a whole
// post, which can be as large as a saved one: that route parses its own JSON,
// with a larger limit, after the admin check (src/routes/admin.js).
const jsonBody = express.json({ limit: "1mb" });
app.use((req, res, next) => (/^\/admin\/posts\/format\/?$/i.test(req.path) ? next() : jsonBody(req, res, next)));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ------------------------------------------------------------------ */
/*  Listen immediately so Railway sees an open port                   */
/* ------------------------------------------------------------------ */

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`The Augustine Journal listening on port ${PORT}`);
});

/* ------------------------------------------------------------------ */
/*  Background startup (non-blocking)                                 */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

startBackground().catch((err) => {
  console.error("[startup] Fatal error during background startup:", err);
  // Exit so Railway's restart policy brings up a fresh process.
  process.exit(1);
});

async function bootstrapWithRetry() {
  const { bootstrap } = await import("./src/lib/db-bootstrap.js");
  const attempts = 8;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await bootstrap();
      console.log("[startup] Bootstrap complete:", result);
      return;
    } catch (e) {
      const msg = (e?.message || String(e) || "").slice(0, 2000);
      console.error(`[startup] Bootstrap failed (attempt ${attempt}/${attempts}):`, msg);
      if (attempt >= attempts || e?.fatal) throw e;
      await sleep(Math.min(30_000, 2000 * 2 ** (attempt - 1)));
    }
  }
}

async function startBackground() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  /* ---------- Database bootstrap ---------- */

  console.log("[startup] Beginning database bootstrap ...");
  await bootstrapWithRetry();

  /* ---------- Database pool for the session store ---------- */

  const { poolSslOption } = await import("./src/lib/db-bootstrap.js");
  pgPool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: poolSslOption(DATABASE_URL),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000
  });
  // Without a listener, a dropped idle connection (e.g. a Postgres restart)
  // would crash the whole process.
  pgPool.on("error", (err) => console.error("[pg] idle client error:", err.message));

  /* ---------- Session store ---------- */

  const PgStore = PgSession(session);

  app.use(
    session({
      store: new PgStore({
        pool: pgPool,
        tableName: "user_sessions",
        createTableIfMissing: true
      }),
      name: "taj.sid",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PRODUCTION,
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  /* ---------- Rate limiting ---------- */

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 180,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(attachLocals);

  /* ---------- Mount routes (only after schema is verified) ---------- */

  const [{ default: publicRoutes }, { default: adminRoutes }, { default: apiRoutes }] =
    await Promise.all([
      import("./src/routes/public.js"),
      import("./src/routes/admin.js"),
      import("./src/routes/api.js")
    ]);

  app.use("/", publicRoutes);
  app.use("/admin", csrfTokens, (req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
  }, adminRoutes);
  app.use("/api", apiRoutes);

  /* ---------- Not found ---------- */

  app.use((req, res) => {
    res.status(404).render("not-found", { title: "Page not found | The Augustine Journal", active: "" });
  });

  /* ---------- Global error handler ---------- */

  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json") || req.is("application/json");
    let status = err?.status || err?.statusCode || 500;
    let message = "Something went wrong.";

    if (err?.code === "EBADCSRFTOKEN") {
      status = 403;
      message = "Security token mismatch. Please refresh and try again.";
    } else if (err?.code === "P2021") {
      status = 503;
      message = "Database schema is not ready yet. Please refresh in a moment.";
    } else if (err?.type === "entity.too.large") {
      status = 413;
      message = "The request is too large.";
    } else if (status >= 400 && status < 500 && err?.expose) {
      message = err.message;
    } else {
      status = status >= 400 && status < 600 ? status : 500;
      console.error(err);
    }

    if (wantsJson) return res.status(status).json({ success: false, error: message });
    res.status(status).type("text/plain").send(message);
  });

  /* ---------- Email scheduler ---------- */

  try {
    const { startScheduler } = await import("./src/lib/scheduler.js");
    const { translatePostTitle } = await import("./src/lib/translation/service.js");
    // Throwback emails carry the post title in each subscriber's language.
    startScheduler({ titleFor: (post, lang) => translatePostTitle(post, lang, { timeoutMs: 60_000 }) });
  } catch (err) {
    console.error("[startup] Failed to start email scheduler:", err?.message || err);
  }

  /* ---------- Translation engine (background pre-translation) ---------- */

  try {
    const { startTranslationService } = await import("./src/lib/translation/service.js");
    startTranslationService();
  } catch (err) {
    console.error("[startup] Failed to start translation service:", err?.message || err);
  }

  /* ---------- Housekeeping: unused PDF uploads ---------- */

  const { cleanupOrphanPdfs } = await import("./src/routes/admin.js");
  const runCleanup = () => cleanupOrphanPdfs().catch((err) => console.error("[cleanup] PDF cleanup failed:", err?.message || err));
  setTimeout(runCleanup, 10 * 60 * 1000).unref();
  setInterval(runCleanup, 24 * 60 * 60 * 1000).unref();

  /* ---------- Ready ---------- */

  appReady = true;
  console.log("[startup] App is fully ready.");
}

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                 */
/* ------------------------------------------------------------------ */

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, closing ...`);
  setTimeout(() => process.exit(0), 10_000).unref();
  server.close();
  try {
    const { stopScheduler } = await import("./src/lib/scheduler.js");
    stopScheduler();
  } catch { /* ignore */ }
  try {
    const { stopTranslationService } = await import("./src/lib/translation/service.js");
    stopTranslationService();
  } catch { /* ignore */ }
  try {
    const { disconnectPrisma } = await import("./src/lib/db.js");
    await disconnectPrisma();
  } catch { /* ignore */ }
  try {
    await pgPool?.end();
  } catch { /* ignore */ }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});
