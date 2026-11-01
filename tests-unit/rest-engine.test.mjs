// Motor de consultas PostgREST sobre filas en memoria (school-node/rest/engine.js): columnas permitidas, filtros,
// orden, relaciones anidadas, reglas de acceso por fila y escrituras. Lógica pura: corre en cualquier versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../school-node/rest/query.js';
import { createEngine } from '../school-node/rest/engine.js';

const seq = { n: 0 };
const SCHEMA = {
  schools: { pk: 'code', columns: ['code', 'name'], relations: {} },
  students: {
    pk: 'id', columns: ['id', 'full_name', 'school_code', 'grade', 'section', 'xp', 'tags'],
    relations: { schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' } },
  },
  groups: { pk: 'id', columns: ['id', 'name'], relations: { group_members: { type: 'many', table: 'group_members', fk: 'group_id', ref: 'id' } } },
  group_members: { pk: 'id', columns: ['id', 'group_id', 'student_id'], relations: {} },
  projects: {
    pk: 'id', columns: ['id', 'user_id', 'group_id', 'title', 'score', 'votes', 'created_at'],
    writable: ['user_id', 'group_id', 'title'],
    defaults: { id: () => (seq.n++ === 0 ? 'p-new' : `p-new-${seq.n}`), created_at: () => '2026-11-01T00:00:00Z', votes: () => 0 },
    relations: {
      students: { type: 'one', table: 'students', fk: 'user_id', ref: 'id' },
      groups: { type: 'one', table: 'groups', fk: 'group_id', ref: 'id' },
      evaluations: { type: 'many', unique: true, table: 'evaluations', fk: 'project_id', ref: 'id' },
    },
  },
  evaluations: { pk: 'id', columns: ['id', 'project_id', 'total_score', 'feedback'], relations: {} },
  lesson_completions: {
    pk: 'id', columns: ['id', 'lesson_id', 'student_id', 'score', 'status'], writable: ['lesson_id', 'student_id', 'score', 'status'],
    unique: [['lesson_id', 'student_id']], defaults: { id: () => `c-${Math.random()}` }, relations: {},
  },
};

function makeStore(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  return {
    data,
    all: (t) => data[t] || (data[t] = []),
    put: (t, row) => { const rows = data[t] || (data[t] = []); const pk = SCHEMA[t].pk; const i = rows.findIndex(r => r[pk] === row[pk]); if (i >= 0) rows[i] = row; else rows.push(row); },
    remove: (t, pkValue) => { const pk = SCHEMA[t].pk; data[t] = data[t].filter(r => r[pk] !== pkValue); },
  };
}
const SEED = {
  schools: [{ code: 'ESC1', name: 'Escuela Uno' }, { code: 'ESC2', name: 'Escuela Dos' }],
  students: [
    { id: 's1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', xp: 10, tags: ['a', 'b'], pin_hash: 'SECRETO', password: 'SECRETO' },
    { id: 's2', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', xp: null, tags: [], pin_hash: 'SECRETO' },
    { id: 's3', full_name: 'Carla', school_code: 'ESC2', grade: 'Segundo', section: 'B', xp: 30, tags: ['b'], pin_hash: 'SECRETO' },
  ],
  groups: [{ id: 7, name: 'Equipo Sol' }],
  group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 7, student_id: 's2' }],
  projects: [
    { id: 'p1', user_id: 's1', group_id: 7, title: 'Robot', score: 80, votes: 3, created_at: '2026-10-01' },
    { id: 'p2', user_id: 's2', group_id: null, title: 'Semáforo', score: null, votes: 1, created_at: '2026-10-02' },
    { id: 'p3', user_id: 's3', group_id: null, title: 'De otra escuela', score: 90, votes: 9, created_at: '2026-10-03' },
  ],
  evaluations: [{ id: 'e1', project_id: 'p1', total_score: 80, feedback: 'Bien' }],
  lesson_completions: [],
};
// Política del ejemplo: cada estudiante solo ve filas de su escuela (students, projects de su escuela).
const policy = {
  canRead: (ctx, table, row) => {
    if (ctx.role === 'service') return true;
    if (table === 'students') return row.school_code === ctx.school;
    if (table === 'projects') return SEED.students.find(s => s.id === row.user_id)?.school_code === ctx.school;
    return true;
  },
  canInsert: (ctx, table, row) => !(table === 'lesson_completions' && row.student_id !== ctx.uid),
  canUpdate: (ctx, table, oldRow) => !(table === 'projects' && oldRow.user_id !== ctx.uid),
  canDelete: (ctx, table, row) => !(table === 'projects' && row.user_id !== ctx.uid),
};
const ctx = { uid: 's1', role: 'authenticated', school: 'ESC1' };
const run = (store, method, url, extra = {}, c = ctx) => createEngine({ schema: SCHEMA, store, policy }).execute(parseRequest({ method, url, headers: {}, ...extra }), c);
const expectError = (fn, status, code) => assert.throws(fn, (e) => e.status === status && (!code || e.code === code), `esperaba ${status} ${code || ''}`);

