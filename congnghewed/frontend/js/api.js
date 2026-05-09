(function () {
  const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3000';
  const nativeFetch = window.fetch.bind(window);

  function canonicalizeLocalDevHost() {
    const { protocol, hostname, port, pathname, search, hash } = window.location;
    if (protocol === 'http:' && hostname === '127.0.0.1') {
      const nextUrl = `http://localhost${port ? `:${port}` : ''}${pathname}${search}${hash}`;
      window.location.replace(nextUrl);
      return true;
    }
    return false;
  }

  function resolveBaseUrl() {
    const explicit = String(window.BAKERY_API_BASE_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');

    if (window.location.protocol === 'file:') {
      return DEFAULT_BACKEND_ORIGIN;
    }

    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port || '';

    if (!port || port === '3000') {
      return '';
    }

    return `${window.location.protocol}//${hostname}:3000`;
  }

  function resolveApiUrl(path) {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const base = resolveBaseUrl();
    if (!base) {
      return path;
    }

    return new URL(path, base).toString();
  }

  function shouldProxy(input) {
    const raw = input instanceof Request ? input.url : String(input || '');
    if (!raw) return false;

    try {
      const url = new URL(raw, window.location.href);
      return url.pathname.startsWith('/api/');
    } catch {
      return raw.startsWith('/api/') || raw.startsWith('api/');
    }
  }

  async function bakeryFetch(input, options = {}) {
    if (shouldProxy(input)) {
      const raw = input instanceof Request ? input.url : String(input);
      const resolved = raw.startsWith('api/') ? `/${raw}` : raw;
      input = resolveApiUrl(resolved);
    }

    return nativeFetch(input, options);
  }

  if (!canonicalizeLocalDevHost()) {
    window.BAKERY_API_BASE_URL = resolveBaseUrl();
    window.bakeryApiFetch = bakeryFetch;
    window.fetch = bakeryFetch;
  }
})();
