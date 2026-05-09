function createSchemaService({ authService, productService, adminEmail, adminPassword }) {
  function ensureSchema() {
    authService.ensureUserRoleColumn();
    productService.ensureProductNewFlagColumn();
    productService.ensureProductsSeed();
    authService.ensureAdminUser(adminEmail, adminPassword);
  }

  return { ensureSchema };
}

module.exports = { createSchemaService };
