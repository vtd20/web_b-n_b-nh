module.exports = function registerMetaRoutes(app, { NODE_ENV, GOOGLE_CLIENT_ID, nowIso, getUserFromRequest, getRequestScope }) {

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      env: NODE_ENV,
      uptime: process.uptime(),
      timestamp: nowIso(),
    });
  });

  app.get('/api/public-config', (req, res) => {
    res.json({
      googleClientId: GOOGLE_CLIENT_ID,
      googleConfigured: Boolean(GOOGLE_CLIENT_ID),
      note: GOOGLE_CLIENT_ID ? '' : 'Thiếu GOOGLE_CLIENT_ID trên server.',
    });
  });

  app.get('/api/me', (req, res) => {
    const user = getUserFromRequest(req, getRequestScope(req));
    if (!user) {
      return res.status(401).json({ user: null });
    }
    return res.json({ user });
  });
};
