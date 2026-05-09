function toNumber(value) {
  return Number(String(value || 0).replace(/[^0-9.]/g, '')) || 0;
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function getCartSubtotal(items) {
  return items.reduce((sum, item) => sum + toNumber(item.price) * Number(item.quantity || 1), 0);
}

function formatItemOptions(item) {
  const size = item.options?.size ? `Size: ${item.options.size}` : '';
  const toppings = Array.isArray(item.options?.toppings) && item.options.toppings.length
    ? `Topping: ${item.options.toppings.join(', ')}`
    : '';
  return [size, toppings].filter(Boolean).join(' • ');
}

const ADDRESS_DATA = {
  'Hà Nội': {
    'Ba Đình': ['Phúc Xá', 'Trúc Bạch', 'Điện Biên'],
    'Cầu Giấy': ['Dịch Vọng', 'Nghĩa Tân', 'Mai Dịch'],
    'Đống Đa': ['Cát Linh', 'Láng Hạ', 'Nam Đồng'],
    'Hai Bà Trưng': ['Bạch Mai', 'Lê Đại Hành', 'Quỳnh Mai'],
  },
  'TP. Hồ Chí Minh': {
    'Quận 1': ['Bến Nghé', 'Bến Thành', 'Cầu Ông Lãnh'],
    'Quận 3': ['Phường 6', 'Phường 7', 'Phường 8'],
    'Bình Thạnh': ['Phường 1', 'Phường 22', 'Phường 25'],
    'Gò Vấp': ['Phường 10', 'Phường 11', 'Phường 15'],
  },
  'Đà Nẵng': {
    'Hải Châu': ['Hải Châu 1', 'Hải Châu 2', 'Thạch Thang'],
    'Sơn Trà': ['An Hải Bắc', 'An Hải Đông', 'Mân Thái'],
    'Cẩm Lệ': ['Hòa An', 'Hòa Phát', 'Hòa Xuân'],
  },
  'Hải Phòng': {
    'Hồng Bàng': ['Hạ Lý', 'Hoàng Văn Thụ', 'Sở Dầu'],
    'Lê Chân': ['An Dương', 'Cát Dài', 'Dư Hàng Kênh'],
    'Ngô Quyền': ['Lạch Tray', 'Máy Chai', 'Vạn Mỹ'],
  },
  'Cần Thơ': {
    'Ninh Kiều': ['An Cư', 'An Hòa', 'Xuân Khánh'],
    'Bình Thủy': ['An Thới', 'Bình Thủy', 'Trà Nóc'],
    'Cái Răng': ['Ba Láng', 'Hưng Phú', 'Tân Phú'],
  },
  'Bình Dương': {
    'Thủ Dầu Một': ['Chánh Nghĩa', 'Phú Cường', 'Phú Hòa'],
    'Dĩ An': ['Dĩ An', 'Tân Đông Hiệp', 'An Bình'],
    'Thuận An': ['An Phú', 'Bình Hòa', 'Lái Thiêu'],
  },
  'Đồng Nai': {
    'Biên Hòa': ['Tân Phong', 'Tam Hiệp', 'Hóa An'],
    'Long Khánh': ['Bảo Vinh', 'Suối Tre', 'Bình Lộc'],
    'Trảng Bom': ['Bắc Sơn', 'Đông Hòa', 'Hố Nai 3'],
  },
  'Khánh Hòa': {
    'Nha Trang': ['Lộc Thọ', 'Phước Hải', 'Vĩnh Hòa'],
    'Cam Ranh': ['Cam Lộc', 'Cam Nghĩa', 'Cam Phúc Bắc'],
    'Cam Lâm': ['Cam Hải Đông', 'Cam Hòa', 'Cam Tân'],
  },
};

function fillAddressSelect(select, placeholder, values, selectedValue = '') {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>` + values
    .map((value) => `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${value}</option>`)
    .join('');
}

function bindAddressPicker() {
  const provinceSelect = document.getElementById('province');
  const districtSelect = document.getElementById('district');
  const wardSelect = document.getElementById('ward');
  if (!provinceSelect || !districtSelect || !wardSelect) return;

  const syncDistricts = () => {
    const province = provinceSelect.value;
    const districts = province ? Object.keys(ADDRESS_DATA[province] || {}) : [];
    fillAddressSelect(districtSelect, 'Quận / Huyện', districts);
    districtSelect.disabled = !province;
    wardSelect.innerHTML = '<option value="">Phường / Xã</option>';
    wardSelect.disabled = true;
  };

  const syncWards = () => {
    const province = provinceSelect.value;
    const district = districtSelect.value;
    const wards = province && district ? ADDRESS_DATA[province]?.[district] || [] : [];
    fillAddressSelect(wardSelect, 'Phường / Xã', wards);
    wardSelect.disabled = !province || !district;
  };

  fillAddressSelect(provinceSelect, 'Tỉnh / Thành phố', Object.keys(ADDRESS_DATA), provinceSelect.value);

  provinceSelect.addEventListener('change', syncDistricts);
  districtSelect.addEventListener('change', syncWards);

  syncDistricts();
}

function resetAddressPicker() {
  const provinceSelect = document.getElementById('province');
  const districtSelect = document.getElementById('district');
  const wardSelect = document.getElementById('ward');
  const detailInput = document.getElementById('address-detail');
  if (provinceSelect) provinceSelect.value = '';
  if (districtSelect) {
    districtSelect.innerHTML = '<option value="">Quận / Huyện</option>';
    districtSelect.disabled = true;
  }
  if (wardSelect) {
    wardSelect.innerHTML = '<option value="">Phường / Xã</option>';
    wardSelect.disabled = true;
  }
  if (detailInput) detailInput.value = '';
}

function getFullAddress() {
  const province = document.getElementById('province')?.value.trim();
  const district = document.getElementById('district')?.value.trim();
  const ward = document.getElementById('ward')?.value.trim();
  const detail = document.getElementById('address-detail')?.value.trim();
  const parts = [detail, ward, district, province].filter(Boolean);
  return {
    province,
    district,
    ward,
    detail,
    fullAddress: parts.join(', '),
  };
}

const PAYMENT_METHODS = {
  bank: {
    key: 'bank',
    label: 'Chuyển khoản ngân hàng',
    badge: 'QR MB',
    status: 'Chờ thanh toán',
    bankName: 'MB Bank',
    accountNumber: '0345734504',
    accountName: 'VU THANH DAT',
    qrLabel: 'Quét QR để chuyển khoản',
    note: 'Dùng app ngân hàng để quét mã và ghi đúng nội dung.',
    contentPrefix: 'GFBK',
  },
  momo: {
    key: 'momo',
    label: 'Ví điện tử MoMo',
    badge: 'QR MoMo',
    status: 'Xác nhận tức thì',
    bankName: 'Ví MoMo',
    accountNumber: '0345734504',
    accountName: 'GIFTER BAKERY',
    qrLabel: 'Quét QR MoMo để thanh toán',
    note: 'Thanh toán nhanh bằng ứng dụng MoMo trên điện thoại.',
    contentPrefix: 'MOMO',
  },
};

let selectedTransferMethod = 'bank';

function getPaymentDraftCode(method = 'bank') {
  const suffix = String(Date.now()).slice(-6);
  return `${PAYMENT_METHODS[method]?.contentPrefix || 'GFBK'}-${suffix}`;
}

function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (!digits) return 'STK: ********';
  const visible = digits.slice(-3);
  const hidden = '*'.repeat(Math.max(digits.length - visible.length, 4));
  return `STK: ${hidden}${visible}`;
}

function getPaymentQrUrl(method = 'bank') {
  const config = PAYMENT_METHODS[method] || PAYMENT_METHODS.bank;
  const draftCode = document.getElementById('payment-content')?.textContent?.trim() || getPaymentDraftCode(method);
  const amount = Math.max(0, getCartSubtotal(cart.filter((item) => item.checked)));
  const content = draftCode.replace(/\s+/g, ' ').trim();

  if (method === 'bank') {
    const bankCode = 'MB';
    const params = new URLSearchParams({
      amount: String(amount),
      addInfo: content,
      accountName: config.accountName,
    });
    return `https://img.vietqr.io/image/${bankCode}-${config.accountNumber}-print.png?${params.toString()}`;
  }

  return '/img/qr_momo.jpg';
}

