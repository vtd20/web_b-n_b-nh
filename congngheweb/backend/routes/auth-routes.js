module.exports = function registerAuthRoutes(app, {
  authRateLimit,
  oauthClient,
  GOOGLE_CLIENT_ID,
  requireText,
  get,
  run,
  hashPassword,
  verifyPassword,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookieName,
  sanitizeUser,
  upsertGoogleUser,
  nowIso,
  hashText,
}) {

  app.post('/api/auth/register', authRateLimit, (req, res) => {
    const name = requireText(req.body.name);
    const email = requireText(req.body.email).toLowerCase();
    const birthday = requireText(req.body.birthday);
    const password = requireText(req.body.password);

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    if (get('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ message: 'Email này đã được đăng ký.' });
    }

    const now = nowIso();
    const result = run(
      `INSERT INTO users (name, email, birthday, password_hash, google_sub, provider, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'local', NULL, ?, ?)`,
      [name, email, birthday, hashPassword(password), now, now]
    );

    const user = get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    const sessionToken = createSession(user.id);
    setSessionCookie(res, sessionToken, requireText(req.body.scope) === 'admin' ? 'admin' : 'user');

    return res.status(201).json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/login', authRateLimit, (req, res) => {
    const email = requireText(req.body.email).toLowerCase();
    const password = requireText(req.body.password);
    const requestedScope = requireText(req.body.scope) === 'admin' ? 'admin' : 'user';

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
    }

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng.' });
    }

    if (!user.password_hash) {
      return res.status(400).json({ message: 'Tài khoản này đang dùng đăng nhập Google.' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng.' });
    }

    const sessionToken = createSession(user.id);
    setSessionCookie(res, sessionToken, requestedScope === 'admin' && user.role === 'admin' ? 'admin' : 'user');

    return res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/google', authRateLimit, async (req, res) => {
    try {
      if (!oauthClient || !GOOGLE_CLIENT_ID) {
        return res.status(500).json({ message: 'Chưa cấu hình GOOGLE_CLIENT_ID trên server.' });
      }

      const credential = requireText(req.body.credential);
      const requestedScope = requireText(req.body.scope) === 'admin' ? 'admin' : 'user';
      if (!credential) {
        return res.status(400).json({ message: 'Thiếu Google credential.' });
      }

      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(401).json({ message: 'Không xác minh được Google token.' });
      }

      if (payload.email_verified === false) {
        return res.status(401).json({ message: 'Email Google chưa được xác minh.' });
      }

      const user = upsertGoogleUser(payload);
      const sessionToken = createSession(user.id);
      setSessionCookie(res, sessionToken, requestedScope === 'admin' && user.role === 'admin' ? 'admin' : 'user');

      return res.json({ user: sanitizeUser(user) });
    } catch (error) {
      return res.status(401).json({
        message: 'Google sign-in thất bại.',
        detail: error.message,
      });
    }
  });

  app.post('/api/auth/logout', authRateLimit, (req, res) => {
    const scope = requireText(req.body.scope) === 'admin' ? 'admin' : 'user';
    const token = req.cookies[getSessionCookieName(scope)];
    if (token) {
      run('DELETE FROM sessions WHERE token_hash = ?', [hashText(token)]);
    }

    clearSessionCookie(res, scope);
    return res.json({ ok: true });
  });
};
