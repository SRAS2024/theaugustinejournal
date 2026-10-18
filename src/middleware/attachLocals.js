import { SITE_LANGS } from "../lib/languages.js";

/**
 * Parse the Accept-Language header and return the best matching supported
 * language code.  Falls back to "en" when nothing matches.
 */
function detectLangFromHeader(acceptLanguage) {
  if (!acceptLanguage) return "en";

  const parts = String(acceptLanguage)
    .split(",")
    .map((part, index) => {
      const [lang, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { lang: lang.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q, index };
    })
    .filter((p) => p.lang && p.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { lang } of parts) {
    const base = lang.split("-")[0];
    if (SITE_LANGS.includes(base)) return base;
  }

  return "en";
}

export function attachLocals(req, res, next) {
  res.locals.csrfToken = "";
  res.locals.isAdmin = Boolean(req.session?.admin?.isLoggedIn);
  res.locals.adminName = req.session?.admin?.name || "";
  res.locals.siteTitle = "The Augustine Journal";
  res.locals.siteLangs = SITE_LANGS;

  // The visitor's preferred language from the Accept-Language header. The
  // page itself is always served in English; the browser translates it.
  res.locals.detectedLang = detectLangFromHeader(req.headers["accept-language"]);

  next();
}