function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}

function applyPaymentMethod(method = 'bank') {
  const config = PAYMENT_METHODS[method] || PAYMENT_METHODS.bank;
  const cards = document.querySelectorAll('[data-payment-card]');
  cards.forEach((card) => {
    card.classList.toggle('is-active', card.dataset.paymentCard === method);
  });

  document.querySelectorAll('input[name="transfer-method"]').forEach((radio) => {
    radio.checked = radio.value === method;
  });

  const statusPill = document.getElementById('payment-status-pill');
  const bankName = document.getElementById('payment-bank-name');
  const accountNumber = document.getElementById('payment-account-number');
  const accountName = document.getElementById('payment-account-name');
  const content = document.getElementById('payment-content');
  const qrLabel = document.getElementById('payment-qr-label');
  const qrNote = document.getElementById('payment-qr-note');
  const paymentMethodStatus = document.getElementById('payment-method-status');
  const qrCard = document.getElementById('payment-qr-card');
  const qrBadge = document.querySelector('.payment-qr-card__badge');
  const qrAccountName = document.getElementById('payment-qr-account-name');
  const qrAccountMask = document.getElementById('payment-qr-account-mask');
  const qrImage = document.getElementById('payment-qr-image');
  const timeline = document.querySelectorAll('.payment-timeline__step');

  if (statusPill) statusPill.textContent = config.status;
  if (qrBadge) qrBadge.textContent = config.badge;
  if (qrAccountName) qrAccountName.textContent = config.accountName;
  if (qrAccountMask) qrAccountMask.textContent = maskAccountNumber(config.accountNumber);
  if (bankName) bankName.textContent = config.bankName;
  if (accountNumber) accountNumber.textContent = config.accountNumber;
  if (accountName) accountName.textContent = config.accountName;
  if (content) content.textContent = getPaymentDraftCode(method);
  if (qrLabel) qrLabel.textContent = config.qrLabel;
  if (qrNote) qrNote.textContent = config.note;
  if (paymentMethodStatus) paymentMethodStatus.textContent = config.status;
  if (qrImage) {
    qrImage.classList.add('is-loading');
    qrImage.onload = () => qrImage.classList.remove('is-loading');
    qrImage.onerror = () => qrImage.classList.remove('is-loading');
    qrImage.src = getPaymentQrUrl(method);
    qrImage.alt = `${config.qrLabel} - ${config.accountNumber}`;
  }

  if (qrCard) {
    qrCard.dataset.method = method;
    qrCard.classList.remove('switching');
    void qrCard.offsetWidth;
    qrCard.classList.add('switching');
    window.setTimeout(() => qrCard.classList.remove('switching'), 500);
  }

  timeline.forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
}

