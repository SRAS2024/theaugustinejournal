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
  }
};

function t(key, lang) {
  const map = EMAIL_STRINGS[key];
  return (map && (map[lang] || map.en)) || "";
}

/* ── Build styled HTML email ── */
function buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang }) {
  return `<!DOCTYPE html>
<html lang="${lang || "en"}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background:#0a0a0e;color:#e8e8ed;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0e;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Title: The Augustine Journal -->
        <tr><td align="center" style="padding:0 0 24px;">
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;letter-spacing:0.5px;color:#e8e8ed;">The Augustine Journal</h1>
        </td></tr>

        <!-- Cathedral artwork (ringing bell) -->
        <tr><td align="center" style="padding:0 0 28px;">
          ${cathedralRingingSvg}
        </td></tr>

        <!-- Decorative rule -->
        <tr><td align="center" style="padding:0 0 24px;">
          <div style="width:200px;height:1px;background:linear-gradient(to right,transparent,rgba(168,139,212,0.18) 20%,rgba(168,139,212,0.18) 80%,transparent);"></div>
        </td></tr>

        <!-- Message -->
        <tr><td align="center" style="padding:0 0 24px;">
          <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;line-height:1.7;color:rgba(232,232,237,0.88);">${message}</p>
        </td></tr>

        <!-- Post link (styled rectangular treatment) -->
        <tr><td align="center" style="padding:0 0 36px;">
          <a href="${postUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:500;color:#e8e8ed;text-decoration:none;">${postTitle}</a>
        </td></tr>

        <!-- Decorative rule -->
        <tr><td align="center" style="padding:0 0 20px;">
          <div style="width:100%;height:1px;background:rgba(255,255,255,0.07);"></div>
        </td></tr>

        <!-- Unsubscribe -->
        <tr><td align="center" style="padding:0;">
          <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:rgba(138,138,153,0.6);letter-spacing:0.3px;">
            ${t("dontWantEmails", lang)} <a href="${unsubscribeUrl}" style="color:rgba(138,138,153,0.6);text-decoration:underline;">${t("unsubscribeLinkText", lang)}</a>
          </p>
        </td></tr>

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
