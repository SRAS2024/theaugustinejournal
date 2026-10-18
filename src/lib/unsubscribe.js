// src/lib/unsubscribe.js
// Signed unsubscribe links: the token proves the link came from one of our
// e-mails, so nobody can unsubscribe someone else just by knowing the address.

import crypto from "crypto";

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL || "";
}

export function unsubscribeToken(email) {
  return crypto
    .createHmac("sha256", `unsubscribe:${secret()}`)
    .update(String(email || "").trim().toLowerCase())
    .digest("base64url")
    .slice(0, 32);
}

export function validUnsubscribeToken(email, token) {
  if (typeof token !== "string" || !secret()) return false;
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Absolute unsubscribe URL for an e-mail address. */
export function unsubscribeUrl(siteUrl, email, lang) {
  const params = new URLSearchParams({ email: String(email || ""), lang: String(lang || "en"), token: unsubscribeToken(email) });
  return `${siteUrl}/api/unsubscribe?${params.toString()}`;
}

/** Token for the confirmation form (keeps other sites from posting it). Valid for two days. */
export function confirmToken(email, now = Date.now()) {
  const day = Math.floor(now / 86_400_000);
  return crypto
    .createHmac("sha256", `unsubscribe-confirm:${secret()}`)
    .update(`${day}|${String(email || "").trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

export function validConfirmToken(email, token, now = Date.now()) {
  if (typeof token !== "string" || !secret()) return false;
  const given = Buffer.from(token);
  return [now, now - 86_400_000].some((t) => {
    const expected = Buffer.from(confirmToken(email, t));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}
