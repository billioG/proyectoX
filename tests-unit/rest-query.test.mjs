// Analizador de consultas PostgREST (school-node/rest/query.js): lo que el cliente de Supabase manda al nodo.
// Es lógica pura (sin SQLite): corre en cualquier versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSelect, parseFilterValue, parseRequest } from '../school-node/rest/query.js';

const req = (method, url, extra = {}) => parseRequest({ method, url, headers: {}, body: undefined, ...extra });

test('parseSelect: columnas, estrella y alias', () => {
  assert.deepEqual(parseSelect('*'), [{ type: 'star' }]);
  assert.deepEqual(parseSelect('id,title'), [{ type: 'col', name: 'id', alias: 'id' }, { type: 'col', name: 'title', alias: 'title' }]);
  assert.deepEqual(parseSelect('mi_titulo:title'), [{ type: 'col', name: 'title', alias: 'mi_titulo' }]);
  assert.deepEqual(parseSelect(''), [{ type: 'star' }], 'sin select = todo');
});

test('parseSelect: relaciones anidadas, alias, !inner y pista de clave foránea', () => {
  const t = parseSelect('*,students(id,full_name,schools(*)),groups(name,group_members(student_id))');
  assert.equal(t.length, 3);
  assert.deepEqual(t[1], { type: 'rel', name: 'students', alias: 'students', inner: false, hint: null, select: [
    { type: 'col', name: 'id', alias: 'id' }, { type: 'col', name: 'full_name', alias: 'full_name' },
    { type: 'rel', name: 'schools', alias: 'schools', inner: false, hint: null, select: [{ type: 'star' }] },
  ] });
  assert.equal(t[2].select[1].name, 'group_members');
  const inner = parseSelect('id,autor:students!inner(full_name)');
  assert.deepEqual([inner[1].alias, inner[1].name, inner[1].inner], ['autor', 'students', true]);
  const hint = parseSelect('id,students!projects_user_id_fkey(full_name)');
  assert.equal(hint[1].hint, 'projects_user_id_fkey');
});

test('parseSelect: ignora espacios y saltos de línea (los select de plantilla)', () => {
  const t = parseSelect(`*,
    students(
      id, full_name,
      schools(*)
    )`);
  assert.equal(t[1].select.length, 3);
});

test('parseFilterValue: operadores básicos, negación y listas', () => {
  assert.deepEqual(parseFilterValue('user_id', 'eq.abc'), { col: 'user_id', op: 'eq', value: 'abc', negate: false });
  assert.deepEqual(parseFilterValue('score', 'gte.10'), { col: 'score', op: 'gte', value: '10', negate: false });
  assert.deepEqual(parseFilterValue('status', 'not.eq.baja'), { col: 'status', op: 'eq', value: 'baja', negate: true });
  assert.deepEqual(parseFilterValue('id', 'in.(1,2,3)'), { col: 'id', op: 'in', value: ['1', '2', '3'], negate: false });
  assert.deepEqual(parseFilterValue('name', 'in.("a,b","c d")'), { col: 'name', op: 'in', value: ['a,b', 'c d'], negate: false });
  assert.deepEqual(parseFilterValue('deleted_at', 'is.null'), { col: 'deleted_at', op: 'is', value: null, negate: false });
  assert.deepEqual(parseFilterValue('active', 'is.true'), { col: 'active', op: 'is', value: true, negate: false });
  assert.deepEqual(parseFilterValue('tags', 'cs.{a,b}'), { col: 'tags', op: 'cs', value: ['a', 'b'], negate: false });
  assert.deepEqual(parseFilterValue('title', 'ilike.*robot*'), { col: 'title', op: 'ilike', value: '%robot%', negate: false });
});

test('parseFilterValue: un operador desconocido lanza 400', () => {
  assert.throws(() => parseFilterValue('a', 'zzz.1'), (e) => e.status === 400);
  assert.throws(() => parseFilterValue('a', 'sin-operador'), (e) => e.status === 400);
});

test('parseRequest: GET con select, filtros repetidos, orden, límite y desplazamiento', () => {
  const r = req('GET', '/rest/v1/projects?select=*,students(full_name)&user_id=eq.s1&created_at=gte.2026-01-01&created_at=lt.2026-12-01&order=votes.desc.nullslast,score.asc&limit=10&offset=20');
  assert.equal(r.kind, 'select');
  assert.equal(r.table, 'projects');
  assert.equal(r.select.length, 2);
  assert.deepEqual(r.filters.map(f => [f.col, f.op, f.value]), [['user_id', 'eq', 's1'], ['created_at', 'gte', '2026-01-01'], ['created_at', 'lt', '2026-12-01']]);
  assert.deepEqual(r.order, [{ col: 'votes', dir: 'desc', nulls: 'last' }, { col: 'score', dir: 'asc', nulls: null }]);
  assert.deepEqual([r.limit, r.offset], [10, 20]);
});

