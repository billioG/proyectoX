// Asistencia que sube un nodo escolar (supabase/functions/node-sync/attendance.ts): la nube vuelve a validar clase, docente, estado y fecha.
// TypeScript sin sintaxis no borrable: Node 22 lo importa; con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/attendance.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /attendance\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const NOW = Date.parse('2026-11-02T15:00:00Z');
const ctx = () => ({
  schoolCode: 'ESC1', now: NOW,
  students: new Map([['s1', { grade: 'Primero', section: 'A' }], ['s3', { grade: 'Segundo', section: 'B' }]]),
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }],
  adminIds: new Set(['adm']),
});
const row = (patch = {}) => ({ student_id: 's1', teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', date: '2026-11-02', time: '08:15:00', status: 'present', id: 'x', created_at: 'y', ...patch });
const op = (seq, kind, r) => ({ seq, tbl: 'attendance', op: kind, pk: 's1:2026-11-02', row: r });
const ok = (ops, c) => mod.planAttendanceOps(ops, c || ctx()).results.map((r) => r.ok);

test('una asistencia válida se escribe como upsert por estudiante y día, sin el id local', { skip }, () => {
  const { actions, results } = mod.planAttendanceOps([op(1, 'insert', row()), op(2, 'update', row({ status: 'late' }))], ctx());
  assert.deepEqual(results, [{ seq: 1, ok: true }, { seq: 2, ok: true }]);
  assert.deepEqual(actions[1], { seq: 2, row: { student_id: 's1', teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', date: '2026-11-02', time: '08:15:00', status: 'late' } });
});

test('rechaza: estudiante o clase ajenos, docente sin esa clase o de otra escuela, estado, fecha y hora inválidos, y borrar', { skip }, () => {
  const bad = [row({ student_id: 'nadie' }), row({ grade: 'Segundo' }), row({ school_code: 'ESC2' }), row({ teacher_id: 't9' }), row({ teacher_id: 'otro' }),
    row({ student_id: 's3', grade: 'Segundo', section: 'B' }), row({ status: 'volando' }), row({ date: 'ayer' }), row({ date: '2026-09-01' }), row({ date: '2026-12-31' }), row({ time: 'tarde' })];
  for (const b of bad) assert.equal(ok([op(1, 'insert', b)])[0], false, JSON.stringify(b));
  assert.equal(ok([op(1, 'delete', row())])[0], false);
});

test('el administrador puede en cualquier clase de la escuela; un cambio malo no frena al resto', { skip }, () => {
  assert.equal(ok([op(1, 'insert', row({ teacher_id: 'adm', student_id: 's3', grade: 'Segundo', section: 'B' }))])[0], true);
  assert.deepEqual(ok([{ foo: 1 }, op(1, 'insert', row({ status: 'x' })), op(2, 'insert', row())]), [false, true]);
});
