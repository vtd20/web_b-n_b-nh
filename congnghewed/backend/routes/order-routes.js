module.exports = function registerOrderRoutes(app, {
  orderRateLimit,
  adminRateLimit,
  requireAuth,
  requireAdmin,
  all,
  get,
  run,
  normalizeOrderItems,
  generateOrderItemsSummary,
  getOrderRowSummary,
  emitOrderEvent,
  notifyN8n,
  formatTelegramOrderMessage,
  formatOrderProcessingEmail,
  nowIso,
  parseCurrency,
  requireText,
}) {

  app.get('/api/orders', requireAuth, (req, res) => {
    const orders = req.user.role === 'admin'
      ? all('SELECT * FROM orders ORDER BY datetime(created_at) DESC')
      : all('SELECT * FROM orders WHERE user_id = ? ORDER BY datetime(created_at) DESC', [req.user.id]);

    return res.json({
      orders: orders.map(getOrderRowSummary),
    });
  });

  app.get('/api/orders/:id', requireAuth, (req, res) => {
    const order = req.user.role === 'admin'
      ? get('SELECT * FROM orders WHERE id = ?', [req.params.id])
      : get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

    if (!order) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại.' });
    }

    return res.json({ order: getOrderRowSummary(order) });
  });

  app.post('/api/orders', orderRateLimit, requireAuth, (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: 'Đơn hàng phải có ít nhất một sản phẩm.' });
    }

    let normalizedItems = [];
    try {
      normalizedItems = normalizeOrderItems(items);
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Dữ liệu sản phẩm không hợp lệ.' });
    }

    const subtotal = normalizedItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const deliveryFee = Math.max(0, parseCurrency(req.body.deliveryFee));
    const tax = Math.max(0, parseCurrency(req.body.tax));
    const total = subtotal + deliveryFee + tax;
    const createdAt = nowIso();
    const orderId = req.body.id || `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
    const itemsSummary = requireText(req.body.itemsSummary) || generateOrderItemsSummary(normalizedItems);

    run(
      `INSERT INTO orders (
        id, user_id, customer_name, email, phone, address, payment_method,
        delivery_date, delivery_slot, note, status, items_json, items_summary,
        subtotal, delivery_fee, tax, total, placed_label, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        req.user.id,
        requireText(req.body.customer) || req.user.name || 'Guest Customer',
        requireText(req.body.email) || req.user.email || '',
        requireText(req.body.phone),
        requireText(req.body.address),
        requireText(req.body.paymentMethod) || 'Card',
        requireText(req.body.deliveryDate),
        requireText(req.body.deliverySlot),
        requireText(req.body.note),
        JSON.stringify(normalizedItems),
        itemsSummary,
        subtotal,
        deliveryFee,
        tax,
        total,
        createdAt,
        createdAt,
        createdAt,
      ]
    );

    const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
    emitOrderEvent('order-created', order);
    void notifyN8n(order, 'order.created', {
      telegramMessage: formatTelegramOrderMessage(order),
    });
    return res.status(201).json({ order: getOrderRowSummary(order) });
  });

  app.patch('/api/orders/:id/status', adminRateLimit, requireAdmin, (req, res) => {
    const status = requireText(req.body.status);
    const allowed = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
    }

    const existing = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại.' });
    }

    run(
      `UPDATE orders
       SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, nowIso(), req.params.id]
    );

    const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    emitOrderEvent('order-updated', order);
    if (status === 'Processing' && existing.status !== 'Processing') {
      const emailPayload = formatOrderProcessingEmail(order, existing.status, status);
      void notifyN8n(order, 'order.status.changed', {
        status,
        previousStatus: existing.status,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      });
    }
    return res.json({ order: getOrderRowSummary(order) });
  });

  app.patch('/api/orders/:id/cancel', requireAuth, (req, res) => {
    const existing = req.user.role === 'admin'
      ? get('SELECT * FROM orders WHERE id = ?', [req.params.id])
      : get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

    if (!existing) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại.' });
    }

    if (existing.status !== 'Processing') {
      return res.status(400).json({ message: 'Chỉ có thể hủy đơn khi đang xử lý.' });
    }

    run(
      `UPDATE orders
       SET status = 'Cancelled', updated_at = ?
       WHERE id = ?`,
      [nowIso(), req.params.id]
    );

    const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    emitOrderEvent('order-updated', order);
    return res.json({ order: getOrderRowSummary(order) });
  });

  app.delete('/api/orders/:id', adminRateLimit, requireAdmin, (req, res) => {
    const existing = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại.' });
    }

    run('DELETE FROM orders WHERE id = ?', [req.params.id]);
    emitOrderEvent('order-deleted', existing);
    return res.json({ ok: true });
  });
};
