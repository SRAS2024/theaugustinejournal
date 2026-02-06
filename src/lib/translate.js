export async function translateTextIfConfigured({ text, targetLang }) {
  // Translation is handled client-side via the built-in i18n dictionary
  // and Google Translate widget. No external server-side API needed.
  return { translatedText: text, used: false };
}
