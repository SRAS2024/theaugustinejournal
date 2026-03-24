// server.js
import crypto from "crypto";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import cookieParser from "cookie-parser";
import PgSession from "connect-pg-simple";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import csurf from "csurf";

import { attachLocals } from "./src/middleware/attachLocals.js";

dotenv.config();

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
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.DATABASE_URL;

let appReady = false;

/* ------------------------------------------------------------------ */
/*  View engine                                                       */
/* ------------------------------------------------------------------ */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ------------------------------------------------------------------ */
/*  Security headers                                                  */
/* ------------------------------------------------------------------ */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://translate.google.com",
          "https://translate.googleapis.com",
          "https://translate-pa.googleapis.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://translate.googleapis.com",
          "https://fonts.googleapis.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://translate.google.com",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://*.gstatic.com"
        ],
        frameSrc: ["'self'", "https://translate.google.com"],
        connectSrc: ["'self'", "https://translate.googleapis.com", "https://translate-pa.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

/* ------------------------------------------------------------------ */
/*  Common middleware                                                  */
/* ------------------------------------------------------------------ */

app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.use("/public", express.static(path.join(__dirname, "public")));
// Serve PDFs: try filesystem first (for freshly uploaded files), then fall
// back to the database so that PDFs survive ephemeral-filesystem redeployments.
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: true }));
app.get("/uploads/:filename", async (req, res) => {
  try {
    const { getPrisma } = await import("./src/lib/db.js");
    const prisma = getPrisma();
    const record = await prisma.pdfFile.findUnique({
      where: { filename: req.params.filename }
    });
    if (!record) return res.status(404).send("File not found.");

    // Re-create the file on disk so future requests are served by express.static
    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, record.filename), record.data);

    res.set("Content-Type", record.mimeType);
    res.set("Content-Length", record.size);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(record.data));
  } catch (err) {
    console.error("[uploads] Error serving PDF from database:", err.message);
    res.status(500).send("Error loading file.");
  }
});

app.set("trust proxy", 1);

/* ------------------------------------------------------------------ */
/*  Health check (always available)                                   */
/* ------------------------------------------------------------------ */

app.get("/health", (_req, res) => {
  res.status(200).send(appReady ? "ok" : "starting");
});

/* ------------------------------------------------------------------ */
/*  Google Search Console verification                                */
/* ------------------------------------------------------------------ */

app.get("/google0292583cfdf40074.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "google0292583cfdf40074.html"));
});

/* ------------------------------------------------------------------ */
/*  Canonical host + HTTPS enforcement                                */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  const host = req.hostname;
  const proto = req.protocol;

  if (host === "www.theaugustinejournal.com") {
    return res.redirect(301, `https://theaugustinejournal.com${req.originalUrl}`);
  }
  if (host === "theaugustinejournal.com" && proto === "http") {
    return res.redirect(301, `https://theaugustinejournal.com${req.originalUrl}`);
  }
  next();
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

/* ------------------------------------------------------------------ */
/*  Listen immediately so Railway sees an open port                   */
/* ------------------------------------------------------------------ */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`The Augustine Journal listening on port ${PORT}`);
});

/* ------------------------------------------------------------------ */
/*  Background startup (non-blocking)                                 */
/* ------------------------------------------------------------------ */

startBackground().catch((err) => {
  console.error("[startup] Fatal error during background startup:", err);
});

async function startBackground() {
  if (!DATABASE_URL) {
    console.error("[startup] DATABASE_URL is not set. App will stay in 503 mode.");
    return;
  }

  /* ---------- Database pool ---------- */

  const disableSsl =
    DATABASE_URL.includes("sslmode=disable") ||
    DATABASE_URL.includes("localhost") ||
    DATABASE_URL.includes("127.0.0.1");

  const pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: disableSsl ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000
  });

  app.set("pgPool", pgPool);

  /* ---------- Database bootstrap ---------- */

  console.log("[startup] Beginning database bootstrap ...");

  try {
    const { bootstrap } = await import("./src/lib/db-bootstrap.js");
    const result = await bootstrap();
    console.log("[startup] Bootstrap complete:", result);
  } catch (e) {
    const msg = (e?.message || String(e) || "").slice(0, 2000);
    console.error("[startup] Bootstrap failed:", msg);
    console.error("[startup] App will stay in 503 mode until restart.");
    return;
  }

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
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  /* ---------- Rate limiting ---------- */

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 180
    })
  );

  /* ---------- CSRF ---------- */

  app.use(
    csurf({
      ignoreMethods: ["GET", "HEAD", "OPTIONS"]
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
  app.use("/admin", adminRoutes);
  app.use("/api", apiRoutes);

  /* ---------- Global error handler ---------- */

  app.use((err, _req, res, _next) => {
    if (err?.code === "EBADCSRFTOKEN") {
      return res.status(403).send("Security token mismatch. Please refresh and try again.");
    }

    if (err?.code === "P2021") {
      return res.status(503).send("Database schema is not ready yet. Please refresh in a moment.");
    }

    console.error(err);
    res.status(500).send("Something went wrong.");
  });

  /* ---------- Email scheduler ---------- */

  try {
    const { startScheduler } = await import("./src/lib/scheduler.js");
    startScheduler();
  } catch (err) {
    console.error("[startup] Failed to start email scheduler:", err?.message || err);
  }

  /* ---------- Ready ---------- */

  appReady = true;
  console.log("[startup] App is fully ready.");
}
