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

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Set it in Railway environment variables.");
  process.exit(1);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet());
app.use(morgan("combined"));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: true }));

const PgStore = PgSession(session);

const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

app.set("pgPool", pgPool);

app.set("trust proxy", 1);

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

app.use(csurf());
app.use(attachLocals);

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

app.listen(PORT, () => {
  console.log(`The Augustine Journal running on port ${PORT}`);
});
