// server.js
import crypto from "crypto";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.DATABASE_URL;

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
/*  Common middleware                                                 */
/* ------------------------------------------------------------------ */

app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

/*
  Serve public assets from the root as well as /public.
  This ensures /favicon.ico and Apple touch icons work without needing a /public prefix.
*/
app.use(express.static(path.join(__dirname, "public"), { index: false }));
app.use("/public", express.static(path.join(__dirname, "public"), { index: false }));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: true }));

app.set("trust proxy", 1);

/* ------------------------------------------------------------------ */
/*  Health check (always available)                                   */
/* ------------------------------------------------------------------ */

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

/* ------------------------------------------------------------------ */
/*  503 fallback                                                      */
/* ------------------------------------------------------------------ */

function serve503(message) {
  app.use((req, res, _next) => {
    if (req.path === "/health") return;
    res.status(503).send(message);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Augustine Journal running on port ${PORT} (503 fallback)`);
  });
}

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

if (!DATABASE_URL) {
  console.error("[startup] DATABASE_URL is not set.");
  serve503(
    "Server is running, but DATABASE_URL is not configured. " +
      "Add a Postgres service or set DATABASE_URL."
  );
} else {
  start().catch((err) => {
    console.error("[startup] Fatal boot error:", err);
    serve503("Server failed to start due to a configuration error. Check logs.");
  });
}

async function start() {
  const disableSsl =
    DATABASE_URL.includes("sslmode=disable") ||
    DATABASE_URL.includes("localhost") ||
    DATABASE_URL.includes("127.0.0.1");

  const pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: disableSsl ? false : { rejectUnauthorized: false }
  });

  app.set("pgPool", pgPool);

  // Verify DB connectivity early with retries so a brief Railway networking hiccup
  // does not take the whole site down.
  console.log("[startup] Checking database connectivity ...");
  await assertDbReachableWithRetries(pgPool, { timeoutMs: 8000, attempts: 10, delayMs: 2000 });
  console.log("[startup] Database is reachable.");

  /* ---------- Database bootstrap ---------- */

  console.log("[startup] Beginning database bootstrap ...");

  try {
    const { bootstrap } = await import("./src/lib/db-bootstrap.js");
    const result = await bootstrap();
    console.log("[startup] Bootstrap complete:", result);
  } catch (e) {
    const msg = (e?.message || String(e) || "").slice(0, 2000);
    console.error("[startup] Bootstrap failed:", msg);

    serve503(
      "Database bootstrap failed. The site will be available once the database schema is ready.\n\n" +
        msg
    );
    return;
  }

  /* ---------- Session store (after DB is confirmed ready) ---------- */

  const PgStore = PgSession(session);

  const store = new PgStore({
    pool: pgPool,
    tableName: "user_sessions",
    createTableIfMissing: true
  });

  // Some connect-pg-simple versions do not expose an EventEmitter interface.
  // Guard this so a missing .on does not hard crash startup.
  if (store && typeof store.on === "function") {
    store.on("error", (err) => {
      console.error("[session-store] Postgres session store error:", err?.message || err);
    });
  }

  app.use(
    session({
      store,
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

  /* ---------- Mount routes ---------- */

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

    // If Postgres is temporarily unreachable, return 503 instead of 500.
    if (err?.code === "ETIMEDOUT" || err?.code === "ECONNREFUSED") {
      return res.status(503).send("Database connection issue. Please try again in a moment.");
    }

    console.error(err);
    res.status(500).send("Something went wrong.");
  });

  /* ---------- Listen ---------- */

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Augustine Journal running on port ${PORT}`);
  });
}

async function assertDbReachable(pgPool, timeoutMs) {
  const timeoutErr = new Error(`Database connection timed out after ${timeoutMs}ms`);
  timeoutErr.code = "ETIMEDOUT";

  await Promise.race([
    pgPool.query("SELECT 1"),
    new Promise((_, reject) => setTimeout(() => reject(timeoutErr), timeoutMs))
  ]);
}

async function assertDbReachableWithRetries(pgPool, { timeoutMs, attempts, delayMs }) {
  let lastErr;

  for (let i = 1; i <= attempts; i++) {
    try {
      await assertDbReachable(pgPool, timeoutMs);
      return;
    } catch (err) {
      lastErr = err;
      console.error(
        `[startup] Database not reachable (attempt ${i}/${attempts}):`,
        err?.message || err
      );

      if (i < attempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr;
}
