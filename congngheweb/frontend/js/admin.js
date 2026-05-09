const STATUS_ORDER = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
const STATUS_LABELS = {
  Processing: 'Đang xử lý',
  Shipped: 'Đã gửi',
  Delivered: 'Đã giao',
  Cancelled: 'Đã hủy',
};

let liveSocket = null;
let liveSocketLoader = null;
let liveRefreshTimer = null;
let livePollTimer = null;
let liveKnownOrderIds = new Set();
let liveNotifiedOrderIds = new Set();
let liveNotifiedProductIds = new Set();
let liveNotifications = [];
let liveToastHost = null;
let liveNotificationDropdown = null;
let liveNotificationDropdownVisible = false;
let liveNotificationHandlersBound = false;
let liveBellCount = 0;
let liveProductBellCount = 0;

function money(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function isNewProduct(product) {
  return Boolean(product?.isNew);
}

function formatDateKey(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function parseDateTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function withinPeriod(order, period) {
  if (period === 'all') return true;
  const createdAt = parseDateTime(order.createdAt);
  if (!createdAt) return false;

  const now = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === '7d') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  } else {
    return true;
  }

  return createdAt >= start;
}

function aggregateProductSales(orders = []) {
  const sales = new Map();

  orders.forEach((order) => {
    getOrderItems(order).forEach((item) => {
      const key = item.productSlug || item.baseName || item.name || 'unknown';
      const current = sales.get(key) || {
        name: item.baseName || item.name || 'Sản phẩm',
        slug: item.productSlug || key,
        quantity: 0,
        revenue: 0,
      };

      current.quantity += Number(item.quantity || 1);
      current.revenue += Number(item.lineTotal || (Number(item.unitPrice || 0) * Number(item.quantity || 1)) || 0);
      sales.set(key, current);
    });
  });

  return [...sales.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportOrdersCsv(orders = []) {
  const rows = [
    ['Mã đơn', 'Khách hàng', 'Email', 'Trạng thái', 'Tổng tiền', 'Thời gian'],
    ...orders.map((order) => [
      order.id,
      order.customer_name || '',
      order.email || '',
      statusLabel(order.status),
      String(Number(order.total || 0)),
      order.createdAt || '',
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');

  downloadTextFile(`orders-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}

function apiJson(path, options = {}) {
  return fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Có lỗi xảy ra.');
    return body;
  });
}

function adminApiPath(path) {
  const separator = String(path || '').includes('?') ? '&' : '?';
  return `${path}${separator}scope=admin`;
}

async function getCurrentUserSafe() {
  try {
    const data = await apiJson(adminApiPath('/api/me'), { method: 'GET', headers: {} });
    return data.user || null;
  } catch {
    return null;
  }
}

function asText(value) {
  return String(value ?? '').trim();
}

function getOrderItems(order) {
  if (Array.isArray(order.items)) return order.items;
  try {
    return JSON.parse(order.items_json || '[]');
  } catch {
    return [];
  }
}

function summarizeOrders(orders) {
  const customerSet = new Set();
  const statusCounts = {};
  let revenue = 0;

  orders.forEach((order) => {
    revenue += Number(order.total || 0);
    customerSet.add(order.email || order.customer_name);
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  });

  return {
    revenue,
    orderCount: orders.length,
    customerCount: customerSet.size,
    averageOrderValue: orders.length ? revenue / orders.length : 0,
    statusCounts,
    processingCount: statusCounts.Processing || 0,
    shippedCount: statusCounts.Shipped || 0,
    deliveredCount: statusCounts.Delivered || 0,
    cancelledCount: statusCounts.Cancelled || 0,
  };
}

function badgeClass(status) {
  if (status === 'Delivered') return 'admin-badge success';
  if (status === 'Cancelled') return 'admin-badge danger';
  if (status === 'Shipped') return 'admin-badge lavender';
  if (status === 'Processing') return 'admin-badge warning';
  return 'admin-badge admin';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function paymentLabel(paymentMethod) {
  const value = String(paymentMethod || '').toLowerCase();
  if (value === 'cod') return 'Thanh toán khi nhận hàng';
  if (value === 'bank' || value === 'momo' || value === 'card' || value === 'transfer') return 'Chuyển khoản';
  return paymentMethod ? String(paymentMethod) : 'Chưa rõ';
}

function paymentBadgeClass(paymentMethod) {
  const value = String(paymentMethod || '').toLowerCase();
  if (value === 'cod') return 'admin-badge success';
  if (value === 'bank' || value === 'momo' || value === 'card' || value === 'transfer') return 'admin-badge lavender';
  return 'admin-badge admin';
}

function formatPlacedLabel(order) {
  if (order.placedLabel) return order.placedLabel;
  if (!order.createdAt) return 'Không rõ thời gian';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(order.createdAt)).replace(',', ' •');
}

function statCard(label, value, note = '', badge = '', badgeClassName = 'lavender') {
  return `
    <div class="admin-card padded">
      <div class="admin-stat">
        <div>
          <div class="label">${label}</div>
          <div class="value">${value}</div>
        </div>
        ${badge ? `<div class="admin-badge ${badgeClassName}">${badge}</div>` : ''}
      </div>
      ${note ? `<p class="admin-note" style="margin-top:16px;color:${badgeClassName === 'warning' ? 'inherit' : '#1f7a43'};">${note}</p>` : ''}
    </div>
  `;
}

function pageHeader(title, subtitle = '', right = '') {
  return `
    <div style="display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:16px;">
      <div>
        <h2 class="admin-page-title">${title}</h2>
        ${subtitle ? `<p class="admin-page-subtitle">${subtitle}</p>` : ''}
      </div>
      ${right}
    </div>
  `;
}

function sectionShell(inner) {
  return `<div class="admin-shell">${inner}</div>`;
}

function loadStoredOrderIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('gifter-admin-seen-orders') || '[]'));
  } catch {
    return new Set();
  }
}

function saveStoredOrderIds(ids) {
  localStorage.setItem('gifter-admin-seen-orders', JSON.stringify([...ids]));
}

function loadStoredProductIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('gifter-admin-seen-products') || '[]'));
  } catch {
    return new Set();
  }
}

function saveStoredProductIds(ids) {
  localStorage.setItem('gifter-admin-seen-products', JSON.stringify([...ids]));
}

function loadStoredNotifications() {
  try {
    const parsed = JSON.parse(localStorage.getItem('gifter-admin-notifications') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredNotifications(items) {
  localStorage.setItem('gifter-admin-notifications', JSON.stringify(items.slice(0, 20)));
}

function normalizeNotification(item) {
  return {
    id: String(item.id || ''),
    type: item.type || 'info',
    title: String(item.title || ''),
    message: String(item.message || ''),
    href: String(item.href || ''),
    createdAt: String(item.createdAt || new Date().toISOString()),
    read: Boolean(item.read),
  };
}

function getUnreadNotificationCount() {
  return liveNotifications.filter((item) => !item.read).length;
}

function updateBellCount() {
  setBellCount(getUnreadNotificationCount());
}

function getBackendOrigin() {
  return String(window.BAKERY_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function loadSocketClient() {
  if (window.io) return Promise.resolve();
  if (liveSocketLoader) return liveSocketLoader;

  liveSocketLoader = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `${getBackendOrigin()}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  return liveSocketLoader;
}

function ensureLiveToastHost() {
  if (liveToastHost) return liveToastHost;
  liveToastHost = document.getElementById('admin-toast-stack');
  if (liveToastHost) return liveToastHost;

  liveToastHost = document.createElement('div');
  liveToastHost.id = 'admin-toast-stack';
  liveToastHost.className = 'admin-toast-stack';
  document.body.appendChild(liveToastHost);
  return liveToastHost;
}

function setBellCount(count) {
  const bellButton = document.querySelector('.admin-topbar-actions button[aria-label="Thông báo"]');
  if (!bellButton) return;

  let badge = bellButton.querySelector('.admin-bell-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'admin-bell-badge';
    bellButton.style.position = 'relative';
    bellButton.appendChild(badge);
  }

  badge.textContent = String(count);
  badge.hidden = count <= 0;
}

function ensureNotificationDropdown() {
  const bellButton = document.querySelector('.admin-topbar-actions button[aria-label="Thông báo"]');
  if (!bellButton) return null;

  if (!liveNotificationDropdown) {
    liveNotificationDropdown = document.createElement('div');
    liveNotificationDropdown.className = 'admin-notification-dropdown';
    liveNotificationDropdown.hidden = true;
    liveNotificationDropdown.innerHTML = '';
    bellButton.insertAdjacentElement('afterend', liveNotificationDropdown);
    liveNotificationDropdown.onclick = (event) => {
      const markRead = event.target.closest('[data-notification-mark-read]');
      if (markRead) {
        event.preventDefault();
        markAllNotificationsRead();
        return;
      }
      const clearAll = event.target.closest('[data-notification-clear]');
      if (clearAll) {
        event.preventDefault();
        clearAllNotifications();
        return;
      }
      const item = event.target.closest('[data-notification-item]');
      if (item) {
        event.preventDefault();
        handleNotificationNavigate(item.dataset.notificationItem, item.dataset.notificationHref);
      }
    };
  }

  return liveNotificationDropdown;
}

function closeNotificationDropdown() {
  const dropdown = ensureNotificationDropdown();
  if (!dropdown) return;
  dropdown.hidden = true;
  liveNotificationDropdownVisible = false;
  document.body.classList.remove('admin-notification-open');
}

function renderNotificationDropdown() {
  const dropdown = ensureNotificationDropdown();
  if (!dropdown) return;

  const items = [...liveNotifications].slice(0, 8);
  const unread = getUnreadNotificationCount();
  const latestTime = items[0]?.createdAt ? new Date(items[0].createdAt).toLocaleString('vi-VN') : '';

  dropdown.innerHTML = `
    <div class="admin-notification-head">
      <div>
        <strong>Thông báo</strong>
        <p>${unread} chưa đọc${latestTime ? ` · mới nhất ${latestTime}` : ''}</p>
      </div>
      <div class="admin-notification-actions">
        <button type="button" class="admin-notification-action" data-notification-mark-read>${unread ? 'Đánh dấu đã xem' : 'Đã xem hết'}</button>
        <button type="button" class="admin-notification-action danger" data-notification-clear>Xóa tất cả</button>
      </div>
    </div>
    <div class="admin-notification-list">
      ${items.length
      ? items.map((item) => `
            <button type="button" class="admin-notification-item${item.read ? '' : ' unread'}" data-notification-item="${item.id}" data-notification-href="${item.href || ''}">
              <div class="admin-notification-icon ${item.type}">${item.type === 'product' ? 'P' : item.type === 'order' ? 'O' : '!'}</div>
              <div class="admin-notification-copy">
                <strong>${item.title}</strong>
                <p>${item.message}</p>
                <span>${new Date(item.createdAt).toLocaleString('vi-VN')}</span>
              </div>
            </button>
          `).join('')
      : '<div class="admin-notification-empty">Chưa có thông báo mới.</div>'}
    </div>
  `;
}

function openNotificationDropdown() {
  const dropdown = ensureNotificationDropdown();
  if (!dropdown) return;
  renderNotificationDropdown();
  dropdown.hidden = false;
  liveNotificationDropdownVisible = true;
  document.body.classList.add('admin-notification-open');
}

function toggleNotificationDropdown() {
  if (liveNotificationDropdownVisible) {
    closeNotificationDropdown();
  } else {
    openNotificationDropdown();
  }
}

function markAllNotificationsRead() {
  if (!liveNotifications.length) return;
  liveNotifications = liveNotifications.map((item) => ({ ...item, read: true }));
  saveStoredNotifications(liveNotifications);
  updateBellCount();
  renderNotificationDropdown();
}

function clearAllNotifications() {
  liveNotifications = [];
  saveStoredNotifications(liveNotifications);
  liveBellCount = 0;
  liveProductBellCount = 0;
  updateBellCount();
  closeNotificationDropdown();
}

function markNotificationRead(id) {
  const index = liveNotifications.findIndex((item) => item.id === id);
  if (index === -1) return;
  if (liveNotifications[index].read) return;

  liveNotifications[index] = { ...liveNotifications[index], read: true };
  saveStoredNotifications(liveNotifications);
  updateBellCount();
  if (liveNotificationDropdownVisible) {
    renderNotificationDropdown();
  }
}

function handleNotificationNavigate(id, href = '') {
  const item = liveNotifications.find((entry) => entry.id === id);
  const targetHref = String(href || item?.href || '').trim();
  if (!item && !targetHref) return;

  if (item) {
    markNotificationRead(id);
  }
  closeNotificationDropdown();

  if (targetHref) {
    window.setTimeout(() => {
      window.location.href = new URL(targetHref, window.location.href).href;
    }, 0);
  }
}

function addNotification(notification) {
  const item = normalizeNotification(notification);
  if (!item.id) return false;

  const existingIndex = liveNotifications.findIndex((entry) => entry.id === item.id);
  if (existingIndex !== -1) {
    const existing = liveNotifications[existingIndex];
    liveNotifications[existingIndex] = {
      ...existing,
      ...item,
      read: existing.read || item.read,
    };
  } else {
    liveNotifications.unshift(item);
  }

  liveNotifications = liveNotifications.slice(0, 20);
  saveStoredNotifications(liveNotifications);
  updateBellCount();
  if (liveNotificationDropdownVisible) {
    renderNotificationDropdown();
  }
  return true;
}

function pushAdminToast(title, message) {
  const host = ensureLiveToastHost();
  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.innerHTML = `
    <strong>${title}</strong>
    <p>${message}</p>
  `;
  host.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 220);
  }, 3000);
}

function scheduleAdminRefresh() {
  window.clearTimeout(liveRefreshTimer);
  liveRefreshTimer = window.setTimeout(() => boot(), 250);
}

function rememberOrders(orders) {
  liveKnownOrderIds = new Set((orders || []).map((order) => order.id));
}

function detectNewOrders(orders) {
  const currentIds = new Set((orders || []).map((order) => order.id));
  const previousIds = liveKnownOrderIds;
  const freshOrders = (orders || []).filter((order) => !previousIds.has(order.id));
  liveKnownOrderIds = currentIds;
  return freshOrders;
}

function announceNewOrders(orders, source = 'poll') {
  const seen = liveNotifiedOrderIds.size ? liveNotifiedOrderIds : loadStoredOrderIds();
  let changed = false;
  const freshOrders = (orders || []).filter((order) => !seen.has(order.id));

  freshOrders.forEach((order) => {
    seen.add(order.id);
    changed = true;
    handleLiveOrderEvent('order-created', { order, source });
  });

  if (changed) {
    liveNotifiedOrderIds = seen;
    saveStoredOrderIds(seen);
  } else if (!liveNotifiedOrderIds.size) {
    liveNotifiedOrderIds = seen;
  }
}

async function pollAdminOrders() {
  try {
    const data = await apiJson(adminApiPath('/api/orders'), { method: 'GET', headers: {} });
    const orders = data.orders || [];
    detectNewOrders(orders);
    announceNewOrders(orders, 'poll');
  } catch {
    // ignore polling errors and keep trying
  }
}

function startAdminPolling() {
  window.clearInterval(livePollTimer);
  livePollTimer = window.setInterval(pollAdminOrders, 10000);
}

function handleLiveOrderEvent(type, payload = {}) {
  const order = payload.order || null;
  const orderId = order?.id || '';
  const customer = order?.customer || order?.customer_name || 'Khách hàng';
  const total = order ? money(order.total) : '';

  if (type === 'order-created') {
    pushAdminToast('Có đơn hàng mới', `${customer} vừa đặt hàng${total ? `, tổng ${total}` : ''}.`);
    addNotification({
      id: `order:${orderId}`,
      type: 'order',
      title: 'Có đơn hàng mới',
      message: `${customer} vừa đặt hàng${total ? `, tổng ${total}` : ''}.`,
      href: 'admin-orders.html?highlight=' + encodeURIComponent(orderId),
      read: false,
    });
  } else if (type === 'order-updated') {
    pushAdminToast('Đơn hàng đã cập nhật', `Đơn ${orderId || ''} vừa đổi trạng thái.`);
  } else if (type === 'order-deleted') {
    pushAdminToast('Đơn hàng đã xoá', `Đơn ${orderId || ''} đã bị xoá.`);
  }

  if (type === 'order-created') {
    if (!liveNotifiedOrderIds.has(orderId) && orderId) {
      liveNotifiedOrderIds.add(orderId);
      saveStoredOrderIds(liveNotifiedOrderIds);
    }
    liveBellCount = Math.max(liveBellCount + 1, liveNotifiedOrderIds.size);
    updateBellCount();
  }

  if (['dashboard', 'orders', 'customers', 'analytics'].includes(document.body.dataset.adminPage)) {
    scheduleAdminRefresh();
  }
}

function announceNewProducts(products, source = 'poll', options = {}) {
  const silent = Boolean(options.silent);
  const seen = liveNotifiedProductIds.size ? liveNotifiedProductIds : loadStoredProductIds();
  let changed = false;
  const freshProducts = (products || []).filter((product) => isNewProduct(product) && product?.slug && !seen.has(product.slug));

  freshProducts.forEach((product) => {
    seen.add(product.slug);
    changed = true;
    if (!silent) {
      pushAdminToast('Có sản phẩm mới', `${product.name || 'Một sản phẩm'} vừa được thêm vào danh mục.`);
    }
    addNotification({
      id: `product:${product.slug}`,
      type: 'product',
      title: 'Có sản phẩm mới',
      message: `${product.name || 'Một sản phẩm'} vừa được thêm vào danh mục.`,
      href: `admin-products.html?highlight=${encodeURIComponent(product.slug)}`,
      read: false,
    });
  });

  if (changed) {
    liveNotifiedProductIds = seen;
    saveStoredProductIds(seen);
  } else if (!liveNotifiedProductIds.size) {
    liveNotifiedProductIds = seen;
  }

  liveProductBellCount = seen.size;
  updateBellCount();
}

async function initAdminLiveUpdates() {
  if (liveSocket) return liveSocket;

  await loadSocketClient();
  if (typeof window.io !== 'function') {
    startAdminPolling();
    return null;
  }

  liveSocket = window.io(getBackendOrigin(), {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  liveSocket.on('connect', () => {
    updateBellCount();
    startAdminPolling();
  });

  liveSocket.on('connect_error', () => {
    startAdminPolling();
  });

  liveSocket.on('admin:order-created', (payload) => handleLiveOrderEvent('order-created', payload));
  liveSocket.on('admin:order-updated', (payload) => handleLiveOrderEvent('order-updated', payload));
  liveSocket.on('admin:order-deleted', (payload) => handleLiveOrderEvent('order-deleted', payload));

  return liveSocket;
}

async function logoutAdmin() {
  try {
    await apiJson(adminApiPath('/api/auth/logout'), {
      method: 'POST',
      body: JSON.stringify({ scope: 'admin' }),
    });
  } catch {
    // ignore
  }
  if (liveSocket) {
    liveSocket.disconnect();
    liveSocket = null;
  }
  window.clearInterval(livePollTimer);
  livePollTimer = null;
  liveKnownOrderIds = new Set();
  liveNotifiedOrderIds = new Set();
  liveNotifiedProductIds = new Set();
  liveBellCount = 0;
  liveProductBellCount = 0;
  setBellCount(0);
  window.location.href = 'auth.html?mode=login&next=admin.html';
}

async function requireAdmin() {
  const nextUrl = encodeURIComponent(window.location.pathname.split('/').pop());
  const user = await getCurrentUserSafe();
  if (!user || user.role !== 'admin') {
    window.location.href = `auth.html?mode=login&next=${nextUrl}`;
    return null;
  }
  return user;
}

function setUserChip(user) {
  const nameEl = document.getElementById('admin-user-name');
  const avatarEl = document.getElementById('admin-user-avatar');
  if (nameEl) nameEl.textContent = user.name || user.email || 'Quản trị';
  if (avatarEl) avatarEl.textContent = (user.name || user.email || 'Q').slice(0, 1).toUpperCase();
}

function setActiveNav(page) {
  document.querySelectorAll('[data-nav]').forEach((item) => {
    item.classList.toggle('active', item.dataset.nav === page);
  });
}

function renderDashboard(content, orders, products = []) {
  const summary = summarizeOrders(orders);
  const activeProducts = products.filter((product) => product.isActive).length;
  const inactiveProducts = products.length - activeProducts;
  const newProducts = products.filter((product) => isNewProduct(product)).length;
  const topProducts = aggregateProductSales(orders).slice(0, 5);
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 6);

  content.innerHTML = sectionShell(`
    ${pageHeader(
    'Tổng quan',
    'Theo dõi doanh thu, đơn hàng và trạng thái danh mục trong một màn hình.',
    `<div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="admin-button primary" href="admin-orders.html">Xem đơn hàng</a>
        <a class="admin-button" href="admin-products.html">Quản lý sản phẩm</a>
      </div>`,
  )}

    <div class="admin-grid-4" style="margin-top:28px;">
      ${statCard('Doanh thu', money(summary.revenue), 'Tổng doanh thu từ tất cả đơn hàng')}
      ${statCard('Đơn hàng', summary.orderCount, 'Số đơn đang được quản lý')}
      ${statCard('Khách hàng', summary.customerCount, 'Khách duy nhất trong hệ thống')}
      ${statCard('Sản phẩm', products.length, `${activeProducts} đang hiển thị`, '', 'lavender')}
    </div>

    <div class="admin-grid-2" style="margin-top:24px;">
      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Trạng thái sản phẩm</h3>
        <div style="margin-top:18px;display:grid;gap:14px;">
          ${statCard('Đang hiển thị', activeProducts, 'Sản phẩm khách có thể mua', '', 'success')}
          ${statCard('Đang ẩn', inactiveProducts, 'Tạm không xuất hiện trên site', '', 'danger')}
          ${statCard('Mới tạo', newProducts, 'Sản phẩm vừa thêm gần đây', '', 'lavender')}
        </div>
      </div>

      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Sản phẩm bán chạy</h3>
        <div style="margin-top:18px;display:grid;gap:12px;">
          ${topProducts.length
      ? topProducts.map((item, index) => `
                <div style="display:grid;grid-template-columns:32px 1fr auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--admin-border);border-radius:14px;background:#fff;">
                  <div style="display:grid;place-items:center;height:32px;width:32px;border-radius:999px;background:${index === 0 ? '#4f3ba8' : '#eef0f6'};color:${index === 0 ? '#fff' : 'var(--admin-ink)'};font-weight:800;">${index + 1}</div>
                  <div>
                    <div style="font-size:18px;font-weight:800;">${item.name}</div>
                    <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">${item.quantity} món đã bán</div>
                  </div>
                  <div style="font-size:18px;font-weight:800;color:var(--admin-navy);">${money(item.revenue)}</div>
                </div>
              `).join('')
      : '<div class="admin-empty">Chưa có dữ liệu bán chạy.</div>'}
        </div>
      </div>
    </div>

    <div class="admin-grid-2" style="margin-top:24px;">
      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Đơn hàng gần đây</h3>
        <div style="margin-top:18px;display:grid;gap:12px;">
          ${recentOrders.length
      ? recentOrders.map((order) => `
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--admin-border);border-radius:14px;background:#fff;">
                  <div>
                    <div style="font-size:18px;font-weight:800;">${order.customer_name || order.customer || 'Khách hàng'}</div>
                    <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">${formatPlacedLabel(order)} · ${order.id || ''}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:18px;font-weight:800;color:var(--admin-navy);">${money(order.total)}</div>
                    <div style="margin-top:6px;"><span class="${badgeClass(order.status)}">${statusLabel(order.status)}</span></div>
                  </div>
                </div>
              `).join('')
      : '<div class="admin-empty">Chưa có đơn hàng nào.</div>'}
        </div>
      </div>

      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Ghi chú nhanh</h3>
        <div style="margin-top:18px;display:grid;gap:14px;font-size:18px;line-height:1.8;">
          <div>• ${summary.processingCount} đơn đang chờ xử lý.</div>
          <div>• ${summary.shippedCount} đơn đang trên đường giao.</div>
          <div>• ${summary.deliveredCount} đơn đã hoàn tất.</div>
          <div>• ${summary.cancelledCount} đơn đã bị hủy.</div>
        </div>
      </div>
    </div>
  `);
}

function renderOrders(content, orders, highlightId = '') {
  const state = {
    query: '',
    status: 'all',
    currentPage: 1,
  };
  const pageSize = 4;

  const render = () => {
    const filtered = orders.filter((order) => {
      const query = state.query.trim().toLowerCase();
      const matchesQuery =
        !query ||
        `${order.id} ${order.customer_name || ''} ${order.email || ''} ${order.phone || ''} ${order.address || ''}`
          .toLowerCase()
          .includes(query);
      const matchesStatus = state.status === 'all' || order.status === state.status;
      return matchesQuery && matchesStatus;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(Math.max(Number(state.currentPage || 1), 1), totalPages);
    state.currentPage = currentPage;
    const visibleOrders = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    content.innerHTML = sectionShell(`
      ${pageHeader(
      'Đơn hàng',
      'Xem, lọc và cập nhật trạng thái đơn hàng nhanh trong cùng một màn hình.',
      `<div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="admin-button primary" id="orders-refresh" type="button">Làm mới</button>
          <button class="admin-button" id="orders-export" type="button">Xuất CSV</button>
        </div>`,
    )}

      <div class="admin-card padded" style="margin-top:28px;">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:14px;align-items:center;">
          <label class="search search-tight" style="min-width:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
            <input id="order-search" class="admin-input" placeholder="Tìm đơn hàng..." value="${asText(state.query)}" />
          </label>
          <select id="order-status-filter" class="admin-select">
            <option value="all" ${state.status === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="Processing" ${state.status === 'Processing' ? 'selected' : ''}>Đang xử lý</option>
            <option value="Shipped" ${state.status === 'Shipped' ? 'selected' : ''}>Đã gửi</option>
            <option value="Delivered" ${state.status === 'Delivered' ? 'selected' : ''}>Đã giao</option>
            <option value="Cancelled" ${state.status === 'Cancelled' ? 'selected' : ''}>Đã hủy</option>
          </select>
        </div>
        <p class="admin-note" style="margin-top:14px;">Đang hiển thị <span id="orders-count">${filtered.length}</span> / ${orders.length} đơn hàng</p>
      </div>

      <div class="admin-card admin-orders-panel" style="margin-top:24px;overflow:hidden;">
        <div class="admin-table">
          <div class="admin-table-head" style="grid-template-columns:1fr .8fr .55fr .8fr .55fr .75fr .8fr .5fr;">
            <div>Khách hàng</div><div>Mã đơn</div><div>Trạng thái</div><div>Thanh toán</div><div>Tiền</div><div>Thời gian</div><div>Chi tiết</div><div></div>
          </div>
          ${visibleOrders.length
        ? visibleOrders.map((order) => `
                <div class="admin-table-row ${highlightId === order.id ? 'highlight' : ''}" style="grid-template-columns:1fr .8fr .55fr .8fr .55fr .75fr .8fr .5fr;">
                  <div>
                    <div style="font-size:18px;font-weight:800;">${order.customer_name || 'Khách hàng'}</div>
                    <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">${order.email || ''}</div>
                  </div>
                  <div style="font-weight:700;">${order.id}</div>
                  <div><span class="${badgeClass(order.status)}">${statusLabel(order.status)}</span></div>
                  <div><span class="${paymentBadgeClass(order.paymentMethod)}">${paymentLabel(order.paymentMethod)}</span></div>
                  <div style="font-weight:800;color:var(--admin-navy);">${money(order.total)}</div>
                  <div style="color:var(--admin-muted);">${formatPlacedLabel(order)}</div>
                  <div><a class="admin-button" href="admin-orders.html?highlight=${encodeURIComponent(order.id)}">Xem</a></div>
                  <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                    ${STATUS_ORDER.filter((status) => status !== order.status).map((status) => `<button class="admin-button" data-order-status="${order.id}" data-status="${status}" type="button">${statusLabel(status)}</button>`).join('')}
                    <button class="admin-button" data-order-delete="${order.id}" type="button" style="color:var(--admin-red);">Xóa</button>
                  </div>
                </div>
              `).join('')
        : '<div class="admin-empty">Không có đơn hàng phù hợp.</div>'}
        </div>
        ${filtered.length > pageSize
        ? `<div class="admin-pagination" data-admin-pagination="orders">
              <button type="button" data-admin-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>Trước</button>
              ${Array.from({ length: totalPages }, (_, index) => index + 1)
          .slice(Math.max(0, currentPage - 2), Math.max(0, currentPage - 2) + 3)
          .map((page) => `<button type="button" class="${page === currentPage ? 'active' : ''}" data-admin-page="${page}">${page}</button>`)
          .join('')}
              <button type="button" data-admin-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>Sau</button>
            </div>`
        : ''}
      </div>
    `);

    document.getElementById('order-search')?.addEventListener('input', (event) => {
      state.query = event.target.value || '';
      state.currentPage = 1;
      render();
    });

    document.getElementById('order-status-filter')?.addEventListener('change', (event) => {
      state.status = event.target.value;
      state.currentPage = 1;
      render();
    });

    document.getElementById('orders-refresh')?.addEventListener('click', () => {
      boot();
    });

    document.getElementById('orders-export')?.addEventListener('click', () => {
      exportOrdersCsv(filtered);
    });

    document.querySelectorAll('[data-order-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        const orderId = button.dataset.orderStatus;
        const nextStatus = button.dataset.status;
        await apiJson(adminApiPath(`/api/orders/${orderId}/status`), {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        });
        await boot();
      });
    });

    document.querySelectorAll('[data-order-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const orderId = button.dataset.orderDelete;
        if (!confirm('Xóa đơn hàng này?')) return;
        await apiJson(adminApiPath(`/api/orders/${orderId}`), { method: 'DELETE' });
        await boot();
      });
    });

    document.querySelectorAll('[data-admin-pagination="orders"] [data-admin-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.adminPage;
        if (key === 'prev') state.currentPage = Math.max(1, currentPage - 1);
        else if (key === 'next') state.currentPage = Math.min(totalPages, currentPage + 1);
        else state.currentPage = Number(key || 1);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  };

  render();
}