test('parseRequest: or=(...) y and=(...) anidados', () => {
  const r = req('GET', '/rest/v1/projects?select=*&or=(user_id.eq.s1,group_id.in.(1,2))');
  assert.deepEqual(r.filters, [{ or: [
    { col: 'user_id', op: 'eq', value: 's1', negate: false },
    { col: 'group_id', op: 'in', value: ['1', '2'], negate: false },
  ] }]);
  const n = req('GET', '/rest/v1/t?or=(a.eq.1,and(b.gt.2,c.lt.9))');
  assert.deepEqual(n.filters[0].or[1], { and: [{ col: 'b', op: 'gt', value: '2', negate: false }, { col: 'c', op: 'lt', value: '9', negate: false }] });
});

test('parseRequest: cabeceras de single/maybeSingle, count y head', () => {
  assert.equal(req('GET', '/rest/v1/students?id=eq.s1', { headers: { accept: 'application/vnd.pgrst.object+json' } }).single, 'object');
  assert.equal(req('GET', '/rest/v1/students', { headers: {} }).single, null);
  const c = req('HEAD', '/rest/v1/students?select=*', { headers: { prefer: 'count=exact' } });
  assert.deepEqual([c.kind, c.head, c.count], ['select', true, 'exact']);
  const g = req('GET', '/rest/v1/students?select=id', { headers: { prefer: 'count=exact' } });
  assert.deepEqual([g.head, g.count], [false, 'exact']);
  const rg = req('GET', '/rest/v1/students', { headers: { range: '5-9', 'range-unit': 'items' } });
  assert.deepEqual([rg.offset, rg.limit], [5, 5]);
});

test('parseRequest: insert, upsert (on_conflict / resolution), update y delete', () => {
  const ins = req('POST', '/rest/v1/projects', { headers: { prefer: 'return=representation' }, body: { title: 'x' } });
  assert.deepEqual([ins.kind, ins.returnRep, ins.rows], ['insert', true, [{ title: 'x' }]]);
  const many = req('POST', '/rest/v1/projects', { body: [{ a: 1 }, { a: 2 }] });
  assert.equal(many.rows.length, 2);
  assert.equal(many.returnRep, false, 'sin Prefer, no devuelve filas');
  const up = req('POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', { headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: { lesson_id: 'l', student_id: 's' } });
  assert.deepEqual([up.kind, up.onConflict, up.returnRep], ['upsert', ['lesson_id', 'student_id'], true]);
  const ig = req('POST', '/rest/v1/t?on_conflict=id', { headers: { prefer: 'resolution=ignore-duplicates' }, body: { id: 1 } });
  assert.deepEqual([ig.kind, ig.ignoreDuplicates], ['upsert', true]);
  const upd = req('PATCH', '/rest/v1/students?id=eq.s1', { body: { xp: 5 } });
  assert.deepEqual([upd.kind, upd.patch, upd.filters.length], ['update', { xp: 5 }, 1]);
  const del = req('DELETE', '/rest/v1/project_likes?project_id=eq.7&user_id=eq.s1');
  assert.deepEqual([del.kind, del.filters.length], ['delete', 2]);
});

test('parseRequest: RPC con argumentos', () => {
  const r = req('POST', '/rest/v1/rpc/react_to_project', { body: { p_project_id: 27, p_reaction: 'like' } });
  assert.deepEqual([r.kind, r.fn, r.args], ['rpc', 'react_to_project', { p_project_id: 27, p_reaction: 'like' }]);
  assert.equal(req('GET', '/rest/v1/rpc/get_class_login_mode?p_grade=Primero').args.p_grade, 'Primero');
});

test('parseRequest: nombres de tabla y de función inválidos lanzan 400', () => {
  for (const url of ['/rest/v1/', '/rest/v1/a b', '/rest/v1/..%2Fx', '/rest/v1/t;drop', '/rest/v1/rpc/']) {
    assert.throws(() => req('GET', url), (e) => e.status === 400, url);
  }
});
