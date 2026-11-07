// Marca del colegio con la app REAL sobre el nodo: el encabezado muestra el nombre y el logo del colegio,
// y el crédito «Hecho por Yo Aprendo · Quetzal LMS» está siempre (encabezado, menú y pantalla de entrada).
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
test.use({ serviceWorkers: 'block' });
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto', brand_name: 'Colegio San José', logo_data: LOGO, brand_color: '#1d4ed8', brand_color2: '#0f766e', brand_color3: '#d97706' }],
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

test('el encabezado muestra el nombre y el logo del colegio, y el crédito de Yo Aprendo siempre está', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); localStorage.setItem('gamecenter_onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  // Antes de entrar: en el nodo de un solo colegio ya se ve su nombre, su logo y su color; el crédito de Yo Aprendo está siempre.
  await expect(page.getByText('Hecho por Yo Aprendo').first()).toBeVisible();
  await expect(page.locator('#login-brand-name')).toHaveText('Colegio San José', { timeout: 15_000 });
  await expect(page.locator('#login-brand-logo')).toBeVisible();
  await expect(page.locator('#login-brand-tile')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-rgb').trim())).toBe('29 78 216');
  // Secundario (índigo/violeta/azul) y acento (ámbar/naranja/amarillo) también cambian: 500 = el color elegido.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sec-500').trim())).toBe('15 118 110');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--acc-500').trim())).toBe('217 119 6');
  // El botón de entrar anima el cambio de color (transition-all): se termina la animación para leer el color final.
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#btn-login')).backgroundColor)).toMatch(/29, 78, 216|rgb\(29 78 216\)/);
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);

  await expect(page.locator('#brand-name')).toHaveText('Colegio San José', { timeout: 15_000 });
  await expect(page.locator('#brand-logo')).toBeVisible();
  await expect(page.locator('#brand-logo')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('#brand-credit')).toBeVisible();
  await expect(page.locator('#brand-credit')).toContainText('Hecho por Yo Aprendo · Quetzal LMS');
  // El pie del menú no depende de la marca.
  await expect(page.locator('#app-credit-sidebar')).toHaveText('Hecho por Yo Aprendo · Quetzal LMS');
});
