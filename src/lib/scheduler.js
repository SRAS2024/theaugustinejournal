// src/lib/scheduler.js
// Simple scheduler for weekly throwback emails (every Thursday)
// Uses setInterval since node-cron is not available

import { getPrisma } from "./db.js";
import { sendWeeklyThrowbackEmail } from "./email-service.js";

let schedulerInterval = null;

/**
 * Start the weekly throwback email scheduler.
 * Checks every hour if it's Thursday and the email hasn't been sent today.
 * Send tracking is persisted in the database (ThrowbackTracker.lastSentDate)
 * so it survives deployments, restarts, and crashes.
 */
export function startScheduler() {
  if (schedulerInterval) return;

  async function check() {
    try {
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 4=Thu
      if (dayOfWeek !== 4) return;

      const todayStr = now.toISOString().slice(0, 10);

      // Check the database to see if we already sent today
      const prisma = getPrisma();
      const tracker = await prisma.throwbackTracker.findUnique({ where: { id: 1 } });
      if (tracker && tracker.lastSentDate === todayStr) {
        return; // Already sent this Thursday
      }

      console.log("[scheduler] Thursday detected. Sending weekly throwback...");
      await sendWeeklyThrowbackEmail();
    } catch (err) {
      console.error("[scheduler] Error in weekly check:", err?.message || err);
    }
  }

  // Check immediately on startup, then every hour
  check();
  schedulerInterval = setInterval(check, 60 * 60 * 1000);

  console.log("[scheduler] Weekly throwback scheduler started (checks every hour, sends on Thursdays).");
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