test('select *: solo las columnas permitidas (nunca pin_hash ni password) y solo las filas que la política deja ver', () => {
  const { rows } = run(makeStore(SEED), 'GET', '/rest/v1/students?select=*');
  assert.deepEqual(rows.map(r => r.id), ['s1', 's2'], 'Carla es de otra escuela: no se ve');
  assert.equal(Object.keys(rows[0]).sort().join(','), 'full_name,grade,id,school_code,section,tags,xp');
  assert.doesNotMatch(JSON.stringify(rows), /SECRETO|pin_hash|password/);
});

test('pedir (o filtrar u ordenar por) una columna no permitida es un error 400 que no revela si existe', () => {
  const s = makeStore(SEED);
  expectError(() => run(s, 'GET', '/rest/v1/students?select=id,pin_hash'), 400, '42703');
  expectError(() => run(s, 'GET', '/rest/v1/students?select=*&pin_hash=eq.SECRETO'), 400, '42703');
  expectError(() => run(s, 'GET', '/rest/v1/students?select=*&order=pin_hash.asc'), 400, '42703');
  expectError(() => run(s, 'GET', '/rest/v1/tabla_inexistente?select=*'), 404, '42P01');
});

test('filtros: eq, neq, gt/gte/lt, in, is null, like/ilike, not, or, and, cs', () => {
  const s = makeStore(SEED);
  const ids = (url) => run(s, 'GET', url).rows.map(r => r.id);
  assert.deepEqual(ids('/rest/v1/students?select=id&section=eq.A'), ['s1', 's2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&id=neq.s1'), ['s2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&xp=gt.5'), ['s1']);
  assert.deepEqual(ids('/rest/v1/students?select=id&id=in.(s2,s9)'), ['s2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&xp=is.null'), ['s2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&xp=not.is.null'), ['s1']);
  assert.deepEqual(ids('/rest/v1/students?select=id&full_name=ilike.*ET*'), ['s2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&full_name=like.An*'), ['s1']);
  assert.deepEqual(ids('/rest/v1/students?select=id&or=(id.eq.s1,xp.is.null)'), ['s1', 's2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&or=(id.eq.s1,and(section.eq.A,xp.is.null))'), ['s1', 's2']);
  assert.deepEqual(ids('/rest/v1/students?select=id&tags=cs.{b}'), ['s1']);
  assert.deepEqual(ids('/rest/v1/projects?select=id&created_at=gte.2026-10-02'), ['p2']);
  assert.deepEqual(ids('/rest/v1/projects?select=id&score=eq.80'), ['p1'], 'número comparado con texto del URL');
});

