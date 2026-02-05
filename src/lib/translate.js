import fetch from "node-fetch";

export async function translateTextIfConfigured({ text, targetLang }) {
  const baseUrl = process.env.TRANSLATE_API_URL;
  if (!baseUrl) return { translatedText: text, used: false };

  const apiKey = process.env.TRANSLATE_API_KEY || "";
  const url = new URL("/translate", baseUrl).toString();

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      })
    });

    if (!resp.ok) {
      return { translatedText: text, used: false };
    }

    const data = await resp.json();
    const translated = data?.translatedText;
    if (!translated || typeof translated !== "string") return { translatedText: text, used: false };
    return { translatedText: translated, used: true };
  } catch {
    return { translatedText: text, used: false };
  }
}
