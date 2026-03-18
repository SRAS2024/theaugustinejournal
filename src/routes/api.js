// src/routes/api.js
import { Router } from "express";
import { nanoid } from "nanoid";
import { getPrisma } from "../lib/db.js";
import { translateTextIfConfigured } from "../lib/translate.js";

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

export default router;
