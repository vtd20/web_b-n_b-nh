function formatCurrency(value) {
  return `${Number(value).toLocaleString('vi-VN')}đ`;
}

function getProducts() {
  return window.BAKERY_PRODUCTS || [];
}

function getProductFromUrl() {
  const products = getProducts();
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (slug) {
    const found = products.find((product) => product.slug === slug);
    if (found) return found;
  }

  try {
    const selected = JSON.parse(localStorage.getItem('selectedProduct') || 'null');
    if (selected?.slug) {
      const found = products.find((product) => product.slug === selected.slug);
      if (found) return found;
    }
  } catch {
    // Ignore malformed cache.
  }

  return products[0] || null;
}

function setMainImage(src, alt) {
  const main = document.getElementById('detail-main-img');
  if (!main) return;
  main.src = src;
  main.alt = alt;
}

function renderThumbs(product) {
  const thumbs = document.getElementById('detail-thumbs');
  if (!thumbs) return;

  const gallery = product.gallery?.length ? product.gallery : [product.image];
  thumbs.innerHTML = gallery
    .map(
      (src, index) => `
        <button type="button" class="detail-thumb ${index === 0 ? 'active' : ''}" data-src="${src}" aria-label="Ảnh ${index + 1}">
          <img src="${src}" alt="${product.name}" />
        </button>
      `,
    )
    .join('');

  thumbs.addEventListener('click', (event) => {
    const button = event.target.closest('.detail-thumb');
    if (!button) return;

    thumbs.querySelectorAll('.detail-thumb').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    setMainImage(button.dataset.src, product.name);
  });
}

function getSelectedSize() {
  const active = document.querySelector('.size-option.active');
  if (!active) return { label: 'Nhỏ', extra: 0, code: 'S' };
  return {
    label: active.textContent.trim(),
    extra: Number(active.dataset.add || 0),
    code: active.dataset.size || 'S',
  };
}

function getSelectedToppings() {
  return Array.from(document.querySelectorAll('.topping-option input:checked')).map((input) => ({
    label: input.value,
    extra: Number(input.dataset.add || 0),
  }));
}

function renderRelated(product) {
  const relatedGrid = document.getElementById('related-grid');
  if (!relatedGrid) return;

  const products = getProducts();
  const related = products
    .filter((item) => item.slug !== product.slug && item.category === product.category)
    .slice(0, 3);

  relatedGrid.innerHTML = related
    .map(
      (item) => `
        <article class="related-card">
          <img src="${item.image}" alt="${item.name}" />
          <div class="related-card-body">
            <h3>${item.name}</h3>
            <p>${formatCurrency(item.price)}</p>
            <a href="product-detail.html?slug=${encodeURIComponent(item.slug)}">Xem chi tiết</a>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderExtraSection(product) {
  const mainDesc = document.getElementById('extra-desc-main');
  const category = document.getElementById('extra-category');
  const tabs = Array.from(document.querySelectorAll('.extra-tab'));
  const panels = {
    description: document.getElementById('extra-description'),
    additional: document.getElementById('extra-additional'),
  };

  if (mainDesc) {
    mainDesc.textContent = product.detail || product.description || '';
  }

  if (category) {
    category.textContent = product.category || 'Bánh ngọt';
  }

  const activateTab = (tabName) => {
    tabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.extraTab === tabName);
    });
    Object.entries(panels).forEach(([name, panel]) => {
      if (!panel) return;
      panel.classList.toggle('active', name === tabName);
    });
  };

  tabs.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.extraTab));
  });

  activateTab('description');
}

function applyProduct(product) {
  const name = document.getElementById('detail-name');
  const desc = document.getElementById('detail-desc');
  const price = document.getElementById('detail-price');

  if (name) name.textContent = product.name;
  if (desc) desc.textContent = product.description;
  if (price) price.textContent = formatCurrency(product.price);

  setMainImage(product.image, product.name);
  renderThumbs(product);
  renderRelated(product);
  renderExtraSection(product);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toast-msg');
  if (!toast || !msg) return;

  msg.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function addDetailToCart(product) {
  const size = getSelectedSize();
  const toppings = getSelectedToppings();
  const qtyInput = document.getElementById('qty-input');
  const quantity = Math.max(1, Number(qtyInput?.value || 1));
  const toppingTotal = toppings.reduce((sum, item) => sum + item.extra, 0);
  const finalPrice = product.price + size.extra + toppingTotal;
  const variantName = `${product.name} - ${size.label}`;
  const variantKey = `${product.slug}-${size.code}-${toppings.map((item) => item.label).join('-') || 'plain'}`;
  const image = product.image;

  const existing = cart.find((item) => item.variantKey === variantKey);
  const cartItem = {
    name: variantName,
    baseName: product.name,
    productSlug: product.slug,
    variantKey,
    price: finalPrice,
    quantity,
    img: image,
    checked: false,
    options: {
      size: size.label,
      toppings: toppings.map((item) => item.label),
    },
  };

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push(cartItem);
  }

  saveCart();
  updateCartUI();
  showToast(product.name);
}

function bindDetailEvents(product) {
  document.querySelectorAll('.size-option').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.size-option').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const size = getSelectedSize();
      const base = product.price + size.extra;
      const toppings = getSelectedToppings();
      const total = base + toppings.reduce((sum, item) => sum + item.extra, 0);
      const price = document.getElementById('detail-price');
      if (price) price.textContent = formatCurrency(total);
    });
  });

  document.querySelectorAll('.topping-option input').forEach((input) => {
    input.addEventListener('change', () => {
      const size = getSelectedSize();
      const toppings = getSelectedToppings();
      const total = product.price + size.extra + toppings.reduce((sum, item) => sum + item.extra, 0);
      const price = document.getElementById('detail-price');
      if (price) price.textContent = formatCurrency(total);
    });
  });

  const minus = document.getElementById('qty-minus');
  const plus = document.getElementById('qty-plus');
  const qtyInput = document.getElementById('qty-input');

  minus?.addEventListener('click', () => {
    const next = Math.max(1, Number(qtyInput.value || 1) - 1);
    qtyInput.value = String(next);
  });

  plus?.addEventListener('click', () => {
    qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) + 1));
  });

  qtyInput?.addEventListener('change', () => {
    const next = Math.max(1, Number(qtyInput.value || 1));
    qtyInput.value = String(next);
  });

  const addToCartBtn = document.getElementById('add-to-cart-btn');
  addToCartBtn?.addEventListener('click', () => addDetailToCart(product));
}

async function initDetailPage() {
  if (window.BAKERY_PRODUCTS_READY && typeof window.BAKERY_PRODUCTS_READY.then === 'function') {
    await window.BAKERY_PRODUCTS_READY.catch(() => {});
  }

  const product = getProductFromUrl();
  if (!product) {
    window.location.href = 'products.html';
    return;
  }

  applyProduct(product);
  bindDetailEvents(product);
  updateCartUI();
}

document.addEventListener('DOMContentLoaded', () => {
  initDetailPage();
});
