function createOrderService({
  all,
  get,
  run,
  requireText,
  parseCurrency,
  nowIso,
  productService,
  io,
  webhookUrl,
  webhookSecret,
}) {
  function getOrderRowSummary(order) {
    const createdAt = order.created_at || order.createdAt || '';
    const placedLabel = order.placed_label || order.placedLabel || '';
    const resolvedPlacedLabel = placedLabel && placedLabel !== 'Just now'
      ? placedLabel
      : createdAt
        ? new Date(createdAt).toLocaleString('vi-VN')
        : '';

    return {
      id: order.id,
      userId: order.user_id || null,
      customer: order.customer_name,
      email: order.email || '',
      phone: order.phone || '',
      address: order.address || '',
      paymentMethod: order.payment_method,
      deliveryDate: order.delivery_date || '',
      deliverySlot: order.delivery_slot || '',
      note: order.note || '',
      status: order.status,
      items: (() => {
        try {
          return JSON.parse(order.items_json || '[]');
        } catch {
          return [];
        }
      })(),
      itemsSummary: order.items_summary || '',
      subtotal: parseCurrency(order.subtotal),
      deliveryFee: parseCurrency(order.delivery_fee),
      tax: parseCurrency(order.tax),
      total: parseCurrency(order.total),
      createdAt,
      updatedAt: order.updated_at,
      placedLabel: resolvedPlacedLabel,
    };
  }

  function emitOrderEvent(type, order) {
    if (!io || !order) return;
    io.emit(`admin:${type}`, {
      type,
      order: getOrderRowSummary(order),
      emittedAt: nowIso(),
    });
  }

  function moneyText(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
  }

  function formatTelegramOrderMessage(order) {
    const items = (() => {
      try {
        return JSON.parse(order.items_json || '[]');
      } catch {
        return [];
      }
    })();
    const itemsText = items.length
      ? items.map((item) => `${Number(item.quantity || 1)}x ${item.name || 'Sản phẩm'}`).join('\n')
      : order.items_summary || 'Chưa có sản phẩm';

    return [
      '🛒 *ĐƠN HÀNG MỚI*',
      '',
      `• Mã đơn: \`${order.id}\``,
      `• Khách hàng: *${order.customer_name || 'Khách hàng'}*`,
      `• SĐT: ${order.phone || 'Chưa có'}`,
      `• Email: ${order.email || 'Chưa có'}`,
      `• Địa chỉ: ${order.address || 'Chưa có'}`,
      `• Thanh toán: ${order.payment_method || 'Chưa chọn'}`,
      `• Tổng tiền: *${moneyText(order.total)}*`,
      '',
      '*Sản phẩm:*',
      itemsText,
      '',
      `• Thời gian: ${new Date(order.created_at || nowIso()).toLocaleString('vi-VN')}`,
    ].join('\n');
  }

  function formatOrderProcessingEmail(order, fromStatus, toStatus) {
    const items = (() => {
      try {
        return JSON.parse(order.items_json || '[]');
      } catch {
        return [];
      }
    })();
    const itemsText = items.length
      ? items.map((item) => `- ${Number(item.quantity || 1)}x ${item.name || 'Sản phẩm'}`).join('\n')
      : order.items_summary || '- Chưa có sản phẩm';
    const customer = order.customer_name || 'Khách hàng';
    const orderId = order.id || '';
    const total = moneyText(order.total);
    const createdAt = new Date(order.created_at || nowIso()).toLocaleString('vi-VN');

    return {
      subject: `Đơn hàng ${orderId} đang được làm bánh`,
      text: [
        `Xin chào ${customer},`,
        '',
        `Đơn hàng ${orderId} của bạn đã được chuyển sang trạng thái "${toStatus}".`,
        'Chúng tôi đang chuẩn bị bánh cho bạn.',
        '',
        `Trạng thái trước đó: ${fromStatus || 'Chưa xác định'}`,
        `Tổng tiền: ${total}`,
        `Thời gian đặt: ${createdAt}`,
        '',
        'Sản phẩm:',
        itemsText,
        '',
        'Cảm ơn bạn đã mua hàng tại Gifter Bakery.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.7;color:#1f2937">
          <h2 style="margin:0 0 12px;">Đơn hàng ${orderId} đang được làm bánh</h2>
          <p>Xin chào <strong>${customer}</strong>,</p>
          <p>Đơn hàng của bạn đã chuyển sang trạng thái <strong>${toStatus}</strong>.</p>
          <p>Chúng tôi đang chuẩn bị bánh cho bạn và sẽ cập nhật tiếp khi có thay đổi.</p>
          <ul>
            <li><strong>Mã đơn:</strong> ${orderId}</li>
            <li><strong>Trạng thái trước đó:</strong> ${fromStatus || 'Chưa xác định'}</li>
            <li><strong>Tổng tiền:</strong> ${total}</li>
            <li><strong>Thời gian đặt:</strong> ${createdAt}</li>
          </ul>
          <p><strong>Sản phẩm:</strong></p>
          <pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e5e7eb">${itemsText}</pre>
          <p>Cảm ơn bạn đã mua hàng tại Gifter Bakery.</p>
        </div>
      `,
    };
  }

  async function notifyN8n(order, event, meta = {}) {
    if (!webhookUrl || !order) return;

    const payload = {
      event,
      orderId: order.id,
      customer: order.customer_name || '',
      phone: order.phone || '',
      email: order.email || '',
      address: order.address || '',
      paymentMethod: order.payment_method || '',
      itemsSummary: order.items_summary || '',
      total: parseCurrency(order.total),
      createdAt: order.created_at || nowIso(),
      telegramMessage: formatTelegramOrderMessage(order),
      items: (() => {
        try {
          return JSON.parse(order.items_json || '[]');
        } catch {
          return [];
        }
      })(),
      ...meta,
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn('[n8n] Order webhook returned', response.status);
      }
    } catch (error) {
      console.warn('[n8n] Failed to notify order webhook:', error.message);
    }
  }

  return {
    getOrderRowSummary,
    emitOrderEvent,
    moneyText,
    formatTelegramOrderMessage,
    formatOrderProcessingEmail,
    notifyN8n,
  };
}

module.exports = { createOrderService };
