const assert = require('assert/strict');

const { hashPassword, verifyPassword, hashText } = require('../lib/core');
const { createAuthService } = require('../lib/auth');
const { createProductService } = require('../lib/products');
const { createOrderService } = require('../lib/orders');

function createMemoryDb() {
  const state = {
    users: [],
    sessions: [],
    products: [],
    orders: [],
  };
  let userId = 1;
  let sessionId = 1;
  let productId = 1;

  function run(sql, params = []) {
    if (sql.includes('INSERT INTO sessions')) {
      const row = {
        id: sessionId++,
        user_id: params[0],
        token_hash: params[1],
        expires_at: params[2],
        created_at: params[3],
      };
      state.sessions.push(row);
      return { lastInsertRowid: row.id, changes: 1 };
    }

    if (sql.includes('INSERT INTO users')) {
      const isAdminBootstrapInsert = sql.includes("role, avatar_url");
      const row = {
        id: userId++,
        name: params[0],
        email: params[1],
        birthday: params[2] || '',
        password_hash: params[3] ?? null,
        google_sub: isAdminBootstrapInsert ? null : params[4] ?? null,
        provider: isAdminBootstrapInsert ? 'local' : params[5] || 'local',
        role: isAdminBootstrapInsert ? 'admin' : params[6] || 'customer',
        avatar_url: isAdminBootstrapInsert ? null : params[7] ?? null,
        created_at: isAdminBootstrapInsert ? params[4] : params[8],
        updated_at: isAdminBootstrapInsert ? params[5] : params[9],
      };
      state.users.push(row);
      return { lastInsertRowid: row.id, changes: 1 };
    }

    if (sql.includes('UPDATE users')) {
      const id = params[params.length - 1];
      const row = state.users.find((entry) => entry.id === id);
      if (row) {
        if (sql.includes("SET role = 'admin'")) {
          row.role = 'admin';
          row.provider = row.provider || 'local';
          row.updated_at = params[0];
          if (!row.password_hash && params[1]) row.password_hash = params[1];
        } else if (sql.includes('SET name = ?, email = ?, avatar_url = ?, provider = \'google\'')) {
          row.name = params[0];
          row.email = params[1];
          row.avatar_url = params[2];
          row.provider = 'google';
          row.updated_at = params[3];
        } else if (sql.includes('SET name = ?, google_sub = ?, avatar_url = ?, provider = \'google\'')) {
          row.name = params[0];
          row.google_sub = params[1];
          row.avatar_url = params[2];
          row.provider = 'google';
          row.updated_at = params[3];
        }
      }
      return { changes: row ? 1 : 0 };
    }

    if (sql.includes('DELETE FROM sessions')) {
      state.sessions = state.sessions.filter((entry) => entry.token_hash !== params[0] && entry.id !== params[0]);
      return { changes: 1 };
    }

    if (sql.includes('INSERT INTO products')) {
      const row = {
        id: productId++,
        slug: params[0],
        name: params[1],
        category: params[2],
        price: params[3],
        image: params[4],
        gallery_json: params[5],
        description: params[6],
        detail: params[7],
        featured: params[8],
        is_active: params[9],
        is_new: params[10],
        created_at: params[11],
        updated_at: params[12],
      };
      state.products.push(row);
      return { lastInsertRowid: row.id, changes: 1 };
    }

    if (sql.includes('UPDATE products')) {
      const id = params[params.length - 1];
      const row = state.products.find((entry) => entry.id === id);
      if (row) {
        row.slug = params[0];
        row.name = params[1];
        row.category = params[2];
        row.price = params[3];
        row.image = params[4];
        row.gallery_json = params[5];
        row.description = params[6];
        row.detail = params[7];
        row.featured = params[8];
        row.is_active = params[9];
        row.is_new = params[10];
        row.updated_at = params[11];
      }
      return { changes: row ? 1 : 0 };
    }

    return { changes: 0 };
  }

  function get(sql, params = []) {
    if (sql.includes('SELECT * FROM users WHERE email = ?')) {
      return state.users.find((entry) => entry.email === params[0]) || null;
    }
    if (sql.includes('SELECT * FROM users WHERE google_sub = ?')) {
      return state.users.find((entry) => entry.google_sub === params[0]) || null;
    }
    if (sql.includes('SELECT * FROM users WHERE id = ?')) {
      return state.users.find((entry) => entry.id === params[0]) || null;
    }
    if (sql.includes('SELECT id FROM users WHERE email = ?')) {
      return state.users.find((entry) => entry.email === params[0]) ? { id: 1 } : null;
    }
    if (sql.includes('SELECT COUNT(*) AS count FROM products')) {
      return { count: state.products.length };
    }
    if (sql.includes('SELECT * FROM products WHERE slug = ?')) {
      return state.products.find((entry) => entry.slug === params[0]) || null;
    }
    if (sql.includes('SELECT id FROM products WHERE slug = ?')) {
      return state.products.find((entry) => entry.slug === params[0]) ? { id: 1 } : null;
    }
    if (sql.includes('SELECT id FROM products WHERE slug = ? AND id != ?')) {
      return state.products.find((entry) => entry.slug === params[0] && entry.id !== params[1]) ? { id: 1 } : null;
    }
    if (sql.includes('SELECT * FROM products WHERE id = ?')) {
      return state.products.find((entry) => entry.id === params[0]) || null;
    }
    if (sql.includes('SELECT * FROM orders WHERE id = ?')) {
      return state.orders.find((entry) => entry.id === params[0]) || null;
    }
    if (sql.includes('SELECT sessions.id AS session_id')) {
      const session = state.sessions.find((entry) => entry.token_hash === params[0]);
      if (!session) return null;
      const user = state.users.find((entry) => entry.id === session.user_id);
      return user ? { session_id: session.id, expires_at: session.expires_at, ...user } : null;
    }
    if (sql.includes('PRAGMA table_info(users)')) {
      return [];
    }
    if (sql.includes('PRAGMA table_info(products)')) {
      return [];
    }
    return null;
  }

  function all(sql, params = []) {
    if (sql.includes('SELECT * FROM products WHERE is_active = 1')) {
      return state.products.filter((entry) => Number(entry.is_active) === 1);
    }
    if (sql.includes('SELECT * FROM products ORDER BY featured ASC, name ASC')) {
      return [...state.products];
    }
    if (sql.includes('PRAGMA table_info(users)')) {
      return [];
    }
    if (sql.includes('PRAGMA table_info(products)')) {
      return [];
    }
    return [];
  }

  return { state, run, get, all };
}

