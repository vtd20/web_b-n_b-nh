function createProductService({
  get,
  run,
  all,
  requireText,
  parseCurrency,
  normalizeSlug,
  safeJsonParse,
  nowIso,
  frontendProductSeed = [],
}) {
  function readFrontendProductSeed() {
    return Array.isArray(frontendProductSeed) ? frontendProductSeed : [];
  }

  function rowToProduct(row) {
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      price: Number(row.price || 0),
      image: row.image || '',
      gallery: safeJsonParse(row.gallery_json, []),
      description: row.description || '',
      detail: row.detail || '',
      featured: Number(row.featured || 0),
      isActive: Number(row.is_active ?? 1) === 1,
      isNew: Number(row.is_new ?? 0) === 1,
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    };
  }

  function getProductBySlug(slug) {
    const row = get('SELECT * FROM products WHERE slug = ?', [slug]);
    return rowToProduct(row);
  }

  function listProducts({ includeInactive = false } = {}) {
    const rows = includeInactive
      ? all('SELECT * FROM products ORDER BY featured ASC, name ASC')
      : all('SELECT * FROM products WHERE is_active = 1 ORDER BY featured ASC, name ASC');
    return rows.map(rowToProduct);
  }

  function seedProductsIfNeeded() {
    const existing = get('SELECT COUNT(*) AS count FROM products');
    if (existing && Number(existing.count || 0) > 0) return;

    const seed = readFrontendProductSeed();
    const now = nowIso();
    seed.forEach((product) => {
      const slug = normalizeSlug(product.slug || product.name);
      if (!slug) return;

      run(
        `INSERT INTO products (
          slug, name, category, price, image, gallery_json, description, detail, featured, is_active, is_new, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          slug,
          requireText(product.name) || slug,
          requireText(product.category) || 'cake',
          parseCurrency(product.price),
          requireText(product.image),
          JSON.stringify(Array.isArray(product.gallery) ? product.gallery : []),
          requireText(product.description),
          requireText(product.detail),
          Number(product.featured || 0),
          now,
          now,
        ]
      );
    });
  }

  function normalizeProductInput(body = {}, existing = null) {
    const name = requireText(body.name);
    const category = requireText(body.category);
    const slugInput = requireText(body.slug);
    const slug = normalizeSlug(slugInput || name || existing?.slug || '');
    const image = requireText(body.image);
    const description = requireText(body.description);
    const detail = requireText(body.detail);
    const gallery = Array.isArray(body.gallery)
      ? body.gallery.map((item) => requireText(item)).filter(Boolean)
      : safeJsonParse(body.gallery, []);
    const featured = Number(body.featured || 0);
    const isActive = body.isActive === false || body.isActive === 'false' ? 0 : 1;
    const price = parseCurrency(body.price);
    const isNew = existing ? Number(existing.is_new ?? 0) === 1 : true;

    return {
      slug,
      name,
      category,
      price,
      image,
      gallery,
      description,
      detail,
      featured,
      isActive,
      isNew: isNew ? 1 : 0,
    };
  }

  function listAvailableProductsForOrder() {
    return listProducts({ includeInactive: false });
  }

  function inferProductSlugFromOrderItem(item, productList = []) {
    const direct = requireText(item.productSlug || item.slug || item.id);
    if (direct && productList.some((product) => product.slug === direct)) {
      return direct;
    }

    const variantKey = requireText(item.variantKey);
    if (variantKey) {
      const match = productList
        .filter((product) => variantKey.startsWith(`${product.slug}-`))
        .sort((a, b) => b.slug.length - a.slug.length)[0];
      if (match) return match.slug;
    }

    const baseName = requireText(item.baseName || item.name).replace(/\s*-\s*.+$/, '');
    if (baseName) {
      const match = productList.find((product) => product.name === baseName);
      if (match) return match.slug;
    }

    return '';
  }

  function resolveSizeExtra(sizeValue) {
    const size = requireText(sizeValue).toLowerCase();
    if (!size) return 0;
    if (['m', 'vua', 'vừa', 'medium'].includes(size)) return 20000;
    if (['l', 'lon', 'lớn', 'large'].includes(size)) return 40000;
    return 0;
  }

  function resolveToppingExtra(toppings = []) {
    const map = new Map([
      ['mâm xôi', 10000],
      ['mam xoi', 10000],
      ['vụn vàng', 15000],
      ['vun vang', 15000],
    ]);

    return toppings.reduce((sum, topping) => {
      const label = requireText(topping).toLowerCase();
      return sum + (map.get(label) || 0);
    }, 0);
  }

  function normalizeOrderItems(items = []) {
    const products = listAvailableProductsForOrder();

    return items.map((item) => {
      const slug = inferProductSlugFromOrderItem(item, products);
      const product = products.find((entry) => entry.slug === slug);

      if (!product) {
        throw new Error(`Sản phẩm không hợp lệ: ${requireText(item.name) || 'unknown'}`);
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const options = item.options && typeof item.options === 'object' ? item.options : {};
      const size = requireText(options.size || item.size || '');
      const toppings = Array.isArray(options.toppings) ? options.toppings.map((value) => requireText(value)).filter(Boolean) : [];
      const unitPrice = Number(product.price || 0) + resolveSizeExtra(size) + resolveToppingExtra(toppings);

      return {
        productSlug: product.slug,
        name: size ? `${product.name} - ${size}` : product.name,
        baseName: product.name,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        options: {
          size,
          toppings,
        },
        image: product.image || '',
      };
    });
  }

  function generateOrderItemsSummary(items = []) {
    return items
      .map((item) => {
        const quantity = Number(item.quantity || 1);
        return `${quantity}x ${item.name || 'Sản phẩm'}`;
      })
      .join(', ');
  }

  function ensureProductsSeed() {
    seedProductsIfNeeded();
  }

  function ensureProductNewFlagColumn() {
    const columns = all('PRAGMA table_info(products)');
    const hasColumn = Array.isArray(columns) && columns.some((column) => column.name === 'is_new');
    if (!hasColumn) {
      run('ALTER TABLE products ADD COLUMN is_new INTEGER NOT NULL DEFAULT 0');
    }
  }

  return {
    readFrontendProductSeed,
    rowToProduct,
    getProductBySlug,
    listProducts,
    seedProductsIfNeeded,
    normalizeProductInput,
    listAvailableProductsForOrder,
    inferProductSlugFromOrderItem,
    resolveSizeExtra,
    resolveToppingExtra,
    normalizeOrderItems,
    generateOrderItemsSummary,
    ensureProductsSeed,
    ensureProductNewFlagColumn,
  };
}

module.exports = { createProductService };
