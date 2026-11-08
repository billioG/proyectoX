// La política de contenido (CSP) de index.html no debe bloquear nada que la app necesita: se comprueba con la CSP ACTIVA (el resto de las pruebas la saltan, ver playwright.config.js),
// en la pantalla de entrada y ya con sesión de docente (servidor escolar de verdad) recorriendo las vistas principales.
const { test, expect } = require('@playwright/test');

test.use({ bypassCSP: false, serviceWorkers: 'block' });

const isCsp = (text) => /Content Security Policy|Refused to (load|execute|connect|frame|apply|create)/i.test(text);

test('pantalla de entrada: ningún recurso de la app es bloqueado por la CSP', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => { if (isCsp(m.text())) blocked.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(blocked, blocked.join(' | ')).toEqual([]);
});

let node = null;
let skipReason = '';

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

test('con sesión de docente: recorrer las vistas principales no dispara bloqueos de la CSP', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const blocked = [];
  page.on('console', (m) => { if (isCsp(m.text())) blocked.push(m.text()); });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  // expect.poll usa page.evaluate con una función (no «eval» de texto), que sí funciona con la CSP activa.
  await expect.poll(() => page.evaluate(() => window.currentUser?.id === 't1' && typeof window.nav === 'function'), { timeout: 30_000 }).toBe(true);
  for (const view of ['feed', 'lessons', 'students', 'attendance', 'progress', 'inbox', 'school-servers', 'exams']) {
    await page.evaluate((v) => window.nav(v), view);
    await page.waitForTimeout(700);
  }
  expect(blocked, blocked.join(' | ')).toEqual([]);
});