function getSelectedPaymentChoice() {
  return document.querySelector('input[name="payment-choice"]:checked')?.value || 'cod';
}

function getSelectedTransferMethod() {
  return document.querySelector('input[name="transfer-method"]:checked')?.value || selectedTransferMethod || 'bank';
}

function ensurePaymentModal() {
  return document.getElementById('payment-modal');
}

function openPaymentModal(method = getSelectedTransferMethod()) {
  selectedTransferMethod = method || 'bank';
  applyPaymentMethod(selectedTransferMethod);

  const modal = ensurePaymentModal();
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-lock');
  requestAnimationFrame(() => modal.classList.add('show'));
}

function closePaymentModal() {
  const modal = ensurePaymentModal();
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-lock');
  window.setTimeout(() => {
    modal.hidden = true;
  }, 220);
}

function bindPaymentCheckoutUI() {
  const choiceRadios = document.querySelectorAll('input[name="payment-choice"]');
  choiceRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const cards = document.querySelectorAll('[data-payment-choice-card]');
      cards.forEach((card) => {
        card.classList.toggle('is-active', card.dataset.paymentChoiceCard === radio.value);
      });
      if (radio.value === 'cod') {
        closePaymentModal();
      }
    });
  });

  const transferRadios = document.querySelectorAll('input[name="transfer-method"]');
  transferRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedTransferMethod = radio.value || 'bank';
        applyPaymentMethod(selectedTransferMethod);
      }
    });
  });

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetId = button.dataset.copyTarget;
      const value = document.getElementById(targetId)?.textContent?.trim() || '';
      if (!value) return;
      try {
        await copyTextToClipboard(value);
        showCartNotice('Đã sao chép', `Đã sao chép ${value} vào clipboard.`, 'success');
      } catch {
        showCartNotice('Không thể sao chép', 'Vui lòng thử lại.', 'error');
      }
    });
  });

  document.querySelectorAll('[data-close-payment-modal]').forEach((button) => {
    button.addEventListener('click', closePaymentModal);
  });

  const modal = ensurePaymentModal();
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.dataset.closePaymentModal !== undefined) {
        closePaymentModal();
      }
    });
  }

  document.querySelector('[data-confirm-transfer-payment]')?.addEventListener('click', () => {
    checkoutOrder({ fromModal: true });
  });

  const selected = document.querySelector('input[name="transfer-method"]:checked');
  selectedTransferMethod = selected?.value || 'bank';
  applyPaymentMethod(selectedTransferMethod);

  const choiceSelected = document.querySelector('input[name="payment-choice"]:checked');
  document.querySelectorAll('[data-payment-choice-card]').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.paymentChoiceCard === (choiceSelected?.value || 'transfer'));
  });
}

