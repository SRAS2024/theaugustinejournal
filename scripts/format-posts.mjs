// scripts/format-posts.mjs
//
// Runs the post formatter (src/lib/post-format.js) over posts that are already
// published. New and edited posts are formatted when they are saved; this is
// for the posts saved before that.
//
//   node scripts/format-posts.mjs                        dry run: report what would change
//   node scripts/format-posts.mjs --apply --backup <file>
//                                                        back up every post's HTML, then save the formatted HTML
//   node scripts/format-posts.mjs --restore <file>       put the HTML from a backup back
//   node scripts/format-posts.mjs --from-json <file>     dry run on a JSON dump of posts (no database)
//
// Options: --report <file> writes the report to a new file instead of the
// terminal; --slug <slug> limits the run to one post.
//
// --restore only puts back posts that still hold what --apply wrote (or the
// backed-up HTML itself): a post edited since then is not overwritten, and
// nothing is written, unless --force is given, with --backup <file> for a copy
// of the HTML it replaces. --report never replaces an existing file unless
// --force, and never the backup or the JSON dump; a report that cannot be
// written is printed instead.
//
// Old posts get the formatter's one-off repair pass too (paragraphs a broken
// PDF import split without any clue); read the dry-run report before --apply.
//
// The database is DATABASE_URL (from .env). Only contentHtml is written, with
// plain SQL so a post's updatedAt (sitemap lastmod, dateModified) stays as it
// was: the words do not change. Translated pages pick up joined paragraphs
// once their new sentences are translated (on the next visit or restart).

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { formatPost } from "../src/lib/post-format.js";

const RULE_LABELS = {
  colours: "Pasted text colour removed",
  spacing: "Spacing tidied (tabs, no-break spaces, doubled spaces, empty formatting)",
  empty: "Empty spacer paragraph removed",
  verse: "Verse lines kept together in one paragraph",
  merge: "Paragraph split by a line wrap joined",
  "section-heading": "Section title made a heading",
  "ref-heading": "References label given the reference heading style",
  "ref-join": "Wrapped reference line joined to its entry",
  "url-join": "URL split across lines rejoined",
  "ref-lines": "Passages listed under their source, one per line",
  "ref-entries": "Reference entries",
  links: "Links",
  "pdf-wrapper": "PDF post"
};

/* ------------------------------------------------------------------ */
/*  Arguments                                                          */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { apply: false, force: false };
  const valueOf = (i, name) => {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail(`${name} needs a file name.`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--backup") args.backup = valueOf(i++, arg);
    else if (arg === "--restore") args.restore = valueOf(i++, arg);
    else if (arg === "--from-json") args.fromJson = valueOf(i++, arg);
    else if (arg === "--report") args.report = valueOf(i++, arg);
    else if (arg === "--slug") args.slug = valueOf(i++, arg);
    else fail(`Unknown option ${arg}`);
  }
  if (args.apply && !args.backup) fail("--apply needs --backup <file>: every post is backed up before anything is written.");
  if (args.apply && args.fromJson) fail("--apply works on the database, not on --from-json.");
  if (args.restore && (args.apply || args.fromJson || args.report)) fail("--restore cannot be combined with --apply, --from-json or --report.");
  if (args.restore && args.force && !args.backup) {
    fail("--restore --force overwrites posts edited since the backup: add --backup <file> for a copy of their HTML first.");
  }
  if (args.backup && fs.existsSync(args.backup)) fail(`${args.backup} already exists; choose a new backup file.`);
  if (args.report) {
    if ([args.backup, args.fromJson].some((file) => file && sameFile(file, args.report))) fail("--report must not name the backup or the JSON dump.");
    if (fs.existsSync(args.report) && !args.force) fail(`${args.report} already exists; choose a new report file (or --force to replace it).`);
  }
  return args;
}

