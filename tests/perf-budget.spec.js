// Presupuesto de consultas de la app REAL: cuenta cuántas peticiones al servidor hace un estudiante al iniciar sesión y al abrir cada pantalla.
// Corre sobre school-node/server.js de verdad (la capa compatible con Supabase), con el mismo código de la app, así que cada petición a /rest/v1 o
// /functions/v1 es una consulta que la nube también recibiría. Sirve para (1) medir y (2) que una pantalla no vuelva a pedir de más sin que nadie lo note.
// OJO: en el nodo no corren el latido de tiempo activo ni la presencia en tiempo real (solo existen con la nube): esos se suman a mano en docs/PERFORMANCE.md.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  const students = Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, username: `alumno${i + 1}`, full_name: `Alumno ${i + 1}`, school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10 * i, gems: 5, role: 'estudiante' }));
  node = await helper.startNode({
    rest: {
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        students,
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      },
    },
  });
});
test.afterAll(async () => { if (node) await node.stop(); });

// Peticiones a la «nube» (el nodo hace de nube): /rest/v1, /functions/v1, /auth/v1.
const isApi = (url) => /\/(rest|functions|auth)\/v1\//.test(url);

test('presupuesto de peticiones del estudiante: inicio de sesión y pantallas principales', async ({ page }) => {
  test.skip(!node, skipReason);
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let current = 'inicio de sesión';
  const counts = new Map();
  const detail = new Map();
  const full_ = {};
  page.on('request', (r) => {
    if (!isApi(r.url())) return;
    counts.set(current, (counts.get(current) || 0) + 1);
    const key = `${r.method()} ${new URL(r.url()).pathname.replace(/^.*\/v1\//, '')}`;
    const full = `${r.method()} ${decodeURIComponent(new URL(r.url()).pathname.replace(/^.*\/v1\//, '') + new URL(r.url()).search)}`.slice(0, 160);
    const f = full_[current] || (full_[current] = new Map());
    f.set(full, (f.get(full) || 0) + 1);
    const d = detail.get(current) || new Map();
    d.set(key, (d.get(key) || 0) + 1);
    detail.set(current, d);
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('onboarding_seen_s1', 'true'); } catch { /* sin almacenamiento */ } });

  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'alumno1');
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser?.id === 's1' && window.userData?.full_name);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000); // el temporizador de 3 s de la campana y lo demás que arranca solo
  await page.evaluate(() => { document.getElementById('daily-chest-modal')?.remove(); });

  const screens = [['ranking', 'Ranking'], ['profile', 'Perfil'], ['lessons', 'Cursos'], ['projects', 'Inicio / proyectos'], ['ranking', 'Ranking (2.ª vez)']];
  for (const [view, label] of screens) {
    current = label;
    await page.evaluate((v) => window.nav(v), view);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  }

  const rows = [...counts.entries()].map(([k, v]) => `${k.padEnd(24)} ${String(v).padStart(3)} peticiones`);
  console.log('\nPRESUPUESTO DE PETICIONES (estudiante, app real sobre el nodo)\n' + rows.join('\n'));
  for (const [screen, f] of Object.entries(full_)) {
    const dup = [...f.entries()].filter(([, c]) => c > 1);
    if (dup.length) console.log(`  REPETIDAS en ${screen}:\n    ` + dup.map(([k, c]) => `${k} ×${c}`).join('\n    '));
  }
  for (const [screen, d] of detail) console.log(`  ${screen}: ${[...d.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' | ')}`);

  const n = (k) => counts.get(k) || 0;
  // Techos con margen sobre lo medido (ver docs/PERFORMANCE.md): si alguien vuelve a hacer que una pantalla pida el doble, esto falla.
  expect(n('inicio de sesión'), 'inicio de sesión').toBeLessThanOrEqual(BUDGET.login);
  for (const [, label] of screens) expect(n(label), label).toBeLessThanOrEqual(BUDGET.screen);
  // Segunda visita al Ranking: con la caché vigente (45 s) no debe volver a pedir el top.
  expect(n('Ranking (2.ª vez)'), 'el Ranking vigente no se vuelve a pedir').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

// Medido (computadora): inicio de sesión 27, Perfil 13, Cursos 2, Ranking 1. Antes de las correcciones de v1.0.227: inicio 47, Perfil 21. Los techos dejan margen.
const BUDGET = { login: 35, screen: 20 };
