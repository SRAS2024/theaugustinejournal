// src/lib/view-helpers.js
// Small helpers available in every EJS view (see app.locals in server.js).

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for HTML element content and attribute values. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** "2026-10-18" for a stored post date (post dates are stored at UTC midnight). */
export function isoDate(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** "October 18, 2026" — the English date shown before the browser localizes it. */
export function formatDate(date, options = { year: "numeric", month: "long", day: "numeric" }) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
