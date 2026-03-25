// src/lib/email-service.js
// Email service using the Resend API via node-fetch
import { getPrisma } from "./db.js";
import { cathedralRingingSvg } from "./cathedral-svg.js";

const SENDER = "The Augustine Journal <notifications@theaugustinejournal.com>";
const SITE_URL = () => (process.env.SITE_URL || "https://theaugustinejournal.com").replace(/\/+$/, "");

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
    en: "Thank you for subscribing to The Augustine Journal",
    pt: "Obrigado por se inscrever no O Diário Agostiniano",
    es: "Gracias por suscribirte a El Diario Agustiniano",
    fr: "Merci de vous être abonné au Le Journal Augustinien",
    de: "Vielen Dank für Ihr Abonnement des Das Augustinische Journal",
    it: "Grazie per esserti iscritto a Il Giornale Agostiniano"
  },
  unsubscribedSubject: {
    en: "Unsubscribed", pt: "Inscrição Cancelada", es: "Suscripción Cancelada",
    fr: "Désabonné", de: "Abgemeldet", it: "Iscrizione Annullata"
  },
  unsubscribedMessage: {
    en: "We are sorry to see you go and would like to thank you for the time you've invested in us",
    pt: "Lamentamos vê-lo partir e gostaríamos de agradecer pelo tempo que investiu em nós",
    es: "Lamentamos verte partir y nos gustaría agradecerte por el tiempo que has invertido en nosotros",
    fr: "Nous sommes désolés de vous voir partir et nous tenons à vous remercier pour le temps que vous nous avez consacré",
    de: "Es tut uns leid, Sie gehen zu sehen, und wir möchten Ihnen für die Zeit danken, die Sie in uns investiert haben",
    it: "Ci dispiace vederti andare e vorremmo ringraziarti per il tempo che hai investito in noi"
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
  return `<!DOCTYPE html>
<html lang="${lang || "en"}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap');
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body, table, td { background-color: #0a0a0e !important; }
  </style>
  <!--[if mso]>
  <style>body,table,td{background:#0a0a0e !important;}</style>
  <![endif]-->
</head>
<body bgcolor="#0a0a0e" style="margin:0;padding:0;background-color:#0a0a0e;color:#e8e8ed;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;margin:0;padding:0;">
    <tr bgcolor="#0a0a0e">
      <td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">${t("siteTitle", lang)}</h1>
        </td></tr>

        <!-- Cathedral artwork (ringing bell) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 28px;">
          ${cathedralRingingSvg}
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap');
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body, table, td { background-color: #0a0a0e !important; }
  </style>
  <!--[if mso]>
  <style>body,table,td{background:#0a0a0e !important;}</style>
  <![endif]-->
</head>
<body bgcolor="#0a0a0e" style="margin:0;padding:0;background-color:#0a0a0e;color:#e8e8ed;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;margin:0;padding:0;">
    <tr bgcolor="#0a0a0e">
      <td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0e" style="background-color:#0a0a0e;max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">${t("siteTitle", lang)}</h1>
        </td></tr>

        <!-- Cathedral artwork (ringing bell) -->
        <tr bgcolor="#0a0a0e"><td align="center" bgcolor="#0a0a0e" style="background-color:#0a0a0e;padding:0 0 28px;">
          ${cathedralRingingSvg}
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
async function sendEmail({ to, subject, html, unsubscribeUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set. Skipping email send.");
    return false;
  }

  try {
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    const body = JSON.stringify({
      from: SENDER,
      to: [to],
      subject,
      html,
      headers: unsubscribeUrl ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      } : undefined
    });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[email] Resend API error ${resp.status}:`, text);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err?.message || err);
    return false;
  }
}

/* ── Send new post notification to all subscribers ── */
export async function sendNewPostEmail(post) {
  const prisma = getPrisma();
  const subscribers = await prisma.subscriber.findMany();
  if (!subscribers.length) return;

  const siteUrl = SITE_URL();
  const postUrl = `${siteUrl}/post/${post.slug}`;

  for (const sub of subscribers) {
    const lang = sub.language || "en";
    const subject = t("newPostTitle", lang);
    const message = t("newPostMessage", lang);
    const postTitle = post.title; // Title stays as-is; translation is done client-side
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(sub.email)}&lang=${lang}`;

    const html = buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang });
    await sendEmail({ to: sub.email, subject, html, unsubscribeUrl });
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

  for (const sub of subscribers) {
    const lang = sub.language || "en";
    const subject = t("weeklyThrowbackTitle", lang);
    const message = t("weeklyThrowbackMessage", lang);
    const postTitle = post.title;
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(sub.email)}&lang=${lang}`;

    const html = buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang });
    await sendEmail({ to: sub.email, subject, html, unsubscribeUrl });
  }

  // Update tracker
  await prisma.throwbackTracker.upsert({
    where: { id: 1 },
    update: { lastSentPostId: post.id },
    create: { id: 1, lastSentPostId: post.id }
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
  const sent = await sendEmail({ to: email, subject, html, unsubscribeUrl });
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
  const sent = await sendEmail({ to: email, subject, html });
  if (sent) {
    console.log(`[email] Unsubscribe confirmation sent to ${email}.`);
  }
}