function test(name, fn) {
  tests.push({ name, fn });
}

const tests = [];

test('hashPassword round-trip works', () => {
  const stored = hashPassword('secret123');
  assert.equal(verifyPassword('secret123', stored), true);
  assert.equal(verifyPassword('wrong-pass', stored), false);
});

test('auth service creates session and bootstraps admin', () => {
  const db = createMemoryDb();
  const auth = createAuthService({
    get: db.get,
    all: db.all,
    run: db.run,
    hashText,
    hashPassword,
    requireText: (value) => String(value || '').trim(),
    nowIso: () => '2026-05-05T00:00:00.000Z',
    SESSION_DAYS: 7,
    IS_PRODUCTION: false,
  });

  const userRow = {
    id: 1,
    name: 'Admin',
    email: 'admin@gifterbakery.com',
    role: 'admin',
    provider: 'local',
  };
  db.state.users.push(userRow);

  const token = auth.createSession(1);
  assert.equal(typeof token, 'string');
  assert.equal(db.state.sessions.length, 1);
  assert.equal(db.state.sessions[0].token_hash, hashText(token));

  auth.ensureAdminUser('owner@example.com', 'Admin123!');
  assert.equal(db.state.users.some((entry) => entry.email === 'owner@example.com' && entry.role === 'admin'), true);
});

