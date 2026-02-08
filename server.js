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

// Prefer a stable secret across restarts in Railway.
// Falls back to a random value only if not provided.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.DATABASE_URL;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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

app.use(morgan("combined"));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: true }));

app.set("trust proxy", 1);

/**
 * Health check endpoint
 * Railway will mark the service unhealthy if it cannot get a quick response.
 */
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

/**
 * If DATABASE_URL is missing, do not hard exit.
 * Instead, serve a clear message so the service responds and you can fix env vars.
 *
 * IMPORTANT:
 * Do not import DB backed routes before this check.
 */
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Set it in Railway environment variables.");

  app.get("*", (req, res) => {
    res
      .status(503)
      .send(
        "Server is running, but DATABASE_URL is not configured. Add a Postgres service or set DATABASE_URL."
      );
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Augustine Journal running on port ${PORT} (DATABASE_URL missing)`);
  });
} else {
  const start = async () => {
    const PgStore = PgSession(session);

    const disableSsl =
      DATABASE_URL.includes("sslmode=disable") ||
      DATABASE_URL.includes("localhost") ||
      DATABASE_URL.includes("127.0.0.1");

    const pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: disableSsl ? false : { rejectUnauthorized: false }
    });

    app.set("pgPool", pgPool);

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

    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 180
      })
    );

    app.use(
      csurf({
        ignoreMethods: ["GET", "HEAD", "OPTIONS"]
      })
    );

    app.use(attachLocals);

    // Database bootstrap: migrate and seed, with automatic baseline on P3005.
    console.log("[startup] Beginning database bootstrap ...");

    try {
      // The file in your repo is named db-bootstrap.js (Linux is case sensitive)
      // and it exports bootstrap(), not bootstrapDatabase().
      const { bootstrap } = await import("./src/lib/db-bootstrap.js");
      const result = await bootstrap();
      console.log("[startup] Bootstrap complete:", result);
    } catch (e) {
      console.error("[startup] Bootstrap failed:", e?.message || e);

      app.use((req, res) => {
        res.status(503).send(
          "Database migrations failed. The site will be available once the database is ready. Check logs for details."
        );
      });

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`The Augustine Journal running on port ${PORT} (migration-failure fallback)`);
      });
      return;
    }

    // Lazy import routes only after bootstrap succeeds.
    const [{ default: publicRoutes }, { default: adminRoutes }, { default: apiRoutes }] =
      await Promise.all([
        import("./src/routes/public.js"),
        import("./src/routes/admin.js"),
        import("./src/routes/api.js")
      ]);

    app.use("/", publicRoutes);
    app.use("/admin", adminRoutes);
    app.use("/api", apiRoutes);

    app.use((err, req, res, next) => {
      if (err?.code === "EBADCSRFTOKEN") {
        return res.status(403).send("Security token mismatch. Please refresh and try again.");
      }
      console.error(err);
      res.status(500).send("Something went wrong.");
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`The Augustine Journal running on port ${PORT}`);
    });
  };

  start().catch((err) => {
    console.error("Fatal boot error:", err);
    app.get("*", (req, res) => {
      res.status(500).send("Server failed to start due to a configuration error. Check logs.");
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`The Augustine Journal running on port ${PORT} (boot error fallback)`);
    });
  });
}
