let ordersState = {
  orders: [],
  query: '',
  status: 'all',
  sort: 'newest',
  currentPage: 1,
};

const pageSize = 2;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status) {
  return {
    Processing: 'Đang xử lý',
    Shipped: 'Đang vận chuyển',
    Delivered: 'Đã giao',
    Cancelled: 'Đã hủy',
  }[status] || status || 'Không rõ';
}

function statusClass(status) {
  return {
    Processing: 'processing',
    Shipped: 'shipped',
    Delivered: 'delivered',
    Cancelled: 'cancelled',
  }[status] || 'processing';
}

function paymentMethodLabel(order) {
  const method = String(order.paymentMethod || '').toLowerCase();
  if (method === 'cod') return 'Thanh toán khi nhận hàng (COD)';
  if (method === 'bank' || method === 'momo') return 'Chuyển khoản - thanh toán';
  return 'Chưa xác định';
}

function paymentMethodBadgeClass(order) {
  const method = String(order.paymentMethod || '').toLowerCase();
  if (method === 'cod') return 'payment-cod';
  if (method === 'bank' || method === 'momo') return 'payment-transfer';
  return 'payment-unknown';
}

function readOrdersItems(order) {
  return Array.isArray(order.items) ? order.items : [];
}

function getOrderSummary(orders) {
  return orders.reduce(
    (acc, order) => {
      acc.processing += order.status === 'Processing' ? 1 : 0;
      acc.shipped += order.status === 'Shipped' ? 1 : 0;
      acc.delivered += order.status === 'Delivered' ? 1 : 0;
      acc.cancelled += order.status === 'Cancelled' ? 1 : 0;
      return acc;
    },
    { processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
  );
}

function getFilteredOrders() {
  const query = ordersState.query.trim().toLowerCase();
  let list = [...ordersState.orders];

  if (ordersState.status !== 'all') {
    list = list.filter((order) => order.status === ordersState.status);
  }

  if (query) {
    list = list.filter((order) => {
      const itemsText = readOrdersItems(order).map((item) => item.name || '').join(' ').toLowerCase();
      return [
        order.id,
        order.customer,
        order.email,
        order.phone,
        order.address,
        order.itemsSummary,
        itemsText,
      ].some((field) => String(field || '').toLowerCase().includes(query));
    });
  }

  list.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (ordersState.sort === 'oldest') return aTime - bTime;
    if (ordersState.sort === 'highest') return Number(b.total || 0) - Number(a.total || 0);
    return bTime - aTime;
  });

  return list;
}

