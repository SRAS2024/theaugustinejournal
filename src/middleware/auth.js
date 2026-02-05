export function requireAdmin(req, res, next) {
  if (req.session?.admin?.isLoggedIn) return next();
  return res.redirect("/admin/login");
}
