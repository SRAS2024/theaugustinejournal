// src/lib/db-bootstrap.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../");

const EXPECTED_TABLES = ["SiteSettings", "Notice", "Post", "PdfFile"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function prismaCommand() {
  if (process.env.PRISMA_CLI_CMD) return process.env.PRISMA_CLI_CMD;
  const bin = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const local = path.join(PROJECT_ROOT, "node_modules", ".bin", bin);
  return fs.existsSync(local) ? local : "npx prisma";
}

function run(command) {
  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      shell: true,
      timeout: 30_000
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

function sslForUrl(url) {
  if (url.includes("sslmode=disable") || url.includes("localhost") || url.includes("127.0.0.1")) {
    return false;
  }
  return { rejectUnauthorized: false };
}

/* ------------------------------------------------------------------ */
/*  Schema readiness check                                            */
/* ------------------------------------------------------------------ */

export async function expectedTablesExist() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;

  const client = new Client({ connectionString: url, ssl: sslForUrl(url), connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES]
    );
    const found = new Set(result.rows.map((r) => r.table_name));
    const allExist = EXPECTED_TABLES.every((t) => found.has(t));
    if (!allExist) {
      const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
      console.log(`[bootstrap] Missing tables: ${missing.join(", ")}`);
    }
    return allExist;
  } catch {
    return false;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Migration with db push fallback                                   */
/* ------------------------------------------------------------------ */

async function ensureSchema() {
  const prisma = prismaCommand();

  // Step 1: Try prisma migrate deploy
  try {
    console.log("[bootstrap] Running prisma migrate deploy ...");
    const out = await run(`${prisma} migrate deploy`);
    if (out?.trim()) console.log(out.trim());
  } catch (err) {
    const stderr = err?.stderr?.toString?.() || err?.stderr || "";
    const stdout = err?.stdout?.toString?.() || err?.stdout || "";
    console.warn("[bootstrap] migrate deploy failed:", (stdout + "\n" + stderr).trim() || err.message);
  }

  if (await expectedTablesExist()) {
    console.log("[bootstrap] Schema verified after migrate deploy.");
    return;
  }

  // Step 2: Fallback to prisma db push
  // --accept-data-loss is required because non-Prisma tables (e.g. user_sessions
  // created by connect-pg-simple) would otherwise block the push. The session
  // table is auto-recreated on every startup via createTableIfMissing: true.
  console.log("[bootstrap] Tables missing after migrate deploy. Running prisma db push --skip-generate --accept-data-loss ...");
  try {
    const out = await run(`${prisma} db push --skip-generate --accept-data-loss`);
    if (out?.trim()) console.log(out.trim());
  } catch (err) {
    const stderr = err?.stderr?.toString?.() || err?.stderr || "";
    const stdout = err?.stdout?.toString?.() || err?.stdout || "";
    const msg = (stdout + "\n" + stderr).trim() || err.message;
    throw new Error(`prisma db push failed: ${msg}`);
  }

  // Step 3: Final verification
  if (await expectedTablesExist()) {
    console.log("[bootstrap] Schema verified after db push fallback.");
    return;
  }

  throw new Error(
    "Schema tables (SiteSettings, Notice, Post) are still missing after migrate deploy and db push. " +
    "Verify DATABASE_URL points to the intended database."
  );
}

/* ------------------------------------------------------------------ */
/*  Idempotent seed                                                   */
/* ------------------------------------------------------------------ */

async function runSeed() {
  const prisma = new PrismaClient();
  try {
    console.log("[bootstrap] Running startup seed ...");

    // Upsert singleton site settings (never overwrites user edits)
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        aboutHtml:
          "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. " +
          "Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers " +
          "through carefully curated essays, letters, and commentary on the matters that shape our " +
          "understanding of the world.</p>"
      }
    });

    // Create a starter notice only if none exist
    const noticeCount = await prisma.notice.count();
    if (noticeCount === 0) {
      await prisma.notice.create({
        data: {
          id: nanoid(),
          message: "Welcome to The Augustine Journal. This is an example notice.",
          order: 1
        }
      });
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
  // 1. Ensure schema tables exist (migrate → db push fallback → throw)
  await ensureSchema();

  // 2. Seed only after schema is confirmed ready
  await runSeed();

  return { ok: true };
}