test('orden (varias columnas, nulos como Postgres), límite, desplazamiento y conteo exacto', () => {
  const s = makeStore(SEED);
  const q = (url, extra) => run(s, 'GET', url, extra);
  assert.deepEqual(q('/rest/v1/students?select=id&order=xp.asc').rows.map(r => r.id), ['s1', 's2'], 'asc: nulos al final');
  assert.deepEqual(q('/rest/v1/students?select=id&order=xp.desc').rows.map(r => r.id), ['s2', 's1'], 'desc: nulos primero');
  assert.deepEqual(q('/rest/v1/students?select=id&order=xp.desc.nullslast').rows.map(r => r.id), ['s1', 's2']);
  assert.deepEqual(q('/rest/v1/projects?select=id&order=votes.desc').rows.map(r => r.id), ['p1', 'p2']);
  assert.deepEqual(q('/rest/v1/students?select=id&order=id.asc&limit=1&offset=1').rows.map(r => r.id), ['s2']);
  const withCount = run(s, 'GET', '/rest/v1/students?select=id&limit=1', { headers: { prefer: 'count=exact' } });
  assert.deepEqual([withCount.rows.length, withCount.count], [1, 2]);
  const head = run(s, 'HEAD', '/rest/v1/students?select=id', { headers: { prefer: 'count=exact' } });
  assert.deepEqual([head.rows, head.count], [[], 2]);
});

test('relaciones: a uno, a muchos, uno a uno inverso (objeto), anidadas, con alias', () => {
  const s = makeStore(SEED);
  const { rows } = run(s, 'GET', '/rest/v1/projects?select=id,autor:students(full_name,schools(name)),groups(name,group_members(student_id)),evaluations(total_score,feedback)&order=id.asc');
  const p1 = rows[0];
  assert.deepEqual(p1.autor, { full_name: 'Ana', schools: { name: 'Escuela Uno' } });
  assert.deepEqual(p1.groups, { name: 'Equipo Sol', group_members: [{ student_id: 's1' }, { student_id: 's2' }] });
  assert.deepEqual(p1.evaluations, { total_score: 80, feedback: 'Bien' }, 'uno a uno: objeto, no lista');
  assert.deepEqual([rows[1].groups, rows[1].evaluations], [null, null], 'sin relación: null');
  assert.equal(rows.length, 2, 'p3 es de otra escuela');
});

test('las filas anidadas también pasan por la política y por la lista de columnas', () => {
  const s = makeStore(SEED);
  s.data.projects.push({ id: 'p4', user_id: 's2', group_id: null, title: 'x', score: 1, votes: 0, created_at: '2026-10-04' });
  s.data.students[1].school_code = 'ESC2'; // el autor de p2/p4 pasa a otra escuela: no se puede ver
  const { rows } = run(s, 'GET', '/rest/v1/groups?select=name,group_members(student_id)');
  assert.deepEqual(rows[0].group_members.length, 2, 'group_members no tiene regla propia');
  expectError(() => run(s, 'GET', '/rest/v1/projects?select=id,students(pin_hash)'), 400, '42703');
  const inner = run(s, 'GET', '/rest/v1/projects?select=id,students!inner(full_name)&order=id.asc', {}, { ...ctx, role: 'service' });
  assert.equal(inner.rows.length, 4);
});

test('!inner descarta las filas sin relación visible', () => {
  const s = makeStore(SEED);
  const all = run(s, 'GET', '/rest/v1/projects?select=id,groups(name)&order=id.asc').rows;
  assert.equal(all.length, 2);
  const inner = run(s, 'GET', '/rest/v1/projects?select=id,groups!inner(name)&order=id.asc').rows;
  assert.deepEqual(inner.map(r => r.id), ['p1']);
});

