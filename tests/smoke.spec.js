// Pruebas de humo de Quetzal LMS. Detectan lo que más rompe a las
// escuelas: una página que no carga, un error de JavaScript al abrir, el
// service worker (modo sin conexión) que no se instala.
const { test, expect } = require('@playwright/test');

// Errores de JavaScript propios de la página (no de red: sin sesión, varias
// llamadas a Supabase responden 401 y eso es esperable).
function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

test('la pantalla de inicio de sesión carga sin errores', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#btn-login')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Política de privacidad' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('el service worker se instala (modo sin conexión)', async ({ page }) => {
  await page.goto('/');
  const scope = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
    ]);
    return reg.scope;
  });
  expect(scope).toContain('localhost:8080');
});

test('la versión de la app coincide con la del service worker', async ({ page, request }) => {
  await page.goto('/');
  const html = await (await request.get('/')).text();
  const sw = await (await request.get('/service-worker.js')).text();
  const appVersion = html.match(/1\.0\.\d+/)?.[0];
  const swVersion = sw.match(/projectx-v(1\.0\.\d+)/)?.[1];
  expect(appVersion, 'no se encontró la versión en index.html').toBeTruthy();
  expect(swVersion).toBe(appVersion);
});

test('la política de privacidad carga', async ({ page }) => {
  await page.goto('/privacidad.html');
  await expect(page.getByRole('heading', { name: 'Política de privacidad' })).toBeVisible();
});

test('el portal de padres rechaza un enlace inválido', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/padres.html?t=no-es-un-token');
  await expect(page.getByText('Este enlace no es válido')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('el manifiesto de la PWA es válido', async ({ request }) => {
  const res = await request.get('/manifest.json');
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name || manifest.short_name).toBeTruthy();
  expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeTruthy();
});
