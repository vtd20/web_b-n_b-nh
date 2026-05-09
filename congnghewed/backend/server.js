const http = require('http');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { get, run, all } = require('./db');
const {
  loadEnvFile,
  createAllowedFrontendOrigins,
  resolveFrontendPaths,
  readFrontendProductSeed,
} = require('./lib/bootstrap');
const {
  hashText,
  hashPassword,
  verifyPassword,
  requireText,
  parseCurrency,
  normalizeSlug,
  safeJsonParse,
  createRateLimiter,
  createSecurityHelpers,
} = require('./lib/core');
const { createAuthService } = require('./lib/auth');
const { createProductService } = require('./lib/products');
const { createOrderService } = require('./lib/orders');
const { createSchemaService } = require('./lib/schema');

let SocketIOServer = null;

try {
  ({ Server: SocketIOServer } = require('socket.io'));
} catch {
  SocketIOServer = null;
}

loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const N8N_NOTIFICATION_WEBHOOK_URL = String(
  process.env.N8N_NOTIFICATION_WEBHOOK_URL || process.env.N8N_ORDER_WEBHOOK_URL || process.env.N8N_ORDER_STATUS_WEBHOOK_URL || ''
).trim();
const N8N_NOTIFICATION_WEBHOOK_SECRET = String(
  process.env.N8N_NOTIFICATION_WEBHOOK_SECRET || process.env.N8N_ORDER_WEBHOOK_SECRET || process.env.N8N_ORDER_STATUS_WEBHOOK_SECRET || ''
).trim();
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const COOKIE_SAMESITE = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
const COOKIE_SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : IS_PRODUCTION;
const allowedFrontendOrigins = createAllowedFrontendOrigins(process.env);

const {
  getSessionCookieName,
  setSessionCookie,
  clearSessionCookie,
  setSecurityHeaders,
  originAllowed,
  validateRequestOrigin,
} = createSecurityHelpers({
  allowedFrontendOrigins,
  IS_PRODUCTION,
  COOKIE_SAMESITE,
  COOKIE_SECURE,
  SESSION_DAYS,
});

const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const { frontendRoot, productDataPath } = resolveFrontendPaths(__dirname);
const io = SocketIOServer
  ? new SocketIOServer(httpServer, {
      cors: {
        origin(origin, callback) {
          if (!origin || originAllowed(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
      },
    })
  : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }
  return next();
});

app.use(setSecurityHeaders);
app.use(validateRequestOrigin);
app.use(express.static(frontendRoot));

function nowIso() {
  return new Date().toISOString();
}

const authService = createAuthService({
  get,
  all,
  run,
  hashText,
  hashPassword,
  requireText,
  nowIso,
  SESSION_DAYS,
  IS_PRODUCTION,
});

const productService = createProductService({
  get,
  run,
  all,
  requireText,
  parseCurrency,
  normalizeSlug,
  safeJsonParse,
  nowIso,
  frontendProductSeed: readFrontendProductSeed(productDataPath),
});

const orderService = createOrderService({
  all,
  get,
  run,
  requireText,
  parseCurrency,
  nowIso,
  productService,
  io,
  webhookUrl: N8N_NOTIFICATION_WEBHOOK_URL,
  webhookSecret: N8N_NOTIFICATION_WEBHOOK_SECRET,
});

const schemaService = createSchemaService({
  authService,
  productService,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
});

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, keyPrefix: 'auth' });
const orderRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'orders' });
const adminRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 60, keyPrefix: 'admin' });

schemaService.ensureSchema();

const registerMetaRoutes = require('./routes/meta-routes');
const registerProductRoutes = require('./routes/product-routes');
const registerAuthRoutes = require('./routes/auth-routes');
const registerOrderRoutes = require('./routes/order-routes');

registerMetaRoutes(app, {
  NODE_ENV,
  GOOGLE_CLIENT_ID,
  nowIso,
  getUserFromRequest: (req, scope) => authService.getUserFromRequest(req, scope, getSessionCookieName),
  getRequestScope: authService.getRequestScope,
});

registerProductRoutes(app, {
  adminRateLimit,
  requireAdmin: (req, res, next) => authService.requireAdmin(req, res, next, getSessionCookieName),
  getRequestScope: authService.getRequestScope,
  getUserFromRequest: (req, scope) => authService.getUserFromRequest(req, scope, getSessionCookieName),
  listProducts: productService.listProducts,
  getProductBySlug: productService.getProductBySlug,
  normalizeSlug,
  normalizeProductInput: productService.normalizeProductInput,
  get,
  run,
  nowIso,
  rowToProduct: productService.rowToProduct,
});

registerAuthRoutes(app, {
  authRateLimit,
  oauthClient,
  GOOGLE_CLIENT_ID,
  requireText,
  get,
  run,
  hashPassword,
  verifyPassword,
  createSession: authService.createSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookieName,
  sanitizeUser: authService.sanitizeUser,
  upsertGoogleUser: authService.upsertGoogleUser,
  nowIso,
  hashText,
});

registerOrderRoutes(app, {
  orderRateLimit,
  adminRateLimit,
  requireAuth: (req, res, next) => authService.requireAuth(req, res, next, getSessionCookieName),
  requireAdmin: (req, res, next) => authService.requireAdmin(req, res, next, getSessionCookieName),
  all,
  get,
  run,
  normalizeOrderItems: productService.normalizeOrderItems,
  generateOrderItemsSummary: productService.generateOrderItemsSummary,
  getOrderRowSummary: orderService.getOrderRowSummary,
  emitOrderEvent: orderService.emitOrderEvent,
  notifyN8n: orderService.notifyN8n,
  formatTelegramOrderMessage: orderService.formatTelegramOrderMessage,
  formatOrderProcessingEmail: orderService.formatOrderProcessingEmail,
  nowIso,
  parseCurrency,
  requireText,
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`GIFTER BAKERY running at http://localhost:${PORT}`);
});
