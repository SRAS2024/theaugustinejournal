// src/routes/api.js
import { Router } from "express";
import { nanoid } from "nanoid";
import { getPrisma } from "../lib/db.js";
import { translateTextIfConfigured } from "../lib/translate.js";
import { sendSubscribeConfirmationEmail, sendUnsubscribeConfirmationEmail } from "../lib/email-service.js";

const router = Router();

router.post("/translate", async (req, res) => {
  const text = String(req.body?.text ?? "");
  const targetLang = String(req.body?.targetLang ?? "").trim();

  if (!text || !targetLang) {
    return res.json({ translatedText: text, used: false });
  }

  try {
    const result = await translateTextIfConfigured({ text, targetLang });
    return res.json(result);
  } catch (err) {
    console.error("[api/translate] failed:", err?.message || err);
    return res.json({ translatedText: text, used: false });
  }
});

router.post("/posts/:id/share", async (req, res) => {
  try {
    const prisma = getPrisma();
    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true }
    });
    return res.json({ success: true, shareCount: post.shareCount });
  } catch (err) {
    console.error("[api/share] failed:", err?.message || err);
    return res.json({ success: false });
  }
});

/* ── Subscribe ── */
router.post("/subscribe", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const language = String(req.body?.language ?? "en").trim();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ success: false, error: "Invalid email" });
    }

    const prisma = getPrisma();

    // Check for duplicate
    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      return res.json({ success: false, duplicate: true });
    }

    await prisma.subscriber.create({
      data: { id: nanoid(), email, language }
    });

    // Send confirmation email (fire-and-forget)
    sendSubscribeConfirmationEmail({ email, language }).catch(err => {
      console.error("[api/subscribe] confirmation email failed:", err?.message || err);
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[api/subscribe] failed:", err?.message || err);
    return res.json({ success: false, error: "Something went wrong." });
  }
});

/* ── Unsubscribe (GET for email link clicks) ── */
router.get("/unsubscribe", async (req, res) => {
  try {
    const email = String(req.query?.email ?? "").trim().toLowerCase();
    const lang = String(req.query?.lang ?? "en").trim();

    if (!email) {
      return res.status(400).send("Missing email.");
    }

    const prisma = getPrisma();
    let wasSubscribed = false;
    try {
      await prisma.subscriber.delete({ where: { email } });
      wasSubscribed = true;
    } catch {
      // Already unsubscribed or doesn't exist — that's fine
    }

    // Send unsubscribe confirmation email (fire-and-forget)
    if (wasSubscribed) {
      sendUnsubscribeConfirmationEmail({ email, language: lang }).catch(err => {
        console.error("[api/unsubscribe] confirmation email failed:", err?.message || err);
      });
    }

    // i18n site titles
    const siteTitles = {
      en: "The Augustine Journal", pt: "O Diário Agostiniano", es: "El Diario Agustiniano",
      fr: "Le Journal Augustinien", de: "Das Augustinische Journal", it: "Il Giornale Agostiniano"
    };
    const siteTitle = siteTitles[lang] || siteTitles.en;

    // i18n messages for the unsubscribe confirmation page
    const messages = {
      en: { title: "Unsubscribed", message: `You have been successfully unsubscribed from ${siteTitle} emails.` },
      pt: { title: "Inscrição Cancelada", message: `Sua inscrição nos emails do ${siteTitle} foi cancelada com sucesso.` },
      es: { title: "Suscripción Cancelada", message: `Se ha cancelado exitosamente su suscripción a los correos de ${siteTitle}.` },
      fr: { title: "Désabonné", message: `Vous avez été désabonné avec succès des emails de ${siteTitle}.` },
      de: { title: "Abgemeldet", message: `Sie wurden erfolgreich von den E-Mails des ${siteTitle} abgemeldet.` },
      it: { title: "Iscrizione Annullata", message: `La tua iscrizione alle email di ${siteTitle} è stata annullata con successo.` }
    };

    const m = messages[lang] || messages.en;

    res.send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${m.title} | ${siteTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    body { margin:0; background:#0a0a0e; color:#e8e8ed; font-family:'Cormorant Garamond',Georgia,serif; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
    .box { text-align:center; max-width:480px; }
    h1 { font-size:28px; font-weight:500; margin:0 0 16px; }
    p { font-size:17px; line-height:1.7; color:rgba(232,232,237,0.85); margin:0 0 24px; }
    a { display:inline-block; padding:10px 20px; border-radius:8px; border:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.02); color:#e8e8ed; text-decoration:none; font-family:'Inter',sans-serif; font-size:13px; transition:border-color 0.2s; }
    a:hover { border-color:rgba(91,45,142,0.2); background:rgba(91,45,142,0.07); }
  </style>
</head>
<body>
  <div class="box">
    <h1>${m.title}</h1>
    <p>${m.message}</p>
    <a href="/">${siteTitle}</a>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error("[api/unsubscribe] failed:", err?.message || err);
    res.status(500).send("Something went wrong.");
  }
});

export default router;