// The same file: the same path, or another path to it (a link, or another
// spelling on a case-insensitive disk such as macOS's: "Backup.json" is
// "backup.json"). A file that does not exist yet is only its path.
function sameFile(a, b) {
  if (path.resolve(a) === path.resolve(b)) return true;
  try {
    const one = fs.statSync(a);
    const other = fs.statSync(b);
    return one.ino === other.ino && one.dev === other.dev;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Report                                                             */
/* ------------------------------------------------------------------ */

// Block HTML as readable text: [h3.class] markers, line breaks as " / ",
// links as «url», tabs and no-break spaces made visible.
function readable(html) {
  return html
    .replace(/<(p|h[1-6]|li|blockquote)(?:\s+class="([^"]*)")?[^>]*>/g, (_, tag, cls) => (tag === "p" && !cls ? "" : `[${tag}${cls ? `.${cls.replace(/ /g, ".")}` : ""}] `))
    .replace(/<br\s*\/?>/g, " / ")
    .replace(/<a\s[^>]*>/g, "«")
    .replace(/<\/a>/g, "»")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|\u00A0/g, "⍽")
    .replace(/\t/g, "⇥")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

const clip = (text, max = 240) => (text.length <= max ? text : `${text.slice(0, max / 2 - 2)} … ${text.slice(-(max / 2 - 2))}`);

// The part of a block that spacing changed, with some context.
function spacingDiff(before, after) {
  const a = readable(before);
  const b = readable(after);
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const from = Math.max(0, start - 40);
  const show = (s, end) => `${from ? "…" : ""}${s.slice(from, end + 40)}${end + 40 < s.length ? "…" : ""}`;
  return [show(a, endA), show(b, endB)];
}

// Consecutive "passage" changes describe one entry growing line by line:
// only the first state and the final one are worth showing.
function groupChanges(changes) {
  const out = [];
  for (const change of changes) {
    const last = out[out.length - 1];
    if (change.rule === "ref-lines" && last?.rule === "ref-lines" && last.after === change.before[0]) {
      last.before.push(change.before[1]);
      last.after = change.after;
    } else {
      out.push({ ...change, before: [...change.before] });
    }
  }
  return out;
}

function describePost(post, result) {
  const lines = [];
  const changes = groupChanges(result.changes);
  const empties = changes.filter((c) => c.rule === "empty").length;
  lines.push(`== ${post.slug} (${post.contentType || "?"}) — ${result.changes.length} change${result.changes.length === 1 ? "" : "s"}`);
  if (!result.changes.length) {
    lines.push("   Already formatted.");
    return lines;
  }
  if (empties) lines.push(`   * ${RULE_LABELS.empty}: ${empties}`);
  for (const change of changes) {
    if (change.rule === "empty") continue;
    const label = RULE_LABELS[change.rule] || change.rule;
    if (!change.before.length) {
      lines.push(`   * ${label}: ${change.after}`);
      continue;
    }
    lines.push(`   * ${label}`);
    if (change.rule === "spacing") {
      const [before, after] = spacingDiff(change.before[0], change.after);
      lines.push(`       - ${clip(before)}`, `       + ${clip(after)}`);
      continue;
    }
    for (const block of change.before) lines.push(`       - ${clip(readable(block))}`);
    lines.push(`       + ${clip(readable(change.after), change.rule === "verse" ? 2000 : 600)}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Sources                                                            */
/* ------------------------------------------------------------------ */

async function openDatabase() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (see .env).");
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

const POST_FIELDS = { id: true, slug: true, contentType: true, contentHtml: true, updatedAt: true };
const formatOptions = (post) => ({ pdf: post.contentType === "PDF", repair: true });

async function loadPosts(args, prisma) {
  let posts;
  if (args.fromJson) {
    posts = JSON.parse(fs.readFileSync(args.fromJson, "utf8"));
    if (!Array.isArray(posts)) fail(`${args.fromJson} is not a JSON array of posts.`);
  } else {
    posts = await prisma.post.findMany({ select: POST_FIELDS, orderBy: [{ postDate: "asc" }, { createdAt: "asc" }] });
  }
  posts = posts.filter((post) => typeof post.contentHtml === "string");
  return args.slug ? posts.filter((post) => post.slug === args.slug) : posts;
}

// `written` maps the id of each post this run changes to the HTML it saves
// (what --restore expects to find there); the other posts keep contentHtml.
function writeBackup(file, posts, source, written = new Map()) {
  if (fs.existsSync(file)) fail(`${file} already exists; choose a new backup file.`);
  const backup = {
    takenAt: new Date().toISOString(),
    source,
    recordsWrites: true,
    posts: posts.map(({ id, slug, contentType, contentHtml, updatedAt }) => ({
      id, slug, contentType, contentHtml, updatedAt, ...(written.has(id) ? { writtenHtml: written.get(id) } : {})
    }))
  };
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), { flag: "wx" });
  // Read it back: nothing is written to the database without a usable backup.
  const check = JSON.parse(fs.readFileSync(file, "utf8"));
  if (check.posts.length !== posts.length) fail(`The backup in ${file} could not be verified.`);
}

// Only contentHtml changes; plain SQL keeps updatedAt as it was.
function saveHtml(prisma, id, html) {
  return prisma.$executeRaw`UPDATE "Post" SET "contentHtml" = ${html} WHERE "id" = ${id}`;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

/**
 * What --restore would do with each backed-up post, given the posts as they
 * are now (a Map by id). A post is safe to put back when it still holds the
 * HTML --apply wrote; one that changed since (edited in the admin) is
 * `edited`. Backups from before the written HTML was recorded (no
 * recordsWrites) are compared with the formatter's output for the backed-up
 * HTML, which only matches while the formatter is unchanged.
 */
export function planRestore(backup, current) {
  const plan = { missing: [], same: [], restore: [], edited: [] };
  for (const post of backup.posts) {
    const now = current.get(post.id);
    if (!now) {
      plan.missing.push(post);
      continue;
    }
    const written = post.writtenHtml ?? (backup.recordsWrites ? post.contentHtml : formatPost(post.contentHtml, formatOptions(now)).html);
    if (now.contentHtml === post.contentHtml) plan.same.push(post);
    else if (now.contentHtml === written) plan.restore.push(post);
    else plan.edited.push(post);
  }
  return plan;
}

async function restore(args, prisma) {
  const backup = JSON.parse(fs.readFileSync(args.restore, "utf8"));
  if (!Array.isArray(backup.posts)) fail(`${args.restore} is not a backup written by this script.`);
  const posts = backup.posts.filter((post) => !args.slug || post.slug === args.slug);
  const found = await prisma.post.findMany({ where: { id: { in: posts.map((post) => post.id) } }, select: POST_FIELDS });
  const current = new Map(found.map((post) => [post.id, post]));
  const plan = planRestore({ ...backup, posts }, current);
  const slugs = (list) => list.map((post) => post.slug).join(", ");
  if (plan.missing.length) console.log(`Not in the database any more, skipped: ${slugs(plan.missing)}`);
  if (plan.edited.length && !args.force) {
    console.error(`Changed since the backup (edited, or formatted by another version of the formatter): ${slugs(plan.edited)}`);
    fail("Nothing was restored. Check those posts, then use --slug for the others, or --force --backup <file> to restore them too.");
  }
  const writes = args.force ? [...plan.restore, ...plan.edited] : plan.restore;
  if (args.backup) {
    // Restoring this backup in turn undoes the restore.
    const written = new Map(writes.map((post) => [post.id, post.contentHtml]));
    writeBackup(args.backup, writes.map((post) => current.get(post.id)), "database, before --restore", written);
  }
  const counts = await prisma.$transaction(writes.map((post) => saveHtml(prisma, post.id, post.contentHtml)));
  const restored = counts.reduce((sum, n) => sum + n, 0);
  console.log(`Restored the HTML of ${restored} post(s) from ${args.restore} (taken ${backup.takenAt}); ${plan.same.length} already held it.`);
  if (args.force && plan.edited.length) console.log(`Overwritten although changed since the backup: ${slugs(plan.edited)} (their HTML is in ${args.backup}).`);
}

async function run(args, prisma) {
  const posts = await loadPosts(args, prisma);
  const source = args.fromJson ? `JSON dump ${args.fromJson}` : "database";
  const report = [
    `Post formatting ${args.apply ? "run" : "dry run"} — ${new Date().toISOString()}`,
    `Source: ${source}, ${posts.length} post(s)`,
    ""
  ];
  const changed = [];
  for (const post of posts) {
    const result = formatPost(post.contentHtml, formatOptions(post));
    if (result.html !== post.contentHtml) changed.push({ post, html: result.html });
    // One line at a time: push(...lines) runs out of stack for a post with
    // 100,000 or so changes.
    for (const line of describePost(post, result)) report.push(line);
    report.push("");
  }
  report.push(`Summary: ${changed.length} of ${posts.length} post(s) ${args.apply ? "formatted" : "would change"}.`);

  if (args.apply) {
    writeBackup(args.backup, posts, source, new Map(changed.map(({ post, html }) => [post.id, html])));
    // All or nothing.
    await prisma.$transaction(changed.map(({ post, html }) => saveHtml(prisma, post.id, html)));
    report.push(`Backup of all ${posts.length} post(s): ${args.backup}`);
  } else {
    report.push("Nothing was written. Use --apply --backup <file> to save.");
  }

  const text = `${report.join("\n")}\n`;
  if (!args.report) {
    process.stdout.write(text);
    return;
  }
  const problem = writeReport(args.report, text, { force: args.force, avoid: [args.backup, args.fromJson] });
  if (!problem) {
    console.log(`Report written to ${args.report} (${changed.length} of ${posts.length} post(s) ${args.apply ? "formatted" : "would change"}).`);
    return;
  }
  // With --apply the database is written by now: the report is shown rather
  // than lost.
  process.stdout.write(text);
  console.error(`Report not written: ${problem}. It is printed above.`);
  process.exitCode = 1;
}

/**
 * Writes the report to a new file (or over an existing one with `force`),
 * but never over one of `avoid` (the backup, the JSON dump), however the path
 * is spelled. Returns null, or why the report was not written.
 * @param {string} file
 * @param {string} text
 * @param {{ force?: boolean, avoid?: (string | undefined)[] }} [options]
 * @returns {string | null}
 */
export function writeReport(file, text, { force = false, avoid = [] } = {}) {
  if (avoid.some((other) => other && sameFile(other, file))) return `${file} is the backup or the JSON dump`;
  try {
    fs.writeFileSync(file, text, { flag: force ? "w" : "wx" });
    return null;
  } catch (err) {
    return err.code === "EEXIST" ? `${file} already exists` : err.message;
  }
}

// Run from the command line (the tests import planRestore and writeReport).
// Node gives import.meta.url as the real path and argv[1] as typed, so the
// real paths are compared: through a symlink (/tmp on macOS) the script must
// not silently do nothing.
function runFromCommandLine() {
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (runFromCommandLine()) {
  const args = parseArgs(process.argv.slice(2));
  const prisma = args.fromJson ? null : await openDatabase();
  try {
    if (args.restore) await restore(args, prisma);
    else await run(args, prisma);
  } finally {
    await prisma?.$disconnect();
  }
}
