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
