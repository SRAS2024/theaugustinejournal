import { Router } from "express";
import { translateTextIfConfigured } from "../lib/translate.js";

const router = Router();

/*
  This is optional. If TRANSLATE_API_URL is not set, it returns original text.
  Client calls it to translate UI strings and post text if desired.
*/
router.post("/translate", async (req, res) => {
  const text = String(req.body?.text || "");
  const targetLang = String(req.body?.targetLang || "").trim();

  if (!text || !targetLang) {
    return res.status(400).json({ translatedText: text, used: false });
  }

  const result = await translateTextIfConfigured({ text, targetLang });
  res.json(result);
});

export default router;