test('single: una fila da objeto; cero o varias dan 406 PGRST116', () => {
  const s = makeStore(SEED);
  const one = run(s, 'GET', '/rest/v1/students?select=id&id=eq.s1', { headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.deepEqual(one.rows, { id: 's1' });
  expectError(() => run(s, 'GET', '/rest/v1/students?select=id&id=eq.nadie', { headers: { accept: 'application/vnd.pgrst.object+json' } }), 406, 'PGRST116');
  expectError(() => run(s, 'GET', '/rest/v1/students?select=id', { headers: { accept: 'application/vnd.pgrst.object+json' } }), 406, 'PGRST116');
});

test('insert: pone los valores por defecto, valida columnas escribibles y la política; devuelve la fila si se pide', () => {
  const s = makeStore(SEED);
  const r = run(s, 'POST', '/rest/v1/projects?select=id,title,votes,created_at', { headers: { prefer: 'return=representation' }, body: { user_id: 's1', title: 'Nuevo' } });
  assert.deepEqual(r.rows, [{ id: 'p-new', title: 'Nuevo', votes: 0, created_at: '2026-11-01T00:00:00Z' }]);
  assert.equal(s.data.projects.length, 4);
  assert.deepEqual(r.changes, [{ op: 'insert', table: 'projects', row: s.data.projects[3] }]);
  const sin = run(s, 'POST', '/rest/v1/projects', { body: { user_id: 's1', title: 'Otro' } });
  assert.deepEqual(sin.rows, [], 'sin Prefer no devuelve filas');
  expectError(() => run(s, 'POST', '/rest/v1/projects', { body: { user_id: 's1', title: 'x', score: 100 } }), 403, '42501'); // columna sin permiso de escritura
  expectError(() => run(s, 'POST', '/rest/v1/projects', { body: { user_id: 's1', title: 'x', inventada: 1 } }), 400, '42703'); // columna que no existe
  expectError(() => run(s, 'POST', '/rest/v1/students', { body: { id: 'sx' } }), 403, '42501');
  expectError(() => run(s, 'POST', '/rest/v1/lesson_completions', { body: { lesson_id: 'l1', student_id: 's2' } }), 403, '42501');
});

test('upsert con on_conflict: actualiza la fila existente (merge) o la ignora; sin duplicar', () => {
  const s = makeStore(SEED);
  const url = '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id';
  run(s, 'POST', url, { headers: { prefer: 'resolution=merge-duplicates' }, body: { lesson_id: 'l1', student_id: 's1', score: 50, status: 'in_progress' } });
  const second = run(s, 'POST', url, { headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: { lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' } });
  assert.equal(s.data.lesson_completions.length, 1);
  assert.deepEqual([second.rows[0].score, second.rows[0].status], [90, 'completed']);
  assert.equal(second.changes[0].op, 'update');
  run(s, 'POST', url, { headers: { prefer: 'resolution=ignore-duplicates' }, body: { lesson_id: 'l1', student_id: 's1', score: 1 } });
  assert.equal(s.data.lesson_completions[0].score, 90, 'ignore-duplicates no pisa');
});

test('update y delete: solo filas que la política deja y que cumplen el filtro; el resto no se toca (sin error, como RLS)', () => {
  const s = makeStore(SEED);
  const upd = run(s, 'PATCH', '/rest/v1/projects?id=eq.p1&select=id,title', { headers: { prefer: 'return=representation' }, body: { title: 'Robot 2' } });
  assert.deepEqual(upd.rows, [{ id: 'p1', title: 'Robot 2' }]);
  const ajeno = run(s, 'PATCH', '/rest/v1/projects?id=eq.p2', { headers: { prefer: 'return=representation' }, body: { title: 'Hackeado' } });
  assert.deepEqual(ajeno.rows, [], 'proyecto de otro estudiante: 0 filas');
  assert.equal(s.data.projects[1].title, 'Semáforo');
  expectError(() => run(s, 'PATCH', '/rest/v1/projects?id=eq.p1', { body: { score: 100 } }), 403, '42501');
  const del = run(s, 'DELETE', '/rest/v1/projects?id=in.(p1,p2)', { headers: { prefer: 'return=representation' } });
  assert.deepEqual(del.rows.map(r => r.id), ['p1']);
  assert.deepEqual(s.data.projects.map(p => p.id), ['p2', 'p3']);
  assert.deepEqual(del.changes.map(c => [c.op, c.table, c.row.id]), [['delete', 'projects', 'p1']]);
});

test('una política que no existe deniega por defecto (nada se sirve sin regla explícita)', () => {
  const engine = createEngine({ schema: SCHEMA, store: makeStore(SEED), policy: {} });
  expectError(() => engine.execute(parseRequest({ method: 'GET', url: '/rest/v1/students?select=id', headers: {} }), ctx), 403, '42501');
});
