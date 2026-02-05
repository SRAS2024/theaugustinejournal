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

import publicRoutes from "./src/routes/public.js";
import adminRoutes from "./src/routes/admin.js";
import apiRoutes from "./src/routes/api.js";
import { attachLocals } from "./src/middleware/attachLocals.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 8080);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL;
const dbConfigured = Boolean(DATABASE_URL);

/* ---------- view engine ---------- */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

/* ---------- security headers ---------- */

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
        connectSrc: [
          "'self'",
          "https://translate.googleapis.com",
          "https://translate-pa.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

/* ---------- logging & body parsing ---------- */

app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

/* ---------- static files ---------- */

app.use("/public", express.static(path.join(__dirname, "public")));

const uploadsPath = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath, { fallthrough: true }));

/* ---------- health endpoint (fast, no DB dependency) ---------- */

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", db: dbConfigured });
});

/* ---------- database pool ---------- */

let pgPool = null;

if (dbConfigured) {
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  pgPool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err.message);
  });

  pgPool.query("SELECT 1").then(() => {
    console.log("PostgreSQL connected.");
  }).catch((err) => {
    console.error("PostgreSQL initial connection failed:", err.message);
  });
} else {
  console.error(
    "DATABASE_URL is not set. The server will start but database-dependent routes return 503."
  );
}

/* ---------- session ---------- */

let sessionMiddleware = null;

if (pgPool) {
  const PgStore = PgSession(session);

  const store = new PgStore({
    pool: pgPool,
    tableName: "user_sessions",
    createTableIfMissing: true
  });

  store.on("error", (err) => {
    console.error("Session store error:", err.message);
  });

  sessionMiddleware = session({
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
  });
}

app.use((req, res, next) => {
  if (!sessionMiddleware) {
    req.session = req.session || {};
    return next();
  }
  sessionMiddleware(req, res, (err) => {
    if (err) {
      console.error("Session middleware error:", err.message);
      req.session = req.session || {};
    }
    next();
  });
});

/* ---------- rate limiting ---------- */

app.use(rateLimit({ windowMs: 60_000, max: 180 }));

/* ---------- CSRF protection (skip for /api and when DB is absent) ---------- */

const csrfProtection = csurf();

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (!dbConfigured) return next();
  csrfProtection(req, res, next);
});

/* ---------- template locals ---------- */

app.use(attachLocals);

/* ---------- database availability guard ---------- */

function requireDb(req, res, next) {
  if (!dbConfigured) {
    return res.status(503).send("Service unavailable \u2014 database is not configured.");
  }
  next();
}

/* ---------- routes ---------- */

app.use("/api", apiRoutes);
app.use("/admin", requireDb, adminRoutes);
app.use("/", requireDb, publicRoutes);

/* ---------- error handler ---------- */

const PRISMA_CONN_CODES = new Set(["P1001", "P1002", "P1003", "P2024"]);

app.use((err, _req, res, _next) => {
  if (err?.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Security token mismatch. Please refresh and try again.");
  }

  if (PRISMA_CONN_CODES.has(err?.code)) {
    console.error("Database connectivity error:", err.message);
    return res.status(503).send("Service unavailable \u2014 database connection error.");
  }

  console.error(err);
  res.status(500).send("Something went wrong.");
});

/* ---------- start ---------- */

app.listen(PORT, () => {
  console.log(`The Augustine Journal running on port ${PORT}`);
});
