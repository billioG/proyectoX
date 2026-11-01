// Pantalla del estudiante en modo nodo: subir un proyecto y verlo en "Mis proyectos".
// Arranca school-node/server.js de verdad (helper de tests-unit) y bloquea todo lo que no sea el nodo,
// como una escuela sin internet. Se omite si better-sqlite3 no está compilado para este Node.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
let videoFile = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  node = await helper.startNode({
    students: [{ id: 's1', full_name: 'Ana Pérez', grade: 'Primero', section: 'A' }],
    groups: [{ id: 7, name: 'Equipo Sol', grade: 'Primero', section: 'A' }],
    members: [{ id: 1, group_id: 7, student_id: 's1', role: 'planner' }],
    courses: [{ id: 'c1', title: 'Robótica básica', grade: 'Primero', section: 'A', created_at: '2026-10-01', lessons: [{ id: 'l1', order_index: 1 }, { id: 'l2', order_index: 2 }, { id: 'l3', order_index: 3 }, { id: 'l4', order_index: 4 }] }],
    completions: [{ lesson_id: 'l1', student_id: 's1' }, { lesson_id: 'l2', student_id: 's1' }],
    // Fichas que bajó el pull: dos aprobadas de la clase de Ana (una con HTML en el título) y una de otra sección.
    xp: { s1: { xp_total: 420, gems: 12 } },
    cloudProjects: [
      { id: 'f1', user_id: 's9', author_name: 'Luis Ramos', title: 'Semáforo con Arduino', score: 85, bimestre: 2, created_at: '2026-10-30T10:00:00Z' },
      { id: 'f2', user_id: 's9', author_name: 'Luis Ramos', title: 'Brazo <img src=x onerror="window.__xss=1">', score: 70, created_at: '2026-10-29T10:00:00Z' },
      { id: 'f3', user_id: 's8', author_name: 'Otra Sección', title: 'Proyecto de otra sección', grade: 'Segundo', section: 'B', score: 90 },
    ],
  });
  await node.login('s1', '1234'); // crea el PIN
  videoFile = path.join(os.tmpdir(), `quetzal-prueba-${process.pid}.mp4`);
  fs.writeFileSync(videoFile, Buffer.alloc(3_000_000, 7));
});

test.afterAll(async () => {
  if (node) await node.stop();
  if (videoFile) fs.rmSync(videoFile, { force: true });
});

async function enterAsStudent(page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.goto(node.base);
  await page.waitForSelector('#node-login [data-i]');
  await page.click('#node-login [data-i="0"]');            // clase
  await page.waitForSelector('#node-change-class');
  await page.click('#node-login [data-i="0"]');            // Ana Pérez
  await page.waitForSelector('[data-k="1"]');
  for (const d of ['1', '2', '3', '4']) await page.click(`[data-k="${d}"]`);
  await page.waitForFunction(() => window.isNodeSession && !document.getElementById('node-login'));
}

test('el estudiante sube un proyecto en el nodo y lo ve en Mis proyectos', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  const posts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/projects')) posts.push(r.url()); });

  await enterAsStudent(page);

  // En modo nodo el menú del estudiante ya no oculta "Subir proyecto".
  const visible = await page.evaluate(() => {
    const el = document.getElementById('nav-est-upload');
    return !!el && el.style.display !== 'none';
  });
  expect(visible).toBe(true);

  await page.evaluate(() => window.nav('upload'));
  await expect(page.locator('#project-group option')).toHaveCount(2);
  expect(await page.locator('#project-group option').allInnerTexts()).toEqual(['Individual', 'Equipo Sol']);

  // Reglas del formulario: título corto = error, sin llamar a la API.
  await page.fill('#project-title', 'abcd');
  await page.fill('#project-description', 'Un robot que sigue una línea negra con dos sensores.');
  await page.setInputFiles('#project-video', videoFile);
  await page.click('#btn-upload-project');
  await expect(page.getByText(/El título debe tener entre 5 y 120/)).toBeVisible();
  expect(posts).toHaveLength(0);

  // Proyecto válido, de equipo.
  await page.fill('#project-title', 'Robot seguidor');
  await page.selectOption('#project-group', '7');
  await page.selectOption('#project-bimestre', '2');
  await page.click('#btn-upload-project');
  const item = page.locator('#node-my-projects [data-project-id]').first();
  await expect(item).toContainText('Robot seguidor', { timeout: 30000 });
  await expect(item).toContainText('Guardado en la escuela');

  const token = await page.evaluate(() => localStorage.getItem('PX_NODE_TOKEN'));
  const mine = (await node.api('/api/projects/mine', { token })).data.projects;
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ title: 'Robot seguidor', status: 'pending', file_size: 3_000_000 });

  // Cancelar desde Mis proyectos (dos toques).
  await item.locator('[data-cancel]').click();
  await item.locator('[data-cancel]').click();
  await expect(page.locator('#node-my-projects [data-project-id]')).toHaveCount(0);
  expect((await node.api('/api/projects/mine', { token })).data.projects).toEqual([]);

  expect(errors).toEqual([]);
});

