// src/routes/api.js
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";
import { getPrisma } from "../lib/db.js";
import { normalizeLang } from "../lib/languages.js";
import { getTranslations } from "../lib/translation/service.js";
import { validUnsubscribeToken, confirmToken, validConfirmToken } from "../lib/unsubscribe.js";
import { sameOriginJson, ownPageJson, isSameSiteRequest } from "../middleware/csrf.js";
import { sendSubscribeConfirmationEmail, sendUnsubscribeConfirmationEmail } from "../lib/email-service.js";
import {
  verifyReadTicket, normalizeDeviceId, deviceIdFromCookie, readerKey, networkTag, isLikelyBot, recordRead,
  DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_MS
} from "../lib/reads.js";

const router = Router();

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/* ── Machine translation of site content ── */
router.get("/translations", async (req, res, next) => {
  try {
    const keys = String(req.query.keys || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const result = await getTranslations(req.query.lang, keys);
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Share counter ── */
router.post("/posts/:id/share", sameOriginJson, async (req, res) => {
  try {
    const prisma = getPrisma();
    // Raw SQL so counting a share does not change the post's updatedAt.
    const rows = await prisma.$queryRaw`
      UPDATE "Post" SET "share_count" = "share_count" + 1
      WHERE "id" = ${String(req.params.id)}
      RETURNING "share_count" AS "shareCount"`;
    if (!rows.length) return res.status(404).json({ success: false });
    return res.json({ success: true, shareCount: Number(rows[0].shareCount) });
  } catch (err) {
    console.error("[api/share] failed:", err?.message || err);
    return res.status(500).json({ success: false });
  }
});

/* ── Read counter ── */
// Posted by public/js/reads.js once the reader has spent the post's reading
// time on the page and scrolled (see src/lib/reads.js). Each device counts
// once per post, each network at most NETWORK_READS_PER_DAY times a day; the
// author's own reads are not counted. Requests that do not come from a page
// here are refused before the limiter, so they cannot use up a reader's quota.
const readLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ counted: false })
});

router.post("/posts/:id/read", ownPageJson, readLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const postId = String(req.params.id);
    const userAgent = String(req.get("user-agent") || "");
    const device = normalizeDeviceId(req.body?.device) || deviceIdFromCookie(req.headers.cookie);
    if (device) {
      // Set by the server as well, so browsers that expire script-set
      // cookies early (Safari) still recognise the device.
      res.cookie(DEVICE_COOKIE, device, { maxAge: DEVICE_COOKIE_MAX_AGE_MS, path: "/", sameSite: "lax", secure: req.secure });
    }

    const ticket = verifyReadTicket(req.body?.ticket, postId);
    if (!ticket.ok || req.session?.admin?.isLoggedIn || isLikelyBot(userAgent)) {
      return res.json({ counted: false });
    }
    const counted = await recordRead(getPrisma(), {
      postId,
      ticket: req.body.ticket,
      readerKey: readerKey({ postId, device, ip: req.ip, userAgent }),
      networkTag: networkTag({ postId, ip: req.ip })
    });
    return res.json({ counted });
  } catch (err) {
    console.error("[api/read] failed:", err?.message || err);
    return res.status(500).json({ counted: false });
  }
});

/* ── Subscribe ── */
const subscribeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post("/subscribe", subscribeLimiter, sameOriginJson, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const language = normalizeLang(req.body?.language);

    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "invalid_email" });
    }

    const prisma = getPrisma();

    // Check for duplicate
    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      return res.json({ success: false, duplicate: true });
    }

    try {
      await prisma.subscriber.create({
        data: { id: nanoid(), email, language }
      });
    } catch (err) {
      if (err?.code === "P2002") return res.json({ success: false, duplicate: true }); // double click
      throw err;
    }

    // Send confirmation email (fire-and-forget)
    sendSubscribeConfirmationEmail({ email, language }).catch(err => {
      console.error("[api/subscribe] confirmation email failed:", err?.message || err);
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[api/subscribe] failed:", err?.message || err);
    return res.status(500).json({ success: false, error: "server_error" });
  }
});

/* ── Unsubscribe ── */

async function unsubscribe(email) {
  const prisma = getPrisma();
  const subscriber = await prisma.subscriber.findUnique({ where: { email } });
  if (!subscriber) return false;
  await prisma.subscriber.deleteMany({ where: { email } });
  // Send unsubscribe confirmation email (fire-and-forget)
  sendUnsubscribeConfirmationEmail({ email, language: subscriber.language }).catch(err => {
    console.error("[api/unsubscribe] confirmation email failed:", err?.message || err);
  });
  return true;
}

function unsubscribeParams(req) {
  const source = { ...req.query, ...(req.body && typeof req.body === "object" ? req.body : {}) };
  return {
    email: String(source.email ?? "").trim().toLowerCase(),
    lang: normalizeLang(source.lang),
    token: String(source.token ?? "")
  };
}

function renderUnsubscribe(res, status, state, { email, lang }) {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex");
  return res.status(status).render("unsubscribe", { state, email, lang, formToken: state === "confirm" ? confirmToken(email) : "" });
}

const unsubscribeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Link in the e-mail footer: a confirmation page with one button. Opening the
// link never unsubscribes by itself, so mail security scanners that follow
// links cannot remove anyone.
router.get("/unsubscribe", (req, res) => {
  const params = unsubscribeParams(req);
  if (!EMAIL_RE.test(params.email)) return renderUnsubscribe(res, 400, "invalid", params);
  return renderUnsubscribe(res, 200, "confirm", params);
});

// RFC 8058 one-click unsubscribe: mail apps POST "List-Unsubscribe=One-Click"
// to the List-Unsubscribe URL, which carries the signed token.
router.post("/unsubscribe", unsubscribeLimiter, async (req, res) => {
  try {
    const params = unsubscribeParams(req);
    if (!EMAIL_RE.test(params.email) || !validUnsubscribeToken(params.email, params.token)) {
      return res.status(400).type("text/plain").send("Invalid unsubscribe link.");
    }
    await unsubscribe(params.email);
    return res.status(200).type("text/plain").send("Unsubscribed.");
  } catch (err) {
    console.error("[api/unsubscribe] one-click failed:", err?.message || err);
    return res.status(500).type("text/plain").send("Something went wrong.");
  }
});

// The button on the confirmation page.
router.post("/unsubscribe/confirm", unsubscribeLimiter, async (req, res, next) => {
  try {
    const params = unsubscribeParams(req);
    const formToken = String(req.body?.formToken ?? "");
    if (!EMAIL_RE.test(params.email) || !isSameSiteRequest(req) || !validConfirmToken(params.email, formToken)) {
      return renderUnsubscribe(res, 400, "invalid", params);
    }
    await unsubscribe(params.email);
    return renderUnsubscribe(res, 200, "done", params);
  } catch (err) {
    next(err);
  }
});

export default router;
