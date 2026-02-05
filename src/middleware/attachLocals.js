export function attachLocals(req, res, next) {
  res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";
  res.locals.isAdmin = Boolean(req.session?.admin?.isLoggedIn);
  res.locals.adminName = req.session?.admin?.name || "";
  res.locals.siteTitle = "The Augustine Journal";
  next();
}
