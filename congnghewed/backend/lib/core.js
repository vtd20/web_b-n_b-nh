const crypto = require('crypto');

function hashText(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, derived] = stored.split(':');
  const compare = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(compare, 'hex'), Buffer.from(derived, 'hex'));
}

function requireText(value) {
  return String(value || '').trim();
}

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  const numeric = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeJsonParse(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, keyPrefix = 'default' } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
    }

    return next();
  };
}

function createSecurityHelpers({
  allowedFrontendOrigins,
  IS_PRODUCTION,
  COOKIE_SAMESITE,
  COOKIE_SECURE,
  SESSION_DAYS,
}) {
  function getSessionCookieName(scope = 'user') {
    return scope === 'admin' ? 'bakery_admin_session' : 'bakery_session';
  }

  function setSessionCookie(res, token, scope = 'user') {
    res.cookie(getSessionCookieName(scope), token, {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  function clearSessionCookie(res, scope = 'user') {
    res.clearCookie(getSessionCookieName(scope), {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
    });
  }

  function setSecurityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (IS_PRODUCTION && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  }

  function originAllowed(origin) {
    if (!origin) return false;
    if (allowedFrontendOrigins.has(origin)) return true;

    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  function isSafeMethod(method) {
    return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
  }

  function validateRequestOrigin(req, res, next) {
    if (isSafeMethod(req.method) || !String(req.path || '').startsWith('/api/')) {
      return next();
    }

    const origin = req.headers.origin || req.headers.referer || '';
    if (!originAllowed(origin)) {
      return res.status(403).json({ message: 'Yêu cầu không hợp lệ từ origin không được phép.' });
    }

    return next();
  }

  return {
    getSessionCookieName,
    setSessionCookie,
    clearSessionCookie,
    setSecurityHeaders,
    originAllowed,
    isSafeMethod,
    validateRequestOrigin,
  };
}

module.exports = {
  hashText,
  hashPassword,
  verifyPassword,
  requireText,
  parseCurrency,
  normalizeSlug,
  safeJsonParse,
  createRateLimiter,
  createSecurityHelpers,
};
