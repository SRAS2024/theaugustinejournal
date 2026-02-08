// src/routes/api.js
import { Router } from "express";
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

export default router;
