function getProducts() {
  return Array.isArray(window.BAKERY_PRODUCTS) ? window.BAKERY_PRODUCTS : [];
}

const state = {
  search: '',
  sort: 'featured',
  categories: new Set(),
  currentPage: 1,
};

const pageSize = 12;

const categoryLabels = {
  cake: 'Bánh kem',
  tiramisu: 'Tiramisu',
  cupcake: 'Cupcake',
  sponge: 'Bánh bông lan',
  bread: 'Bánh mì ngọt',
};

function formatPrice(value) {
  return `${Number(value).toLocaleString('vi-VN')}đ`;
}

function isNewProduct(product) {
  return Boolean(product?.isNew);
}

function updateHomeProductCount() {
  const counter = document.getElementById('home-product-count');
  if (!counter) return;

  const total = getProducts().length;
  counter.textContent = total
    ? `Hiện có ${total} sản phẩm trong menu`
    : 'Chưa có sản phẩm nào trong menu';
}

function getActiveCategories() {
  const allChecked = document.getElementById('category-all')?.checked;
  if (allChecked || state.categories.size === 0) return null;
  return Array.from(state.categories);
}

function filterProducts() {
  const query = state.search.trim().toLowerCase();
  const categories = getActiveCategories();

  let list = getProducts().filter((product) => {
    const matchesSearch =
      !query ||
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      categoryLabels[product.category].toLowerCase().includes(query);

    const matchesCategory = !categories || categories.includes(product.category);

    return matchesSearch && matchesCategory;
  });

  switch (state.sort) {
    case 'price-asc':
      list = list.slice().sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      list = list.slice().sort((a, b) => b.price - a.price);
      break;
    case 'name':
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      break;
    default:
      list = list.slice().sort((a, b) => a.featured - b.featured);
      break;
  }

  return list;
}

function clampPage(totalPages) {
  if (totalPages === 0) {
    state.currentPage = 1;
    return 1;
  }

  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;
  return state.currentPage;
}

function openProductDetail(product) {
  try {
    localStorage.setItem('selectedProduct', JSON.stringify(product));
  } catch {
    // Ignore storage failures and navigate with slug only.
  }

  window.location.href = `product-detail.html?slug=${encodeURIComponent(product.slug)}`;
}

function buildProductCard(product) {
  return `
    <article class="catalog-card" data-slug="${product.slug}">
      <div class="catalog-image-wrap">
        ${isNewProduct(product) ? '<span class="catalog-new-badge">Mới tạo</span>' : ''}
        <img src="${product.image}" alt="${product.name}" />
        <button type="button" class="favorite-btn" aria-label="Yêu thích">
          <i class="fa-regular fa-heart"></i>
        </button>
      </div>
      <div class="catalog-info">
        <div class="catalog-title-row">
          <h3><a class="product-link" href="product-detail.html?slug=${encodeURIComponent(product.slug)}">${product.name}</a></h3>
          <div class="catalog-price">${formatPrice(product.price)}</div>
        </div>
        <p class="catalog-desc">${product.description}</p>
      </div>
    </article>
  `;
}

function bindCardContainer(container) {
  if (!container || container.dataset.boundCards === 'true') return;

  container.addEventListener('click', (event) => {
    const card = event.target.closest('.catalog-card');
    if (!card || event.target.closest('button') || event.target.closest('a')) return;

    const product = getProducts().find((item) => item.slug === card.dataset.slug);
    if (product) openProductDetail(product);
  });

  container.dataset.boundCards = 'true';
}

function getFeaturedProducts(limit = 6) {
  return [...getProducts()]
    .filter((product) => Boolean(product.featured))
    .sort((a, b) => a.featured - b.featured)
    .slice(0, limit);
}

function getLatestProducts(limit = 6) {
  return [...getProducts()]
    .filter((product) => Boolean(product.isActive !== false))
    .sort((a, b) => {
      const left = new Date(b.createdAt || b.updatedAt || 0).getTime();
      const right = new Date(a.createdAt || a.updatedAt || 0).getTime();
      return left - right;
    })
    .slice(0, limit);
}

