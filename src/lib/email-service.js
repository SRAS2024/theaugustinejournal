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
 * The emails are built to hold up in every mail app:
 *   - Table layout, 600px wide and fluid on phones. Outlook for Windows (Word)
 *     ignores max-width, so it gets a fixed 600px "ghost" table inside
 *     <!--[if mso]> comments.
 *   - Every colour is a solid hex value (Outlook drops rgba()), written as a
 *     bgcolor attribute and as an inline style on every coloured cell. Borders
 *     are 1px of padding around a cell, so they are coloured cells too.
 *   - Every text element carries its own colour, font, size and line height:
 *     the Gmail apps with non-Google accounts ignore <style> altogether.
 *   - Web fonts are an enhancement; Georgia and Arial stand in where they do
 *     not load, and Outlook is pointed at them with mso-font-alt.
 *   - Forced dark modes: the design is dark already, so "light dark" is
 *     declared (Apple Mail leaves it alone) and the colours are pinned again
 *     where apps repaint them: Gmail (a gradient of the same colour, which it
 *     does not invert, plus two blend layers that turn inverted text back) and
 *     Outlook.com / Outlook apps ([data-ogsc] / [data-ogsb]).
 *   - The artwork is transparent PNG at twice its displayed size, so it stays
 *     sharp and sits on any of the colours below without an edge.
 *
 * Every interpolated value goes through escapeHtml.
 */

/** The email palette: ivory on warm charcoal with dark purple accents, as on the site. */
const EMAIL_COLORS = Object.freeze({
  page: "#131211",       // warm charcoal behind the card (the site's ground)
  panel: "#1A1917",      // the card (cathedral and ornament PNGs are rendered for it)
  panelEdge: "#2B2926",  // the card's hairline edge
  button: "#211F1D",     // post link
  buttonEdge: "#3F3549", // post link edge (charcoal with a trace of purple)
  ivory: "#F1EBDD",      // site title, post title
  text: "#E2DBCB",       // message
  muted: "#A39C8D",      // footer (warm grey)
  link: "#CDC5B4",       // footer link
  purple: "#5B2D8E",     // accent line at the top of the card
  accent: "#A88BD4"      // ornament (drawn into ornament-email.png)
});

const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',Times,serif";
const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500&display=swap";

// Cells whose colour is pinned in dark modes (class "bg-<name>")
const FILLED = ["page", "panelEdge", "panel", "buttonEdge", "button", "purple"];
// Text colours restored in Outlook's dark mode (class "tx-<name>")
const TEXT_COLORS = ["ivory", "text", "muted", "link"];

/** Inline style for a text element: colour, font, size and line height always set */
function textStyle({ font, size, lineHeight, color, extra = "" }) {
  return `margin:0;font-family:${font};font-size:${size}px;line-height:${lineHeight}px;color:${EMAIL_COLORS[color]};mso-line-height-rule:exactly;${extra}`;
}

/** Opening <td> of a coloured cell: bgcolor, inline background and the pinning class */
function filledCell(name, { classes = "", style = "", attrs = "" } = {}) {
  const color = EMAIL_COLORS[name];
  return `<td align="center" bgcolor="${color}"${attrs} class="bg-${name}${classes ? ` ${classes}` : ""}" style="background-color:${color};${style}">`;
}

// Longest pair of last words (characters in both together) that noWidow joins. The message spans
// the card, 262px on a 320px phone; 22 characters of its 17px serif take at most about 225px
// (Georgia, Cyrillic), and every message in EMAIL_STRINGS stays within it.
const NO_WIDOW_MAX = 22;

/**
 * Joins the last two words with a no-break space so a phone never leaves one word alone on the
 * last line. Only a short pair is joined: a long one could not wrap and would push the card wider
 * than a narrow phone. Not used on post titles, which can be any length (see postButtonRow).
 */
function noWidow(text) {
  const value = String(text ?? "");
  const space = value.lastIndexOf(" ");
  if (space <= 0) return value;
  const previous = value.slice(value.lastIndexOf(" ", space - 1) + 1, space);
  const last = value.slice(space + 1);
  if (!previous || !last || previous.length + last.length > NO_WIDOW_MAX) return value;
  return `${value.slice(0, space)}\u00a0${last}`;
}

/** Gmail's dark mode inverts text; these two blend layers invert it back (Gmail only, see GMAIL_CSS). */
function keepTextColor(html) {
  return `<div class="gm-screen"><div class="gm-diff">${html}</div></div>`;
}

/*
 * <style> blocks. Gmail drops a whole block when it meets something it does
 * not support, so the Gmail rules (u + .body is Gmail's own wrapper) and the
 * mobile sizes stay apart from the attribute selectors used by other apps.
 */
