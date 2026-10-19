// src/lib/translation/engine.js
// Runs translation jobs in a child process (worker.js), one job at a time.
// The worker is started on demand and restarted if it crashes; jobs that were
// running when it died fail and are retried by the caller. When the worker has
// been idle for a while it asks to stop, and the engine lets it go only if no
// job is on its way to it.

import { fork } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.js");
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // includes a first-time model download

export class TranslationEngine {
  constructor({ log = console.log } = {}) {
    this.log = log;
    this.child = null;
    this.pending = new Map(); // id -> { resolve, reject, timer, child }
    this.nextId = 1;
    this.crashes = [];
    this.stopped = false;
  }

  start() {
    if (this.child) return this.child;
    const child = fork(WORKER, [], {
      env: process.env,
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    child.on("message", (msg) => this.onMessage(msg, child));
    child.on("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      if (code !== 0 && !this.stopped) {
        this.crashes.push(Date.now());
        this.log(`[translation] worker exited (${signal || code})`);
      }
      for (const [id, job] of this.pending) {
        if (job.child !== child) continue;
        clearTimeout(job.timer);
        job.reject(new Error("Translation worker stopped"));
        this.pending.delete(id);
      }
    });
    child.on("error", (err) => this.log("[translation] worker error:", err.message));
    this.child = child;
    return child;
  }

  onMessage(msg, child) {
    if (msg?.type === "idle") {
      // Disconnecting makes the worker exit; the next job starts a new one.
      if (this.child === child && ![...this.pending.values()].some((j) => j.child === child)) {
        this.child = null;
        if (child.connected) child.disconnect();
      }
      return;
    }
    const job = msg && this.pending.get(msg.id);
    if (!job) return;
    this.pending.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.type === "result") job.resolve({ outputs: msg.outputs, model: msg.model, alt: msg.alt || [] });
    else job.reject(new Error(msg.message || "Translation failed"));
  }

  /** True when the worker crashed three times in the last ten minutes. */
  isBackingOff() {
    const since = Date.now() - 10 * 60 * 1000;
    this.crashes = this.crashes.filter((t) => t > since);
    return this.crashes.length >= 3;
  }

  /** Translate `texts` into `lang`. Resolves { outputs: (string|null)[], model, alt: number[] }. */
  run(lang, texts) {
    if (this.stopped) return Promise.reject(new Error("Translation engine stopped"));
    if (this.isBackingOff()) return Promise.reject(new Error("Translation worker is crashing; backing off"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        const job = this.pending.get(id);
        if (!job) return;
        this.pending.delete(id);
        reject(new Error("Translation job timed out"));
        job.child?.kill("SIGKILL");
      }, JOB_TIMEOUT_MS);
      const job = { resolve, reject, timer, child: null };
      this.pending.set(id, job);
      try {
        job.child = this.start();
        job.child.send({ type: "translate", id, lang, texts });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  stop() {
    this.stopped = true;
    this.child?.kill("SIGTERM");
    this.child = null;
  }
}
