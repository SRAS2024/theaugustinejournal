const SUPPORTED_LANGS = ["en", "pt", "es", "fr", "de", "it"];

/**
 * Parse the Accept-Language header and return the best matching supported
 * language code.  Falls back to "en" when nothing matches.
 */
function detectLangFromHeader(acceptLanguage) {
  if (!acceptLanguage) return "en";

  const parts = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, qPart] = part.trim().split(";");
      const q = qPart ? parseFloat(qPart.split("=")[1]) : 1;
      return { lang: lang.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of parts) {
    const base = lang.split("-")[0];
    if (SUPPORTED_LANGS.includes(base)) return base;
  }

  return "en";
}

export function attachLocals(req, res, next) {
  // CSRF middleware is only enabled when DATABASE_URL is configured.
  // If it is not enabled, req.csrfToken will not exist.
  res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";
  res.locals.isAdmin = Boolean(req.session?.admin?.isLoggedIn);
  res.locals.adminName = req.session?.admin?.name || "";
  res.locals.siteTitle = "The Augustine Journal";

  // Detect preferred language from the Accept-Language request header
  res.locals.detectedLang = detectLangFromHeader(req.headers["accept-language"]);

  next();
}
