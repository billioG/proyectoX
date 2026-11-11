// Buzón sin internet con la app REAL: el estudiante manda una sugerencia y evalúa a su docente con el modal de siempre; si ya evaluó esta semana, la app ofrece mandarlo como sugerencia.
// Todo queda en el servidor de la escuela y en la bandeja para la nube. Arranca school-node/server.js de verdad y bloquea todo lo que no sea el nodo.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
let openSqlite = null;

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  openSqlite = helper.openSqlite;
  const { hashClassPassword } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante' }],
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

test('la estudiante manda una sugerencia y evalúa a su docente sin internet; la segunda evaluación de la semana se ofrece como sugerencia', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept()); // «¿Enviar como sugerencia?» cuando ya evaluó esta semana
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  const clean = () => page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); document.querySelectorAll('.driver-overlay, .driver-popover').forEach((e) => e.remove()); });
  const setValue = (selector, value) => page.evaluate(([sel, v]) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [selector, value]);
  const tap = async (selector) => { await clean(); await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 }); await page.locator(selector).evaluate((el) => el.click()); };
  await page.evaluate(() => window.nav('profile'));
  await page.waitForFunction(() => typeof window.openSuggestionModal === 'function');

  // 1) Sugerencia.
  await page.evaluate(() => window.openSuggestionModal());
  await setValue('#suggestion-message', 'Más tiempo de laboratorio, por favor');
  await tap('#btn-submit-suggestion');
  await expect(page.getByText('Sugerencia recibida')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#suggestion-modal')).toHaveCount(0);

  // 2) Evaluación del docente de la semana, con los cinco criterios.
  await page.evaluate(() => window.openSuggestionModal());
  await setValue('#suggestion-type', 'rating');
  await expect(page.locator('#rating-section')).not.toHaveClass(/hidden/);
  await page.evaluate(() => ['interest', 'practice', 'resources', 'respect', 'clarity'].forEach((k, i) => window.selectEvalOption(k, [4, 5, 4, 5, 4][i])));
  await setValue('#suggestion-message', 'Lo mejor fue la robótica');
  await tap('#btn-submit-suggestion');
  await expect(page.getByText('Evaluación enviada con éxito')).toBeVisible({ timeout: 15_000 });

  // 3) Otra evaluación esta semana: la app lo detecta (consulta teacher_ratings) y, al aceptar, lo manda como sugerencia.
  await page.evaluate(() => window.openSuggestionModal());
  await setValue('#suggestion-type', 'rating');
  await setValue('#suggestion-message', 'Quiero decir algo más');
  await tap('#btn-submit-suggestion');
  await expect(page.getByText('Enviado como sugerencia exitosamente')).toBeVisible({ timeout: 15_000 });

  // Lo que quedó: 2 sugerencias y 1 evaluación en el servidor, y las tres en la bandeja.
  const state = await page.evaluate(async () => {
    const sb = window._supabase;
    const s = (await sb.from('student_suggestions').select('message,type')).data;
    const r = (await sb.from('teacher_ratings').select('teacher_id,rating,q_practice,best_moment')).data;
    return { s: s.map((x) => x.message).sort(), r };
  });
  expect(state.s).toEqual(['(Redirigido de Evaluación) Quiero decir algo más', 'Más tiempo de laboratorio, por favor']);
  expect(state.r).toEqual([{ teacher_id: 't1', rating: 4.4, q_practice: 5, best_moment: 'Lo mejor fue la robótica' }]);
  const db = openSqlite(`${node.dataDir}/node.db`);
  try {
    const out = db.prepare("SELECT row FROM rest_outbox WHERE tbl = '_rpc' AND op = 'submit_feedback'").all().map((r) => JSON.parse(r.row).args.kind).sort();
    expect(out).toEqual(['rating', 'suggestion', 'suggestion']);
  } finally { db.close(); }
  expect(errors).toEqual([]);
});
