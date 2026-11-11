// «Servidor de la escuela» en la plataforma: el docente ve si su Raspberry está en línea, cuántos cambios tiene por subir y cómo va la sincronización, y toca «Sincronizar ahora» sin saber su dirección IP.
// La nube se simula (las funciones get_school_nodes y request_node_sync) para controlar cada momento; sin la nube, la pantalla lo explica. App real sobre school-node/server.js de verdad.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
test.use({ serviceWorkers: 'block' }); // Playwright no puede simular peticiones que atiende un Service Worker

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

async function openAsTeacher(page) {
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 't1' && window.nav);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });
  await page.evaluate(() => window.nav('school-servers'));
  await page.waitForFunction(() => typeof window.loadSchoolServers === 'function');
}

test('el docente ve el estado de su Raspberry y pide sincronizar desde la plataforma; el avance aparece solo', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  const requests = [];
  const seen = () => new Date(Date.now() - 10_000).toISOString();
  let nodes = [{ id: 'n1', name: 'Raspberry de la sala', school_code: 'ESC1', school_name: 'Escuela Piloto', last_seen_at: seen(), last_sync_at: new Date(Date.now() - 3_600_000).toISOString(), status: { version: 'v1.0.223', pending_changes: 3, syncing: false } }];
  await page.route('**/rest/v1/rpc/get_school_nodes', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(nodes.map((n) => ({ ...n, last_seen_at: seen() }))) }));
  await page.route('**/rest/v1/rpc/request_node_sync', async (r) => { requests.push(r.request().postDataJSON()); await r.fulfill({ contentType: 'application/json', body: '1' }); });
  await openAsTeacher(page);

  const box = page.locator('#school-servers-container');
  await expect(box).toContainText('Escuela Piloto');
  await expect(box).toContainText('Raspberry de la sala');
  await expect(box.locator('[data-badge]')).toHaveText('En línea');
  await expect(box).toContainText('3 cambios por subir');
  await expect(box).toContainText('Última sincronización hace 1 h');
  await expect(box).toContainText('v1.0.223');

  // «Sincronizar ahora»: pide la sincronización de SU escuela y avisa cuánto tarda; el servidor empieza y la pantalla lo muestra sin recargar.
  await page.evaluate(() => document.querySelector('[data-sync-school]').click());
  await expect(page.getByText('el servidor recibe el pedido en menos de 30 segundos')).toBeVisible();
  expect(requests).toEqual([{ p_school: 'ESC1' }]);
  nodes = [{ ...nodes[0], status: { ...nodes[0].status, syncing: true, stage: 'Enviando los cambios y bajando lo nuevo de la nube' } }];
  await expect(box.locator('[data-badge]')).toHaveText('Sincronizando…', { timeout: 20_000 });
  await expect(box).toContainText('Enviando los cambios y bajando lo nuevo de la nube…');
  nodes = [{ ...nodes[0], last_sync_at: new Date().toISOString(), status: { ...nodes[0].status, syncing: false, pending_changes: 0 } }];
  await expect(box).toContainText('Todo está al día', { timeout: 20_000 });
  await expect(box).toContainText('Última sincronización hace unos segundos');

  // Un servidor que no avisa hace rato se ve «Sin conexión» con qué hacer.
  nodes = [{ ...nodes[0], last_seen_at: null }];
  await page.route('**/rest/v1/rpc/get_school_nodes', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...nodes[0], last_seen_at: new Date(Date.now() - 3 * 3_600_000).toISOString() }]) }));
  await expect(box.locator('[data-badge]')).toHaveText('Sin conexión', { timeout: 20_000 });
  await expect(box).toContainText('Conéctalo por cable al router con internet');
  expect(errors).toEqual([]);
});

test('sin la nube (o sin la migración) la pantalla lo explica en vez de quedarse en blanco; escuela sin servidor también', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(60_000);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await openAsTeacher(page);
  await expect(page.locator('#school-servers-container')).toContainText('Esto se ve desde la plataforma en línea');
  await page.route('**/rest/v1/rpc/get_school_nodes', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.evaluate(() => window.loadSchoolServers());
  await expect(page.locator('#school-servers-container')).toContainText('todavía no tiene un servidor');
});
