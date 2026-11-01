// Esquema real (columnas, relaciones) y reglas de acceso (RLS en código) de la capa local compatible con Supabase.
// Reproduce las políticas de la nube para los estudiantes: ven su salón, lo suyo y lo público; nunca columnas
// sensibles. Lógica pura sobre filas en memoria: corre en cualquier versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../school-node/rest/query.js';
import { createEngine } from '../school-node/rest/engine.js';
import { SCHEMA } from '../school-node/rest/schema.js';
import { createPolicy } from '../school-node/rest/policies.js';

const SEED = {
  schools: [{ id: 1, code: 'ESC1', name: 'Escuela Uno', phone: '555', email: 'esc@x.com' }],
  students: [
    { id: 's1', full_name: 'Ana', username: 'ana1', email: 'ana@x.com', cui: '123', school_code: 'ESC1', grade: 'Primero', section: 'A', birth_date: '2015-01-01', gender: 'F', pin_hash: 'SECRETO', password_generated: 'SECRETO', qr_data: 'QR', xp: 10 },
    { id: 's2', full_name: 'Beto', username: 'beto1', email: 'beto@x.com', school_code: 'ESC1', grade: 'Primero', section: 'A', xp: 20 },
    { id: 's3', full_name: 'Carla', username: 'carla1', email: 'carla@x.com', school_code: 'ESC1', grade: 'Segundo', section: 'B', xp: 30 },
  ],
  teachers: [{ id: 't1', full_name: 'Marta', email: 'marta@x.com', role: 'docente' }],
  groups: [{ id: 7, name: 'Equipo Sol', school_code: 'ESC1' }],
  group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 7, student_id: 's2' }],
  projects: [
    { id: 1, user_id: 's1', group_id: 7, title: 'Robot', score: 80, votes: 2, upload_ip: '10.0.0.1', client_metadata: { x: 1 } },
    { id: 2, user_id: 's3', group_id: null, title: 'De Segundo B', score: 90, votes: 0 },
  ],
  evaluations: [
    { id: 1, project_id: 1, teacher_id: 't1', total_score: 80, feedback: 'Bien', comments: null },
    { id: 2, project_id: 2, teacher_id: 't1', total_score: 90, feedback: 'Excelente', comments: null },
  ],
  courses: [{ id: 'c1', title: 'Robótica', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
  lessons: [
    { id: 'l1', course_id: 'c1', title: 'Intro', audience: 'estudiante', order_index: 1, school_code: 'ESC1', grade: 'Primero', section: 'A' },
    { id: 'l2', course_id: 'c1', title: 'Guía del docente', audience: 'docente', order_index: 2, school_code: 'ESC1', grade: 'Primero', section: 'A' },
  ],
  lesson_completions: [
    { id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' },
    { id: 'lc2', lesson_id: 'l1', student_id: 's2', score: 70, status: 'completed' },
  ],
  student_badges: [], badges: [], teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
};
function makeStore() {
  const data = JSON.parse(JSON.stringify(SEED));
  return {
    data,
    all: (t) => data[t] || (data[t] = []),
    put: (t, row) => { const rows = data[t] || (data[t] = []); const pk = SCHEMA[t].pk; const i = rows.findIndex(r => r[pk] === row[pk]); if (i >= 0) rows[i] = row; else rows.push(row); },
    remove: (t, v) => { const pk = SCHEMA[t].pk; data[t] = data[t].filter(r => r[pk] !== v); },
  };
}
const student = (id, grade, section) => ({ uid: id, role: 'student', classKey: `ESC1|${grade}|${section}` });
const ana = student('s1', 'Primero', 'A');
const carla = student('s3', 'Segundo', 'B');
const teacher = { uid: 't1', role: 'teacher', classKey: null };
const run = (store, method, url, ctx, extra = {}) => createEngine({ schema: SCHEMA, store, policy: createPolicy({ store }) }).execute(parseRequest({ method, url, headers: {}, ...extra }), ctx);
const fails = (fn, status, code) => assert.throws(fn, (e) => e.status === status && (!code || e.code === code), `esperaba ${status} ${code || ''}`);

test('un estudiante ve a su salón y a sí mismo, no a otros salones', () => {
  const s = makeStore();
  assert.deepEqual(run(s, 'GET', '/rest/v1/students?select=id&order=id.asc', ana).rows.map(r => r.id), ['s1', 's2']);
  assert.deepEqual(run(s, 'GET', '/rest/v1/students?select=id&order=id.asc', carla).rows.map(r => r.id), ['s3']);
  assert.deepEqual(run(s, 'GET', '/rest/v1/students?select=id&order=id.asc', teacher).rows.map(r => r.id), ['s1', 's2', 's3'], 'el docente ve a todos');
});

test('columnas sensibles de estudiantes: nunca salen; email, fecha de nacimiento y género salen como null (la app los pide)', () => {
  const s = makeStore();
  const one = run(s, 'GET', '/rest/v1/students?select=*&id=eq.s1', ana).rows[0];
  const text = JSON.stringify(one);
  assert.doesNotMatch(text, /SECRETO|pin_hash|password_generated|qr_data|ana@x\.com|123|2015-01-01/);
  assert.equal('email' in one, false, 'select * no incluye las columnas enmascaradas');
  const asked = run(s, 'GET', '/rest/v1/students?select=id,full_name,email,birth_date,gender,cui&id=eq.s1', ana);
  assert.deepEqual(asked.rows[0], { id: 's1', full_name: 'Ana', email: null, birth_date: null, gender: null, cui: null });
  fails(() => run(s, 'GET', '/rest/v1/students?select=pin_hash', ana), 400, '42703');
  fails(() => run(s, 'GET', '/rest/v1/students?select=id&pin_hash=eq.SECRETO', ana), 400, '42703');
  fails(() => run(s, 'GET', '/rest/v1/students?select=id&email=eq.ana@x.com', ana), 400, '42703');
});

test('lo anidado respeta las mismas reglas: el autor de otro salón no se ve, y la evaluación solo es de quien corresponde', () => {
  const s = makeStore();
  const rows = run(s, 'GET', '/rest/v1/projects?select=id,students(full_name),evaluations(total_score,feedback)&order=id.asc', ana).rows;
  assert.deepEqual(rows[0], { id: 1, students: { full_name: 'Ana' }, evaluations: { total_score: 80, feedback: 'Bien' } });
  assert.deepEqual(rows[1], { id: 2, students: null, evaluations: null }, 'proyecto de otro salón: autor y evaluación ocultos');
  assert.equal(run(s, 'GET', '/rest/v1/projects?select=id,evaluations(total_score)&id=eq.1', student('s2', 'Primero', 'A')).rows[0].evaluations.total_score, 80, 'compañero de equipo ve la evaluación');
  assert.equal(run(s, 'GET', '/rest/v1/projects?select=id,evaluations(total_score)&id=eq.1', carla).rows[0].evaluations, null, 'otro salón no');
  assert.deepEqual(run(s, 'GET', '/rest/v1/evaluations?select=id', carla).rows.map(r => r.id), [2]);
  assert.deepEqual(run(s, 'GET', '/rest/v1/evaluations?select=id&order=id.asc', teacher).rows.map(r => r.id), [1, 2]);
});

test('columnas internas de proyectos (IP, metadatos) no se sirven', () => {
  const s = makeStore();
  fails(() => run(s, 'GET', '/rest/v1/projects?select=upload_ip', ana), 400, '42703');
  fails(() => run(s, 'GET', '/rest/v1/projects?select=id,client_metadata', ana), 400, '42703');
  assert.doesNotMatch(JSON.stringify(run(s, 'GET', '/rest/v1/projects?select=*', ana).rows), /10\.0\.0\.1|client_metadata/);
});

test('lecciones: el estudiante solo ve las de audiencia estudiante; el docente todas', () => {
  const s = makeStore();
  assert.deepEqual(run(s, 'GET', '/rest/v1/lessons?select=id&order=order_index.asc', ana).rows.map(r => r.id), ['l1']);
  assert.deepEqual(run(s, 'GET', '/rest/v1/lessons?select=id&order=order_index.asc', teacher).rows.map(r => r.id), ['l1', 'l2']);
  const course = run(s, 'GET', '/rest/v1/courses?select=id,lessons(id,title)', ana).rows[0];
  assert.deepEqual(course.lessons.map(l => l.id), ['l1'], 'también dentro de courses(lessons(...))');
});

test('avance de lecciones: lee lo propio, escribe lo propio, y no toca lo de otro', () => {
  const s = makeStore();
  assert.deepEqual(run(s, 'GET', '/rest/v1/lesson_completions?select=student_id', ana).rows.map(r => r.student_id), ['s1']);
  assert.equal(run(s, 'GET', '/rest/v1/lesson_completions?select=student_id', teacher).rows.length, 2);
  const up = run(s, 'POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', ana,
    { headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: { lesson_id: 'l1', student_id: 's1', score: 100, status: 'completed' } });
  assert.deepEqual([up.rows[0].score, up.changes[0].op], [100, 'update']);
  fails(() => run(s, 'POST', '/rest/v1/lesson_completions', ana, { body: { lesson_id: 'l9', student_id: 's2', status: 'completed' } }), 403, '42501');
  assert.deepEqual(run(s, 'PATCH', '/rest/v1/lesson_completions?student_id=eq.s2', ana, { headers: { prefer: 'return=representation' }, body: { score: 0 } }).rows, []);
  assert.equal(s.data.lesson_completions.find(r => r.student_id === 's2').score, 70);
  assert.equal(run(s, 'DELETE', '/rest/v1/lesson_completions?student_id=eq.s2', ana, { headers: { prefer: 'return=representation' } }).rows.length, 0);
});

test('tablas que no se exponen (docentes para estudiantes, xp_events, claves de nodos, tutores, contraseñas de clase) no existen para la capa', () => {
  const s = makeStore();
  assert.deepEqual(run(s, 'GET', '/rest/v1/teachers?select=id', ana).rows, [], 'un estudiante no ve docentes (como en la nube)');
  for (const t of ['xp_events', 'school_nodes', 'class_passwords', 'student_guardians', 'push_subscriptions', 'login_rate_limit', 'practice_results']) {
    fails(() => run(s, 'GET', `/rest/v1/${t}?select=*`, ana), 404, '42P01');
  }
});

test('proyectos y escritura: solo lectura en la prueba de concepto (nada de insertar ni editar proyectos desde el navegador)', () => {
  const s = makeStore();
  fails(() => run(s, 'POST', '/rest/v1/projects', ana, { body: { user_id: 's1', title: 'x' } }), 403, '42501');
  fails(() => run(s, 'PATCH', '/rest/v1/students?id=eq.s1', ana, { body: { xp: 99999 } }), 403, '42501');
  assert.equal(s.data.students[0].xp, 10);
});
