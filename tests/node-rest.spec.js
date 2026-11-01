// La app REAL sobre el nodo sin internet (capa local compatible con Supabase): login de verdad sin lista de usuarios,
// Inicio, Cursos, avance de lección, cofre diario, Práctica del Centro de Juego y aviso de sincronización.
// Arranca school-node/server.js de verdad (helper de tests-unit) y bloquea todo lo que no sea el nodo, como una
// escuela sin internet. Se omite si better-sqlite3 no está compilado para este Node.
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
        students: [
          { id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 1240, gems: 30, streak: 6, role: 'estudiante' },
          { id: 's2', username: 'beto1', full_name: 'Beto Ruiz', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 800, gems: 10, streak: 2, role: 'estudiante' },
        ],
        courses: [{ id: 'c1', title: 'Robótica básica', description: 'Primeros pasos', school_code: 'ESC1', grade: 'Primero', section: 'A', created_at: '2026-10-01T00:00:00Z' }],
        lessons: [
          { id: 'l1', course_id: 'c1', title: 'Qué es un robot', content_type: 'text', audience: 'estudiante', order_index: 1, school_code: 'ESC1', grade: 'Primero', section: 'A' },
          { id: 'l2', course_id: 'c1', title: 'Sensores', content_type: 'text', audience: 'estudiante', order_index: 2, school_code: 'ESC1', grade: 'Primero', section: 'A' },
        ],
        lesson_completions: [{ id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 100, status: 'completed' }],
        projects: [{ id: 101, user_id: 's2', title: 'Semáforo con Arduino', description: 'Un semáforo', score: 85, votes: 3, bimestre: 2, created_at: '2026-10-30T10:00:00Z' }],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

async function open(page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
}

async function login(page, user = 'ana1', pass = 'clase123') {
  await page.fill('#login-username', user);
  await page.fill('#login-password', pass);
  await page.click('#btn-login');
}

const closeOverlays = (page) => page.evaluate(() => {
  document.querySelectorAll('div').forEach((e) => { if (/COFRE DIARIO/i.test(e.textContent || '') && e.textContent.length < 200) e.closest('.fixed')?.remove(); });
  document.querySelector('.driver-popover-close-btn')?.click();
});

test('el login es el de la app (sin lista de usuarios) y una contraseña mala no entra', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  expect(await page.evaluate(() => window.SUPABASE_URL)).toBe(node.base);
  await expect(page.locator('#node-login')).toHaveCount(0);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Beto|Ana López|beto1/);

  await login(page, 'ana1', 'mala');
  await expect(page.getByText('Usuario o contraseña incorrectos').first()).toBeVisible();
  await expect(page.locator('#login-username')).toBeVisible();
  expect(errors).toEqual([]);
});

test('entra y ve Inicio, Cursos con su avance, el cofre, la Práctica y el aviso de sincronización', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page);

  await expect(page.getByText('Ana López').first()).toBeVisible();
  await closeOverlays(page);
  await expect(page.getByText('TU RANGO')).toBeVisible();
  await expect(page.getByText('1240 XP TOTAL')).toBeVisible();
  await expect(page.getByText('Semáforo con Arduino')).toBeVisible();

  await page.evaluate(() => window.nav('lessons'));
  const lessons = page.locator('#view-lessons');
  await expect(lessons.getByRole('heading', { name: 'Robótica básica' })).toBeVisible();
  await expect(lessons.getByText('50%')).toBeVisible();

  // Aviso de sincronización: sin sincronizar y sin cambios; al completar una lección cuenta 1 cambio por subir.
  const chip = page.locator('#node-sync-chip');
  await expect(chip).toContainText('Aún sin sincronizar');
  const xp = await page.evaluate(async () => {
    await window._supabase.from('lesson_completions').upsert({ lesson_id: 'l2', student_id: 's1', score: 90, status: 'completed' }, { onConflict: 'lesson_id,student_id' });
    window.dispatchEvent(new Event('focus'));
    return (await window._supabase.from('students').select('xp').eq('id', 's1').single()).data.xp;
  });
  expect(xp).toBe(1250); // 10 XP por la lección, al instante
  await expect(chip).toContainText('1 cambio por subir');

  // Cofre diario sin internet: el premio llega y el XP sube.
  const chest = await page.evaluate(async () => (await window._supabase.rpc('claim_daily_chest')).data);
  expect([20, 50, 100]).toContain(chest.xp);
  const again = await page.evaluate(async () => (await window._supabase.rpc('claim_daily_chest')).error?.message);
  expect(again).toMatch(/Ya reclamaste/);

  // Práctica (sin IA): el tema de la clase sale de la réplica.
  await page.evaluate(() => window.PracticeMode.start('hangman'));
  await expect(page.getByText('PRÁCTICA: AHORCADO', { exact: false })).toBeVisible();
  await expect(page.locator('#practice-topic-modal option', { hasText: 'Sensores' })).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('un estudiante no puede leer columnas secretas ni a otros salones por la capa local', async ({ page }) => {
  test.skip(!node, skipReason);
  await open(page);
  await login(page);
  await expect(page.getByText('Ana López').first()).toBeVisible();
  const out = await page.evaluate(async () => {
    const pin = await window._supabase.from('students').select('pin_hash').limit(1);
    const secret = await window._supabase.from('xp_events').select('*');
    const write = await window._supabase.from('students').update({ xp: 99999 }).eq('id', 's1');
    return { pin: pin.error?.code, secret: secret.error?.code, write: write.error?.code };
  });
  expect(out).toEqual({ pin: '42703', secret: '42P01', write: '42501' });
});
