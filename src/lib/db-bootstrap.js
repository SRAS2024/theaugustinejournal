import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

function prismaBinary() {
  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const local = path.join(projectRoot, "node_modules", ".bin", binName);
  return fs.existsSync(local) ? local : "prisma";
}

function run(command) {
  return execSync(command, {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: "pipe"
  }).toString();
}

function listMigrationNames() {
  const migrationsDir = path.join(projectRoot, "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) return [];

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name && !name.startsWith("."));
}

/**
 * Run Prisma migrations via `prisma migrate deploy`.
 * If the DB is non-empty but not yet baselined (P3005), automatically baseline
 * by marking all existing migrations as applied, then re-run deploy.
 *
 * Returns { ok: boolean, baselined?: boolean, error?: string }
 */
export async function runMigrations() {
  const prisma = prismaBinary();

  try {
    console.log("[bootstrap] Running prisma migrate deploy …");
    run(`"${prisma}" migrate deploy`);
    console.log("[bootstrap] Migrations applied successfully.");
    return { ok: true, baselined: false };
  } catch (err) {
    const stdout = err?.stdout ? err.stdout.toString() : "";
    const stderr = err?.stderr ? err.stderr.toString() : "";
    const combined = `${stdout}\n${stderr}`.trim();

    if (combined.includes("P3005")) {
      console.log("[bootstrap] Detected P3005, baselining existing database …");

      const migrations = listMigrationNames();
      if (!migrations.length) {
        const msg = "P3005 detected but no prisma/migrations folders found to baseline.";
        console.error("[bootstrap] Migration failed:", msg);
        return { ok: false, error: msg };
      }

      try {
        for (const name of migrations) {
          console.log(`[bootstrap] Marking migration as applied: ${name}`);
          run(`"${prisma}" migrate resolve --applied "${name}"`);
        }

        console.log("[bootstrap] Baseline complete. Re-running migrate deploy …");
        run(`"${prisma}" migrate deploy`);
        console.log("[bootstrap] Migrations ready after baseline.");
        return { ok: true, baselined: true };
      } catch (e2) {
        const s2 = e2?.stdout ? e2.stdout.toString() : "";
        const e2err = e2?.stderr ? e2.stderr.toString() : "";
        const msg2 = `${s2}\n${e2err}`.trim() || e2?.message || String(e2);
        console.error("[bootstrap] Baseline or re-deploy failed:", msg2);
        return { ok: false, error: msg2 };
      }
    }

    const msg = combined || err?.message || String(err);
    console.error("[bootstrap] Migration failed:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Lightweight seed: ensures SiteSettings row exists and at least one Notice is
 * present so the first page load never crashes on an empty database.
 *
 * This is intentionally idempotent and safe to call on every startup.
 */
export async function runSeed() {
  const prisma = new PrismaClient();
  try {
    console.log("[bootstrap] Running startup seed …");

    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        aboutHtml:
          "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers through carefully curated essays, letters, and commentary on the matters that shape our understanding of the world.</p>"
      }
    });

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

/**
 * Full bootstrap: migrate then seed.
 * Returns { ok: boolean, baselined?: boolean, error?: string }
 */
export async function bootstrap() {
  const migration = await runMigrations();
  if (!migration.ok) {
    return migration;
  }

  try {
    await runSeed();
  } catch (err) {
    console.error("[bootstrap] Seed failed (non-fatal):", err?.message || err);
  }

  return { ok: true, baselined: migration.baselined === true };
}
