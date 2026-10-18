// src/lib/email-service.js
// Email service using the Resend API via the global fetch
import { nanoid } from "nanoid";
import { getPrisma } from "./db.js";
import { SITE_LANGS, normalizeLang } from "./languages.js";
import { unsubscribeToken } from "./unsubscribe.js";

const SENDER = "The Augustine Journal <notifications@theaugustinejournal.com>";
const REPLY_TO = "The Augustine Journal <notifications@theaugustinejournal.com>";
const SITE_URL = () => (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");

/* ── Languages ── */

export const SUPPORTED_LANGS = Object.freeze([...SITE_LANGS]);

/**
 * Map any language value (subscriber row, query string, form field) to one of
 * the six site languages. Region subtags are dropped ("pt-BR" → "pt"); anything
 * else, including the retired "it", falls back to "en".
 */
export { normalizeLang };

/* ── Helpers ── */

/** Escape a value for use in HTML text and double- or single-quoted attributes */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** "r•••@example.com" — e-mail addresses are not written to the logs in full. */
function maskEmail(address) {
  const [user, domain] = String(address ?? "").split("@");
  return domain ? `${user.slice(0, 1)}•••@${domain}` : "•••";
}

/** Sleep helper for rate-limiting and retry backoff */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Reject if the promise has not settled within ms */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Public URL of a post */
export function buildPostUrl(slug) {
  return `${SITE_URL()}/post/${encodeURIComponent(String(slug ?? ""))}`;
}

/**
 * One-click unsubscribe URL. The same URL serves the link in the email (GET)
 * and the RFC 8058 List-Unsubscribe-Post request (POST). The signed token lets
 * the link unsubscribe in one click without letting anyone forge links.
 */
export function buildUnsubscribeUrl(email, lang) {
  const address = String(email ?? "");
  return `${SITE_URL()}/api/unsubscribe?email=${encodeURIComponent(address)}&lang=${encodeURIComponent(normalizeLang(lang))}&token=${encodeURIComponent(unsubscribeToken(address))}`;
}

/* ── i18n strings for emails ── */
/*
 * One register per language: Spanish tú, Portuguese (Brazil) você, French vous,
 * German Sie, Russian вы. French uses a no-break space before ! ? : ;
 */
export const EMAIL_STRINGS = {
  weeklyThrowbackTitle: {
    en: "Weekly Throwback",
    es: "Retrospectiva semanal",
    pt: "Retrospectiva semanal",
    fr: "Rétrospective hebdomadaire",
    de: "Wöchentlicher Rückblick",
    ru: "Еженедельная ретроспектива"
  },
  weeklyThrowbackMessage: {
    en: "This is your weekly throwback. Check out our post.",
    es: "Esta es tu retrospectiva semanal. Echa un vistazo a nuestra publicación.",
    pt: "Esta é sua retrospectiva semanal. Confira nossa publicação.",
    fr: "Voici votre rétrospective hebdomadaire. Découvrez notre publication.",
    de: "Hier ist Ihr wöchentlicher Rückblick. Schauen Sie sich unseren Beitrag an.",
    ru: "Это ваша еженедельная ретроспектива. Прочитайте нашу публикацию."
  },
  newPostTitle: {
    en: "Our Latest Post",
    es: "Nuestra última publicación",
    pt: "Nossa última publicação",
    fr: "Notre dernière publication",
    de: "Unser neuester Beitrag",
    ru: "Наша новая публикация"
  },
  newPostMessage: {
    en: "Check out our newest post.",
    es: "Echa un vistazo a nuestra publicación más reciente.",
    pt: "Confira nossa publicação mais recente.",
    fr: "Découvrez notre toute dernière publication.",
    de: "Schauen Sie sich unseren neuesten Beitrag an.",
    ru: "Читайте нашу новую публикацию."
  },
  unsubscribeLinkText: {
    en: "Unsubscribe",
    es: "Cancelar suscripción",
    pt: "Cancelar inscrição",
    fr: "Se désabonner",
    de: "Abmelden",
    ru: "Отписаться"
  },
  dontWantEmails: {
    en: "Don't want to receive emails?",
    es: "¿No quieres recibir más correos?",
    pt: "Não quer mais receber nossos e-mails?",
    fr: "Vous ne souhaitez plus recevoir nos e-mails ?",
    de: "Sie möchten keine E-Mails mehr von uns erhalten?",
    ru: "Не хотите больше получать наши письма?"
  },
  siteTitle: {
    en: "The Augustine Journal",
    es: "El Diario Agustiniano",
    pt: "O Diário Agostiniano",
    fr: "Le Journal augustinien",
    de: "Das Augustinische Journal",
    ru: "Августинский журнал"
  },
  cathedralAlt: {
    en: "Cathedral",
    es: "Catedral",
    pt: "Catedral",
    fr: "Cathédrale",
    de: "Kathedrale",
    ru: "Собор"
  },
  subscribedSubject: {
    en: "Subscribed",
    es: "Suscripción confirmada",
    pt: "Inscrição confirmada",
    fr: "Abonnement confirmé",
    de: "Abonnement bestätigt",
    ru: "Подписка оформлена"
  },
  subscribedMessage: {
    en: "Thank you for subscribing to The Augustine Journal!",
    es: "¡Gracias por suscribirte al Diario Agustiniano!",
    pt: "Obrigado por se inscrever no Diário Agostiniano!",
    fr: "Merci pour votre abonnement au Journal augustinien !",
    de: "Vielen Dank, dass Sie das Augustinische Journal abonniert haben!",
    ru: "Спасибо за подписку на «Августинский журнал»!"
  },
  unsubscribedSubject: {
    en: "Unsubscribed",
    es: "Suscripción cancelada",
    pt: "Inscrição cancelada",
    fr: "Désabonnement confirmé",
    de: "Abmeldung bestätigt",
    ru: "Подписка отменена"
  },
  unsubscribedMessage: {
    en: "We are sorry to see you go and would like to thank you for the time you've invested in us!",
    es: "¡Lamentamos que te vayas y te agradecemos el tiempo que nos has dedicado!",
    pt: "Lamentamos sua saída e agradecemos o tempo que você nos dedicou!",
    fr: "Nous sommes désolés de vous voir partir et vous remercions du temps que vous nous avez consacré !",
    de: "Schade, dass Sie gehen! Vielen Dank für die Zeit, die Sie uns geschenkt haben.",
    ru: "Нам жаль, что вы уходите. Спасибо за время, которое вы нам уделили!"
  }
};

function t(key, lang) {
  const map = EMAIL_STRINGS[key];
  return (map && (map[normalizeLang(lang)] || map.en)) || "";
}

/* ── Build styled HTML email ── */
/*
 * Email background strategy: Many email clients (Gmail, Outlook, Yahoo) strip
 * CSS "background" from <body> and ignore rgba() values. We use:
 *   - bgcolor="#0a0a0e" HTML attribute on every table, tr, and td
 *   - background-color:#0a0a0e inline style as reinforcement
 *   - Solid hex colors instead of rgba() for all foreground/border colors
 *
 * Color mapping (site palette → email-safe hex):
 *   --bg        #0a0a0e  →  #0a0a0e
 *   --text      #e8e8ed  →  #e8e8ed
 *   --muted     #8a8a99  →  #8a8a99
 *   border rgba(255,255,255,0.07) on #0a0a0e  →  #1c1c20
 *   btn bg rgba(255,255,255,0.02) on #0a0a0e  →  #0f0f13
 *   text  rgba(232,232,237,0.88)              →  #ccccD1
 *   purple decorative                         →  #2b1c3e
 *
 * Every interpolated value goes through escapeHtml.
 */

/** Divider + unsubscribe footer rows (empty when there is no unsubscribe URL) */
function unsubscribeRows(unsubscribeUrl, lang) {
  if (!unsubscribeUrl) return "";
  return `
        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;"><tr><td style="height:1px;background-color:#1c1c20;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Unsubscribe -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0;">
          <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#5c5c67;letter-spacing:0.3px;">
            ${escapeHtml(t("dontWantEmails", lang))} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#5c5c67;text-decoration:underline;">${escapeHtml(t("unsubscribeLinkText", lang))}</a>
          </p>
        </td></tr>
`;
}

/** Full email document: site title, cathedral, rule and message, then extraRows */
function renderEmailDocument({ lang, subject, preheader, message, extraRows }) {
  const cathedralImgUrl = `${SITE_URL()}/public/icons/cathedral-email.png`;
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${escapeHtml(subject)}</title>
  <!--[if !mso]><!-->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap"/>
  <!--<![endif]-->
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body, table, td { background-color: #0a0a0e !important; }
  </style>
  <!--[if mso]>
  <style>body,table,td{background:#0a0a0e !important;}</style>
  <![endif]-->
</head>
<body bgcolor="#0a0a0e" style="margin:0;padding:0;background-color:#0a0a0e;color:#e8e8ed;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;">
  <!-- Preheader text (visible in inbox preview, hidden in email body) -->
  <div style="display:none;font-size:1px;color:#0a0a0e;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}${"&#847; &zwnj; &nbsp; ".repeat(30)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;margin:0;padding:0;">
    <tr bgcolor="#0a0a0e">
      <td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">${escapeHtml(t("siteTitle", lang))}</h1>
        </td></tr>

        <!-- Cathedral artwork (hosted PNG — Gmail and Outlook do not display SVG images) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 28px;">
          <img src="${escapeHtml(cathedralImgUrl)}" alt="${escapeHtml(t("cathedralAlt", lang))}" width="260" height="140" style="display:block;margin:0 auto;width:260px;max-width:100%;height:auto;border:0;" />
        </td></tr>

        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="200" style="margin:0 auto;"><tr><td style="height:1px;background-color:#2b1c3e;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Message -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;line-height:1.7;color:#ccccd1;">${escapeHtml(message)}</p>
        </td></tr>
${extraRows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Email with a post link button (new post, weekly throwback) */
export function buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang }) {
  const code = normalizeLang(lang);
  const postRow = `
        <!-- Post link (styled rectangular treatment) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 36px;">
          <a href="${escapeHtml(postUrl)}" style="display:inline-block;padding:14px 24px;border-radius:8px;border:1px solid #1c1c20;background-color:#0f0f13;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:500;color:#e8e8ed;text-decoration:none;">${escapeHtml(postTitle)}</a>
        </td></tr>
`;
  return renderEmailDocument({
    lang: code,
    subject,
    preheader: `${message} — ${postTitle}`,
    message,
    extraRows: postRow + unsubscribeRows(unsubscribeUrl, code)
  });
}

/** Simple email without a post link (subscribe / unsubscribe confirmations) */
export function buildSimpleEmailHtml({ subject, message, unsubscribeUrl, lang }) {
  const code = normalizeLang(lang);
  return renderEmailDocument({
    lang: code,
    subject,
    preheader: `${message} — ${t("siteTitle", code)}`,
    message,
    extraRows: unsubscribeRows(unsubscribeUrl, code)
  });
}

/**
 * Plain-text alternative built from the same data as the HTML (never by
 * stripping the HTML), so it carries the post link and the unsubscribe link.
 */
export function buildPlainText({ message, postTitle, postUrl, unsubscribeUrl, lang }) {
  const code = normalizeLang(lang);
  const oneLine = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const blocks = [t("siteTitle", code), oneLine(message)];
  if (postUrl) blocks.push([oneLine(postTitle), String(postUrl)].filter(Boolean).join("\n"));
  if (unsubscribeUrl) {
    const colon = code === "fr" ? " :" : ":";
    blocks.push(`${t("dontWantEmails", code)} ${t("unsubscribeLinkText", code)}${colon} ${unsubscribeUrl}`);
  }
  return blocks.filter(Boolean).join("\n\n");
}

/* ── Send email via Resend API ── */
/*
 * Deliverability improvements:
 *   1. Plain-text alternative (multipart) — HTML-only emails are penalised by
 *      Gmail, Outlook, Yahoo, and most corporate filters.
 *   2. Reply-To header — missing reply-to is a spam signal.
 *   3. X-Entity-Ref-ID — unique per email, prevents unwanted conversation
 *      threading in Outlook and some webmail clients.
 *   4. Retry with exponential back-off — transient 429 / 5xx from Resend
 *      no longer silently lose the email.
 *   5. Resend "tags" — helps with tracking in the Resend dashboard.
 *   6. List-Unsubscribe + List-Unsubscribe-Post (RFC 8058 one-click); the
 *      POST arrives at the same /api/unsubscribe URL.
 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // 2s, 4s, 8s
const SEND_GAP_MS = 250; // pause between bulk sends to stay under the Resend rate limit

/** Send one email. Resolves true when Resend accepted it, false otherwise (never throws). */
export async function sendEmail({ to, subject, html, text, unsubscribeUrl, tag }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set. Skipping email send.");
    return false;
  }

  // Unique ID per message to prevent threading issues in Outlook / webmail
  const entityRefId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const emailHeaders = {
    "X-Entity-Ref-ID": entityRefId
  };
  if (unsubscribeUrl) {
    emailHeaders["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    emailHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const payload = {
    from: SENDER,
    reply_to: REPLY_TO,
    to: [to],
    subject,
    html,
    text,
    headers: emailHeaders,
    tags: tag ? [{ name: "category", value: tag }] : undefined
  };

  const fetchHeaders = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: fetchHeaders,
        body
      });

      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        console.log(`[email] Sent to ${maskEmail(to)} (id: ${data?.id || "unknown"})`);
        return true;
      }

      const respText = await resp.text().catch(() => "");

      // Retry on rate-limit (429) or server errors (5xx)
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[email] Resend ${resp.status} for ${maskEmail(to)}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(delay);
        continue;
      }

      console.error(`[email] Resend API error ${resp.status} for ${maskEmail(to)}:`, respText);
      return false;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[email] Network error for ${maskEmail(to)}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`, err?.message);
        await sleep(delay);
        continue;
      }
      console.error(`[email] Failed to send to ${maskEmail(to)} after ${MAX_RETRIES + 1} attempts:`, err?.message || err);
      return false;
    }
  }

  return false;
}

/* ── Bulk sending helpers ── */

const TITLE_TRANSLATION_BUDGET_MS = 90 * 1000;

/**
 * Post title per language. translate(lang) is called once per language other
 * than English (the language titles are written in); errors, empty results and
 * anything past the shared time budget fall back to the original title.
 * Posts with autoTranslateTitle === false always keep the original title.
 */
export async function resolvePostTitles(post, langs, translate, { budgetMs = TITLE_TRANSLATION_BUDGET_MS } = {}) {
  const original = String(post?.title ?? "");
  const codes = [...new Set(langs.map(normalizeLang))];
  const titles = new Map(codes.map(lang => [lang, original]));
  if (typeof translate !== "function" || post?.autoTranslateTitle === false) return titles;

  const deadline = Date.now() + budgetMs;
  for (const lang of codes) {
    if (lang === "en") continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.warn(`[email] Title translation budget used up; "${lang}" keeps the original title.`);
      continue;
    }
    try {
      const translated = await withTimeout(Promise.resolve().then(() => translate(lang)), remaining);
      const clean = typeof translated === "string" ? translated.replace(/\s+/g, " ").trim() : "";
      if (clean) titles.set(lang, clean);
    } catch (err) {
      console.warn(`[email] Title translation to "${lang}" failed; using the original title:`, err?.message || err);
    }
  }
  return titles;
}

/** Subject, HTML, plain text and unsubscribe URL of a post email for one subscriber */
function composePostEmail({ subjectKey, messageKey, email, lang, postTitle, postUrl }) {
  const code = normalizeLang(lang);
  const subject = t(subjectKey, code);
  const message = t(messageKey, code);
  const unsubscribeUrl = buildUnsubscribeUrl(email, code);
  return {
    subject,
    unsubscribeUrl,
    html: buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang: code }),
    text: buildPlainText({ message, postTitle, postUrl, unsubscribeUrl, lang: code })
  };
}

/** Send to every subscriber in turn; resolves { total, sent, failed } and never throws. */
async function deliverToSubscribers(subscribers, compose, tag) {
  const total = subscribers.length;
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set. Skipping ${total} "${tag}" email(s).`);
    return { total, sent: 0, failed: total };
  }

  let sent = 0;
  for (let i = 0; i < total; i++) {
    const sub = subscribers[i];
    try {
      if (await sendEmail({ to: sub.email, tag, ...compose(sub) })) sent++;
    } catch (err) {
      console.error(`[email] Could not send "${tag}" email to ${maskEmail(sub.email)}:`, err?.message || err);
    }

    // Small delay between sends to avoid rate-limiting
    if (i < total - 1) await sleep(SEND_GAP_MS);
  }
  return { total, sent, failed: total - sent };
}

