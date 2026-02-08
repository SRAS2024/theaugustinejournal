// src/lib/db-bootstrap.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

function prismaCommand() {
  if (process.env.PRISMA_CLI_CMD) return process.env.PRISMA_CLI_CMD;

  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const local = path.join(projectRoot, "node_modules", ".bin", binName);

  if (fs.existsSync(local)) return local;

  return "npx prisma";
}

function run(command) {
  return execSync(command, {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: "pipe",
    shell: true
  }).toString();
}

function sslForUrl(url) {
  const disable =
    url.includes("sslmode=disable") || url.includes("localhost") || url.includes("127.0.0.1");
  return disable ? false : { rejectUnauthorized: false };
}

async function expectedTablesExist() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;

  const client = new Client({ connectionString: url, ssl: sslForUrl(url) });
  try {
    await client.connect();
    const expected = ["SiteSettings", "Notice", "Post"];
    const r = await client.query(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      `,
      [expected]
    );
    const found = new Set(r.rows.map((x) => x.table_name));
    return expected.every((t) => found.has(t));
  } catch {
    return false;
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

/**
 * Runs migrations. If they "succeed" but the expected tables are still missing,
 * it automatically falls back to `prisma db push` to create the schema from schema.prisma.
 *
 * This avoids reliance on the migrations folder being present in the deployed container.
 */
export async function runMigrations() {
  const prisma = prismaCommand();

  try {
    console.log("[bootstrap] Running prisma migrate deploy ...");
    const out = run(`${prisma} migrate deploy`);
    if (out?.trim()) console.log(out.trim());
    console.log("[bootstrap] migrate deploy exited successfully.");

    const okAfterDeploy = await expectedTablesExist();
    if (okAfterDeploy) {
      console.log("[bootstrap] Expected tables exist after migrate deploy.");
      return { ok: true, baselined: false, createdViaPush: false };
    }

    console.log("[bootstrap] Tables missing after deploy. Running prisma db push fallback ...");
    const pushOut = run(`${prisma} db push --skip-generate`);
    if (pushOut?.trim()) console.log(pushOut.trim());

    const okAfterPush = await expectedTablesExist();
    if (!okAfterPush) {
      const msg =
        "Schema tables are missing after migrate deploy and db push. Verify DATABASE_URL points to the intended database.";
      console.error("[bootstrap]", msg);
      return { ok: false, error: msg, createdViaPush: true };
    }

    console.log("[bootstrap] Tables created via db push fallback.");
    return { ok: true, baselined: false, createdViaPush: true };
  } catch (err) {
    const stdout = err?.stdout ? err.stdout.toString() : "";
    const stderr = err?.stderr ? err.stderr.toString() : "";
    const combined = `${stdout}\n${stderr}`.trim();
    const msg = combined || err?.message || String(err);
    console.error("[bootstrap] Migration failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function runSeed() {
  const prisma = new PrismaClient();
  try {
    console.log("[bootstrap] Running startup seed ...");

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

export async function bootstrap() {
  const migration = await runMigrations();
  if (!migration.ok) {
    throw new Error(migration.error || "Database migrations failed.");
  }

  await runSeed();

  return {
    ok: true,
    baselined: migration.baselined === true,
    createdViaPush: migration.createdViaPush === true
  };
}