test('el panel del docente muestra los proyectos por subir y los que fallaron', async ({ page }) => {
  test.skip(!node, skipReason);
  const token = await node.login('s1', '1234');
  const make = async (title) => {
    const buf = Buffer.alloc(1000, 5);
    const { id } = (await node.api('/api/projects', { method: 'POST', token, body: { title, description: 'Un robot que sigue una línea negra con dos sensores.', bimestre: 1, filename: 'v.mp4', size: buf.length } })).data;
    const put = await fetch(`${node.base}/api/projects/${id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: buf });
    expect(put.status).toBe(200);
    return id;
  };
  await make('Proyecto uno');
  await make('Proyecto dos');

  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.goto(node.base);
  await page.waitForSelector('#node-login [data-teacher]');
  await page.click('#node-login [data-teacher]');
  await page.fill('#t-code', '48213976');
  await page.click('#t-go');
  const tile = page.locator('#t-projects');
  await expect(tile).toContainText('2 por subir');
  await expect(tile).toContainText('0 subidos');
  await expect(tile).not.toContainText('con error');

  // Uno falló al sincronizar: el docente lo ve.
  await node.stopServer();
  const { openSqlite } = await import('../tests-unit/helpers/start-node.mjs');
  const db = openSqlite(path.join(node.dataDir, 'node.db'));
  db.prepare("UPDATE projects SET last_error = 'No hay internet' WHERE title = 'Proyecto uno'").run();
  db.close();
  await node.startServer();
  await page.reload();
  await page.waitForSelector('#node-login [data-teacher]');
  await page.click('#node-login [data-teacher]');
  await page.fill('#t-code', '48213976');
  await page.click('#t-go');
  await expect(page.locator('#t-projects')).toContainText('1 con error');
});

test('el perfil del estudiante en el nodo muestra su avance y sus proyectos, sin internet', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const token = await node.login('s1', '1234');
  const buf = Buffer.alloc(1000, 5);
  const { id } = (await node.api('/api/projects', { method: 'POST', token, body: { title: 'Mi robot del perfil', description: 'Un robot que sigue una línea negra con dos sensores.', bimestre: 1, filename: 'v.mp4', size: buf.length } })).data;
  expect((await fetch(`${node.base}/api/projects/${id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: buf })).status).toBe(200);

  await enterAsStudent(page);
  // Como el estudiante: toca su nombre en el encabezado (no llama a nav() directo).
  await page.locator(`[onclick="nav('profile')"]`).first().click();
  await expect(page.locator('#profile-content')).toContainText('Ana Pérez');
  await expect(page.locator('#profile-content')).toContainText('Primero A');
  const course = page.locator('[data-course-progress="c1"]');
  await expect(course).toContainText('Robótica básica');
  await expect(course).toContainText('2 de 4 lecciones');
  await expect(course.locator('[role=progressbar]')).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('#node-profile-projects')).toContainText('Mi robot del perfil');
  await expect(page.locator('#node-profile-projects')).toContainText('Guardado en la escuela');
  await page.click('#node-profile-upload');
  await expect(page.locator('#btn-upload-project')).toBeVisible();
  expect(errors).toEqual([]);
});

