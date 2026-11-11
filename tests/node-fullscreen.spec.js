// Pantalla completa para los recursos con la app REAL: el visor de un curso trae el botón «Pantalla completa» sobre el recurso (imagen, PDF, video...),
// entra con la API del navegador o, si no existe, con un modo que cubre la ventana y un botón «Salir»; Esc también sale.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante' }],
        courses: [{ id: 'c1', title: 'Robótica', school_code: 'ESC1', grade: 'Primero', section: 'A', created_at: '2026-10-01T00:00:00Z' }],
        lessons: [
          { id: 'l1', course_id: 'c1', title: 'Foto del robot', content_type: 'image', content_url: PIXEL, audience: 'estudiante', order_index: 1, school_code: 'ESC1', grade: 'Primero', section: 'A' },
          { id: 'l2', course_id: 'c1', title: 'Guía en PDF', content_type: 'pdf', content_url: '/content/lessons/l2/guia.pdf', audience: 'estudiante', order_index: 2, school_code: 'ESC1', grade: 'Primero', section: 'A' },
        ],
        lesson_completions: [{ id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 100, status: 'completed' }],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

test('el visor de recursos trae «Pantalla completa»: entra, sale con el botón y con Esc, y también funciona sin la API del navegador', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.nav);
  const clean = () => page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); document.querySelectorAll('.driver-overlay, .driver-popover').forEach((e) => e.remove()); });
  await page.evaluate(() => window.nav('lessons'));
  await page.waitForFunction(() => typeof window.openCoursePlayer === 'function' && document.querySelector('#view-lessons')?.textContent.includes('Robótica'));
  await page.evaluate(() => window.openCoursePlayer('c1'));
  await page.waitForFunction(() => window._activeCourse?.items?.length === 2);
  await expect(page.locator('#course-player-viewer')).toBeVisible();

  // Primer recurso: imagen.
  await page.evaluate(() => window.selectCourseResource(0));
  const img = page.locator('#course-player-viewer img.px-fs-target');
  await expect(img).toHaveCount(1);
  const btn = page.locator('#course-player-viewer .px-fs-btn');
  await expect(btn).toHaveText(/pantalla completa/i);

  // Sin la API del navegador (iPhone/iPad): el modo que cubre toda la ventana, con su botón «Salir».
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true }));
  await clean();
  await btn.evaluate((el) => el.click());
  await expect(page.locator('img.px-fs-fake')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => { const r = document.querySelector('img.px-fs-fake').getBoundingClientRect(); return [r.x, r.y, Math.round(r.width) >= document.documentElement.clientWidth, Math.round(r.height) >= document.documentElement.clientHeight]; })).toEqual([0, 0, true, true]); // cubre toda la parte visible de la ventana
  await page.locator('#px-fs-exit').evaluate((el) => el.click());
  await expect(page.locator('.px-fs-fake')).toHaveCount(0);
  await expect(page.locator('#px-fs-exit')).toHaveCount(0);

  // Esc también sale, y NO cierra de paso el reproductor del curso.
  await btn.evaluate((el) => el.click());
  await expect(page.locator('img.px-fs-fake')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.px-fs-fake')).toHaveCount(0);
  await expect(page.locator('#course-player-viewer')).toBeVisible();

  // Con la API: si el navegador la niega (sin gesto del usuario, o no es compatible), cae al modo que cubre la ventana; el mismo botón alterna.
  await page.evaluate(() => { delete document.fullscreenEnabled; });
  await page.evaluate(() => { const el = document.querySelector('#course-player-viewer img.px-fs-target'); el.requestFullscreen = () => Promise.reject(new Error('negado')); window.togglePxFullscreen(el); });
  await expect(page.locator('img.px-fs-fake')).toHaveCount(1);
  await page.evaluate(() => window.togglePxFullscreen(document.querySelector('#course-player-viewer img.px-fs-target')));
  await expect(page.locator('.px-fs-fake')).toHaveCount(0);
  await page.evaluate(() => { const el = document.querySelector('#course-player-viewer img.px-fs-target'); el.requestFullscreen = () => Promise.resolve(); window.togglePxFullscreen(el); });
  await expect(page.locator('.px-fs-fake')).toHaveCount(0); // la API aceptó: no hace falta el modo de reserva

  // Segundo recurso: el PDF (iframe) también lo trae, y cambiar de recurso no deja botones repetidos.
  await page.evaluate(() => window.selectCourseResource(1));
  await expect(page.locator('#course-player-viewer iframe.px-fs-target')).toHaveCount(1);
  await expect(page.locator('#course-player-viewer .px-fs-btn')).toHaveCount(1);
  expect(errors).toEqual([]);
});
