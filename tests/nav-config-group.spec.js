// Menú lateral del docente: lo de configuración vive plegado en un solo grupo «Configuración».
// Al navegar a una opción de dentro, el grupo se despliega; sin modo simple, el docente ve todas sus opciones.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
test.use({ serviceWorkers: 'block' });

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword, emailHash } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

test('la configuración del docente está plegada en un grupo y se despliega al entrar a una de sus opciones', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');

  // El login ya no enlaza a la política de privacidad ni a «Para colegios».
  await expect(page.getByRole('link', { name: 'Política de privacidad' })).toHaveCount(0);

  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 't1' && window.nav);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });

  const group = page.locator('#cfg-group-doc');
  const toggle = group.locator('.nav-group-toggle');
  const items = group.locator('.nav-group-items');

  // En celular el menú está oculto hasta tocar la hamburguesa.
  if (await page.locator('#mobile-menu-btn').isVisible()) await page.click('#mobile-menu-btn');

  // Tres grupos: «Mi clase» viene abierto (lo de todos los días); «Seguimiento» y «Configuración», plegados.
  await expect(page.locator('#cls-group-doc .nav-group-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#nav-doc-attendance')).toBeVisible();
  await expect(page.locator('#seg-group-doc .nav-group-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#nav-doc-students')).toBeHidden();
  // Un docente que no coordina no ve «Mis Docentes» / «Mi Establecimiento».
  await expect(page.locator('.nav-coord-only')).toHaveCount(2);
  for (const el of await page.locator('.nav-coord-only').all()) await expect(el).toBeHidden();

  // El grupo aparece plegado.
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('Configuración');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(items).toBeHidden();

  // Se despliega al tocarlo y se pliega de nuevo.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(items).toBeVisible();
  await expect(group.getByText('Servidor de la escuela')).toBeVisible();
  await toggle.click();
  await expect(items).toBeHidden();

  // Lo que el docente deja abierto se recuerda en el dispositivo.
  await page.reload();
  await page.waitForFunction(() => window.currentUser?.id === 't1' && window.nav);
  await expect(page.locator('#cls-group-doc .nav-group-toggle')).toHaveAttribute('aria-expanded', 'true');

  // Navegar a una opción de dentro despliega el grupo y la marca activa.
  await page.evaluate(() => window.nav('school-servers'));
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#nav-doc-servers')).toHaveClass(/active/);

  // Equipos también vive dentro del grupo, y ya no hay «modo simple» ni botón para alternarlo.
  await expect(page.locator('#nav-doc-groups')).toBeVisible();
  expect(await page.locator('#nav-docente > #nav-doc-groups').count()).toBe(0);
  await expect(page.locator('#nav-doc-simple-toggle')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});
