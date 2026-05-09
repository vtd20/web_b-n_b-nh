function createAuthService({
  get,
  all,
  run,
  hashText,
  hashPassword,
  requireText,
  nowIso,
  SESSION_DAYS,
  IS_PRODUCTION,
}) {
  function sanitizeUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      birthday: row.birthday || '',
      provider: row.provider,
      role: row.role || 'customer',
      avatarUrl: row.avatar_url || '',
      googleSub: row.google_sub || '',
    };
  }

  function createSession(userId) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashText(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    run(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [userId, tokenHash, expiresAt, createdAt]
    );

    return token;
  }

  function getRequestScope(req) {
    const scope = requireText(req.query.scope || req.body?.scope);
    return scope === 'admin' ? 'admin' : 'user';
  }

  function getUserFromRequest(req, scope = 'user', getSessionCookieName) {
    const token = req.cookies[getSessionCookieName(scope)];
    if (!token) return null;

    const tokenHash = hashText(token);
    const session = get(
      `SELECT sessions.id AS session_id, sessions.expires_at, users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
      [tokenHash]
    );

    if (!session) return null;
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      run('DELETE FROM sessions WHERE id = ?', [session.session_id]);
      return null;
    }

    return sanitizeUser(session);
  }

  function upsertGoogleUser(payload) {
    const googleSub = requireText(payload.sub);
    const email = requireText(payload.email).toLowerCase();
    const name = requireText(payload.name || payload.given_name || payload.email || 'Google User');
    const avatarUrl = requireText(payload.picture);
    const now = nowIso();

    if (!googleSub || !email) {
      throw new Error('Google payload is missing sub or email.');
    }

    let user = get('SELECT * FROM users WHERE google_sub = ?', [googleSub]);
    if (user) {
      run(
        `UPDATE users
         SET name = ?, email = ?, avatar_url = ?, provider = 'google', updated_at = ?
         WHERE id = ?`,
        [name, email, avatarUrl, now, user.id]
      );
      return get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (user) {
      run(
        `UPDATE users
         SET name = ?, google_sub = ?, avatar_url = ?, provider = 'google', updated_at = ?
         WHERE id = ?`,
        [name, googleSub, avatarUrl, now, user.id]
      );
      return get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    const result = run(
      `INSERT INTO users (name, email, birthday, password_hash, google_sub, provider, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, 'google', ?, ?, ?)`,
      [name, email, '', googleSub, avatarUrl, now, now]
    );

    return get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
  }

  function ensureUserRoleColumn() {
    const columns = all('PRAGMA table_info(users)');
    const hasRole = Array.isArray(columns) && columns.some((column) => column.name === 'role');
    if (!hasRole) {
      run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'");
    }
  }

  function ensureAdminUser(adminEmail, adminPassword) {
    const email = String(adminEmail || 'admin@gifterbakery.com').toLowerCase();
    const hasExplicitPassword = String(adminPassword || '').trim().length > 0;
    const password = hasExplicitPassword ? String(adminPassword).trim() : String(IS_PRODUCTION ? '' : 'Admin123!');

    if (!password) {
      if (IS_PRODUCTION) {
        console.warn('[auth] ADMIN_PASSWORD is required in production; skipping admin bootstrap until it is set.');
        return;
      }
    }

    const now = nowIso();
    const existing = get('SELECT * FROM users WHERE email = ?', [email]);
    const hashed = hashPassword(password);

    if (existing) {
      run(
        `UPDATE users
         SET role = 'admin', provider = COALESCE(provider, 'local'), updated_at = ?, password_hash = ?
         WHERE id = ?`,
        [now, hashed, existing.id]
      );
      return;
    }

    run(
      `INSERT INTO users (name, email, birthday, password_hash, google_sub, provider, role, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'local', 'admin', NULL, ?, ?)`,
      ['Admin', email, '', hashed, now, now]
    );
  }

  function requireAuth(req, res, next, getSessionCookieName) {
    const user = getUserFromRequest(req, getRequestScope(req), getSessionCookieName);
    if (!user) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    }
    req.user = user;
    return next();
  }

  function requireAdmin(req, res, next, getSessionCookieName) {
    const user = getUserFromRequest(req, 'admin', getSessionCookieName);
    if (!user) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập trang này.' });
    }

    req.user = user;
    return next();
  }

  return {
    sanitizeUser,
    createSession,
    getRequestScope,
    getUserFromRequest,
    upsertGoogleUser,
    ensureUserRoleColumn,
    ensureAdminUser,
    requireAuth,
    requireAdmin,
  };
}

module.exports = { createAuthService };