const GMAIL_CSS = [
  "body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}",
  "table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}",
  "img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}",
  `u + .body{background-image:linear-gradient(${EMAIL_COLORS.page},${EMAIL_COLORS.page})!important;}`,
  "u + .body .gm-screen{background:#000000;mix-blend-mode:screen;}",
  "u + .body .gm-diff{background:#000000;mix-blend-mode:difference;}",
  ...FILLED.map(name => `u + .body .bg-${name}{background-image:linear-gradient(${EMAIL_COLORS[name]},${EMAIL_COLORS[name]})!important;}`),
  "@media screen and (max-width:520px){",
  ".pad-page{padding:24px 12px 32px!important;}",
  ".pad-panel{padding:0 22px 38px!important;}",
  ".pad-top{padding:38px 0 20px!important;}",
  ".t-title{font-size:26px!important;line-height:32px!important;}",
  ".t-message{font-size:17px!important;line-height:28px!important;}",
  "}",
  // Narrow phones (320-374px, e.g. 360px Android): less padding in the card and the post button,
  // so a long word in a post title ("Auferstehungsverheißung", "достопримечательностях") fits whole
  // in Cormorant and Georgia, and from 360px also in Gmail for Android's Noto Serif. From 375px up
  // the email looks exactly as above.
  "@media screen and (max-width:374px){",
  ".pad-panel{padding:0 16px 38px!important;}",
  ".pad-button{padding:14px!important;}",
  "}"
].join("\n");

// Apple Mail, Outlook.com and the Outlook apps, Samsung Email: colour scheme, auto-links, dark-mode repaints
const DARK_MODE_CSS = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark;}",
  "a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}",
  "#MessageViewBody a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}",
  // Outlook marks what it repainted with data-ogsc / data-ogsb: on the element itself or on a parent
  ...TEXT_COLORS.map(name => `[data-ogsc] .tx-${name},.tx-${name}[data-ogsc]{color:${EMAIL_COLORS[name]}!important;}`),
  ...FILLED.map(name => `[data-ogsb] .bg-${name},.bg-${name}[data-ogsb]{background-color:${EMAIL_COLORS[name]}!important;}`),
  "@media (prefers-color-scheme:dark){",
  ...TEXT_COLORS.map(name => `.tx-${name}{color:${EMAIL_COLORS[name]}!important;}`),
  ...FILLED.map(name => `.bg-${name}{background-color:${EMAIL_COLORS[name]}!important;}`),
  "}"
].join("\n");

// Outlook for Windows: Georgia / Arial instead of Times New Roman for fonts it lacks
const OUTLOOK_CSS = [
  "@font-face{font-family:'Cormorant Garamond';mso-font-alt:Georgia;}",
  "@font-face{font-family:Inter;mso-font-alt:Arial;}",
  ".f-serif{font-family:Georgia,'Times New Roman',serif!important;}",
  ".f-sans{font-family:Arial,Helvetica,sans-serif!important;}"
].join("\n");

/** Unsubscribe line under the card (empty when there is no unsubscribe URL) */
function footerRow(unsubscribeUrl, lang) {
  if (!unsubscribeUrl) return "";
  const small = { font: SANS, size: 12, lineHeight: 19 };
  const link = `<a href="${escapeHtml(unsubscribeUrl)}" class="f-sans tx-link" style="${textStyle({ ...small, color: "link", extra: "text-decoration:underline;white-space:nowrap;" })}">${escapeHtml(t("unsubscribeLinkText", lang))}</a>`;
  return `
            <!-- Unsubscribe -->
            <tr><td align="center" style="padding:26px 20px 0;">
              ${keepTextColor(`<p class="f-sans tx-muted" style="${textStyle({ ...small, color: "muted", extra: "letter-spacing:0.2px;" })}">${escapeHtml(t("dontWantEmails", lang))} ${link}</p>`)}
            </td></tr>`;
}

/**
 * Post link: a bordered button that Outlook draws square and everything else rounds. The button
 * is only as wide as its title, so the title is never joined by noWidow, and a word too long for
 * the phone (a German compound, say) breaks instead of widening the card (word-break:break-word
 * is the one that also narrows the button; Outlook for Windows ignores both and stays 600px).
 * Below 375px the button and the card have less padding (pad-button, pad-panel), so words of up to
 * about 23 letters fit whole on a 320px phone in Cormorant and Georgia (Noto Serif, which Gmail for
 * Android uses, is wider: there such words fit from 360px and may break at 320px).
 */
function postButtonRow(postTitle, postUrl) {
  return `
                  <!-- Post link -->
                  <tr><td align="center" style="padding:0;">
                    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>${filledCell("buttonEdge", { style: "padding:1px;border-radius:9px;" })}
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>${filledCell("button", { style: "border-radius:8px;mso-padding-alt:14px 28px;" })}
                            ${keepTextColor(`<a href="${escapeHtml(postUrl)}" class="f-serif tx-ivory pad-button" style="${textStyle({ font: SERIF, size: 19, lineHeight: 26, color: "ivory", extra: "display:inline-block;padding:14px 28px;font-weight:500;letter-spacing:0.2px;text-decoration:none;overflow-wrap:break-word;word-break:break-word;" })}">${escapeHtml(postTitle)}</a>`)}
                          </td></tr>
                        </table>
                      </td></tr>
                    </table>
                  </td></tr>`;
}

