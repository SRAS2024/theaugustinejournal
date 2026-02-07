export function attachLocals(req, res, next) {
  // CSRF middleware is only enabled when DATABASE_URL is configured.
  // If it is not enabled, req.csrfToken will not exist.
  res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";
  res.locals.isAdmin = Boolean(req.session?.admin?.isLoggedIn);
  res.locals.adminName = req.session?.admin?.name || "";
  res.locals.siteTitle = "The Augustine Journal";
  next();
}