function clampOrdersPage(totalPages) {
  const page = Number(ordersState.currentPage || 1);
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

function renderOrdersPagination(totalPages, currentPage) {
  const host = document.getElementById('orders-pagination');
  if (!host) return;

  if (totalPages <= 1) {
    host.innerHTML = '';
    return;
  }

  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages, start + 2);
  const pages = [];
  for (let page = start; page <= end; page += 1) pages.push(page);

  host.innerHTML = `
    <button type="button" data-orders-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>Trước</button>
    ${pages.map((page) => `<button type="button" class="${page === currentPage ? 'active' : ''}" data-orders-page="${page}">${page}</button>`).join('')}
    <button type="button" data-orders-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>Sau</button>
  `;

  host.querySelectorAll('[data-orders-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.ordersPage;
      if (key === 'prev') {
        ordersState.currentPage = Math.max(1, currentPage - 1);
      } else if (key === 'next') {
        ordersState.currentPage = Math.min(totalPages, currentPage + 1);
      } else {
        ordersState.currentPage = Number(key || 1);
      }
      renderOrders();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function orderTimeline(order) {
  if (order.status === 'Cancelled') {
    return `
      <div class="timeline-step done current">Đã hủy</div>
    `;
  }

  const steps = [
    { key: 'Processing', label: 'Đã tiếp nhận', done: true, time: order.createdAt },
    { key: 'Shipped', label: 'Đang vận chuyển', done: order.status === 'Shipped' || order.status === 'Delivered', current: order.status === 'Shipped', time: order.updatedAt },
    { key: 'Delivered', label: 'Hoàn thành', done: order.status === 'Delivered', current: order.status === 'Delivered', time: order.updatedAt },
  ];

  return steps
    .map((step) => `
      <div class="timeline-step${step.done ? ' done' : ''}${step.current ? ' current' : ''}">
        <strong>${step.label}</strong>
        ${step.time ? `<div>${formatDate(step.time)}</div>` : ''}
      </div>
    `)
    .join('');
}

function buildOrderItems(order) {
  const items = readOrdersItems(order);
  if (!items.length) {
    return '<p class="orders-muted">Đơn hàng chưa có chi tiết sản phẩm.</p>';
  }

  return items
    .slice(0, 3)
    .map((item) => `
      <article class="order-item">
        <img src="${escapeHtml(item.image || item.img || 'img/Logo_Nobackground.png')}" alt="${escapeHtml(item.name || 'Sản phẩm')}" />
        <div>
          <h3>${escapeHtml(item.name || item.baseName || 'Sản phẩm')}</h3>
          <p>Số lượng: ${Number(item.quantity || 1)} • ${money(item.unitPrice || item.price || 0)}/cái</p>
          ${item.options?.size || Array.isArray(item.options?.toppings) && item.options.toppings.length
            ? `<p>${[item.options?.size ? `Size ${escapeHtml(item.options.size)}` : '', Array.isArray(item.options?.toppings) && item.options.toppings.length ? `Topping: ${escapeHtml(item.options.toppings.join(', '))}` : ''].filter(Boolean).join(' • ')}</p>`
            : ''}
        </div>
      </article>
    `)
    .join('');
}

function buildOrderCard(order) {
  const items = readOrdersItems(order);
  return `
    <article class="order-card" data-order-id="${escapeHtml(order.id || '')}">
      <div class="order-card-header">
        <div>
          <div class="label">Mã đơn hàng</div>
          <div class="value">${escapeHtml(order.id || '')}</div>
        </div>
        <div>
          <div class="label">Ngày đặt</div>
          <div class="value">${formatDate(order.createdAt) || 'Vừa xong'}</div>
        </div>
        <div>
          <div class="label">Tổng cộng</div>
          <div class="value" style="color:var(--orders-accent);">${money(order.total)}</div>
        </div>
        <div class="order-pill ${statusClass(order.status)}">${statusLabel(order.status)}</div>
      </div>

      <div class="order-card-body">
        <div>
          <div class="order-payment-line">
            <span>Thanh toán</span>
            <strong>${escapeHtml(paymentMethodLabel(order))}</strong>
          </div>

          <div class="order-items">
            ${buildOrderItems(order)}
          </div>

          ${order.note ? `
            <div class="order-note">
              <h4>Ghi chú</h4>
              <p>${escapeHtml(order.note)}</p>
            </div>
          ` : ''}
        </div>

        <div class="order-side">
          <div class="order-address">
            <h4>Địa chỉ giao hàng</h4>
            <p>${escapeHtml(order.customer || 'Khách hàng')}</p>
            <p>${escapeHtml(order.address || 'Chưa có địa chỉ')}</p>
            ${order.phone ? `<p>${escapeHtml(order.phone)}</p>` : ''}
          </div>

          <div class="order-timeline">
            <h4>Tiến trình</h4>
            <div class="timeline-list">
              ${orderTimeline(order)}
            </div>
          </div>
        </div>
      </div>

      <div class="order-card-footer">
        <div class="orders-muted">${items.length} sản phẩm trong đơn</div>
        <div class="order-actions">
          ${order.status === 'Processing' ? `<button class="orders-btn danger" type="button" data-cancel-order="${escapeHtml(order.id || '')}">Hủy đơn</button>` : ''}
          <a class="orders-btn" href="index.html#contact">Liên hệ cửa hàng</a>
          <button class="orders-btn primary" type="button" data-reorder-order="${escapeHtml(order.id || '')}">Mua lại</button>
        </div>
      </div>
    </article>
  `;
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  const empty = document.getElementById('orders-empty');
  const pagination = document.getElementById('orders-pagination');
  if (!list || !empty) return;

  const filtered = getFilteredOrders();
  const summary = getOrderSummary(ordersState.orders);
  document.getElementById('summary-processing').textContent = String(summary.processing).padStart(2, '0');
  document.getElementById('summary-delivered').textContent = String(summary.delivered).padStart(2, '0');
  document.getElementById('summary-cancelled').textContent = String(summary.cancelled).padStart(2, '0');

  const user = window.__ordersUser || null;
  if (user) {
    document.getElementById('orders-user-name').textContent = user.name || user.email || 'Khách hàng';
    document.getElementById('orders-user-email').textContent = user.email || '';
  }

  const chips = document.querySelectorAll('[data-status]');
  chips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.status === ordersState.status);
  });

  if (!filtered.length) {
    list.innerHTML = '';
    if (pagination) pagination.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `
      <h3>Chưa có đơn hàng nào phù hợp</h3>
      <p>Hãy đổi bộ lọc hoặc quay lại trang sản phẩm để đặt bánh ngay.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
        <a class="orders-btn primary" href="products.html">Xem sản phẩm</a>
        <a class="orders-btn" href="index.html#contact">Liên hệ cửa hàng</a>
      </div>
    `;
    return;
  }

  empty.hidden = true;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = clampOrdersPage(totalPages);
  ordersState.currentPage = currentPage;
  const start = (currentPage - 1) * pageSize;
  const visibleOrders = filtered.slice(start, start + pageSize);

  list.innerHTML = visibleOrders.map((order) => buildOrderCard(order)).join('');

  list.querySelectorAll('[data-reorder-order]').forEach((button) => {
    button.addEventListener('click', () => reorderOrder(button.dataset.reorderOrder));
  });

  list.querySelectorAll('[data-cancel-order]').forEach((button) => {
    button.addEventListener('click', () => cancelOrderWithModal(button.dataset.cancelOrder));
  });

  renderOrdersPagination(totalPages, currentPage);
}

