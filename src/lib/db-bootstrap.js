import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

/**
 * Run Prisma migrations via `prisma migrate deploy`.
 *
 * This uses the migration files checked into prisma/migrations/ and will never
 * generate destructive DDL (no table drops).  The `user_sessions` table managed
 * by connect-pg-simple is completely outside Prisma's schema and is therefore
 * never touched by these migrations.
 *
 * Returns { ok: boolean, error?: string }
 */
export async function runMigrations() {
  try {
    console.log("[bootstrap] Running prisma migrate deploy …");
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env }
    });
    console.log("[bootstrap] Migrations applied successfully.");
    return { ok: true };
  } catch (err) {
    const message = err?.stderr?.toString?.() || err.message || String(err);
    console.error("[bootstrap] Migration failed:", message);
    return { ok: false, error: message };
  }
}

/**
 * Lightweight seed: ensures SiteSettings row exists and at least one Notice is
 * present so the first page load never crashes on an empty database.
 *
 * This is intentionally idempotent — safe to call on every startup.
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
 * Returns { ok: boolean, error?: string }
 */
export async function bootstrap() {
  const migration = await runMigrations();
  if (!migration.ok) {
    return migration;
  }

  try {
    await runSeed();
  } catch (err) {
    console.error("[bootstrap] Seed failed (non-fatal):", err.message || err);
    // Seed failure is not fatal — tables exist, just data is missing.
    // Routes can still serve; admin can populate data manually.
  }

  return { ok: true };
}
