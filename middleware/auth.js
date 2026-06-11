/**
 * Middleware: require authenticated session
 * Applies to all /api/* routes except /api/auth/login
 */
function requireAuth(req, res, next) {
  // Skip auth for login endpoint
  if (req.path === '/login') return next();

  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Sesi berakhir. Silakan login kembali.', redirect: '/login' });
  }
  next();
}

/**
 * Middleware: require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Belum login.', redirect: '/login' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya admin.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
