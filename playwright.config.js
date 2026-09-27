// Pruebas de humo: comprueban que las páginas principales cargan sin
// errores. No inician sesión ni tocan la base de datos (no necesitan
// credenciales). Correr con: npm test
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:8080',
    locale: 'es-GT',
  },
  // PW_CHANNEL=chrome usa el Chrome instalado en la computadora (útil en
  // Windows si el navegador que descarga Playwright no puede abrirse).
  projects: [
    { name: 'celular', use: { ...devices['Pixel 5'], channel: process.env.PW_CHANNEL } },
    { name: 'computadora', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } },
  ],
  webServer: {
    command: 'npx http-server -p 8080 -c-1 --silent',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
