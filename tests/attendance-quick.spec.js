// Asistencia rápida sin cámara con la app REAL sobre el nodo: en «http» (contexto no seguro) la pantalla cambia sola a la lista rápida, marca y quita presentes
// con la cola de siempre (mark_attendance), y con cámara disponible sigue mostrando el flujo QR. Sin internet; arranca school-node/server.js de verdad.
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
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 0, gems: 0, role: 'estudiante' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

// Toque directo (el cofre diario y el tour pueden tapar la pantalla): quita lo que estorbe y hace clic por script.
const tap = async (page, locator) => {
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); document.querySelectorAll('.driver-overlay, .driver-popover').forEach((e) => e.remove()); });
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  await locator.evaluate((el) => el.click());
};

async function openAttendance(page, { secure }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.addInitScript((isSecure) => {
    try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ }
    // El servidor de la escuela es «http»: el navegador dice que el contexto no es seguro.
    if (!isSecure) Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  }, secure);
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'ana1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  await page.waitForFunction(() => typeof window.nav === 'function');
  // La pantalla de asistencia es del docente: se dibuja con un resumen de ejemplo y la cola se captura (así se ve exactamente qué se guardaría).
  await page.evaluate(async () => {
    document.getElementById('daily-chest-modal')?.remove();
    await import('/js/attendance.js');
    window.__queued = [];
    window._syncManager = { enqueue: async (action, data) => { window.__queued.push({ action, data }); } };
    window.showToast = () => {};
    window.currentUser = { id: 't1' };
    const holder = document.createElement('div');
    holder.id = 'attendance-main-interface';
    document.body.appendChild(holder);
    window.renderAttendanceUI(holder, { assignments: [{ school_code: 'ESC1', grade: 'Primero', section: 'A', schools: { name: 'Escuela Piloto' } }], todayWaivers: [], waiverCount: 0 });
    const sel = document.getElementById('attendance-assignment');
    sel.value = '0';
    const list = document.getElementById('attendance-students-list');
    document.getElementById('qr-scanner-section').classList.remove('hidden');
    window.renderStudentsAttendanceList(list, [
      { id: 's1', full_name: 'Ana López', username: 'ana1' }, { id: 's2', full_name: 'Beto Díaz', username: 'beto2' }, { id: 's3', full_name: 'Carla Ruiz', username: 'carla3' },
    ], new Set(['s3']));
  });
  return errors;
}

test('nodo en http: la pantalla entra sola a la lista rápida, marca, quita y marca a todos con la cola de asistencia', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const errors = await openAttendance(page, { secure: false });

  await expect(page.locator('#attendance-camera-col')).toContainText('En este servidor no se puede usar la cámara. Usa la lista rápida. Cuando el nodo tenga HTTPS podrás escanear QR.');
  await expect(page.locator('#btn-start-scanner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Configurar este dispositivo para usar la cámara/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ayuda/ })).toBeVisible();
  await expect(page.locator('#attendance-present-count')).toHaveText('1 PRESENTES DE 3');

  // Un toque marca presente.
  await tap(page, page.locator('[data-quick-student="s1"]'));
  await expect(page.locator('#attendance-present-count')).toHaveText('2 PRESENTES DE 3');
  await expect(page.locator('[data-quick-student="s1"]')).toHaveAttribute('aria-pressed', 'true');
  // Otro toque lo quita (se guarda «absent»: la nube no borra asistencia).
  await tap(page, page.locator('[data-quick-student="s1"]'));
  await expect(page.locator('#attendance-present-count')).toHaveText('1 PRESENTES DE 3');
  // Marcar todos.
  await tap(page, page.getByRole('button', { name: /Marcar todos presentes/ }));
  await expect(page.locator('#attendance-present-count')).toHaveText('3 PRESENTES DE 3');

  const queued = await page.evaluate(() => window.__queued.map((q) => [q.action, q.data.student_id, q.data.status, q.data.school_code, q.data.teacher_id]));
  expect(queued).toEqual([
    ['mark_attendance', 's1', 'present', 'ESC1', 't1'],
    ['mark_attendance', 's1', 'absent', 'ESC1', 't1'],
    ['mark_attendance', 's1', 'present', 'ESC1', 't1'],
    ['mark_attendance', 's2', 'present', 'ESC1', 't1'],
  ]);

  // El asistente abre sin bloquear y, sin certificado en el servidor, lo dice sin dramatizar.
  await tap(page, page.getByRole('button', { name: /Configurar este dispositivo para usar la cámara/ }));
  const modal = page.locator('#camera-setup-modal');
  await expect(modal).toContainText('debe confiar en el certificado del servidor de la escuela');
  await expect(modal).toContainText('todavía no tiene certificado para descargar');
  await expect(modal).toContainText('Android'); await expect(modal).toContainText('iPhone / iPad'); await expect(modal).toContainText('Windows');
  // El nodo de prueba no tiene HTTPS: se simula lo que hace el navegador real (el intento por https falla) para que el resultado no dependa de la red local.
  await page.evaluate(() => { const real = window.fetch.bind(window); window.fetch = (u, o) => (String(u).startsWith('https:') ? Promise.reject(new TypeError('Failed to fetch')) : real(u, o)); });
  await tap(page, modal.getByRole('button', { name: /Ya lo instalé, probar cámara/ }));
  await expect(modal).toContainText('no ofrece HTTPS', { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('node_camera_ready'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('con cámara disponible (contexto seguro) se mantiene el flujo QR de siempre', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const errors = await openAttendance(page, { secure: true });
  await expect(page.locator('#btn-start-scanner')).toBeVisible();
  await expect(page.locator('#qr-video')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Marcar todos presentes/ })).toHaveCount(0);
  await expect(page.locator('[data-quick-student]')).toHaveCount(0);
  // Si al abrirla el navegador dice que no hay cámara, vuelve a la lista rápida sin avisos.
  await page.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' })) }, configurable: true }); });
  await tap(page, page.locator('#btn-start-scanner'));
  await expect(page.locator('#attendance-camera-col')).toContainText('Usa la lista rápida');
  await expect(page.locator('[data-quick-student]')).toHaveCount(3);
  expect(errors, errors.join('\n')).toEqual([]);
});
