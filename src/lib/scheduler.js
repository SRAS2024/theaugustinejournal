// src/lib/scheduler.js
// Simple scheduler for weekly throwback emails (every Thursday morning)
// Uses setInterval since node-cron is not available

import { getPrisma } from "./db.js";
import { sendWeeklyThrowbackEmail } from "./email-service.js";

export const DEFAULT_THROWBACK_TIMEZONE = "America/Chicago";
const THROWBACK_WEEKDAY = "Thu";
const THROWBACK_HOUR = 9; // local time in the throwback time zone
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let schedulerInterval = null;
let checkRunning = false;

/** Time zone from THROWBACK_TIMEZONE (IANA name), falling back to America/Chicago */
export function resolveThrowbackTimeZone(value = process.env.THROWBACK_TIMEZONE) {
  const zone = String(value ?? "").trim();
  if (!zone) return DEFAULT_THROWBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    console.warn(`[scheduler] Invalid THROWBACK_TIMEZONE "${zone}"; using ${DEFAULT_THROWBACK_TIMEZONE}.`);
    return DEFAULT_THROWBACK_TIMEZONE;
  }
}

/**
 * Is the weekly throwback due at this instant? It is due on Thursday from
 * 09:00 local time in timeZone. localDate (YYYY-MM-DD in that zone) is the
 * "already sent" key stored in ThrowbackTracker.lastSentDate.
 */
export function throwbackDueAt(date = new Date(), timeZone = DEFAULT_THROWBACK_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const part = type => parts.find(p => p.type === type)?.value || "";

  const weekday = part("weekday");
  const hour = Number(part("hour")) % 24;
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  return { due: weekday === THROWBACK_WEEKDAY && hour >= THROWBACK_HOUR, localDate, weekday, hour };
}

/**
 * Claim today's send before any email goes out. The conditional update only
 * matches while lastSentDate differs from localDate, so of several processes
 * (restart, deploy overlap, slow previous run) exactly one gets count === 1.
 */
export async function claimThrowbackDay(prisma, localDate) {
  const row = await prisma.throwbackTracker.findUnique({ where: { id: 1 } });
  if (row?.lastSentDate === localDate) return { claimed: false };
  if (!row) {
    // First run: create the singleton row (INSERT … ON CONFLICT DO NOTHING)
    await prisma.throwbackTracker.createMany({ data: [{ id: 1 }], skipDuplicates: true });
  }

  const { count } = await prisma.throwbackTracker.updateMany({
    where: { id: 1, lastSentDate: { not: localDate } },
    data: { lastSentDate: localDate }
  });
  return count === 1 ? { claimed: true, previousDate: row?.lastSentDate ?? "" } : { claimed: false };
}

/** Give the claim back (only if it is still ours) so a later check retries. */
export async function releaseThrowbackDay(prisma, localDate, previousDate = "") {
  const { count } = await prisma.throwbackTracker.updateMany({
    where: { id: 1, lastSentDate: localDate },
    data: { lastSentDate: previousDate }
  });
  return count === 1;
}

/**
 * One scheduler check. Resolves { status, localDate, result? } where status is
 * "not-due", "already-sent", "sent", "nothing-to-send" or "failed".
 * The claim is kept when nothing needed sending (no subscribers or too few
 * posts) and released when every attempted email failed.
 */
export async function runThrowbackCheck({
  now = new Date(),
  timeZone = DEFAULT_THROWBACK_TIMEZONE,
  titleFor,
  prisma,
  send = sendWeeklyThrowbackEmail
} = {}) {
  const { due, localDate } = throwbackDueAt(now, timeZone);
  if (!due) return { status: "not-due", localDate };

  const db = prisma || getPrisma();
  const claim = await claimThrowbackDay(db, localDate);
  if (!claim.claimed) return { status: "already-sent", localDate };

  console.log(`[scheduler] Thursday ${localDate} (${timeZone}). Sending weekly throwback...`);
  let result;
  try {
    result = await send({ titleFor, prisma: db });
  } catch (err) {
    // Nothing was sent yet (the send only throws before its first email)
    await releaseThrowbackDay(db, localDate, claim.previousDate).catch(releaseErr => {
      console.error("[scheduler] Could not release the throwback claim:", releaseErr?.message || releaseErr);
    });
    throw err;
  }

  if (!result || result.total === 0) return { status: "nothing-to-send", localDate, result };

  if (result.sent === 0) {
    await releaseThrowbackDay(db, localDate, claim.previousDate);
    console.warn(`[scheduler] Weekly throwback: all ${result.failed} email(s) failed. Will retry at the next hourly check.`);
    return { status: "failed", localDate, result };
  }

  return { status: "sent", localDate, result };
}

/**
 * Start the weekly throwback email scheduler.
 * Checks every hour whether it is Thursday from 09:00 in THROWBACK_TIMEZONE
 * (default America/Chicago) and the email has not been sent that local day.
 * Send tracking is persisted in the database (ThrowbackTracker.lastSentDate)
 * so it survives deployments, restarts, and crashes.
 *
 * options.titleFor(post, lang) → Promise<string>: optional per-language title.
 */
export function startScheduler(options = {}) {
  if (schedulerInterval) return;

  const timeZone = resolveThrowbackTimeZone(options.timeZone ?? process.env.THROWBACK_TIMEZONE);
  const titleFor = typeof options.titleFor === "function" ? options.titleFor : undefined;

  async function check() {
    if (checkRunning) return; // the previous check is still sending
    checkRunning = true;
    try {
      await runThrowbackCheck({ timeZone, titleFor });
    } catch (err) {
      console.error("[scheduler] Error in weekly check:", err?.message || err);
    } finally {
      checkRunning = false;
    }
  }

  // Check immediately on startup, then every hour
  check();
  schedulerInterval = setInterval(check, CHECK_INTERVAL_MS);

  console.log(`[scheduler] Weekly throwback scheduler started (checks every hour, sends Thursdays from ${String(THROWBACK_HOUR).padStart(2, "0")}:00 ${timeZone}).`);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
