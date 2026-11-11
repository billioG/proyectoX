// Gestión de Equipos con la pantalla REAL del docente, sin internet: abrir la pantalla, crear un equipo eligiendo integrantes, armar todos con la varita, renombrar,
// rotar roles, intercambiar roles, quitar y disolver. Arranca school-node/server.js de verdad y bloquea todo lo que no sea el nodo.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword, emailHash } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  const students = ['Ana', 'Beto', 'Carla', 'Dani', 'Elena', 'Fer', 'Gina'].map((n, i) => ({
    id: `s${i + 1}`, username: `${n.toLowerCase()}1`, full_name: `${n} Pérez`, school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante',
  }));
  node = await helper.startNode({
    rest: {
      teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        students,
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

test('el docente maneja los equipos de su clase con la pantalla de siempre, sin internet', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const failedGroups = [];
  page.on('response', r => { if (r.url().includes('/rest/v1/') && r.status() >= 400 && /group/.test(r.url())) failedGroups.push(`${r.status()} ${decodeURIComponent(r.url())}`); });
  page.on('dialog', d => d.accept()); // confirmar «disolver equipo»
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'marta@escuela.com');
  await page.fill('#login-password', '654321');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 't1');
  const clean = () => page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); document.querySelectorAll('.driver-overlay, .driver-popover').forEach((e) => e.remove()); });
  const tap = async (locator) => { await clean(); await locator.waitFor({ state: 'visible', timeout: 15_000 }); await locator.evaluate((el) => el.click()); };

  // 1) La pantalla abre (antes se quedaba en «Organizando Estrategias de Equipo...»).
  await page.evaluate(() => window.nav('groups'));
  const box = page.locator('#groups-container');
  await expect(box).toContainText('Centro de Comando de Equipos');
  await expect(box).not.toContainText('Organizando Estrategias');

  // 2) Crear un equipo eligiendo clase e integrantes.
  await tap(box.getByRole('button', { name: /nuevo equipo/i }));
  await page.fill('#group-name', 'Cometas');
  await page.selectOption('#group-school', 'ESC1');
  await expect(page.locator('#group-grade option[value="Primero"]')).toHaveCount(1);
  await page.selectOption('#group-grade', 'Primero');
  await expect(page.locator('#group-section option[value="A"]')).toHaveCount(1);
  await page.selectOption('#group-section', 'A');
  await expect(page.locator('input[name="members"]')).toHaveCount(7);
  await clean();
  await page.evaluate(() => { const c = document.querySelectorAll('input[name="members"]'); c[0].click(); c[1].click(); });
  await expect(page.locator('input[name="members"]:checked')).toHaveCount(2);
  await tap(page.locator('#btn-create-group'));
  await expect(page.getByText('Equipo desplegado')).toBeVisible();
  await expect(box).toContainText('Cometas');
  await expect(box).toContainText('Ana Pérez');
  await expect(box).toContainText('Beto Pérez');

  // 3) La varita arma el resto con los alumnos libres (los dos ya ocupados no cuentan).
  await tap(box.getByRole('button', { name: /nuevo equipo/i }));
  await page.selectOption('#group-school', 'ESC1');
  await expect(page.locator('#group-grade option[value="Primero"]')).toHaveCount(1);
  await page.selectOption('#group-grade', 'Primero');
  await expect(page.locator('#group-section option[value="A"]')).toHaveCount(1);
  await page.selectOption('#group-section', 'A');
  await expect(page.locator('input[name="members"]')).toHaveCount(5);
  await page.evaluate(() => window.magicCreateAllGroups());
  await expect.poll(async () => page.evaluate(async () => (await window._supabase.from('groups').select('id')).data.length), { timeout: 15_000 }).toBeGreaterThan(1);
  await page.evaluate(() => document.querySelector('.fixed.inset-0.z-\\[100\\]')?.remove());
  await page.evaluate(() => window.loadGroups());

  // 4) Renombrar, rotar roles e intercambiar roles.
  const g = await page.evaluate(async () => (await window._supabase.from('groups').select('id, name, group_members(id, role)').eq('name', 'Cometas').single()).data);
  await page.evaluate((id) => window.updateGroup(id, 'Cometas Rojos'), g.id);
  await expect.poll(async () => page.evaluate(async (id) => (await window._supabase.from('groups').select('name').eq('id', id).single()).data.name, g.id)).toBe('Cometas Rojos');
  const before = await page.evaluate(async (id) => (await window._supabase.from('group_members').select('student_id, role').eq('group_id', id).order('student_id')).data, g.id);
  await page.evaluate((id) => window.rotateRoles(id), g.id);
  const after = await page.evaluate(async (id) => (await window._supabase.from('group_members').select('student_id, role').eq('group_id', id).order('student_id')).data, g.id);
  expect(after.map((m) => m.role)).not.toEqual(before.map((m) => m.role));
  expect(after.map((m) => m.role).sort()).toEqual(['maker', 'speaker']);
  await page.evaluate((id) => window.swapRolesInTeam(id, 'maker', 'speaker'), g.id);
  const swapped = await page.evaluate(async (id) => (await window._supabase.from('group_members').select('student_id, role').eq('group_id', id).order('student_id')).data, g.id);
  expect(swapped.map((m) => m.role)).toEqual(after.map((m) => (m.role === 'maker' ? 'speaker' : 'maker')));

  // 5) Todo queda para la nube y el equipo disuelto libera a sus integrantes.
  const pending = await (await fetch(`${node.base}/api/node/status`)).json();
  expect(pending.pending_changes).toBeGreaterThan(0);
  await page.evaluate((id) => window.deleteGroup(id, 'Cometas Rojos'), g.id);
  await expect.poll(async () => page.evaluate(async (id) => (await window._supabase.from('groups').select('id').eq('id', id)).data.length, g.id)).toBe(0);
  expect(await page.evaluate(async (id) => (await window._supabase.from('group_members').select('id').eq('group_id', id)).data.length, g.id)).toBe(0);

  expect(failedGroups).toEqual([]);
  expect(errors).toEqual([]);
});
