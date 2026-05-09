let cachedCurrentUser = null;
let cachedPublicConfig = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPageNextUrl() {
  const pathname = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';

  if (pathname === 'auth.html') return 'index.html';
  if (pathname === 'cart.html') return 'cart.html';
  if (pathname.endsWith('.html')) return pathname;
  return 'index.html';
}

function getRequestedNextInfo() {
  try {
    const url = new URL(window.location.href);
    const explicitNext = String(url.searchParams.get('next') || '').trim();
    return {
      explicit: Boolean(explicitNext),
      nextUrl: explicitNext || getPageNextUrl(),
    };
  } catch {
    return {
      explicit: false,
      nextUrl: getPageNextUrl(),
    };
  }
}

function isAdminTarget(target) {
  const file = String(target || '').split('/').pop().toLowerCase();
  return file === 'admin.html' || file.startsWith('admin-');
}

function getAuthScope(nextUrl) {
  return isAdminTarget(nextUrl) ? 'admin' : 'user';
}

function resolvePostAuthUrl(user, requestedNext) {
  const fallback = String(requestedNext || '').trim() || 'index.html';

  if (user?.role === 'admin') {
    if (isAdminTarget(fallback)) return fallback;
    return 'admin.html';
  }

  return fallback;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === 'object' && body ? body.message : 'Có lỗi xảy ra.';
    const error = new Error(message);
    error.body = body;
    throw error;
  }

  return body;
}

async function getPublicConfig() {
  if (cachedPublicConfig) return cachedPublicConfig;

  try {
    cachedPublicConfig = await apiFetch('/api/public-config', { method: 'GET', headers: {} });
  } catch {
    cachedPublicConfig = {};
  }

  return cachedPublicConfig;
}

async function getCurrentUser() {
  if (cachedCurrentUser !== null) return cachedCurrentUser;

  try {
    const data = await apiFetch('/api/me?scope=user', { method: 'GET', headers: {} });
    cachedCurrentUser = data.user || null;
  } catch {
    cachedCurrentUser = null;
  }

  return cachedCurrentUser;
}

function setAuthMessage(message, type) {
  const box = document.getElementById('auth-message');
  if (!box) return;
  box.textContent = message || '';
  box.className = 'auth-message' + (type ? ' ' + type : '');
}

async function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (!area) return;

  area.innerHTML = '<div class="auth-user"><span class="auth-user-name">...</span></div>';

  const user = await getCurrentUser();
  const nextUrl = encodeURIComponent(getPageNextUrl());

  if (user) {
    area.innerHTML = `
      <div class="auth-user">
        <span class="auth-user-name">${escapeHtml(user.name || user.email)}</span>
        <button type="button" class="auth-link auth-logout" onclick="logoutUser()">Đăng xuất</button>
      </div>
    `;
    return;
  }

  area.innerHTML = `
    <div class="auth-links">
      <a class="auth-link" href="auth.html?mode=login&next=${nextUrl}">Đăng nhập</a>
      <a class="auth-button" href="auth.html?mode=register&next=${nextUrl}">Đăng ký</a>
    </div>
  `;
}

async function logoutUser() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ scope: 'user' }) });
  } catch {
    // Ignore logout errors and clear the UI locally.
  }

  cachedCurrentUser = null;
  await renderAuthArea();

  if (window.location.pathname.toLowerCase().includes('cart.html')) {
    window.location.reload();
    return;
  }

  window.location.href = 'index.html';
}

function prefillCheckoutProfile() {
  const nameInput = document.getElementById('name');
  if (nameInput && !nameInput.value.trim() && cachedCurrentUser) {
    nameInput.value = cachedCurrentUser.name || '';
  }
}

async function submitAuth(path, payload) {
  const data = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  cachedCurrentUser = data.user || null;
  return data;
}

