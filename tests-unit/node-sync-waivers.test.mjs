// Permisos de asistencia que sube un nodo (supabase/functions/node-sync/waivers.ts): siempre quedan pendientes; solo del propio docente y su escuela.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/waivers.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /waivers\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const W = '1f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const NOW = Date.parse('2026-11-02T15:00:00Z');
const ctx = () => ({ schoolCode: 'ESC1', now: NOW, assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }], adminIds: new Set(['adm']) });
const w = (patch = {}) => ({ teacher_id: 't1', date: '2026-11-02', reason: 'Reunión de padres', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'approved', ...patch });
const op = (seq, kind, row, pk = W) => ({ seq, tbl: 'attendance_waivers', op: kind, pk, row });
const oks = (ops) => mod.planWaiverOps(ops, ctx()).results.map((r) => r.ok);

test('un permiso de clase o de toda la escuela se escribe SIEMPRE como pendiente (aunque el nodo diga otra cosa)', { skip }, () => {
  const { actions, results } = mod.planWaiverOps([op(1, 'insert', w()), op(2, 'insert', w({ grade: null, section: null }), '2f2b8c1e-5d4a-4e7b-9a10-123456789abc')], ctx());
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(actions[0].row.status, 'pending');
  assert.deepEqual([actions[1].row.grade, actions[1].row.section], [null, null]);
});

test('rechaza: docente de otra escuela o sin esa clase, escuela ajena, motivo vacío o enorme, fecha rara, id inválido', { skip }, () => {
  for (const b of [w({ teacher_id: 't9' }), w({ teacher_id: 'nadie' }), w({ school_code: 'ESC2' }), w({ grade: 'Segundo', section: 'B' }), w({ grade: 'Primero', section: null }), w({ reason: '  ' }), w({ reason: 'x'.repeat(1001) }), w({ date: 'hoy' }), w({ date: '2026-01-01' })]) {
    assert.equal(oks([op(1, 'insert', b)])[0], false, JSON.stringify(b).slice(0, 70));
  }
  assert.equal(oks([op(1, 'insert', w(), 'no-uuid')])[0], false);
  assert.equal(oks([op(1, 'delete', w())])[0], true, 'borrar se hace en línea: aquí no frena la bandeja');
  assert.deepEqual(oks([{ foo: 1 }, op(1, 'insert', w({ reason: '' })), op(2, 'insert', w())]), [false, true]);
});