function ensureCartNoticeHost() {
  let host = document.getElementById('cart-notice-stack');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'cart-notice-stack';
  host.className = 'cart-notice-stack';
  document.body.appendChild(host);
  return host;
}

function showCartNotice(title, message, tone = 'warning', action) {
  const host = ensureCartNoticeHost();
  const notice = document.createElement('div');
  notice.className = `cart-notice ${tone}`;
  notice.innerHTML = `
    <div class="cart-notice-icon" aria-hidden="true">
      <i class="fa-solid ${tone === 'error' ? 'fa-triangle-exclamation' : tone === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
    </div>
    <div class="cart-notice-body">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
    ${action?.label && action?.href ? `<a class="cart-notice-action" href="${action.href}">${escapeHtml(action.label)}</a>` : ''}
  `;
  host.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add('show'));
  window.setTimeout(() => {
    notice.classList.remove('show');
    window.setTimeout(() => notice.remove(), 220);
  }, 3200);
}

function renderCart() {
  const list = document.getElementById('cart-list');
  list.innerHTML = '';

  if (!cart.length) {
    list.innerHTML = '<p>Giỏ hàng trống 😢</p>';
    document.getElementById('subtotal').innerText = '0đ';
    document.getElementById('total').innerText = '0đ';
    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.checked = false;
    updateCartUI();
    return;
  }

  let total = 0;
  cart.forEach((item, index) => {
    if (item.checked) {
      total += toNumber(item.price) * Number(item.quantity || 1);
    }

    list.insertAdjacentHTML(
      'beforeend',
      `
        <div class="cart-item">
          <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleItem(${index})">
          <img src="${item.img || item.image || ''}" alt="${item.name || ''}">
          <div class="info">
            <h4>${item.name || 'Sản phẩm'}</h4>
            <p>${formatMoney(toNumber(item.price))}</p>
            ${formatItemOptions(item) ? `<small class="cart-item-options">${formatItemOptions(item)}</small>` : ''}
          </div>
          <div class="qty">
            <button onclick="decrease(${index})">-</button>
            <span>${Number(item.quantity || 1)}</span>
            <button onclick="increase(${index})">+</button>
          </div>
          <div class="price">${formatMoney(toNumber(item.price) * Number(item.quantity || 1))}</div>
          <span class="remove" onclick="removeItem(${index})">×</span>
        </div>
      `,
    );
  });

  document.getElementById('subtotal').innerText = formatMoney(total);
  document.getElementById('total').innerText = formatMoney(total);
  document.getElementById('selectAll').checked = cart.length > 0 && cart.every((item) => item.checked);
  updateCartUI();
}

function toggleItem(index) {
  cart[index].checked = !cart[index].checked;
  saveCart();
  renderCart();
}

function toggleAll(el) {
  cart.forEach((item) => (item.checked = el.checked));
  saveCart();
  renderCart();
}

function increase(index) {
  cart[index].quantity = Number(cart[index].quantity || 1) + 1;
  saveCart();
  renderCart();
}

