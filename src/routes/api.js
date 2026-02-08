import { Router } from "express";
import { translateTextIfConfigured } from "../lib/translate.js";

const router = Router();

/*
  Optional translation endpoint.
  If TRANSLATE_API_URL is not set, translateTextIfConfigured should return the original text.
  This route must never crash the app if the translation service is down.
*/
router.post("/translate", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "");
    const targetLang = String(req.body?.targetLang ?? "").trim();

    if (!text || !targetLang) {
      return res.status(400).json({ translatedText: text, used: false });
    }

    const result = await translateTextIfConfigured({ text, targetLang });
    return res.json(result);
  } catch (err) {
    console.error("[api/translate] failed:", err?.message || err);
    return res.status(200).json({
      translatedText: String(req.body?.text ?? ""),
      used: false,
      error: "translation_unavailable"
    });
  }
});

export default router;
