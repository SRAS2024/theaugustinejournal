// src/lib/scheduler.js
// Simple scheduler for weekly throwback emails (every Thursday)
// Uses setInterval since node-cron is not available

import { sendWeeklyThrowbackEmail } from "./email-service.js";

let schedulerInterval = null;

/**
 * Start the weekly throwback email scheduler.
 * Checks every hour if it's Thursday and the email hasn't been sent today.
 */
export function startScheduler() {
  if (schedulerInterval) return;

  let lastSentDate = null;

  async function check() {
    try {
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 4=Thu
      const todayStr = now.toISOString().slice(0, 10);

      // Send on Thursday (UTC), only once per day
      if (dayOfWeek === 4 && lastSentDate !== todayStr) {
        console.log("[scheduler] Thursday detected. Sending weekly throwback...");
        await sendWeeklyThrowbackEmail();
        lastSentDate = todayStr;
      }
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