async function initGoogleButton(nextUrl, mode) {
  const suffix = mode === 'register' ? 'register' : 'login';
  const buttonHost = document.getElementById(`google-signin-button-${suffix}`);
  const noteHost = document.getElementById(`google-signin-note-${suffix}`);
  if (!buttonHost) return;

  if (!window.google || !google.accounts || !google.accounts.id) {
    buttonHost.innerHTML = '<p class="auth-inline-note">Đang tải Google Sign-In...</p>';
    setTimeout(() => initGoogleButton(nextUrl, mode), 300);
    return;
  }

  const config = await getPublicConfig();
  const clientId = config.googleClientId || '';

  if (!clientId) {
    buttonHost.innerHTML = '<p class="auth-inline-note">Chưa cấu hình `GOOGLE_CLIENT_ID` trên server.</p>';
    if (noteHost && config.note) noteHost.textContent = config.note;
    return;
  }

  if (buttonHost.dataset.rendered === '1') return;

  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const data = await submitAuth('/api/auth/google', {
          credential: response.credential,
          scope: getAuthScope(nextUrl),
        });
        window.location.href = resolvePostAuthUrl(data.user, nextUrl);
      } catch (error) {
        setAuthMessage(error.message || 'Đăng nhập Google thất bại.', 'error');
      }
    },
  });

  buttonHost.innerHTML = '';
  buttonHost.dataset.rendered = '1';
  google.accounts.id.renderButton(buttonHost, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    width: 360,
    text: 'signin_with',
    logo_alignment: 'left',
  });
}

async function initAuthPage() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginPanel = document.getElementById('login-panel');
  const registerPanel = document.getElementById('register-panel');

  const url = new URL(window.location.href);
  const mode = url.searchParams.get('mode') || 'login';
  const nextInfo = getRequestedNextInfo();
  const authScope = getAuthScope(nextInfo.nextUrl);

  const showMode = (selected) => {
    const isLogin = selected === 'login';
    if (loginPanel) loginPanel.hidden = !isLogin;
    if (registerPanel) registerPanel.hidden = isLogin;
    if (loginTab) loginTab.classList.toggle('active', isLogin);
    if (registerTab) registerTab.classList.toggle('active', !isLogin);
    setAuthMessage('', '');

    const hintBox = document.getElementById('auth-admin-hint');
    if (hintBox) {
      hintBox.textContent = isAdminTarget(nextInfo.nextUrl)
        ? 'Đăng nhập bằng tài khoản quản trị để vào khu admin.'
        : '';
    }

    initGoogleButton(nextInfo.nextUrl, selected);
  };

  if (loginTab) loginTab.addEventListener('click', () => showMode('login'));
  if (registerTab) registerTab.addEventListener('click', () => showMode('register'));

  const registerLink = document.querySelector('.auth-forgot');
  if (registerLink) {
    registerLink.href = 'auth.html?mode=register&next=' + encodeURIComponent(nextInfo.nextUrl);
  }

  showMode(mode === 'register' ? 'register' : 'login');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = String(document.getElementById('login-email').value || '').trim();
      const password = String(document.getElementById('login-password').value || '').trim();

      if (!email || !password) {
        setAuthMessage('Vui lòng nhập email và mật khẩu.', 'error');
        return;
      }

      try {
        const data = await submitAuth('/api/auth/login', { email, password, scope: authScope });
        window.location.href = resolvePostAuthUrl(data.user, nextInfo.nextUrl);
      } catch (error) {
        setAuthMessage(error.message || 'Đăng nhập thất bại.', 'error');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = String(document.getElementById('register-name').value || '').trim();
      const email = String(document.getElementById('register-email').value || '').trim();
      const birthday = String(document.getElementById('register-birthday').value || '').trim();
      const password = String(document.getElementById('register-password').value || '').trim();
      const confirm = String(document.getElementById('register-confirm').value || '').trim();

      if (!name || !email || !password || !confirm) {
        setAuthMessage('Vui lòng điền đầy đủ thông tin.', 'error');
        return;
      }

      if (password.length < 6) {
        setAuthMessage('Mật khẩu phải có ít nhất 6 ký tự.', 'error');
        return;
      }

      if (password !== confirm) {
        setAuthMessage('Mật khẩu xác nhận không khớp.', 'error');
        return;
      }

      try {
        const data = await submitAuth('/api/auth/register', {
          name,
          email,
          birthday,
          password,
          scope: 'user',
        });
        window.location.href = resolvePostAuthUrl(data.user, nextInfo.nextUrl);
      } catch (error) {
        setAuthMessage(error.message || 'Đăng ký thất bại.', 'error');
      }
    });
  }

  initGoogleButton(nextInfo.nextUrl, mode);
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderAuthArea();
  await initAuthPage();
  prefillCheckoutProfile();
});