async function renderProducts(content) {
  const categoryLabels = {
    cake: 'Bánh kem',
    tiramisu: 'Tiramisu',
    cupcake: 'Cupcake',
    sponge: 'Bánh bông lan',
    bread: 'Bánh mì ngọt',
  };

  const parseGallery = (value) =>
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const loadProducts = async () => {
    const data = await apiJson(adminApiPath('/api/products'), { method: 'GET', headers: {} });
    return Array.isArray(data.products) ? data.products : [];
  };

  let products = [];
  let state = {
    query: '',
    category: 'all',
    editingSlug: '',
    currentPage: 1,
  };
  const pageSize = 4;

  const getEditingProduct = () => products.find((product) => product.slug === state.editingSlug) || null;

  const productFormMarkup = (product = null) => {
    const galleryText = Array.isArray(product?.gallery) ? product.gallery.join('\n') : '';
    const escapeField = (value) => (typeof escapeHtml === 'function' ? escapeHtml(value) : String(value || ''));
    const formTitle = product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới';
    const formNote = product
      ? 'Giữ đúng cấu trúc dữ liệu gốc để sản phẩm lên trang người dùng và trang chủ ổn định.'
      : 'Nhập giống các sản phẩm mẫu ban đầu: tên, slug, danh mục, giá, ảnh chính, gallery và mô tả.';

    return `
      <div class="admin-grid-2" style="margin-top:28px;align-items:start;isolation:isolate;">
        <div class="admin-card padded admin-product-form-card">
          <h3 style="margin:0;font-size:24px;font-weight:800;">${formTitle}</h3>
          <p class="admin-note" style="margin-top:10px;">${formNote}</p>
          <form id="admin-product-form" class="admin-product-form" style="margin-top:18px;display:grid;gap:18px;">
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">
              <label class="admin-field">
                <span class="admin-field-label">Tên sản phẩm</span>
                <input class="admin-input" id="product-name" placeholder="Bánh Kem Dâu Tây" value="${escapeField(product?.name || '')}" required />
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Slug</span>
                <input class="admin-input" id="product-slug" placeholder="banh-kem-dau-tay" value="${escapeField(product?.slug || '')}" required />
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Danh mục</span>
                <select class="admin-select" id="product-category" required>
                  <option value="cake" ${product?.category === 'cake' ? 'selected' : ''}>Bánh kem</option>
                  <option value="tiramisu" ${product?.category === 'tiramisu' ? 'selected' : ''}>Tiramisu</option>
                  <option value="cupcake" ${product?.category === 'cupcake' ? 'selected' : ''}>Cupcake</option>
                  <option value="sponge" ${product?.category === 'sponge' ? 'selected' : ''}>Bánh bông lan</option>
                  <option value="bread" ${product?.category === 'bread' ? 'selected' : ''}>Bánh mì ngọt</option>
                </select>
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Giá bán</span>
                <input class="admin-input" id="product-price" type="number" min="0" placeholder="320000" value="${Number(product?.price || 0)}" required />
              </label>
            </div>

            <div style="display:grid;gap:14px;">
              <label class="admin-field">
                <span class="admin-field-label">Đường dẫn ảnh chính</span>
                <input class="admin-input" id="product-image" placeholder="img/banh_kem/banhkem (1).jpg" value="${escapeField(product?.image || '')}" required />
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Gallery ảnh phụ</span>
                <textarea class="admin-input" id="product-gallery" rows="4" placeholder="Mỗi dòng một ảnh">${escapeField(galleryText)}</textarea>
                <span class="admin-field-help">Nhập đúng như 30 sản phẩm gốc: mỗi dòng một đường dẫn ảnh.</span>
              </label>
            </div>

            <div style="display:grid;gap:14px;">
              <label class="admin-field">
                <span class="admin-field-label">Mô tả ngắn</span>
                <textarea class="admin-input" id="product-description" rows="3" placeholder="Lớp kem mịn và dâu tươi, hợp cho sinh nhật..." required>${escapeField(product?.description || '')}</textarea>
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Mô tả chi tiết</span>
                <textarea class="admin-input" id="product-detail" rows="4" placeholder="Thông tin chi tiết về nguyên liệu, hương vị, kích thước...">${escapeField(product?.detail || '')}</textarea>
              </label>
            </div>

            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:end;">
              <label class="admin-field">
                <span class="admin-field-label">Thứ tự nổi bật</span>
                <input class="admin-input" id="product-featured" type="number" min="0" placeholder="1" value="${Number(product?.featured || 0)}" />
              </label>
              <label class="admin-checkline">
                <input id="product-active" type="checkbox" ${product?.isActive === false ? '' : 'checked'} />
                <span>Đang hiển thị</span>
              </label>
            </div>

            <div class="admin-product-form-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <button class="admin-button primary" type="submit">${product ? 'Cập nhật' : 'Thêm sản phẩm'}</button>
              ${product ? '<button class="admin-button" id="product-cancel-edit" type="button">Hủy chỉnh sửa</button>' : ''}
              <button class="admin-button" id="product-reset-form" type="button">Làm mới</button>
            </div>
          </form>
        </div>

        <div class="admin-card padded">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
            <h3 style="margin:0;font-size:24px;font-weight:800;">Danh sách sản phẩm</h3>
            <div style="display:flex;gap:10px;align-items:center;">
              <label class="search search-tight" style="min-width:260px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
                <input id="product-search" class="admin-input" placeholder="Tìm sản phẩm..." value="${asText(state.query)}" />
              </label>
              <select id="category-filter" class="admin-select" style="max-width:220px;">
                <option value="all" ${state.category === 'all' ? 'selected' : ''}>Tất cả danh mục</option>
                <option value="cake" ${state.category === 'cake' ? 'selected' : ''}>Bánh kem</option>
                <option value="tiramisu" ${state.category === 'tiramisu' ? 'selected' : ''}>Tiramisu</option>
                <option value="cupcake" ${state.category === 'cupcake' ? 'selected' : ''}>Cupcake</option>
                <option value="sponge" ${state.category === 'sponge' ? 'selected' : ''}>Bánh bông lan</option>
                <option value="bread" ${state.category === 'bread' ? 'selected' : ''}>Bánh mì ngọt</option>
              </select>
              <button class="admin-button" id="product-refresh" type="button">Làm mới</button>
            </div>
          </div>
          <p class="admin-note" style="margin-top:16px;">Đang hiển thị <span id="admin-products-count">0</span> sản phẩm</p>
          <div id="admin-products-grid" class="admin-products-grid" style="margin-top:18px;"></div>
          <div id="admin-products-pagination" class="admin-pagination" style="margin-top:20px;"></div>
        </div>
      </div>
    `;
  };

  const render = () => {
    const filtered = products.filter((product) => {
      const query = state.query.trim().toLowerCase();
      const matchesQuery =
        !query || `${product.name} ${product.description} ${product.slug}`.toLowerCase().includes(query);
      const matchesCategory = state.category === 'all' || product.category === state.category;
      return matchesQuery && matchesCategory;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(Math.max(Number(state.currentPage || 1), 1), totalPages);
    state.currentPage = currentPage;
    const visibleProducts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    content.innerHTML = sectionShell(`
      ${pageHeader(
      'Sản phẩm',
      'Thêm, sửa, ẩn và xoá sản phẩm trực tiếp từ cơ sở dữ liệu.',
      `<button class="admin-button primary" id="start-new-product" type="button">+ Thêm sản phẩm mới</button>`,
    )}
      ${productFormMarkup(getEditingProduct())}
    `);

    document.getElementById('admin-products-count').textContent = `${visibleProducts.length} / ${filtered.length}`;
    const grid = document.getElementById('admin-products-grid');
    if (grid) {
      grid.innerHTML = visibleProducts.length
        ? visibleProducts
          .map(
            (product) => `
                <article class="admin-product-card">
                  <div class="admin-product-media">
                    ${isNewProduct(product) ? '<span class="admin-product-new-badge">Mới tạo</span>' : ''}
                    <img src="${product.image}" alt="${product.name}" />
                  </div>
                  <div class="body">
                    <div class="admin-product-head">
                      <h3 class="admin-product-title">${product.name}</h3>
                      <div class="admin-product-price">${money(product.price)}</div>
                    </div>
                    <p class="admin-note admin-product-desc">${product.description}</p>
                    <div class="admin-product-meta">
                      <span class="admin-badge admin">${categoryLabels[product.category] || product.category}</span>
                      <span class="admin-badge ${product.isActive ? 'success' : 'danger'}">${product.isActive ? 'Hiển thị' : 'Ẩn'}</span>
                    </div>
                    <div class="admin-product-actions">
                      <button class="admin-button" type="button" data-edit-product="${product.slug}">Chỉnh sửa</button>
                      <button class="admin-button" type="button" data-toggle-product="${product.slug}">${product.isActive ? 'Ẩn' : 'Hiện'}</button>
                      <button class="admin-button" type="button" data-delete-product="${product.slug}" style="color:var(--admin-red);">Xoá</button>
                    </div>
                  </div>
                </article>
              `,
          )
          .join('')
        : '<div class="admin-card admin-empty">Không tìm thấy sản phẩm phù hợp.</div>';
    }
    const paginationHost = document.getElementById('admin-products-pagination');
    if (paginationHost) {
      if (filtered.length > pageSize) {
        const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
        const visiblePages = pages.slice(Math.max(0, currentPage - 2), Math.max(0, currentPage - 2) + 3);
        paginationHost.innerHTML = `
          <button type="button" data-admin-products-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>Trước</button>
          ${visiblePages.map((page) => `<button type="button" class="${page === currentPage ? 'active' : ''}" data-admin-products-page="${page}">${page}</button>`).join('')}
          <button type="button" data-admin-products-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>Sau</button>
        `;
        paginationHost.querySelectorAll('[data-admin-products-page]').forEach((button) => {
          button.addEventListener('click', () => {
            const key = button.dataset.adminProductsPage;
            if (key === 'prev') state.currentPage = Math.max(1, currentPage - 1);
            else if (key === 'next') state.currentPage = Math.min(totalPages, currentPage + 1);
            else state.currentPage = Number(key || 1);
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });
      } else {
        paginationHost.innerHTML = '';
      }
    }

    document.getElementById('start-new-product')?.addEventListener('click', () => {
      state.editingSlug = '';
      render();
    });

    document.getElementById('product-refresh')?.addEventListener('click', async () => {
      await refreshProducts({ silent: true });
    });

    document.getElementById('product-search')?.addEventListener('input', (event) => {
      state.query = event.target.value || '';
      state.currentPage = 1;
      render();
    });

    document.getElementById('category-filter')?.addEventListener('change', (event) => {
      state.category = event.target.value;
      state.currentPage = 1;
      render();
    });

    document.querySelectorAll('[data-edit-product]').forEach((button) => {
      button.addEventListener('click', () => {
        state.editingSlug = button.dataset.editProduct || '';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    document.querySelectorAll('[data-toggle-product]').forEach((button) => {
      button.addEventListener('click', async () => {
        const slug = button.dataset.toggleProduct;
        const target = products.find((item) => item.slug === slug);
        if (!target) return;
        await apiJson(adminApiPath(`/api/products/${slug}`), {
          method: 'PATCH',
          body: JSON.stringify({
            ...target,
            isActive: !target.isActive,
          }),
        });
        await refreshProducts();
      });
    });

    document.querySelectorAll('[data-delete-product]').forEach((button) => {
      button.addEventListener('click', async () => {
        const slug = button.dataset.deleteProduct;
        if (!confirm('Xóa sản phẩm này?')) return;
        await apiJson(adminApiPath(`/api/products/${slug}`), { method: 'DELETE' });
        if (state.editingSlug === slug) state.editingSlug = '';
        await refreshProducts();
      });
    });

    const form = document.getElementById('admin-product-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const editing = getEditingProduct();
        const payload = {
          name: document.getElementById('product-name').value.trim(),
          slug: document.getElementById('product-slug').value.trim(),
          category: document.getElementById('product-category').value,
          price: Number(document.getElementById('product-price').value || 0),
          image: document.getElementById('product-image').value.trim(),
          gallery: parseGallery(document.getElementById('product-gallery').value),
          description: document.getElementById('product-description').value.trim(),
          detail: document.getElementById('product-detail').value.trim(),
          featured: Number(document.getElementById('product-featured').value || 0),
          isActive: document.getElementById('product-active').checked,
        };

        if (!payload.name || !payload.slug || !payload.category || !payload.image || !payload.description) {
          alert('Vui lòng nhập đầy đủ thông tin sản phẩm.');
          return;
        }

        const route = editing ? `/api/products/${editing.slug}` : '/api/products';
        const method = editing ? 'PATCH' : 'POST';
        await apiJson(adminApiPath(route), {
          method,
          body: JSON.stringify(payload),
        });
        if (!editing && payload.slug) {
          liveNotifiedProductIds.add(payload.slug);
          saveStoredProductIds(liveNotifiedProductIds);
          addNotification({
            id: `product:create:${payload.slug}`,
            type: 'product',
            title: 'Có sản phẩm mới',
            message: `${payload.name} vừa được thêm vào danh mục.`,
            href: `admin-products.html?highlight=${encodeURIComponent(payload.slug)}`,
            read: false,
          });
        }
        pushAdminToast(
          editing ? 'Cập nhật sản phẩm thành công' : 'Thêm sản phẩm thành công',
          `${payload.name} đã được ${editing ? 'cập nhật' : 'thêm'} vào danh mục.`,
        );
        state.editingSlug = '';
        state.currentPage = 1;
        await refreshProducts({ silent: true });
      } catch (error) {
        pushAdminToast('Không thể lưu sản phẩm', error?.message || 'Vui lòng thử lại.');
      }
    });

    document.getElementById('product-reset-form')?.addEventListener('click', () => {
      state.editingSlug = '';
      render();
    });

    document.getElementById('product-cancel-edit')?.addEventListener('click', () => {
      state.editingSlug = '';
      render();
    });
  };

  const refreshProducts = async (options = {}) => {
    products = await loadProducts().catch(() => []);
    announceNewProducts(products, 'poll', options);
    render();
  };

  await refreshProducts();
}

function renderCustomers(content, orders) {
  const customers = new Map();
  orders.forEach((order) => {
    const key = order.email || order.customer_name;
    const current = customers.get(key) || {
      name: order.customer_name,
      email: order.email || '',
      orders: 0,
      spent: 0,
      lastOrder: order.createdAt,
    };
    current.orders += 1;
    current.spent += Number(order.total || 0);
    if (new Date(order.createdAt || 0) > new Date(current.lastOrder || 0)) current.lastOrder = order.createdAt;
    customers.set(key, current);
  });

  const list = [...customers.values()].sort((a, b) => b.spent - a.spent);
  const repeatCustomers = list.filter((item) => item.orders > 1);
  const topCustomer = list[0] || null;
  const recentCustomers = [...list].slice(0, 6);

  content.innerHTML = sectionShell(`
    ${pageHeader('Khách hàng', 'Theo dõi khách mua lại, giá trị đơn và nhóm khách có đóng góp cao nhất.')}

    <div class="admin-grid-4" style="margin-top:28px;">
      ${statCard('Tổng khách hàng', list.length, 'Email hoặc tên khách duy nhất')}
      ${statCard('Khách mua lại', repeatCustomers.length, 'Đặt hàng nhiều hơn 1 lần', '↻', 'success')}
      ${statCard('Tổng đơn hàng', orders.length, 'Tính trên toàn hệ thống')}
      ${statCard('Doanh thu', money(list.reduce((sum, item) => sum + item.spent, 0)), 'Tổng chi tiêu của toàn bộ khách')}
    </div>

    <div class="admin-grid-2" style="margin-top:24px;">
      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Khách nổi bật</h3>
        <div style="margin-top:18px;display:grid;gap:12px;">
          ${topCustomer ? `
            <div style="border:1px solid var(--admin-border);border-radius:16px;padding:18px;background:#fff;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;">
                <div>
                  <div style="font-size:22px;font-weight:800;">${topCustomer.name}</div>
                  <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">${topCustomer.email || 'Chưa có email'}</div>
                </div>
                <span class="admin-badge lavender">${topCustomer.orders} đơn</span>
              </div>
              <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
                <div style="background:#fbf7ff;border-radius:14px;padding:12px 14px;">
                  <div class="admin-field-label">Chi tiêu</div>
                  <div style="margin-top:8px;font-size:22px;font-weight:800;color:var(--admin-navy);">${money(topCustomer.spent)}</div>
                </div>
                <div style="background:#fbf7ff;border-radius:14px;padding:12px 14px;">
                  <div class="admin-field-label">Đơn gần nhất</div>
                  <div style="margin-top:8px;font-size:18px;font-weight:800;">${topCustomer.lastOrder ? new Date(topCustomer.lastOrder).toLocaleDateString('vi-VN') : 'N/A'}</div>
                </div>
              </div>
            </div>` : '<div class="admin-empty">Chưa có khách nào.</div>'}
        </div>
      </div>

      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Tóm tắt</h3>
        <div style="margin-top:18px;display:grid;gap:14px;font-size:18px;line-height:1.8;">
          <div>• ${list.length} khách duy nhất trong hệ thống.</div>
          <div>• ${repeatCustomers.length} khách đã quay lại mua thêm.</div>
          <div>• ${orders.length} đơn hàng đang được quản lý.</div>
          <div>• ${money(list.reduce((sum, item) => sum + item.spent, 0))} là tổng chi tiêu.</div>
        </div>
      </div>
    </div>

    <div class="admin-card" style="margin-top:24px;overflow:hidden;">
      <div style="padding:18px 20px;border-bottom:1px solid var(--admin-border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Danh sách khách hàng</h3>
        <span class="admin-badge admin">${list.length} khách</span>
      </div>
      <div class="admin-table">
        <div class="admin-table-head" style="grid-template-columns:1.2fr 1fr .45fr .55fr .5fr;">
          <div>Khách hàng</div><div>Email</div><div>Đơn</div><div>Chi tiêu</div><div>Hạng</div>
        </div>
        ${recentCustomers.concat(list.slice(6)).map(
    (customer) => `
            <div class="admin-table-row" style="grid-template-columns:1.2fr 1fr .45fr .55fr .5fr;">
              <div>
                <div style="font-size:18px;font-weight:800;">${customer.name}</div>
                <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">Đơn gần nhất: ${customer.lastOrder ? new Date(customer.lastOrder).toLocaleDateString('vi-VN') : 'N/A'}</div>
              </div>
              <div>${customer.email || 'Chưa có email'}</div>
              <div style="font-size:18px;font-weight:800;">${customer.orders}</div>
              <div style="font-size:18px;font-weight:800;">${money(customer.spent)}</div>
              <div><span class="${badgeClass(customer.orders > 3 ? 'Delivered' : customer.orders > 1 ? 'Shipped' : 'Processing')}">${customer.orders > 3 ? 'VIP' : customer.orders > 1 ? 'Thân thiết' : 'Mới'}</span></div>
            </div>`
  ).join('')}
      </div>
    </div>
  `);
}

function renderAnalytics(content, orders) {
  const state = {
    period: '7d',
    minTotal: '',
    maxTotal: '',
  };

  const visibleOrders = () => orders.filter((order) => {
    if (!withinPeriod(order, state.period)) return false;
    const total = Number(order.total || 0);
    const min = state.minTotal === '' ? null : Number(state.minTotal);
    const max = state.maxTotal === '' ? null : Number(state.maxTotal);
    if (Number.isFinite(min) && total < min) return false;
    if (Number.isFinite(max) && total > max) return false;
    return true;
  });

  const render = () => {
    const filtered = visibleOrders();
    const summary = summarizeOrders(filtered);
    const bars = [
      ['Processing', summary.processingCount],
      ['Shipped', summary.shippedCount],
      ['Delivered', summary.deliveredCount],
      ['Cancelled', summary.cancelledCount],
    ];
    const peak = Math.max(...bars.map(([, count]) => count), 1);
    const revenueByDay = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = formatDateKey(day);
      const dayOrders = filtered.filter((order) => formatDateKey(order.createdAt) === key);
      return dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    });
    const maxRevenue = Math.max(...revenueByDay, 1);
    const topProducts = aggregateProductSales(filtered).slice(0, 5);

    content.innerHTML = sectionShell(`
      ${pageHeader('Thống kê', 'Xem hiệu suất đơn hàng, doanh thu và sản phẩm bán chạy.')}

      <div class="admin-grid-4" style="margin-top:28px;">
        ${statCard('Doanh thu', money(summary.revenue))}
        ${statCard('Giá trị đơn trung bình', money(summary.averageOrderValue))}
        ${statCard('Khách hàng', summary.customerCount)}
        ${statCard('Đơn đang mở', summary.processingCount + summary.shippedCount)}
      </div>

      <div class="admin-card padded" style="margin-top:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <h3 style="margin:0;font-size:24px;font-weight:800;">Bộ lọc chi tiết</h3>
          <span class="admin-badge lavender">${filtered.length} đơn phù hợp</span>
        </div>
        <div style="margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;">
          <button class="admin-button ${state.period === '7d' ? 'primary' : ''}" data-analytics-period="7d" type="button">7 ngày</button>
          <button class="admin-button ${state.period === '30d' ? 'primary' : ''}" data-analytics-period="30d" type="button">30 ngày</button>
          <input class="admin-input" data-analytics-min type="number" min="0" placeholder="Tổng tiền tối thiểu" value="${state.minTotal}" />
          <input class="admin-input" data-analytics-max type="number" min="0" placeholder="Tổng tiền tối đa" value="${state.maxTotal}" />
        </div>
      </div>

      <div class="admin-grid-2" style="margin-top:24px;">
        <div class="admin-card padded">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <h3 style="margin:0;font-size:24px;font-weight:800;">Cơ cấu trạng thái đơn</h3>
            <span class="admin-badge lavender">${summary.orderCount} đơn</span>
          </div>
          <div style="margin-top:24px;display:grid;gap:18px;">
            ${bars.map(([label, count]) => `
              <div style="display:grid;grid-template-columns:160px 1fr 60px;gap:14px;align-items:center;">
                <div style="font-size:18px;font-weight:700;">${statusLabel(label)}</div>
                <div style="height:14px;border-radius:999px;background:#f0f3fa;overflow:hidden;">
                  <div style="height:100%;width:${(count / peak) * 100}%;border-radius:999px;background:${label === 'Delivered' ? '#2ea66f' : label === 'Cancelled' ? '#d95c57' : label === 'Shipped' ? '#2e7dd7' : '#4f3ba8'};"></div>
                </div>
                <div style="text-align:right;font-size:18px;font-weight:800;">${count}</div>
              </div>`).join('')}
          </div>
        </div>

        <div class="admin-card padded">
          <h3 style="margin:0;font-size:24px;font-weight:800;">Doanh thu 7 ngày</h3>
          <div style="margin-top:22px;display:flex;align-items:end;gap:12px;height:280px;background:#fbf7ff;border-radius:18px;padding:20px;">
            ${revenueByDay.map((value, index) => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;">
                <div style="width:100%;height:${Math.max(18, (value / maxRevenue) * 180 + 18)}px;border-radius:16px 16px 0 0;background:linear-gradient(180deg,rgba(91,58,168,.3),rgba(91,58,168,.65));"></div>
                <div style="font-size:12px;font-weight:700;">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index]}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="admin-grid-2" style="margin-top:24px;">
        <div class="admin-card padded">
          <h3 style="margin:0;font-size:24px;font-weight:800;">Sản phẩm bán chạy</h3>
          <div style="margin-top:18px;display:grid;gap:12px;">
            ${topProducts.length
        ? topProducts.map((item, index) => `
                  <div style="display:grid;grid-template-columns:32px 1fr auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--admin-border);border-radius:14px;background:#fff;">
                    <div style="display:grid;place-items:center;height:32px;width:32px;border-radius:999px;background:${index === 0 ? '#4f3ba8' : '#eef0f6'};color:${index === 0 ? '#fff' : 'var(--admin-ink)'};font-weight:800;">${index + 1}</div>
                    <div>
                      <div style="font-size:18px;font-weight:800;">${item.name}</div>
                      <div style="margin-top:4px;color:var(--admin-muted);font-size:14px;">${item.quantity} món đã bán</div>
                    </div>
                    <div style="font-size:18px;font-weight:800;color:var(--admin-navy);">${money(item.revenue)}</div>
                  </div>
                `).join('')
        : '<div class="admin-empty">Chưa có dữ liệu bán chạy.</div>'}
          </div>
        </div>

        <div class="admin-card padded">
          <h3 style="margin:0;font-size:24px;font-weight:800;">Nhận định</h3>
          <div style="margin-top:18px;display:grid;gap:14px;font-size:18px;line-height:1.8;">
            <div>• ${summary.processingCount} đơn đang chờ xử lý.</div>
            <div>• ${summary.shippedCount} đơn đang trên đường giao.</div>
            <div>• ${summary.deliveredCount} đơn đã hoàn tất.</div>
            <div>• ${summary.cancelledCount} đơn đã bị hủy.</div>
          </div>
        </div>
      </div>
    `);

    document.querySelectorAll('[data-analytics-period]').forEach((button) => {
      button.addEventListener('click', () => {
        state.period = button.dataset.analyticsPeriod;
        render();
      });
    });

    document.querySelector('[data-analytics-min]')?.addEventListener('input', (event) => {
      state.minTotal = event.target.value;
      render();
    });

    document.querySelector('[data-analytics-max]')?.addEventListener('input', (event) => {
      state.maxTotal = event.target.value;
      render();
    });
  };

  render();
}

function renderSettings(content) {
  const settingsKey = 'gifter-admin-settings';
  const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
  const state = {
    storeName: saved.storeName || 'Gifter Bakery',
    email: saved.email || 'orders@gifterbakery.com',
    notifyNewOrders: saved.notifyNewOrders ?? true,
    notifyLowStock: saved.notifyLowStock ?? true,
    deliveryNote: saved.deliveryNote || 'Giao hàng trong ngày nếu đặt trước 14:00.',
  };

  const save = () => localStorage.setItem(settingsKey, JSON.stringify(state));

  content.innerHTML = sectionShell(`
    ${pageHeader('Cài đặt', 'Cập nhật thương hiệu cửa hàng, thông báo và ghi chú vận hành.')}

    <div class="admin-grid-2" style="margin-top:28px;">
      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Hồ sơ cửa hàng</h3>
        <div style="margin-top:20px;display:grid;gap:16px;">
          <label class="admin-field">
            <span class="admin-field-label">Tên cửa hàng</span>
            <input id="setting-store-name" class="admin-input" value="${asText(state.storeName)}" />
          </label>
          <label class="admin-field">
            <span class="admin-field-label">Email nhận thông báo</span>
            <input id="setting-email" class="admin-input" value="${asText(state.email)}" />
          </label>
          <label class="admin-field">
            <span class="admin-field-label">Ghi chú giao hàng</span>
            <textarea id="setting-delivery-note" class="admin-input" rows="4">${asText(state.deliveryNote)}</textarea>
          </label>
        </div>
        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="admin-button primary" id="save-settings" type="button">Lưu thay đổi</button>
          <button class="admin-button" type="button" id="reset-settings">Đặt lại</button>
        </div>
      </div>

      <div class="admin-card padded">
        <h3 style="margin:0;font-size:24px;font-weight:800;">Thông báo</h3>
        <div style="margin-top:18px;display:grid;gap:14px;font-size:18px;">
          <label class="admin-checkline"><input id="setting-new-orders" type="checkbox" ${state.notifyNewOrders ? 'checked' : ''} /> <span>Thông báo đơn hàng mới</span></label>
          <label class="admin-checkline"><input id="setting-low-stock" type="checkbox" ${state.notifyLowStock ? 'checked' : ''} /> <span>Cảnh báo sắp hết hàng</span></label>
        </div>
        <div style="margin-top:20px;border-radius:18px;background:#fbf7ff;padding:18px;">
          <div class="admin-field-label">Ghi chú</div>
          <div style="margin-top:8px;font-size:18px;line-height:1.7;color:var(--admin-ink);">
            Các cài đặt này được lưu cục bộ trong trình duyệt, phù hợp cho bản demo và thử nghiệm quản trị.
          </div>
        </div>
      </div>
    </div>
  `);

  document.getElementById('save-settings')?.addEventListener('click', () => {
    state.storeName = document.getElementById('setting-store-name').value;
    state.email = document.getElementById('setting-email').value;
    state.deliveryNote = document.getElementById('setting-delivery-note').value;
    state.notifyNewOrders = document.getElementById('setting-new-orders').checked;
    state.notifyLowStock = document.getElementById('setting-low-stock').checked;
    save();
    alert('Đã lưu cài đặt.');
  });

  document.getElementById('reset-settings')?.addEventListener('click', () => {
    localStorage.removeItem(settingsKey);
    renderSettings(content);
  });
}

async function boot() {
  const page = document.body.dataset.adminPage;
  const user = await requireAdmin();
  if (!user) return;
  liveNotifications = loadStoredNotifications().map(normalizeNotification);
  setUserChip(user);
  setActiveNav(page);
  updateBellCount();
  startAdminPolling();
  initAdminLiveUpdates().catch(() => { });

  const content = document.getElementById('admin-content');
  if (!content) return;

  const orders = await apiJson(adminApiPath('/api/orders'), { method: 'GET', headers: {} })
    .then((data) => data.orders || [])
    .catch(() => []);
  const products = await apiJson(adminApiPath('/api/products'), { method: 'GET', headers: {} })
    .then((data) => Array.isArray(data.products) ? data.products : [])
    .catch(() => []);
  rememberOrders(orders);
  if (!liveNotifiedOrderIds.size) {
    liveNotifiedOrderIds = loadStoredOrderIds();
  }
  if (!liveNotifiedProductIds.size) {
    liveNotifiedProductIds = loadStoredProductIds();
  }
  announceNewOrders(orders, 'boot');
  announceNewProducts(products, 'boot');
  const highlightId = new URLSearchParams(window.location.search).get('highlight') || '';

  if (page === 'dashboard') renderDashboard(content, orders, products);
  else if (page === 'orders') renderOrders(content, orders, highlightId);
  else if (page === 'customers') renderCustomers(content, orders);
  else if (page === 'analytics') renderAnalytics(content, orders);
  else if (page === 'settings') renderSettings(content);
  else if (page === 'products') await renderProducts(content);
  else content.innerHTML = '<div class="admin-shell admin-empty">Không tìm thấy bộ hiển thị trang.</div>';

  const bellButton = document.querySelector('.admin-topbar-actions button[aria-label="Thông báo"]');
  if (bellButton && !bellButton.dataset.boundNotifications) {
    bellButton.dataset.boundNotifications = '1';
    bellButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleNotificationDropdown();
    });
  }

  if (!liveNotificationHandlersBound) {
    liveNotificationHandlersBound = true;
    document.addEventListener('click', (event) => {
      const dropdown = liveNotificationDropdown;
      const bell = document.querySelector('.admin-topbar-actions button[aria-label="Thông báo"]');
      if (!dropdown || dropdown.hidden) return;
      if (dropdown.contains(event.target) || bell?.contains(event.target)) return;
      closeNotificationDropdown();
    });
  }

  if (liveNotificationDropdown) {
    liveNotificationDropdown.onclick = (event) => {
      const markRead = event.target.closest('[data-notification-mark-read]');
      if (markRead) {
        event.preventDefault();
        markAllNotificationsRead();
        return;
      }
      const clearAll = event.target.closest('[data-notification-clear]');
      if (clearAll) {
        event.preventDefault();
        clearAllNotifications();
        return;
      }
      const item = event.target.closest('[data-notification-item]');
      if (item) {
        event.preventDefault();
        handleNotificationNavigate(item.dataset.notificationItem);
      }
    };
  }
}

document.addEventListener('DOMContentLoaded', boot);

window.logoutAdmin = logoutAdmin;

