// Buzón en la app REAL (sobre school-node/server.js de verdad): el docente lee las evaluaciones y las sugerencias de SU clase de forma ANÓNIMA (el nombre de los estudiantes no aparece en ninguna parte
// de la pantalla), con el promedio por criterio. Funciona sin internet porque el servidor de la escuela tiene la misma función que la nube.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword, emailHash } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  const when = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 19);
  node = await helper.startNode({
    rest: {
      teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        students: [
          { id: 's1', username: 'ana1', full_name: 'Ana Quiñónez', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
          { id: 's2', username: 'beto1', full_name: 'Beto Zamora', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        ],
        teacher_ratings: [
          { id: 1, student_id: 's1', teacher_id: 't1', rating: 4.2, message: 'La robótica', best_moment: 'La robótica', created_at: when, q_interest: 4, q_practice: 5, q_resources: 4, q_respect: 5, q_clarity: 4 },
          { id: 2, student_id: 's2', teacher_id: 't1', rating: 3.8, message: 'Fue muy rápido', best_moment: null, created_at: when, q_interest: 4, q_practice: 3, q_resources: 4, q_respect: 3, q_clarity: 0 },
        ],
        student_suggestions: [{ id: 1, student_id: 's1', type: 'suggestion', message: 'Más tiempo de laboratorio, por favor', rating: null, created_at: when }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

test('el docente lee el buzón: promedio, comentarios y sugerencias de su clase, sin saber quién escribió', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const failed = [];
  page.on('response', r => { if (/get_feedback_inbox|get_my_ratings|teacher_ratings|student_suggestions/.test(r.url()) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 't1' && window.nav);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });
  await page.evaluate(() => window.nav('inbox'));
  const box = page.locator('#inbox-container');
  await expect(box).toContainText('Evaluaciones de la clase');
  await expect(box).toContainText('anónimos');
  await expect(box).toContainText('de 5 · 2 evaluaciones'); // dos evaluaciones, promedio 4 (4.2 y 3.8)
  await expect(box.locator('.text-4xl')).toHaveText('4');
  await expect(box).toContainText('Aprendizaje práctico');
  await expect(box).toContainText('La robótica');
  await expect(box).toContainText('Fue muy rápido');
  await expect(box).toContainText('Más tiempo de laboratorio, por favor');
  await expect(box).toContainText('Anónimo');

  // Anonimato: ni en lo que se ve, ni en el código de la pantalla, ni leyendo las tablas directo.
  const everything = await page.evaluate(() => document.getElementById('view-inbox').innerHTML + document.body.innerText);
  for (const secret of ['Ana', 'Quiñónez', 'Beto', 'Zamora', 'ana1', 'beto1', 's1', 's2']) expect(everything.includes(secret), `no debe verse ${secret}`).toBe(false);
  const direct = await page.evaluate(async () => ({ r: (await window._supabase.from('teacher_ratings').select('*')).data, s: (await window._supabase.from('student_suggestions').select('*')).data }));
  expect(direct).toEqual({ r: [], s: [] });
  // El perfil del docente sigue promediando sus notas (por la función, sin ver quién).
  const mine = await page.evaluate(async () => (await window._supabase.rpc('get_my_ratings')).data);
  expect(mine).toEqual([{ rating: 4.2 }, { rating: 3.8 }]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('el administrador ve quién escribió cada mensaje y a qué docente; puede filtrar por establecimiento', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(60_000);
  const calls = [];
  const data = {
    role: 'admin',
    suggestions: [{ id: 1, message: 'Más computadoras', created_at: '2026-11-03T10:00:00', school_code: 'ESC1', school_name: 'Escuela Uno', grade: 'Primero', section: 'A', student_name: 'Ana Quiñónez' }],
    ratings: [{ id: 1, rating: 4.5, message: 'La robótica', best_moment: 'La robótica', created_at: '2026-11-03T10:00:00', q_interest: 5, q_practice: 4, q_resources: 4, q_respect: 5, q_clarity: 4, school_code: 'ESC2', school_name: 'Escuela Dos', grade: 'Segundo', section: 'B', teacher_name: 'Marta Gómez', student_name: 'Beto Zamora' }],
  };
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.route('**/rest/v1/rpc/get_feedback_inbox', async (r) => { calls.push(r.request().postDataJSON()); await r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }); });
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_t1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 't1' && window.nav);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });
  await page.evaluate(() => window.nav('inbox'));
  const box = page.locator('#inbox-container');
  await expect(box).toContainText('Como administrador ves quién escribió');
  await expect(box).toContainText('Beto Zamora → Marta Gómez');
  await expect(box).toContainText('Ana Quiñónez');
  await expect(box.locator('#inbox-school option')).toHaveText(['Todos los establecimientos', 'Escuela Dos', 'Escuela Uno']);
  await page.evaluate(() => { const s = document.getElementById('inbox-school'); s.value = 'ESC2'; s.dispatchEvent(new Event('change')); });
  await expect.poll(() => calls.at(-1)?.p_school).toBe('ESC2'); // el filtro pide solo esa escuela
  expect(calls[0].p_school).toBeNull(); // al abrir, todas
});