test('product service normalizes input and order items', () => {
  const db = createMemoryDb();
  db.state.products.push({
    id: 1,
    slug: 'banh-kem-dau-tay',
    name: 'Bánh Kem Dâu Tây',
    category: 'Bánh kem',
    price: 200000,
    image: '/img/cake.jpg',
    gallery_json: '[]',
    description: 'demo',
    detail: 'demo detail',
    featured: 0,
    is_active: 1,
    is_new: 0,
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
  });

  const products = createProductService({
    get: db.get,
    run: db.run,
    all: db.all,
    requireText: (value) => String(value || '').trim(),
    parseCurrency: (value) => Number(String(value || 0).replace(/[^0-9.]/g, '')) || 0,
    normalizeSlug: (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    safeJsonParse: (value, fallback = []) => {
      try {
        return Array.isArray(JSON.parse(value)) ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    },
    nowIso: () => '2026-05-05T00:00:00.000Z',
  });

  const normalized = products.normalizeProductInput({
    name: 'Bánh Kem Dâu Tây',
    category: 'Bánh kem',
    price: '200000',
    image: 'cake.jpg',
    description: 'Mô tả ngắn',
    detail: 'Chi tiết',
  });
  assert.equal(normalized.slug, 'banh-kem-dau-tay');
  assert.equal(normalized.isNew, 1);

  const orderItems = products.normalizeOrderItems([
    {
      productSlug: 'banh-kem-dau-tay',
      quantity: 2,
      options: {
        size: 'L',
        toppings: ['Mâm xôi'],
      },
    },
  ]);
  assert.equal(orderItems[0].unitPrice, 250000);
  assert.equal(orderItems[0].lineTotal, 500000);
});

test('order service formats summaries and messages', () => {
  const orderService = createOrderService({
    all: () => [],
    get: () => null,
    run: () => ({}),
    requireText: (value) => String(value || '').trim(),
    parseCurrency: (value) => Number(value || 0),
    nowIso: () => '2026-05-05T00:00:00.000Z',
    productService: {},
    io: null,
    webhookUrl: '',
    webhookSecret: '',
  });

  const summary = orderService.getOrderRowSummary({
    id: 'ORD-1',
    user_id: 7,
    customer_name: 'Nguyễn A',
    email: 'a@example.com',
    phone: '0909',
    address: 'Hà Nội',
    payment_method: 'COD',
    delivery_date: '2026-05-06',
    delivery_slot: '18:00',
    note: 'Giao giờ chiều',
    status: 'Processing',
    items_json: JSON.stringify([{ quantity: 2, name: 'Bánh kem' }]),
    items_summary: '2x Bánh kem',
    subtotal: 200000,
    delivery_fee: 30000,
    tax: 0,
    total: 230000,
    created_at: '2026-05-05T10:00:00.000Z',
    updated_at: '2026-05-05T10:00:00.000Z',
    placed_label: 'Just now',
  });

  assert.equal(summary.total, 230000);
  assert.equal(summary.items.length, 1);

  const message = orderService.formatTelegramOrderMessage({
    id: 'ORD-1',
    customer_name: 'Nguyễn A',
    phone: '0909',
    email: 'a@example.com',
    address: 'Hà Nội',
    payment_method: 'COD',
    total: 230000,
    items_json: JSON.stringify([{ quantity: 2, name: 'Bánh kem' }]),
    items_summary: '2x Bánh kem',
    created_at: '2026-05-05T10:00:00.000Z',
  });

  assert.match(message, /ĐƠN HÀNG MỚI/);
  assert.match(message, /ORD-1/);
  assert.match(message, /230.000đ/);
});

(async () => {
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(error.stack || error.message || error);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`${failed} test(s) failed`);
  }

  console.log(`Passed ${tests.length} test(s).`);
})().catch(() => {
  process.exitCode = 1;
});
