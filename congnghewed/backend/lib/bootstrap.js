const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function createAllowedFrontendOrigins(env = process.env) {
  return new Set(
    [env.FRONTEND_ORIGIN, ...(env.FRONTEND_ORIGINS || '').split(',')]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  );
}

function resolveFrontendPaths(rootDir) {
  const frontendRoot = path.join(rootDir, '..', 'frontend');
  return {
    frontendRoot,
    productDataPath: path.join(frontendRoot, 'js', 'product-data.js'),
  };
}

function readFrontendProductSeed(productDataPath) {
  try {
    const code = fs.readFileSync(productDataPath, 'utf8');
    const sandbox = { window: {} };
    require('vm').runInNewContext(code, sandbox, { timeout: 1000 });
    return Array.isArray(sandbox.window.BAKERY_PRODUCTS) ? sandbox.window.BAKERY_PRODUCTS : [];
  } catch (error) {
    console.warn('[products] Unable to load frontend seed:', error.message);
    return [];
  }
}

module.exports = {
  loadEnvFile,
  createAllowedFrontendOrigins,
  resolveFrontendPaths,
  readFrontendProductSeed,
};
