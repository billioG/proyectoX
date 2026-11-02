// Equipos que arma un docente en el nodo (supabase/functions/node-sync/groups.ts): ids reservados, solo la escuela del nodo, miembros de la
// misma clase. TypeScript sin sintaxis no borrable: Node 22 lo importa; con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/groups.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /groups\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const G = 1_600_000_001, M = 1_600_000_002, M2 = 1_600_000_003;
const ctx = (over = {}) => ({
  schoolCode: 'ESC1',
  students: new Map([['s1', { grade: 'Primero', section: 'A' }], ['s2', { grade: 'Primero', section: 'A' }], ['s3', { grade: 'Segundo', section: 'B' }]]),
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }],
  adminIds: new Set(), groups: new Map([[7, { school_code: 'ESC1', grade: 'Primero', section: 'A' }], [70, { school_code: 'ESC2', grade: 'Primero', section: 'A' }]]),
  members: new Map([[1, { group_id: 7 }], [10, { group_id: 70 }]]), ...over,
});
const group = (patch = {}) => ({ name: 'Estrellas', school_code: 'ESC1', grade: 'Primero', section: 'A', ...patch });
const member = (patch = {}) => ({ group_id: G, student_id: 's1', role: 'planner', is_leader: null, ...patch });
const op = (seq, tbl, kind, pk, row) => ({ seq, tbl, op: kind, pk: String(pk), row });
const plan = (ops, c = ctx()) => mod.planGroupOps(ops, c);
const oks = (ops, c) => plan(ops, c).results.map((r) => r.ok);

test('un equipo nuevo (id reservado) y sus miembros, en orden, se escriben; el equipo lleva como autor a un docente de esa clase', { skip }, () => {
  const { actions, results } = plan([op(1, 'groups', 'insert', G, group()), op(2, 'group_members', 'insert', M, member()), op(3, 'group_members', 'insert', M2, member({ student_id: 's2', role: 'builder' }))]);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
  assert.deepEqual(actions[0], { seq: 1, table: 'groups', kind: 'upsert', row: { id: G, name: 'Estrellas', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1' } });
  assert.deepEqual(actions[1].row, { id: M, group_id: G, student_id: 's1', role: 'planner' });
});

test('rechaza: id fuera del rango, escuela o clase ajenas, nombre vacío o enorme; miembro de otra clase, de equipo inexistente o con rol enorme', { skip }, () => {
  for (const b of [op(1, 'groups', 'insert', 5, group()), op(1, 'groups', 'insert', G, group({ school_code: 'ESC2' })), op(1, 'groups', 'insert', G, group({ grade: 'Quinto' })),
    op(1, 'groups', 'insert', G, group({ name: ' ' })), op(1, 'groups', 'insert', G, group({ name: 'x'.repeat(81) })), op(1, 'groups', 'insert', 'no', group())]) assert.equal(oks([b])[0], false);
  const base = op(0, 'groups', 'insert', G, group());
  for (const m of [member({ student_id: 's3' }), member({ group_id: 99 }), member({ role: 'x'.repeat(31) }), member({ student_id: 'nadie' }), member({ is_leader: 'si' })]) {
    assert.deepEqual(oks([{ ...base, seq: 1 }, op(2, 'group_members', 'insert', M, m)]), [true, false], JSON.stringify(m));
  }
  assert.equal(oks([op(1, 'group_members', 'insert', 3, member({ group_id: 7 }))])[0], false, 'un miembro nuevo usa un id reservado');
});

test('editar y borrar solo lo de la escuela del nodo; borrar un equipo se lleva a sus miembros; borrar lo que ya no existe es éxito', { skip }, () => {
  assert.equal(oks([op(1, 'groups', 'update', 7, group({ name: 'Sol y Luna' }))])[0], true, 'equipo que ya existía en la nube');
  assert.equal(oks([op(1, 'groups', 'update', 70, group({ name: 'Robado' }))])[0], false, 'equipo de otra escuela');
  assert.equal(oks([op(1, 'groups', 'delete', 70, {})])[0], false);
  const c = ctx();
  const r = plan([op(1, 'groups', 'delete', 7, {}), op(2, 'group_members', 'insert', 1, member({ group_id: 7 }))], c);
  assert.deepEqual(r.results.map((x) => x.ok), [true, false], 'sus miembros se fueron con él');
  assert.deepEqual(r.actions, [{ seq: 1, table: 'groups', kind: 'delete', id: 7 }]);
  assert.equal(oks([op(1, 'groups', 'delete', 123, {}), op(2, 'group_members', 'delete', 456, {})]).every(Boolean), true);
  assert.equal(oks([op(1, 'group_members', 'delete', 10, {})])[0], false, 'miembro de otra escuela');
});

test('un cambio malo no frena a los demás', { skip }, () => {
  assert.deepEqual(oks([{ foo: 1 }, op(1, 'groups', 'insert', 5, group()), op(2, 'groups', 'insert', G, group())]), [false, true]);
});