/** Full email document: the card with title, cathedral, ornament, message and button, then the footer */
function renderEmailDocument({ lang, subject, preheader, message, button = "", footer = "" }) {
  const icons = `${SITE_URL()}/public/icons`;
  // Fine charcoal grain around the card, as on the site. An HTML attribute, not CSS url(): Gmail has
  // dropped whole style attributes that contain url(). Flat charcoal wherever it is not shown.
  const grain = ` background="${escapeHtml(`${icons}/grain-email.png`)}"`;
  // The cathedral is fluid up to its 260px (width:100%;max-width:260px), not 260px capped at 100%:
  // a blocked or failed image keeps its box, which must never push a 320px phone sideways.
  // Outlook for Windows sizes it from width="260".
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <!--[if !mso]><!--><link rel="stylesheet" href="${FONTS_CSS}"><!--<![endif]-->
  <style>
${GMAIL_CSS}
  </style>
  <style>
${DARK_MODE_CSS}
  </style>
  <!--[if mso]><style>
${OUTLOOK_CSS}
  </style><![endif]-->
</head>
<body class="body" bgcolor="${EMAIL_COLORS.page}" style="margin:0;padding:0;width:100%;background-color:${EMAIL_COLORS.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div role="article" aria-roledescription="email" aria-label="${escapeHtml(subject)}" lang="${escapeHtml(lang)}" dir="ltr">
  <!-- Preheader: shown in the inbox preview, hidden in the message -->
  <div style="display:none;mso-hide:all;font-family:${SANS};font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${EMAIL_COLORS.page};">${escapeHtml(preheader)}${"&#847; &zwnj; &nbsp; ".repeat(40)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.page}" class="bg-page" style="width:100%;background-color:${EMAIL_COLORS.page};">
    <tr>${filledCell("page", { classes: "pad-page", style: "padding:40px 16px 44px;", attrs: grain })}
      <!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
        <tr>${filledCell("panelEdge", { style: "padding:1px;border-radius:12px;" })}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${filledCell("panel", { classes: "pad-panel", style: "padding:0 36px 44px;border-radius:11px;" })}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Accent mark hanging from the top edge -->
                <tr><td align="center" style="padding:0;">
                  <table role="presentation" align="center" width="56" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${filledCell("purple", { style: "height:2px;font-size:2px;line-height:2px;mso-line-height-rule:exactly;" })}&nbsp;</td></tr></table>
                </td></tr>
                <!-- Site title -->
                <tr><td align="center" class="pad-top" style="padding:44px 0 22px;">
                  ${keepTextColor(`<h1 class="f-serif tx-ivory t-title" style="${textStyle({ font: SERIF, size: 28, lineHeight: 34, color: "ivory", extra: "font-weight:500;letter-spacing:0.6px;" })}">${escapeHtml(t("siteTitle", lang))}</h1>`)}
                </td></tr>
                <!-- Cathedral (PNG: Gmail and Outlook do not show SVG images) -->
                <tr><td align="center" style="padding:0 0 24px;">
                  <img src="${escapeHtml(`${icons}/cathedral-email-ivory.png`)}" alt="${escapeHtml(t("cathedralAlt", lang))}" width="260" height="140" class="f-serif" style="display:block;margin:0 auto;width:100%;max-width:260px;height:auto;border:0;outline:none;text-decoration:none;text-align:center;font-family:${SERIF};font-size:14px;line-height:20px;font-style:italic;color:${EMAIL_COLORS.muted};">
                </td></tr>
                <!-- Ornament -->
                <tr><td align="center" style="padding:0 0 24px;">
                  <img src="${escapeHtml(`${icons}/ornament-email.png`)}" alt="" width="160" height="12" style="display:block;margin:0 auto;width:160px;height:12px;border:0;outline:none;text-decoration:none;">
                </td></tr>
                <!-- Message -->
                <tr><td align="center" style="padding:0${button ? " 0 30px" : ""};">
                  ${keepTextColor(`<p class="f-serif tx-text t-message" style="${textStyle({ font: SERIF, size: 18, lineHeight: 29, color: "text" })}">${escapeHtml(noWidow(message))}</p>`)}
                </td></tr>${button}
              </table>
            </td></tr>
          </table>
        </td></tr>${footer}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
  </div>
</body>
</html>`;
}

/** Email with a post link button (new post, weekly throwback) */
export function buildEmailHtml({ subject, message, postTitle, postUrl, unsubscribeUrl, lang }) {
  const code = normalizeLang(lang);
  return renderEmailDocument({
    lang: code,
    subject,
    preheader: `${message} — ${postTitle}`,
    message,
    button: postButtonRow(postTitle, postUrl),
    footer: footerRow(unsubscribeUrl, code)
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
    footer: footerRow(unsubscribeUrl, code)
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