async function findSubscribers(prisma) {
  return prisma.subscriber.findMany({
    select: { email: true, language: true },
    orderBy: { createdAt: "asc" }
  });
}

/* ── Send new post notification to all subscribers ── */
/*
 * options.titleFor(lang) → Promise<string>: optional per-language post title.
 * Resolves { total, sent, failed }. An EmailLog row is written only when at
 * least one email was delivered.
 */
export async function sendNewPostEmail(post, options = {}) {
  const prisma = options.prisma || getPrisma(); // tests pass a stub
  const subscribers = await findSubscribers(prisma);
  if (!subscribers.length) {
    console.log("[email] New post notification skipped: no subscribers.");
    return { total: 0, sent: 0, failed: 0 };
  }

  const postUrl = buildPostUrl(post.slug);
  const translate = typeof options.titleFor === "function" ? lang => options.titleFor(lang) : null;
  const titles = await resolvePostTitles(post, subscribers.map(sub => sub.language), translate);

  const result = await deliverToSubscribers(subscribers, sub => {
    const lang = normalizeLang(sub.language);
    return composePostEmail({
      subjectKey: "newPostTitle", messageKey: "newPostMessage",
      email: sub.email, lang, postTitle: titles.get(lang) ?? post.title, postUrl
    });
  }, "new_post");

  if (result.sent > 0) {
    try {
      await prisma.emailLog.create({
        data: { id: nanoid(), type: "NEW_POST", postId: post.id }
      });
    } catch (err) {
      console.error("[email] Could not write the NEW_POST email log:", err?.message || err);
    }
  }

  console.log(`[email] New post notification delivered to ${result.sent} of ${result.total} subscriber(s) (${result.failed} failed).`);
  return result;
}

