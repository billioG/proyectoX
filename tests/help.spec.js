// Ayuda dentro de la app (js/help-messages.js): el botón de la pantalla de entrada y el de «Subir proyecto» abren la ayuda con sus pasos, se cierran con Escape,
// y el aviso de ingreso con datos malos sale en español claro. Sobre school-node/server.js de verdad, sin internet.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 0, gems: 0, role: 'estudiante' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

test('ayuda para entrar, aviso claro con datos malos, y ayuda de «Subir proyecto»', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');

  // 1) Ayuda de la pantalla de entrada.
  await page.getByRole('button', { name: '¿Necesitas ayuda para entrar?' }).click();
  const modal = page.locator('#help-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Ayuda para entrar');
  await expect(modal).toContainText('Estudiantes: escribe tu usuario (sin @)');
  await expect(modal.locator('ol li')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // 2) Contraseña de clase equivocada: aviso en español con lo que se puede hacer.
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'incorrecta');
  await page.click('#btn-login');
  const toast = page.locator('.toast-error').first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).not.toContainText(/invalid|undefined|TypeError/i);
  await expect(toast).toContainText(/contrase/i);

  // 3) Entra bien y abre «Subir proyecto»: botón de ayuda con los límites reales.
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });
  await page.evaluate(() => window.nav('upload'));
  await page.getByRole('button', { name: /¿Cómo subo mi proyecto\?/ }).click();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Cómo subir un proyecto');
  await expect(modal).toContainText('mínimo 5 letras');
  await expect(modal).toContainText('150 MB');
  await modal.locator('[data-help-close]').click();
  await expect(modal).toHaveCount(0);
  expect(errors).toEqual([]);
});
