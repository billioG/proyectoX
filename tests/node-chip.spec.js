// La barra de sincronización del docente con la app REAL: al detectar internet el servidor sincroniza solo y la barra lo cuenta paso a paso («Se conectó a internet. Sincronizando: …»),
// avisa cuando termina, y al pasar el cursor muestra si hay internet y las direcciones del servidor. El estado del nodo se simula para controlar cada momento.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
// El Service Worker de la app atiende las peticiones y Playwright no puede simularlas: se bloquea en esta prueba.
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
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

const base = { pending_changes: 0, pending: { uploads: 0, uploads_rejected: [] }, sync_error: null, last_sync_at: null, internet: { online: true, detail: null, checked_at: '2026-11-05T10:00:00Z' }, urls: ['http://192.168.1.50:8080', 'http://quetzal.local:8080'] };

test('la barra muestra el avance cuando el servidor sincroniza solo al detectar internet, avisa al terminar y da las direcciones', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  let current = { ...base, syncing: false, last_sync_at: '2026-11-05T09:00:00Z' };
  await page.route('**/api/node/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) }));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  const chip = page.locator('#node-sync-chip');
  // Antes de iniciar sesión la barra NO existe a la vista.
  await expect(chip).toBeHidden();
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await expect(chip).toContainText('Sincronizado hace');
  await expect(chip).toHaveAttribute('title', /Internet: sí\.[\s\S]*Dirección del servidor: http:\/\/192\.168\.1\.50:8080 {2}·.*quetzal\.local/);

  // En el celular: tocar el texto muestra si hay internet y por dónde se abre el servidor (cambia al conectarlo a otra red).
  await chip.locator('[data-text]').evaluate((el) => el.click()); // (en el celular otra capa puede taparla; el clic real es el mismo)
  await expect(page.getByText('El servidor tiene internet.')).toBeVisible();
  await expect(page.getByText('Abre el servidor en: http://192.168.1.50:8080 o http://quetzal.local:8080')).toBeVisible();

  // El servidor detecta internet y empieza solo: la barra lo cuenta, con el paso en el que va.
  current = { ...base, syncing: true, sync_cause: 'reconnect', sync_stage: 'Enviando los cambios y bajando lo nuevo de la nube', pending_changes: 3, last_sync_at: '2026-11-05T09:00:00Z' };
  await expect(chip).toContainText('Se conectó a internet. Sincronizando: Enviando los cambios y bajando lo nuevo de la nube…', { timeout: 30_000 });
  await expect(chip).toHaveAttribute('data-tone', 'busy');
  await expect(chip.locator('[data-sync]')).toBeDisabled();

  // Termina: aviso de «Listo» (aunque nadie pulsó el botón) y la barra vuelve a «Sincronizado».
  current = { ...base, syncing: false, last_sync_at: new Date().toISOString() };
  await expect(page.getByText('Listo, se sincronizó con la nube')).toBeVisible({ timeout: 30_000 });
  await expect(chip).toContainText('Sincronizado');

  // Si el intento que arrancó solo falla, lo dice (con el motivo).
  current = { ...base, syncing: true, sync_cause: 'reconnect', sync_stage: 'Empezando' };
  await expect(chip).toContainText('Sincronizando', { timeout: 30_000 });
  current = { ...base, syncing: false, sync_error: 'Sin internet por ahora: la conexión es muy lenta.', internet: { online: false, detail: 'La nube no respondió a tiempo.' } };
  await expect(page.getByText('la conexión es muy lenta').first()).toBeVisible({ timeout: 30_000 });
});

test('la barra de sincronización no la ve una estudiante, y el menú sigue funcionando con el Centro de Juego abierto', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  await page.route('**/api/node/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base, syncing: false, last_sync_at: '2026-11-05T09:00:00Z' }) }));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); localStorage.setItem('gamecenter_onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });
  await page.waitForTimeout(2500); // la barra se decide cada segundo
  await expect(page.locator('#node-sync-chip')).toBeHidden();

  // Centro de Juego (pantalla completa): abrir el menú NO lo cierra (queda encima); elegir una opción sí lo cierra y muestra esa pantalla.
  await page.evaluate(() => window.openGamificationHub());
  await expect(page.locator('#gamification-hub-modal')).toBeVisible();
  await page.evaluate(() => window.toggleSidebar());
  // Abrir el menú NO saca del Centro de Juego y el menú queda encima (z-index mayor que el del hub).
  await expect(page.locator('#gamification-hub-modal')).toBeVisible();
  await expect(page.locator('#sidebar')).toHaveClass(/active/);
  await page.waitForTimeout(700); // el menú se desliza 300 ms
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); }); // el cofre diario puede reaparecer encima
  const z = await page.evaluate(() => ({
    side: +getComputedStyle(document.getElementById('sidebar')).zIndex,
    hub: +getComputedStyle(document.getElementById('gamification-hub-modal')).zIndex,
  }));
  if (page.viewportSize().width < 768) { // en computadora el menú es fijo y el Centro de Juego lo cubre por diseño
    expect(z.side).toBeGreaterThan(z.hub);
  }
  await page.evaluate(() => window.nav('lessons'));
  await expect(page.locator('#gamification-hub-modal')).toHaveCount(0);
  await expect(page.locator('#view-lessons')).toBeVisible();
  // Y navegar directo (sin tocar el botón del menú) también lo cierra.
  await page.evaluate(() => window.openGamificationHub());
  await expect(page.locator('#gamification-hub-modal')).toBeVisible();
  await page.evaluate(() => window.nav('ranking'));
  await expect(page.locator('#gamification-hub-modal')).toHaveCount(0);
  await expect(page.locator('#view-ranking')).toBeVisible();
});