function decrease(index) {
  if (Number(cart[index].quantity || 1) > 1) {
    cart[index].quantity = Number(cart[index].quantity || 1) - 1;
  } else {
    cart.splice(index, 1);
  }
  saveCart();
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

async function checkout() {
  return checkoutOrder();
}

function showSuccess(order = {}) {
  const popup = document.getElementById('order-success');
  if (!popup) return;

  const orderId = String(order.id || '');
  const total = formatMoney(toNumber(order.total || 0));
  const paymentLabel = {
    cod: 'Thanh toán khi nhận hàng (COD)',
    bank: 'Chuyển khoản ngân hàng',
    momo: 'Ví MoMo',
  }[String(order.paymentMethod || '').toLowerCase()] || 'Thanh toán khi nhận hàng (COD)';

  const subtitle = document.getElementById('order-toast-subtitle');
  const idBox = document.getElementById('order-toast-id');
  const totalBox = document.getElementById('order-toast-total');
  const paymentBox = document.getElementById('order-toast-payment');
  const etaBox = document.getElementById('order-toast-eta');
  if (subtitle) subtitle.textContent = orderId ? `Mã đơn: ${orderId}` : 'Đơn hàng đã được ghi nhận thành công';
  if (idBox) idBox.textContent = orderId ? `#${orderId}` : '#ORD-123456';
  if (totalBox) totalBox.textContent = total;
  if (paymentBox) paymentBox.textContent = paymentLabel;
  if (etaBox) etaBox.textContent = '30 - 45 phút';

  popup.hidden = false;
  popup.classList.remove('show');
  void popup.offsetWidth;
  popup.classList.add('show');

  window.clearTimeout(showSuccess._timer);
  showSuccess._timer = window.setTimeout(() => {
    closeSuccess();
  }, 6000);
}

function closeSuccess() {
  const popup = document.getElementById('order-success');
  if (!popup) return;
  popup.classList.remove('show');
  window.clearTimeout(showSuccess._timer);
  window.setTimeout(() => {
    popup.hidden = true;
  }, 220);
}

async function checkoutOrder(options = {}) {
  const currentUser = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
  if (!currentUser) {
    showCartNotice('C?n dang nh?p', 'Vui l�ng dang nh?p tru?c khi thanh to�n.', 'warning', { label: '�ang nh?p ngay', href: 'auth.html?mode=login&next=cart.html' });
    window.location.href = 'auth.html?mode=login&next=cart.html';
    return;
  }

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const addressInfo = getFullAddress();
  const address = addressInfo.fullAddress;
  const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;

  document.getElementById('name-error').innerText = '';
  document.getElementById('phone-error').innerText = '';
  document.getElementById('address-error').innerText = '';

  let isValid = true;
  if (!name) {
    document.getElementById('name-error').innerText = 'Vui lòng nhập họ tên';
    isValid = false;
  }
  if (!phone) {
    document.getElementById('phone-error').innerText = 'Vui lòng nhập số điện thoại';
    isValid = false;
  } else if (!phoneRegex.test(phone)) {
    document.getElementById('phone-error').innerText = 'SĐT không hợp lệ';
    isValid = false;
  }
  if (!addressInfo.province || !addressInfo.district || !addressInfo.ward || !addressInfo.detail) {
    document.getElementById('address-error').innerText = 'Vui lòng chọn đầy đủ tỉnh/thành, quận/huyện, phường/xã và nhập địa chỉ cụ thể';
    isValid = false;
  }
  if (!isValid) return;

  const selected = cart.filter((item) => item.checked);
  if (!selected.length) {
    showCartNotice('Chưa chọn sản phẩm', 'Hãy chọn ít nhất một sản phẩm để tiếp tục thanh toán.', 'warning');
    return;
  }

  const paymentChoice = getSelectedPaymentChoice();
  if (paymentChoice === 'transfer' && !options.fromModal) {
    openPaymentModal();
    return;
  }

  const subtotal = getCartSubtotal(selected);
  const paymentMethod = paymentChoice === 'transfer' ? getSelectedTransferMethod() : 'cod';
  const items = selected.map((item) => ({
    id: item.id || item.slug || item.name,
    productSlug: item.productSlug || item.slug || '',
    baseName: item.baseName || String(item.name || '').replace(/\s*-\s*.+$/, ''),
    name: item.name,
    subtitle: item.subtitle || '',
    quantity: Number(item.quantity || 1),
    image: item.img || item.image || '',
    unitPrice: toNumber(item.price),
    lineTotal: toNumber(item.price) * Number(item.quantity || 1),
    options: item.options || {},
  }));

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: name || currentUser.name || 'Khách hàng',
        email: currentUser.email || '',
        phone,
        address,
        paymentMethod,
        deliveryDate: '',
        deliverySlot: '',
        note: '',
        items,
        itemsDetails: items,
        subtotal,
        deliveryFee: 0,
        tax: 0,
        total: subtotal,
        itemsSummary: selected.map((item) => `${Number(item.quantity || 1)}x ${item.name}`).join(', '),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Không thể tạo đơn hàng.');
    }

    cart = cart.filter((item) => !item.checked);
    saveCart();
    renderCart();
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    resetAddressPicker();
    closePaymentModal();
    showSuccess({
      id: payload.order?.id || '',
      total: payload.order?.total ?? subtotal,
      paymentMethod,
    });
  } catch (error) {
    showCartNotice('Thanh to�n th?t b?i', error.message || 'Vui l�ng th? l?i.', 'error');
  }
}

function goBack() {
  if (document.referrer) window.history.back();
  else window.location.href = 'index.html';
}

bindAddressPicker();
bindPaymentCheckoutUI();
renderCart();