/* ── Weekly throwback rotation ── */
/*
 * Posts rotate oldest → newest, always excluding the newest post. The tracker
 * stores "<postId>|<postDate ISO>|<createdAt ISO>" so that the rotation can
 * continue from the last-sent post's position even after that post was
 * deleted or re-dated. Older rows hold only the id and are still understood.
 */

function timeOf(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function comparePostOrder(a, b) {
  return (timeOf(a.postDate) - timeOf(b.postDate))
    || (timeOf(a.createdAt) - timeOf(b.createdAt))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function encodeThrowbackMarker(post) {
  return `${post.id}|${new Date(post.postDate).toISOString()}|${new Date(post.createdAt).toISOString()}`;
}

function parseThrowbackMarker(marker) {
  const [id, postDate, createdAt] = String(marker ?? "").split("|");
  if (!id) return null;
  if (postDate && createdAt && Number.isFinite(Date.parse(postDate)) && Number.isFinite(Date.parse(createdAt))) {
    return { id, postDate: new Date(postDate), createdAt: new Date(createdAt) };
  }
  return { id, postDate: null, createdAt: null };
}

/** Pick the next throwback post, or null when there are fewer than two posts. */
export function selectThrowbackPost(posts, lastSentMarker) {
  const sorted = [...posts].sort(comparePostOrder);
  if (sorted.length < 2) return null;
  const eligible = sorted.slice(0, -1); // Exclude the most recent post

  const last = parseThrowbackMarker(lastSentMarker);
  if (!last) return eligible[0];

  // Where the last-sent post stood when it was sent (legacy markers: where it stands now)
  const anchor = last.postDate ? last : sorted.find(p => p.id === last.id);
  if (!anchor) return eligible[0];

  return eligible.find(p => p.id !== last.id && comparePostOrder(p, anchor) > 0)
    || eligible.find(p => p.id !== last.id)
    || eligible[0];
}

/* ── Send weekly throwback email ── */
/*
 * options.titleFor(post, lang) → Promise<string>: optional per-language title.
 * Resolves { total, sent, failed, postId }; total is 0 when there was nothing
 * to send (no subscribers or fewer than two posts). The rotation advances and
 * an EmailLog row is written only when at least one email was delivered.
 * Never throws once sending has started. The once-a-day guard lives in
 * scheduler.js.
 */
export async function sendWeeklyThrowbackEmail(options = {}) {
  const prisma = options.prisma || getPrisma(); // tests pass a stub
  const subscribers = await findSubscribers(prisma);
  if (!subscribers.length) {
    console.log("[email] Weekly throwback skipped: no subscribers.");
    return { total: 0, sent: 0, failed: 0, postId: null };
  }

  const posts = await prisma.post.findMany({
    select: { id: true, slug: true, title: true, type: true, postDate: true, createdAt: true, autoTranslateTitle: true }
  });
  const tracker = await prisma.throwbackTracker.findUnique({ where: { id: 1 } });
  const post = selectThrowbackPost(posts, tracker?.lastSentPostId);
  if (!post) {
    console.log("[email] Not enough posts for weekly throwback.");
    return { total: 0, sent: 0, failed: 0, postId: null };
  }

  const postUrl = buildPostUrl(post.slug);
  const translate = typeof options.titleFor === "function" ? lang => options.titleFor(post, lang) : null;
  const titles = await resolvePostTitles(post, subscribers.map(sub => sub.language), translate);

  const result = await deliverToSubscribers(subscribers, sub => {
    const lang = normalizeLang(sub.language);
    return composePostEmail({
      subjectKey: "weeklyThrowbackTitle", messageKey: "weeklyThrowbackMessage",
      email: sub.email, lang, postTitle: titles.get(lang) ?? post.title, postUrl
    });
  }, "weekly_throwback");

  if (result.sent > 0) {
    // Advance the rotation (lastSentDate is owned by the scheduler's daily claim)
    try {
      const marker = encodeThrowbackMarker(post);
      await prisma.throwbackTracker.upsert({
        where: { id: 1 },
        update: { lastSentPostId: marker },
        create: { id: 1, lastSentPostId: marker }
      });
    } catch (err) {
      console.error("[email] Could not advance the throwback rotation:", err?.message || err);
    }

    try {
      await prisma.emailLog.create({
        data: { id: nanoid(), type: "WEEKLY_THROWBACK", postId: post.id }
      });
    } catch (err) {
      console.error("[email] Could not write the WEEKLY_THROWBACK email log:", err?.message || err);
    }
  }

  console.log(`[email] Weekly throwback "${post.title}" delivered to ${result.sent} of ${result.total} subscriber(s) (${result.failed} failed).`);
  return { ...result, postId: post.id };
}

/* ── Send subscribe confirmation email ── */
/** Resolves true when the email was delivered. */
export async function sendSubscribeConfirmationEmail({ email, language }) {
  const lang = normalizeLang(language);
  const subject = t("subscribedSubject", lang);
  const message = t("subscribedMessage", lang);
  const unsubscribeUrl = buildUnsubscribeUrl(email, lang);

  const html = buildSimpleEmailHtml({ subject, message, unsubscribeUrl, lang });
  const text = buildPlainText({ message, unsubscribeUrl, lang });
  const sent = await sendEmail({ to: email, subject, html, text, unsubscribeUrl, tag: "subscribe_confirmation" });
  if (sent) {
    console.log(`[email] Subscribe confirmation sent to ${maskEmail(email)}.`);
  }
  return sent;
}

/* ── Send unsubscribe confirmation email ── */
/** Resolves true when the email was delivered. */
export async function sendUnsubscribeConfirmationEmail({ email, language }) {
  const lang = normalizeLang(language);
  const subject = t("unsubscribedSubject", lang);
  const message = t("unsubscribedMessage", lang);

  const html = buildSimpleEmailHtml({ subject, message, lang });
  const text = buildPlainText({ message, lang });
  const sent = await sendEmail({ to: email, subject, html, text, tag: "unsubscribe_confirmation" });
  if (sent) {
    console.log(`[email] Unsubscribe confirmation sent to ${maskEmail(email)}.`);
  }
  return sent;
}