test('el Inicio del estudiante en el nodo muestra las fichas de su clase sin internet', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await enterAsStudent(page);

  // Inicio vuelve a estar en el menú del estudiante.
  expect(await page.evaluate(() => { const el = document.getElementById('nav-est-home'); return !!el && el.style.display !== 'none'; })).toBe(true);

  // Como el estudiante: toca el logo de arriba (no llama a nav() directo).
  await page.locator(`header [onclick="nav('feed')"]`).first().click();
  const cards = page.locator('#feed-container [data-feed-project]');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  const f1 = page.locator('[data-feed-project="f1"]');
  await expect(f1).toContainText('Semáforo con Arduino');
  await expect(f1).toContainText('Luis Ramos');
  await expect(f1).toContainText('Nota 85');
  await expect(page.locator('#feed-container')).not.toContainText('Proyecto de otra sección');

  // El título con HTML se ve como texto y no se ejecuta.
  await expect(page.locator('[data-feed-project="f2"]')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('#feed-container img').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('el latido de actividad no llama a la nube en el nodo (no hay sesión de Supabase)', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await enterAsStudent(page);
  const calls = await page.evaluate(async () => {
    const seen = [];
    window._supabase = { rpc: async (name) => { seen.push(name); return { error: { message: 'No autenticado' } }; } };
    const t = window.ActivityTracker;
    if (!t) return ['sin ActivityTracker'];
    t.isActive = true; t.lastInteraction = Date.now();
    await t.sendHeartbeat();
    return seen;
  });
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test('el cofre diario del nodo se abre con un clic, suma XP y no vuelve a salir hoy', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const token = await node.login('s1', '1234');
  const before = (await node.api('/api/xp', { token })).data;
  expect(before.chest_available).toBe(true);

  await enterAsStudent(page);
  await page.locator(`header [onclick="nav('feed')"]`).first().click();
  const modal = page.locator('#daily-chest-modal');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('[onclick^="window.openChest"]').click();
  await expect(modal).toContainText(/\+\d+ XP/);
  const won = Number((await modal.innerText()).match(/\+(\d+) XP/)[1]);
  expect([20, 50, 100]).toContain(won);

  const after = (await node.api('/api/xp', { token })).data;
  expect(after.xp).toBe(before.xp + won);
  expect(after.chest_available).toBe(false);

  // Otra visita el mismo día: ya no sale.
  // Recargar conserva la sesión del estudiante (no vuelve a pedir PIN).
  await page.reload();
  await page.waitForFunction(() => window.isNodeSession && !document.getElementById('node-login'));
  await page.locator(`header [onclick="nav('feed')"]`).first().click();
  await expect(page.locator('#feed-container [data-feed-project]').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(3500);
  await expect(page.locator('#daily-chest-modal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('el Perfil del nodo muestra nivel, rango, XP y gemas, y completar una lección avisa +10 XP', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const token = await node.login('s1', '1234');
  await enterAsStudent(page);

  // Completar una lección (la que sigue sin completar) avisa +10 XP.
  await page.evaluate(() => window.nav('lessons'));
  await page.waitForTimeout(1500);
  const base = (await node.api('/api/xp', { token })).data;
  await page.evaluate(() => { window._completionsCache = window._completionsCache || new Map(); return window.markLessonSeen('l3'); });
  await expect(page.getByText('+10 XP').first()).toBeVisible({ timeout: 10000 });
  const now = (await node.api('/api/xp', { token })).data;
  expect(now.xp).toBe(base.xp + 10);

  // El Perfil muestra el total (base 420 + cofre de hoy + 10 de la lección) con clic real.
  await page.locator(`[onclick="nav('profile')"]`).first().click();
  const card = page.locator('#node-profile-xp');
  await expect(card).toContainText(`${now.xp} XP`);
  await expect(card).toContainText(`Nivel ${now.level}`);
  await expect(card).toContainText(String(now.gems_total));
  await expect(card).toContainText(/Novato|Aprendiz/);
  expect(errors).toEqual([]);
});