function renderFeaturedProducts() {
  const featured = document.getElementById('featured-products');
  if (!featured) return;

  featured.innerHTML = getFeaturedProducts().map((product) => buildProductCard(product)).join('');
  bindCardContainer(featured);
  updateHomeProductCount();
}

function renderLatestProducts() {
  const latest = document.getElementById('latest-products');
  if (!latest) return;

  latest.innerHTML = getLatestProducts().map((product) => buildProductCard(product)).join('');
  bindCardContainer(latest);
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  const count = document.getElementById('results-count');
  const pagination = document.getElementById('pagination');
  if (!grid || !count || !pagination) return;

  const list = filterProducts();
  count.textContent = `${list.length} sản phẩm`;

  if (!list.length) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <h3>Không tìm thấy sản phẩm phù hợp</h3>
        <p>Thử đổi từ khóa, bỏ bớt bộ lọc hoặc chọn lại danh mục nhé.</p>
      </div>
    `;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = clampPage(totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleProducts = list.slice(start, start + pageSize);

  grid.innerHTML = visibleProducts.map((product) => buildProductCard(product)).join('');
  bindCardContainer(grid);
  renderPagination(totalPages);
  updateHomeProductCount();
}

function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const buttons = [];
  buttons.push(`
    <button type="button" class="page-btn" data-page="${Math.max(1, state.currentPage - 1)}" ${state.currentPage === 1 ? 'disabled' : ''}>
      Trước
    </button>
  `);

  for (let page = 1; page <= totalPages; page += 1) {
    buttons.push(`
      <button type="button" class="page-btn ${page === state.currentPage ? 'active' : ''}" data-page="${page}">
        ${page}
      </button>
    `);
  }

  buttons.push(`
    <button type="button" class="page-btn" data-page="${Math.min(totalPages, state.currentPage + 1)}" ${state.currentPage === totalPages ? 'disabled' : ''}>
      Sau
    </button>
  `);

  pagination.innerHTML = buttons.join('');
}

function syncCategoryState() {
  const all = document.getElementById('category-all');
  const categoryInputs = document.querySelectorAll('.category-filter');

  categoryInputs.forEach((input) => {
    if (input.checked) state.categories.add(input.value);
    else state.categories.delete(input.value);
  });

  if (all?.checked) {
    state.categories.clear();
  }
}

function bindEvents() {
  const search = document.getElementById('product-search');
  const sort = document.getElementById('sort-select');
  const categoryAll = document.getElementById('category-all');
  const categoryInputs = document.querySelectorAll('.category-filter');
  const pagination = document.getElementById('pagination');
  const grid = document.getElementById('products-grid');
  const featured = document.getElementById('featured-products');

  search?.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    state.currentPage = 1;
    renderProducts();
  });

  sort?.addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.currentPage = 1;
    renderProducts();
  });

  categoryAll?.addEventListener('change', () => {
    if (categoryAll.checked) {
      state.categories.clear();
      categoryInputs.forEach((input) => {
        input.checked = false;
      });
    }
    syncCategoryState();
    state.currentPage = 1;
    renderProducts();
  });

  categoryInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.categories.add(input.value);
      else state.categories.delete(input.value);

      if (categoryAll) categoryAll.checked = false;
      if (state.categories.size === 0 && categoryAll) {
        categoryAll.checked = true;
      }

      syncCategoryState();
      state.currentPage = 1;
      renderProducts();
    });
  });

  bindCardContainer(grid);
  bindCardContainer(featured);

  pagination?.addEventListener('click', (event) => {
    const button = event.target.closest('.page-btn');
    if (!button || button.disabled) return;

    const nextPage = Number(button.dataset.page);
    if (!Number.isFinite(nextPage)) return;

    state.currentPage = nextPage;
    renderProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function initCatalog() {
  if (window.BAKERY_PRODUCTS_READY && typeof window.BAKERY_PRODUCTS_READY.then === 'function') {
    await window.BAKERY_PRODUCTS_READY.catch(() => {});
  }

  syncCategoryState();
  bindEvents();
  renderProducts();
  renderFeaturedProducts();
  renderLatestProducts();
  updateHomeProductCount();
  updateCartUI();
}

document.addEventListener('DOMContentLoaded', () => {
  initCatalog();
});
