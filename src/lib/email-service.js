// src/lib/email-service.js
// Email service using the Resend API via node-fetch
import { getPrisma } from "./db.js";

const SENDER = "The Augustine Journal <notifications@theaugustinejournal.com>";
const REPLY_TO = "The Augustine Journal <notifications@theaugustinejournal.com>";
const SITE_URL = () => (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");

/* ── Helpers ── */

/** Strip HTML tags and decode common entities to produce a plain-text version */
function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sleep helper for rate-limiting and retry backoff */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── i18n strings for emails ── */
const EMAIL_STRINGS = {
  weeklyThrowbackTitle: {
    en: "Weekly Throwback", pt: "Retrospectiva Semanal", es: "Retrospectiva Semanal",
    fr: "Rétrospective Hebdomadaire", de: "Wöchentlicher Rückblick", it: "Retrospettiva Settimanale"
  },
  weeklyThrowbackMessage: {
    en: "This is your weekly throwback. Check out our post.",
    pt: "Esta é sua retrospectiva semanal. Confira nossa publicação.",
    es: "Esta es tu retrospectiva semanal. Echa un vistazo a nuestra publicación.",
    fr: "Voici votre rétrospective hebdomadaire. Découvrez notre publication.",
    de: "Dies ist Ihr wöchentlicher Rückblick. Schauen Sie sich unseren Beitrag an.",
    it: "Questa è la tua retrospettiva settimanale. Dai un'occhiata al nostro articolo."
  },
  newPostTitle: {
    en: "Our Latest Post", pt: "Nossa Última Publicação", es: "Nuestra Última Publicación",
    fr: "Notre Dernière Publication", de: "Unser Neuester Beitrag", it: "Il Nostro Ultimo Articolo"
  },
  newPostMessage: {
    en: "Check out our newest post.",
    pt: "Confira nossa publicação mais recente.",
    es: "Echa un vistazo a nuestra publicación más reciente.",
    fr: "Découvrez notre toute dernière publication.",
    de: "Schauen Sie sich unseren neuesten Beitrag an.",
    it: "Dai un'occhiata al nostro ultimo articolo."
  },
  unsubscribeText: {
    en: "Don't want to receive emails? Unsubscribe.",
    pt: "Não quer receber emails? Cancelar inscrição.",
    es: "¿No quieres recibir correos? Cancelar suscripción.",
    fr: "Vous ne souhaitez plus recevoir d'emails\u00a0? Se désabonner.",
    de: "Sie möchten keine E-Mails mehr erhalten? Abmelden.",
    it: "Non vuoi ricevere email? Annulla iscrizione."
  },
  unsubscribeLinkText: {
    en: "Unsubscribe", pt: "Cancelar inscrição", es: "Cancelar suscripción",
    fr: "Se désabonner", de: "Abmelden", it: "Annulla iscrizione"
  },
  dontWantEmails: {
    en: "Don't want to receive emails?", pt: "Não quer receber emails?",
    es: "¿No quieres recibir correos?", fr: "Vous ne souhaitez plus recevoir d'emails\u00a0?",
    de: "Sie möchten keine E-Mails mehr erhalten?", it: "Non vuoi ricevere email?"
  },
  siteTitle: {
    en: "The Augustine Journal", pt: "O Diário Agostiniano", es: "El Diario Agustiniano",
    fr: "Le Journal Augustinien", de: "Das Augustinische Journal", it: "Il Giornale Agostiniano"
  },
  subscribedSubject: {
    en: "Subscribed", pt: "Inscrito", es: "Suscrito",
    fr: "Abonné", de: "Abonniert", it: "Iscritto"
  },
  subscribedMessage: {
    en: "Thank you for subscribing to The Augustine Journal!",
    pt: "Obrigado por se inscrever no O Diário Agostiniano!",
    es: "Gracias por suscribirte a El Diario Agustiniano!",
    fr: "Merci de vous être abonné au Le Journal Augustinien!",
    de: "Vielen Dank für Ihr Abonnement des Das Augustinische Journal!",
    it: "Grazie per esserti iscritto a Il Giornale Agostiniano!"
  },
  unsubscribedSubject: {
    en: "Unsubscribed", pt: "Inscrição Cancelada", es: "Suscripción Cancelada",
    fr: "Désabonné", de: "Abgemeldet", it: "Iscrizione Annullata"
  },
  unsubscribedMessage: {
    en: "We are sorry to see you go and would like to thank you for the time you've invested in us!",
    pt: "Lamentamos vê-lo partir e gostaríamos de agradecer pelo tempo que investiu em nós!",
    es: "Lamentamos verte partir y nos gustaría agradecerte por el tiempo que has invertido en nosotros!",
    fr: "Nous sommes désolés de vous voir partir et nous tenons à vous remercier pour le temps que vous nous avez consacré!",
    de: "Es tut uns leid, Sie gehen zu sehen, und wir möchten Ihnen für die Zeit danken, die Sie in uns investiert haben!",
    it: "Ci dispiace vederti andare e vorremmo ringraziarti per il tempo che hai investito in noi!"
  }
};

function t(key, lang) {
  const map = EMAIL_STRINGS[key];
  return (map && (map[lang] || map.en)) || "";
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
 */
function buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang }) {
  const preheader = `${message} — ${postTitle}`;
  const cathedralImgUrl = `${SITE_URL()}/public/icons/cathedral-email.svg`;
  return `<!DOCTYPE html>
<html lang="${lang || "en"}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${subject}</title>
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
  <div style="display:none;font-size:1px;color:#0a0a0e;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}${"&#847; &zwnj; &nbsp; ".repeat(30)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;margin:0;padding:0;">
    <tr bgcolor="#0a0a0e">
      <td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">${t("siteTitle", lang)}</h1>
        </td></tr>

        <!-- Cathedral artwork (hosted image — Gmail strips inline SVG) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 28px;">
          <img src="${cathedralImgUrl}" alt="Cathedral" width="260" height="140" style="display:block;margin:0 auto;width:260px;max-width:100%;height:auto;border:0;" />
        </td></tr>

        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="200" style="margin:0 auto;"><tr><td style="height:1px;background-color:#2b1c3e;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Message -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;line-height:1.7;color:#ccccd1;">${message}</p>
        </td></tr>

        <!-- Post link (styled rectangular treatment) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 36px;">
          <a href="${postUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;border:1px solid #1c1c20;background-color:#0f0f13;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:500;color:#e8e8ed;text-decoration:none;">${postTitle}</a>
        </td></tr>

        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;"><tr><td style="height:1px;background-color:#1c1c20;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Unsubscribe -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0;">
          <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#5c5c67;letter-spacing:0.3px;">
            ${t("dontWantEmails", lang)} <a href="${unsubscribeUrl}" style="color:#5c5c67;text-decoration:underline;">${t("unsubscribeLinkText", lang)}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── Build simple HTML email (no post link) ── */
function buildSimpleEmailHtml({ subject, message, unsubscribeUrl, lang }) {
  const preheader = `${message} — ${t("siteTitle", lang)}`;
  const cathedralImgUrl = `${SITE_URL()}/public/icons/cathedral-email.svg`;
  const unsubscribeSection = unsubscribeUrl ? `
        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;"><tr><td style="height:1px;background-color:#1c1c20;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Unsubscribe -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0;">
          <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#5c5c67;letter-spacing:0.3px;">
            ${t("dontWantEmails", lang)} <a href="${unsubscribeUrl}" style="color:#5c5c67;text-decoration:underline;">${t("unsubscribeLinkText", lang)}</a>
          </p>
        </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="${lang || "en"}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${subject}</title>
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
  <div style="display:none;font-size:1px;color:#0a0a0e;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}${"&#847; &zwnj; &nbsp; ".repeat(30)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;margin:0;padding:0;">
    <tr bgcolor="#0a0a0e">
      <td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">${t("siteTitle", lang)}</h1>
        </td></tr>

        <!-- Cathedral artwork (hosted image — Gmail strips inline SVG) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 28px;">
          <img src="${cathedralImgUrl}" alt="Cathedral" width="260" height="140" style="display:block;margin:0 auto;width:260px;max-width:100%;height:auto;border:0;" />
        </td></tr>

        <!-- Decorative rule -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="200" style="margin:0 auto;"><tr><td style="height:1px;background-color:#2b1c3e;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- Message -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;line-height:1.7;color:#ccccd1;">${message}</p>
        </td></tr>
${unsubscribeSection}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // 2s, 4s, 8s

async function sendEmail({ to, subject, html, unsubscribeUrl, tag }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set. Skipping email send.");
    return false;
  }

  // Build plain-text version from the HTML for multipart/alternative
  const text = htmlToPlainText(html);

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
        console.log(`[email] Sent to ${to} (id: ${data?.id || "unknown"})`);
        return true;
      }

      const respText = await resp.text();

      // Retry on rate-limit (429) or server errors (5xx)
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[email] Resend ${resp.status} for ${to}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(delay);
        continue;
      }

      console.error(`[email] Resend API error ${resp.status} for ${to}:`, respText);
      return false;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[email] Network error for ${to}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`, err?.message);
        await sleep(delay);
        continue;
      }
      console.error(`[email] Failed to send to ${to} after ${MAX_RETRIES + 1} attempts:`, err?.message || err);
      return false;
    }
  }

  return false;
}

/* ── Send new post notification to all subscribers ── */
export async function sendNewPostEmail(post) {
  const prisma = getPrisma();
  const subscribers = await prisma.subscriber.findMany();
  if (!subscribers.length) return;

  const siteUrl = SITE_URL();
  const postUrl = `${siteUrl}/post/${post.slug}`;

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];
    const lang = sub.language || "en";
    const subject = t("newPostTitle", lang);
    const message = t("newPostMessage", lang);
    const postTitle = post.title; // Title stays as-is; translation is done client-side
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(sub.email)}&lang=${lang}`;

    const html = buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang });
    await sendEmail({ to: sub.email, subject, html, unsubscribeUrl, tag: "new_post" });

    // Small delay between sends to avoid rate-limiting
    if (i < subscribers.length - 1) await sleep(250);
  }

  // Log the email
  const { nanoid } = await import("nanoid");
  await prisma.emailLog.create({
    data: { id: nanoid(), type: "NEW_POST", postId: post.id }
  });

  console.log(`[email] New post notification sent to ${subscribers.length} subscriber(s).`);
}

