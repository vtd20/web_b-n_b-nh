module.exports = function registerProductRoutes(app, {
  adminRateLimit,
  requireAdmin,
  getRequestScope,
  getUserFromRequest,
  listProducts,
  getProductBySlug,
  normalizeSlug,
  normalizeProductInput,
  get,
  run,
  nowIso,
  rowToProduct,
}) {

  app.get('/api/products', (req, res) => {
    const requestedScope = getRequestScope(req);
    const adminUser = requestedScope === 'admin' ? getUserFromRequest(req, 'admin') : null;
    const products = listProducts({ includeInactive: Boolean(adminUser) });
    return res.json({ products });
  });

  app.get('/api/products/:slug', (req, res) => {
    const requestedScope = getRequestScope(req);
    const adminUser = requestedScope === 'admin' ? getUserFromRequest(req, 'admin') : null;
    const product = getProductBySlug(normalizeSlug(req.params.slug));

    if (!product || (!product.isActive && !adminUser)) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    return res.json({ product });
  });

  app.post('/api/products', adminRateLimit, requireAdmin, (req, res) => {
    const product = normalizeProductInput(req.body);

    if (!product.name || !product.slug || !product.category || !product.image || !product.description) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin sản phẩm.' });
    }

    if (get('SELECT id FROM products WHERE slug = ?', [product.slug])) {
      return res.status(409).json({ message: 'Slug sản phẩm đã tồn tại.' });
    }

    const now = nowIso();
    const result = run(
      `INSERT INTO products (
        slug, name, category, price, image, gallery_json, description, detail, featured, is_active, is_new, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.slug,
        product.name,
        product.category,
        product.price,
        product.image,
        JSON.stringify(product.gallery),
        product.description,
        product.detail,
        product.featured,
        product.isActive,
        product.isNew,
        now,
        now,
      ]
    );

    const created = get('SELECT * FROM products WHERE id = ?', [result.lastInsertRowid]);
    return res.status(201).json({ product: rowToProduct(created) });
  });

  app.patch('/api/products/:slug', adminRateLimit, requireAdmin, (req, res) => {
    const existing = get('SELECT * FROM products WHERE slug = ?', [normalizeSlug(req.params.slug)]);
    if (!existing) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    const product = normalizeProductInput(req.body, rowToProduct(existing));
    if (!product.name || !product.slug || !product.category || !product.image || !product.description) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin sản phẩm.' });
    }

    const slugTaken = get('SELECT id FROM products WHERE slug = ? AND id != ?', [product.slug, existing.id]);
    if (slugTaken) {
      return res.status(409).json({ message: 'Slug sản phẩm đã tồn tại.' });
    }

    const now = nowIso();
    run(
      `UPDATE products
       SET slug = ?, name = ?, category = ?, price = ?, image = ?, gallery_json = ?, description = ?, detail = ?, featured = ?, is_active = ?, is_new = ?, updated_at = ?
       WHERE id = ?`,
      [
        product.slug,
        product.name,
        product.category,
        product.price,
        product.image,
        JSON.stringify(product.gallery),
        product.description,
        product.detail,
        product.featured,
        product.isActive,
        product.isNew,
        now,
        existing.id,
      ]
    );

    const updated = get('SELECT * FROM products WHERE id = ?', [existing.id]);
    return res.json({ product: rowToProduct(updated) });
  });

  app.delete('/api/products/:slug', adminRateLimit, requireAdmin, (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    const existing = get('SELECT * FROM products WHERE slug = ?', [slug]);
    if (!existing) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    run('DELETE FROM products WHERE id = ?', [existing.id]);
    return res.json({ ok: true });
  });
};
