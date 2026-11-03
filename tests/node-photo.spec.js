// Cambiar la foto de perfil SIN internet con la app REAL: el estudiante usa el modal de siempre (elige la imagen, «Subir»), la foto se guarda en el servidor de la escuela, se ve al instante,
// gana el premio de la primera foto y queda en la bandeja para la nube. Arranca school-node/server.js de verdad y bloquea todo lo que no sea el nodo.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

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
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, role: 'estudiante', profile_photo_url: null }],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

test('la estudiante cambia su foto sin internet con el modal de la app y la ve al instante, con su premio', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });

  await page.evaluate(() => window.nav('profile'));
  await page.waitForFunction(() => typeof window.openUploadPhotoModal === 'function');
  await page.evaluate(() => window.openUploadPhotoModal());
  await page.setInputFiles('#photo-input', { name: 'mi-foto.png', mimeType: 'image/png', buffer: PNG });
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); document.getElementById('btn-upload-photo').click(); });

  await expect(page.getByText('Ganaste 100 XP y 25 Gemas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Foto de perfil actualizada')).toBeVisible();
  await expect(page.locator('#upload-photo-modal')).toHaveCount(0);

  // La foto se sirve desde el servidor de la escuela y la ve la propia app (cabecera y datos).
  const state = await page.evaluate(async () => {
    const { data } = await window._supabase.from('students').select('xp,gems,profile_photo_url').eq('id', 's1').single();
    const img = await fetch(data.profile_photo_url);
    return { ...data, status: img.status, type: img.headers.get('content-type') };
  });
  expect(state.profile_photo_url).toMatch(/^\/storage\/v1\/object\/public\/profile-photos\/s1_\d+\.png$/);
  expect([state.xp, state.gems, state.status, state.type]).toEqual([110, 30, 200, 'image/png']);

  // Queda para la nube: el cambio espera la imagen en la bandeja y la imagen cuenta como archivo por subir.
  const status = await (await fetch(`${node.base}/api/node/status`)).json();
  expect(status.pending.uploads).toBeGreaterThanOrEqual(1);
  expect(status.pending_changes).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