/* ── Send weekly throwback email ── */
export async function sendWeeklyThrowbackEmail() {
  const prisma = getPrisma();
  const subscribers = await prisma.subscriber.findMany();
  if (!subscribers.length) return;

  // Get all posts sorted by date ascending (oldest first)
  const allPosts = await prisma.post.findMany({
    orderBy: [{ postDate: "asc" }, { createdAt: "asc" }]
  });

  if (allPosts.length < 2) {
    console.log("[email] Not enough posts for weekly throwback.");
    return;
  }

  // Determine which post to send (rotate through all except the latest)
  const eligiblePosts = allPosts.slice(0, -1); // Exclude the most recent post
  let tracker = await prisma.throwbackTracker.findUnique({ where: { id: 1 } });

  let nextPostIndex = 0;
  if (tracker && tracker.lastSentPostId) {
    const lastIdx = eligiblePosts.findIndex(p => p.id === tracker.lastSentPostId);
    if (lastIdx >= 0) {
      nextPostIndex = (lastIdx + 1) % eligiblePosts.length;
    }
  }

  const post = eligiblePosts[nextPostIndex];
  const siteUrl = SITE_URL();
  const postUrl = `${siteUrl}/post/${post.slug}`;

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];
    const lang = sub.language || "en";
    const subject = t("weeklyThrowbackTitle", lang);
    const message = t("weeklyThrowbackMessage", lang);
    const postTitle = post.title;
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(sub.email)}&lang=${lang}`;

    const html = buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang });
    await sendEmail({ to: sub.email, subject, html, unsubscribeUrl, tag: "weekly_throwback" });

    // Small delay between sends to avoid rate-limiting
    if (i < subscribers.length - 1) await sleep(250);
  }

  // Update tracker (persist both the post rotation and the send date)
  const sentDate = new Date().toISOString().slice(0, 10);
  await prisma.throwbackTracker.upsert({
    where: { id: 1 },
    update: { lastSentPostId: post.id, lastSentDate: sentDate },
    create: { id: 1, lastSentPostId: post.id, lastSentDate: sentDate }
  });

  // Log the email
  const { nanoid } = await import("nanoid");
  await prisma.emailLog.create({
    data: { id: nanoid(), type: "WEEKLY_THROWBACK", postId: post.id }
  });

  console.log(`[email] Weekly throwback sent to ${subscribers.length} subscriber(s): "${post.title}"`);
}

/* ── Send subscribe confirmation email ── */
export async function sendSubscribeConfirmationEmail({ email, language }) {
  const lang = language || "en";
  const siteUrl = SITE_URL();
  const subject = t("subscribedSubject", lang);
  const message = t("subscribedMessage", lang);
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&lang=${lang}`;

  const html = buildSimpleEmailHtml({ subject, message, unsubscribeUrl, lang });
  const sent = await sendEmail({ to: email, subject, html, unsubscribeUrl, tag: "subscribe_confirmation" });
  if (sent) {
    console.log(`[email] Subscribe confirmation sent to ${email}.`);
  }
}

/* ── Send unsubscribe confirmation email ── */
export async function sendUnsubscribeConfirmationEmail({ email, language }) {
  const lang = language || "en";
  const subject = t("unsubscribedSubject", lang);
  const message = t("unsubscribedMessage", lang);

  const html = buildSimpleEmailHtml({ subject, message, lang });
  const sent = await sendEmail({ to: email, subject, html, tag: "unsubscribe_confirmation" });
  if (sent) {
    console.log(`[email] Unsubscribe confirmation sent to ${email}.`);
  }
}
