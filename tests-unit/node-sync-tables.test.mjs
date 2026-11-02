// Bloque genérico `tables` de la bajada de node-sync (supabase/functions/node-sync/tables.ts): qué tablas y columnas
// salen hacia el nodo, el alcance por escuela y los verificadores de contraseña de clase.
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

let mod = null;
let SCHEMA = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/tables.ts');
  SCHEMA = (await import('../school-node/rest/schema.js')).SCHEMA;
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /tables\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e; // en Node 22 falta el archivo: fallo real
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const SENSITIVE = ['pin_hash', 'pin_salt', 'pin_updated_at', 'password_generated', 'email', 'cui', 'birth_date', 'gender', 'codigo_personal',
  'qr_code', 'qr_data', 'created_by_admin', 'upload_ip', 'client_metadata', 'phone', 'base_salary', 'password'];

test('las columnas que bajan son exactamente las que el nodo sirve; nada sensible', { skip }, () => {
  for (const [table, cols] of Object.entries(mod.TABLE_COLUMNS)) {
    assert.ok(SCHEMA[table], `${table} no existe en el esquema del nodo`);
    for (const c of cols) {
      assert.ok(SCHEMA[table].columns.includes(c), `${table}.${c} no la sirve el nodo: bajarla es regalar datos`);
      assert.ok(!SENSITIVE.includes(c), `${table}.${c} es sensible`);
    }
  }
  for (const table of Object.keys(SCHEMA).filter((t) => !SCHEMA[t].empty)) {
    assert.ok(mod.TABLE_COLUMNS[table], `${table} del esquema del nodo no se baja de la nube`);
  }
});

test('el verificador de clase coincide con el que calcula el nodo y nunca lleva la contraseña', { skip }, async () => {
  const rows = [
    { school_code: 'ESC1', grade: 'Primero', section: 'A', password: 'clase123', requires_password: true },
    { school_code: 'ESC1', grade: 'Primero', section: 'B', password: 'otra', requires_password: false },
    { school_code: 'ESC1', grade: 'Segundo', section: 'A', password: null, requires_password: true },
  ];
  const out = await mod.buildClassVerifiers(rows);
  assert.equal(out.length, 2, 'una clase que exige contraseña pero no tiene ninguna no se puede verificar: se omite');
  const a = out.find((v) => v.class_key === 'ESC1|Primero|A');
  const expected = crypto.pbkdf2Sync('clase123', Buffer.from(a.salt, 'hex'), 150000, 32, 'sha256').toString('hex');
  assert.deepEqual([a.requires_password, a.hash], [true, expected]);
  const b = out.find((v) => v.class_key === 'ESC1|Primero|B');
  assert.deepEqual([b.requires_password, b.salt, b.hash], [false, '', ''], 'sin contraseña: no se manda ni su hash');
  assert.doesNotMatch(JSON.stringify(out), /clase123|"otra"/);
});

// Base de datos de mentira con la interfaz mínima del cliente de Supabase (eq, in, order, range, limit).
function fakeAdmin(data) {
  const calls = [];
  const from = (table) => {
    let rows = (data[table] || []).slice();
    let cols = null;
    const q = {
      select: (c) => { cols = c === '*' ? null : c.split(',').map((x) => x.trim()); return q; },
      eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q; },
      in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      gte: (c, v) => { rows = rows.filter((r) => r[c] >= v); return q; },
      or: () => q,
      order: () => q,
      limit: (n) => { rows = rows.slice(0, n); return q; },
      range: (a, b) => { rows = rows.slice(a, b + 1); return q; },
      then: (ok, bad) => { calls.push([table, cols]); return Promise.resolve({ data: rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : r)), error: null }).then(ok, bad); },
    };
    return q;
  };
  return { from, calls };
}
const chunk = (arr, n = 100) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const fetchAll = async (build) => { const { data, error } = await build(0, 999); if (error) throw error; return data || []; };

