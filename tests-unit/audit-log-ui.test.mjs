// Pantalla «Bitácora de seguridad» (js/audit-log.js): textos en español, nada sin escapar, y que esté cableada solo para el administrador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTIONS, actionLabel, detailsText, rowHtml, whenGt } from '../js/audit-log.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('cada acción que registra la base o las funciones tiene su texto en español', () => {
  const sql = read('migrations/security-audit-log.sql');
  const fromSql = [...sql.matchAll(/log_security_event\(\s*(?:auth\.uid\(\)|p_actor)\s*,\s*'([a-z_]+)'/g)].map((m) => m[1]);
  const fromEdge = ['admin-create-teacher', 'admin-delete-students', 'admin-force-delete-school', 'admin-set-class-password', 'admin-bulk-import-students', 'staff-student-passwords']
    .flatMap((f) => [...read(`supabase/functions/${f}/index.ts`).matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1]));
  const all = [...new Set([...fromSql, ...fromEdge])];
  assert.ok(all.length >= 12, `acciones encontradas: ${all.join(', ')}`);
  for (const a of all) assert.ok(ACTIONS[a], `falta el texto de «${a}» en js/audit-log.js`);
  for (const [k, [label, icon, color]] of Object.entries(ACTIONS)) { assert.ok(label && icon.startsWith('fa-') && color, k); }
  assert.equal(actionLabel('algo_nuevo'), 'algo_nuevo', 'una acción desconocida se muestra con su nombre técnico');
  assert.equal(actionLabel(undefined), 'Acción');
});

test('detailsText: una línea en español con lo importante de cada acción', () => {
  assert.equal(detailsText('students_deleted', { count: 3, schools: ['ESC1', 'ESC2'] }), '3 alumnos · de ESC1, ESC2');
  assert.equal(detailsText('students_deleted', { count: 1, schools: ['ESC1'], errors: 2 }), '1 alumno · de ESC1 · 2 errores');
  assert.equal(detailsText('students_imported', { created: 12, errors: 1, classes_with_new_password: 2 }), '12 creados · 1 con error · 2 clases con contraseña nueva');
  assert.equal(detailsText('teacher_role_changed', { from: 'docente', to: 'coordinador' }), 'de «docente» a «coordinador»');
  assert.equal(detailsText('teacher_created', { role: 'docente' }), 'rol: docente');
  assert.equal(detailsText('class_password_changed', { grade: 'Primero', section: 'A', protegida: true }), 'Primero A · con contraseña');
  assert.equal(detailsText('class_password_changed', { whole_school: true, classes: 4, protegida: false }), '4 clases · sin contraseña');
  assert.equal(detailsText('school_deleted', { name: 'Escuela Piloto' }), 'Escuela Piloto');
  assert.equal(detailsText('student_passwords_revealed', { requested: 5, delivered: 4 }), '5 pedidas · 4 entregadas');
  assert.equal(detailsText('student_passwords_backfill', { encrypted: 15, pending: 0 }), '15 cifradas · 0 pendientes');
  assert.equal(detailsText('user_password_reset', {}), '', 'sin detalles no inventa nada');
  assert.equal(detailsText('students_deleted', null), '');
});

test('rowHtml: escapa todo (nada de HTML ni scripts de la base llega al DOM) y cubre las filas raras', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = rowHtml({ id: 7, created_at: '2026-11-10T15:00:00Z', actor_id: 'u1', actor_name: evil, actor_role: 'admin', action: 'school_deleted', target_type: 'school', target_id: evil, school_code: evil, details: { name: evil }, source: 'x' });
  assert.ok(!html.includes('<img'), 'sin etiquetas inyectadas');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html, /Administrador/);
  assert.match(html, /Establecimiento eliminado/);
  const noActor = rowHtml({ id: 8, created_at: '2026-11-10T15:00:00Z', actor_id: null, actor_name: null, actor_role: null, action: 'students_deleted', details: { count: 2 } });
  assert.match(noActor, /Sin sesión \(proceso del servidor\)/);
  assert.match(rowHtml({ id: 9, created_at: 'no-es-fecha', action: 'x_y', details: 'no-es-objeto' }), /x_y/, 'fecha o detalles inválidos no rompen la fila');
});

test('whenGt: hora de Guatemala (UTC-6)', () => {
  assert.match(whenGt('2026-11-10T03:30:00Z'), /09/, 'el 9 de noviembre a las 21:30 de Guatemala');
  assert.equal(whenGt('basura'), '');
});

test('la pantalla está cableada solo para el administrador: menú, sección, carga y vista restringida', () => {
  const main = read('js/main.js'), html = read('index.html');
  assert.match(main, /'audit-log': \['js\/audit-log\.js'\]/);
  assert.match(main, /case 'audit-log':\s+if \(userRole === 'admin'\) callViewLoader\(view, window\.loadAuditLog\)/);
  assert.match(main, /ADMIN_ONLY_VIEWS = new Set\(\[[^\]]*'audit-log'/);
  assert.match(html, /onclick="nav\('audit-log'\)"/);
  assert.match(html, /<section id="view-audit-log"/);
  assert.match(html, /id="audit-log-container"/);
  assert.equal((html.match(/onclick="nav\('audit-log'\)"/g) || []).length, 1, 'un solo acceso (el del menú del administrador)');
  const src = read('js/audit-log.js');
  assert.match(src, /rpc\('get_security_audit_log'/);
  assert.doesNotMatch(src, /\.from\('security_audit_log'\)/, 'siempre por la función, nunca la tabla directa');
});