function ensureOrdersToastHost() {
  let host = document.getElementById('orders-toast-stack');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'orders-toast-stack';
  host.style.position = 'fixed';
  host.style.right = '24px';
  host.style.bottom = '24px';
  host.style.zIndex = '100';
  host.style.display = 'grid';
  host.style.gap = '12px';
  host.style.width = 'min(360px, calc(100vw - 32px))';
  document.body.appendChild(host);
  return host;
}

function showOrdersToast(title, message) {
  const host = ensureOrdersToastHost();
  const toast = document.createElement('div');
  toast.className = 'orders-toast';
  toast.style.border = '1px solid rgba(159, 90, 69, 0.18)';
  toast.style.borderRadius = '16px';
  toast.style.background = 'rgba(255, 255, 255, 0.98)';
  toast.style.boxShadow = '0 18px 40px rgba(84, 55, 41, 0.16)';
  toast.style.padding = '14px 16px';
  toast.innerHTML = `<strong style="display:block;font-size:15px;margin-bottom:6px;">${escapeHtml(title)}</strong><p style="margin:0;color:#7a665c;line-height:1.5;">${escapeHtml(message)}</p>`;
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(8px)';
  toast.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 3000);
}

function ensureCancelModalHost() {
  let host = document.getElementById('orders-cancel-modal');
  if (host) return host;

  host = document.createElement('div');
  host.id = 'orders-cancel-modal';
  host.className = 'orders-cancel-modal';
  host.innerHTML = `
    <div class="orders-cancel-modal__backdrop" data-cancel-modal-close></div>
    <div class="orders-cancel-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="orders-cancel-title">
      <div class="orders-cancel-modal__icon">
        <i class="fa-solid fa-circle-exclamation"></i>
      </div>
      <h3 id="orders-cancel-title">Hủy đơn hàng này?</h3>
      <p class="orders-cancel-modal__message">Đơn hàng sẽ được chuyển sang trạng thái hủy và không thể khôi phục lại từ trang này.</p>
      <div class="orders-cancel-modal__meta">
        <span>Mã đơn</span>
        <strong data-cancel-modal-order>---</strong>
      </div>
      <div class="orders-cancel-modal__actions">
        <button type="button" class="orders-btn" data-cancel-modal-close>Đóng lại</button>
        <button type="button" class="orders-btn danger" data-cancel-modal-confirm>Hủy đơn</button>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  return host;
}

function closeCancelModal() {
  const host = document.getElementById('orders-cancel-modal');
  if (!host) return;
  host.classList.remove('show');
  document.body.classList.remove('orders-modal-open');
}

function openCancelModal(orderId) {
  const host = ensureCancelModalHost();
  const orderLabel = host.querySelector('[data-cancel-modal-order]');
  const confirmButton = host.querySelector('[data-cancel-modal-confirm]');
  const closeButtons = host.querySelectorAll('[data-cancel-modal-close]');

  if (orderLabel) orderLabel.textContent = orderId || '---';

  confirmButton.onclick = async () => {
    closeCancelModal();
    await executeCancelOrder(orderId);
  };

  closeButtons.forEach((button) => {
    button.onclick = () => closeCancelModal();
  });

  host.classList.add('show');
  document.body.classList.add('orders-modal-open');
}

function cancelOrderWithModal(orderId) {
  if (!orderId) return;
  openCancelModal(orderId);
}

async function executeCancelOrder(orderId) {
  if (!orderId) return;

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Không thể hủy đơn hàng.');
    showOrdersToast('Đã hủy đơn hàng', `Đơn ${orderId} đã được chuyển sang trạng thái hủy.`);
    await loadOrders();
    ordersState.currentPage = 1;
    renderOrders();
  } catch (error) {
    showOrdersToast('Không thể hủy đơn', error.message || 'Vui lòng thử lại.');
  }
}

function reorderOrder(orderId) {
  const order = ordersState.orders.find((item) => item.id === orderId);
  if (!order) return;

  const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
  const nextCart = [...currentCart];

  readOrdersItems(order).forEach((item) => {
    const variantKey = item.variantKey || `${item.productSlug || item.baseName || item.name || 'item'}-${item.options?.size || 'default'}-${Array.isArray(item.options?.toppings) ? item.options.toppings.join('-') : 'plain'}`;
    const existing = nextCart.find((cartItem) => cartItem.variantKey === variantKey);
    const cartItem = {
      name: item.name || item.baseName || 'Sản phẩm',
      baseName: item.baseName || item.name || 'Sản phẩm',
      productSlug: item.productSlug || '',
      variantKey,
      price: Number(item.unitPrice || item.price || 0),
      quantity: Number(item.quantity || 1),
      img: item.image || item.img || '',
      checked: true,
      options: item.options || {},
    };

    if (existing) {
      existing.quantity += cartItem.quantity;
    } else {
      nextCart.push(cartItem);
    }
  });

  localStorage.setItem('cart', JSON.stringify(nextCart));
  window.dispatchEvent(new Event('cart-updated'));
  showOrdersToast('Đã thêm vào giỏ', 'Đơn hàng cũ đã được thêm lại vào giỏ hàng.');
  window.location.href = 'cart.html';
}

async function cancelOrder(orderId) {
  if (!orderId) return;
  if (!window.confirm('Bạn muốn hủy đơn hàng này?')) return;

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Không thể hủy đơn hàng.');
    showOrdersToast('Đã hủy đơn hàng', `Đơn ${orderId} đã được chuyển sang trạng thái hủy.`);
    await loadOrders();
    ordersState.currentPage = 1;
    renderOrders();
  } catch (error) {
    showOrdersToast('Không thể hủy đơn', error.message || 'Vui lòng thử lại.');
  }
}

async function loadOrders() {
  const response = await fetch('/api/orders', {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Không thể tải đơn hàng.');
  }
  ordersState.orders = Array.isArray(payload.orders) ? payload.orders : [];
}

function bindOrdersUI() {
  const search = document.getElementById('orders-search');
  const sort = document.getElementById('orders-sort');
  const chips = document.querySelectorAll('[data-status]');

  search?.addEventListener('input', () => {
    ordersState.query = search.value;
    ordersState.currentPage = 1;
    renderOrders();
  });

  sort?.addEventListener('change', () => {
    ordersState.sort = sort.value;
    ordersState.currentPage = 1;
    renderOrders();
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      ordersState.status = chip.dataset.status || 'all';
      ordersState.currentPage = 1;
      renderOrders();
    });
  });
}

function renderLoggedOutState() {
  const list = document.getElementById('orders-list');
  const empty = document.getElementById('orders-empty');
  if (list) list.innerHTML = '';
  if (empty) {
    empty.hidden = false;
    empty.innerHTML = `
      <h3>Vui lòng đăng nhập để xem đơn hàng</h3>
      <p>Đơn hàng của bạn sẽ được hiển thị ở đây sau khi đăng nhập.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
        <a class="orders-btn primary" href="auth.html?mode=login&next=orders.html">Đăng nhập</a>
        <a class="orders-btn" href="products.html">Xem sản phẩm</a>
      </div>
    `;
  }
}

async function boot() {
  if (typeof renderAuthArea === 'function') {
    await renderAuthArea();
  }

  const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
  window.__ordersUser = user;
  if (!user) {
    renderLoggedOutState();
    return;
  }

  try {
    await loadOrders();
  } catch (error) {
    renderLoggedOutState();
    const empty = document.getElementById('orders-empty');
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = `
        <h3>Không thể tải đơn hàng</h3>
        <p>${escapeHtml(error.message || 'Vui lòng thử lại sau.')}</p>
      `;
    }
    return;
  }

  ordersState.currentPage = 1;
  bindOrdersUI();
  renderOrders();
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCancelModal();
  });
  boot().catch(() => {
    renderLoggedOutState();
  });
});