test('baja solo lo de la escuela del nodo, con las columnas permitidas y sin datos de otras escuelas', { skip }, async () => {
  const admin = fakeAdmin({
    schools: [{ id: 1, code: 'ESC1', name: 'Uno', phone: '555' }, { id: 2, code: 'ESC2', name: 'Dos' }],
    students: [
      { id: 's1', school_code: 'ESC1', username: 'ana1', full_name: 'Ana', email: 'ana@x.com', pin_hash: 'SECRETO', password_generated: 'SECRETO', xp: 5 },
      { id: 's9', school_code: 'ESC2', username: 'zoe9', full_name: 'Zoe', xp: 7 },
    ],
    teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1' }, { id: 2, teacher_id: 't2', school_code: 'ESC2' }],
    teachers: [{ id: 't1', full_name: 'Marta', email: 'marta@escuela.com', role: 'docente', base_salary: 9999 }, { id: 't2', full_name: 'Docente Ajeno', email: 'ajeno@otra.com', role: 'docente' }],
    groups: [{ id: 7, school_code: 'ESC1', name: 'Sol' }, { id: 8, school_code: 'ESC2', name: 'Luna' }],
    group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 8, student_id: 's9' }],
    projects: [{ id: 1, user_id: 's1', title: 'Robot', upload_ip: '10.0.0.1', client_metadata: { a: 1 } }, { id: 2, user_id: 's9', title: 'Ajeno' }],
    evaluations: [{ id: 1, project_id: 1, total_score: 80 }, { id: 2, project_id: 2, total_score: 99 }],
    project_likes: [{ id: 1, project_id: 1, user_id: 's1' }, { id: 2, project_id: 2, user_id: 's9' }],
    courses: [{ id: 'c1', school_code: 'ESC1' }, { id: 'c2', school_code: 'ESC2' }],
    lessons: [{ id: 'l1', course_id: 'c1', title: 'Intro' }, { id: 'l2', course_id: 'c2', title: 'Ajena' }],
    lesson_completions: [{ id: 'lc1', lesson_id: 'l1', student_id: 's1' }, { id: 'lc2', lesson_id: 'l2', student_id: 's9' }],
    announcements: [
      { id: 'a1', sender_id: 'admin', sender_role: 'admin', audience: 'all', title: 'Para todos', message: 'Hola', created_at: new Date().toISOString(), target_groups: [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }, { school_code: 'ESC2', grade: 'GRUPO-DE-OTRA-ESCUELA', section: 'Z' }] },
      { id: 'a2', sender_id: 't1', sender_role: 'docente', audience: 'students', school_code: 'ESC1', grade: 'Primero', section: 'A', title: 'De mi clase', message: 'x', created_at: new Date().toISOString() },
      { id: 'a3', sender_id: 't2', sender_role: 'docente', audience: 'students', school_code: 'ESC2', grade: 'Primero', section: 'A', title: 'AVISO-AJENO', message: 'x', created_at: new Date().toISOString() },
      { id: 'a4', sender_id: 'admin', sender_role: 'admin', audience: 'all', title: 'VIEJO', message: 'x', created_at: '2020-01-01T00:00:00Z' },
    ],
    announcement_reads: [{ id: 1, announcement_id: 'a1', user_id: 's1' }, { id: 2, announcement_id: 'a1', user_id: 's9' }, { id: 3, announcement_id: 'a3', user_id: 's9' }],
    badges: [{ id: 1, code: 'b1', name: 'Insignia' }],
    student_badges: [{ id: 1, student_id: 's1', badge_id: 1 }, { id: 2, student_id: 's9', badge_id: 1 }],
  });
  const t = await mod.pullTables(admin, { school_code: 'ESC1' }, { studentIds: new Set(['s1']), fetchAll, chunk });
  const ids = (name, key = 'id') => t[name].map((r) => r[key]);
  assert.deepEqual(ids('schools'), [1]);
  assert.deepEqual(ids('students'), ['s1']);
  assert.deepEqual(ids('teacher_assignments'), [1]);
  assert.deepEqual(ids('teachers'), ['t1'], 'solo los docentes asignados a esta escuela');
  assert.deepEqual(ids('announcements').sort(), ['a1', 'a2'], 'solo los que alcanzan a la escuela y de los últimos 90 días');
  assert.deepEqual(ids('announcement_reads'), [1], 'solo lecturas de gente de la escuela');
  assert.deepEqual(ids('groups'), [7]);
  assert.deepEqual(ids('group_members'), [1]);
  assert.deepEqual(ids('projects'), [1]);
  assert.deepEqual(ids('evaluations'), [1]);
  assert.deepEqual(ids('project_likes'), [1]);
  assert.deepEqual(ids('courses'), ['c1']);
  assert.deepEqual(ids('lessons'), ['l1']);
  assert.deepEqual(ids('lesson_completions'), ['lc1']);
  assert.deepEqual(ids('student_badges'), [1]);
  assert.deepEqual(ids('badges'), [1]);
  const text = JSON.stringify(t);
  assert.doesNotMatch(text, /SECRETO|ana@x\.com|10\.0\.0\.1|client_metadata|"phone"|Zoe|Ajeno|Ajena|marta@escuela|base_salary|9999|AVISO-AJENO|VIEJO|GRUPO-DE-OTRA-ESCUELA/);
});

test('las entradas de docentes llevan la huella del correo (igual que la del nodo), el PIN hasheado, y nunca el correo en claro', { skip }, async () => {
  const out = await mod.buildTeacherLogins([
    { teacher_id: 't1', email: ' Marta@Escuela.com ', pin_hash: 'a'.repeat(64), pin_salt: 'b'.repeat(32) },
    { teacher_id: 't2', email: 'sinpin@x.com', pin_hash: null, pin_salt: null },
    { teacher_id: 't3', email: null, pin_hash: 'a'.repeat(64), pin_salt: 'b'.repeat(32) },
  ]);
  assert.equal(out.length, 1, 'sin PIN o sin correo no hay entrada');
  const expected = crypto.createHash('sha256').update('marta@escuela.com').digest('hex');
  assert.deepEqual(out[0], { teacher_id: 't1', email_hash: expected, pin_hash: 'a'.repeat(64), pin_salt: 'b'.repeat(32) });
  assert.doesNotMatch(JSON.stringify(out), /marta|escuela\.com/i);
});
