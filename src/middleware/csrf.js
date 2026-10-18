// src/middleware/csrf.js
// CSRF protection for the admin area (replaces the deprecated csurf package).
// Each session gets a random secret; forms and fetch calls send a token
// derived from it in the "_csrf" field or the "x-csrf-token" header.

import crypto from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sign(salt, secret) {
  return crypto.createHmac("sha256", secret).update(salt).digest("base64url");
}

function makeToken(secret) {
  const salt = crypto.randomBytes(12).toString("base64url");
  return `${salt}.${sign(salt, secret)}`;
}

function validToken(token, secret) {
  if (typeof token !== "string" || !secret) return false;
  const [salt, mac] = token.split(".");
  if (!salt || !mac) return false;
  const expected = Buffer.from(sign(salt, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function csrfError() {
  const err = new Error("Invalid CSRF token");
  err.code = "EBADCSRFTOKEN";
  err.status = 403;
  return err;
}

/** Adds req.csrfToken(); does not check anything by itself. */
export function csrfTokens(req, _res, next) {
  req.csrfToken = () => {
    if (!req.session) return "";
    if (!req.session.csrfSecret) req.session.csrfSecret = crypto.randomBytes(24).toString("base64url");
    return makeToken(req.session.csrfSecret);
  };
  next();
}

/**
 * Rejects unsafe requests without a valid token. Use after the body has been
 * parsed (for multipart forms: after multer).
 */
export function verifyCsrf(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const token = req.get("x-csrf-token") || (req.body && req.body._csrf);
  if (validToken(token, req.session?.csrfSecret)) return next();
  return next(csrfError());
}

/**
 * True when the request was made by this site's own pages: browsers send
 * Sec-Fetch-Site (and an Origin header on POST); requests from other sites
 * cannot fake either.
 */
export function isSameSiteRequest(req) {
  const site = req.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.get("origin");
  if (!origin) return true; // not a browser request (or a very old browser)
  if (origin === "null") return false;
  try {
    return new URL(origin).hostname === req.hostname;
  } catch {
    return false;
  }
}

/**
 * For public JSON endpoints used by the site's own pages: the request must
 * come from this site and carry a JSON body, which a cross-site form cannot
 * send.
 */
export function sameOriginJson(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!isSameSiteRequest(req) || !req.is("application/json")) return next(csrfError());
  return next();
}
