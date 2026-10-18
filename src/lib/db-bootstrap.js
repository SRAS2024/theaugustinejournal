// src/lib/db-bootstrap.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../");

const EXPECTED_TABLES = [
  "SiteSettings",
  "Notice",
  "Post",
  "post_views",
  "PdfFile",
  "Subscriber",
  "email_logs",
  "throwback_tracker",
  "translations",
  "post_redirects"
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function prismaCli() {
  const bin = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const local = path.join(PROJECT_ROOT, "node_modules", ".bin", bin);
  return fs.existsSync(local) ? { file: local, prefix: [] } : { file: "npx", prefix: ["prisma"] };
}

function runPrisma(args) {
  const cli = prismaCli();
  return new Promise((resolve, reject) => {
    execFile(cli.file, [...cli.prefix, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      timeout: 120_000,
      shell: process.platform === "win32"
    }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

/**
 * SSL settings for node-postgres. An explicit sslmode in the URL is left to
 * the driver; local databases use no SSL; anything else (e.g. Railway) uses
 * SSL without certificate verification, as before.
 */
export function poolSslOption(url) {
  if (/[?&]sslmode=/.test(url)) return undefined;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  return { rejectUnauthorized: false };
}

/* ------------------------------------------------------------------ */
/*  Schema readiness check                                            */
/* ------------------------------------------------------------------ */

/**
 * Which expected tables are missing. Throws when the database cannot be
 * reached, so a connection problem is never mistaken for an empty database.
 */
export async function missingTables() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");

  const client = new pg.Client({ connectionString: url, ssl: poolSslOption(url), connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES]
    );
    const found = new Set(result.rows.map((r) => r.table_name));
    return EXPECTED_TABLES.filter((t) => !found.has(t));
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Migrations                                                        */
/* ------------------------------------------------------------------ */

async function ensureSchema() {
  console.log("[bootstrap] Running prisma migrate deploy ...");
  try {
    const out = await runPrisma(["migrate", "deploy"]);
    if (out?.trim()) console.log(out.trim());
  } catch (err) {
    const stdout = err?.stdout?.toString?.() || "";
    const stderr = err?.stderr?.toString?.() || "";
    throw new Error(`prisma migrate deploy failed: ${(stdout + "\n" + stderr).trim() || err.message}`);
  }

  const missing = await missingTables();
  if (missing.length) {
    // Never try to "repair" a production schema automatically.
    const error = new Error(
      `Tables missing after migrate deploy: ${missing.join(", ")}. ` +
      "Verify DATABASE_URL points to the intended database and check the migration history."
    );
    error.fatal = true;
    throw error;
  }
  console.log("[bootstrap] Schema verified.");
}

/* ------------------------------------------------------------------ */
/*  Idempotent seed                                                   */
/* ------------------------------------------------------------------ */

async function runSeed() {
  const prisma = new PrismaClient();
  try {
    console.log("[bootstrap] Running startup seed ...");

    // A fresh database gets the default site text and one example notice.
    // Existing sites are never changed (deleting every notice stays deleted).
    const existing = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!existing) {
      await prisma.siteSettings.create({
        data: {
          id: 1,
          aboutHtml:
            "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. " +
            "Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers " +
            "through carefully curated essays, letters, and commentary on the matters that shape our " +
            "understanding of the world.</p>"
        }
      });
      if ((await prisma.notice.count()) === 0) {
        await prisma.notice.create({
          data: {
            id: nanoid(),
            message: "Welcome to The Augustine Journal. This is an example notice.",
            order: 1
          }
        });
      }
    }

    console.log("[bootstrap] Seed completed.");
  } finally {
    await prisma.$disconnect();
  }
}

/* ------------------------------------------------------------------ */
/*  Bootstrap entry point                                             */
/* ------------------------------------------------------------------ */

export async function bootstrap() {
  // 1. Apply migrations and verify the schema
  await ensureSchema();

  // 2. Seed only after schema is confirmed ready
  await runSeed();

  return { ok: true };
}
