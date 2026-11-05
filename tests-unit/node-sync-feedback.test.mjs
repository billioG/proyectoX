// Buzón que sube un nodo (supabase/functions/node-sync/validators.ts): solo se valida la forma y se limpia la fila; el docente de la clase lo comprueba la función SQL (node-feedback-sql.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/validators.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /validators\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}
const S = '11111111-1111-1111-1111-111111111111', T = '22222222-2222-2222-2222-222222222222';
const ctx = { studentIds: new Set([S]) };
const sug = (row = {}, over = {}) => ({ seq: 1, fn: 'submit_feedback', student_id: S, args: { kind: 'suggestion', row: { id: 1500000001, student_id: S, type: 'suggestion', message: 'Más laboratorio', rating: null, created_at: '2026-11-04T15:00:00.000Z', ...row } }, ...over });
const rat = (row = {}, over = {}) => ({ seq: 2, fn: 'submit_feedback', student_id: S, args: { kind: 'rating', row: { id: 1500000002, student_id: S, teacher_id: T, rating: 4.24, message: 'La robótica', best_moment: null, q_interest: 4, q_practice: 5, q_resources: 4, q_respect: 4, q_clarity: 4, created_at: '2026-11-04T15:00:00.000Z', ...row } }, ...over });

test('acepta la sugerencia y la evaluación y arma la llamada limpia (solo los campos conocidos, nota a un decimal)', { skip }, () => {
  const s = mod.validateFeedbackEvent(sug({ extra: 'x', admin: true }), ctx);
  assert.equal(s.ok, true);
  assert.deepEqual(s.call, { p_kind: 'suggestion', p_student: S, p_row: { id: 1500000001, student_id: S, type: 'suggestion', message: 'Más laboratorio', rating: null, created_at: '2026-11-04T15:00:00.000Z' } });
  const r = mod.validateFeedbackEvent(rat({ hack: 1 }), ctx);
  assert.equal(r.ok, true);
  assert.equal(r.call.p_row.rating, 4.2);
  assert.deepEqual(Object.keys(r.call.p_row).sort(), ['best_moment', 'created_at', 'id', 'message', 'q_clarity', 'q_interest', 'q_practice', 'q_resources', 'q_respect', 'rating', 'student_id', 'teacher_id']);
  assert.equal(mod.validateFeedbackEvent(rat({ q_interest: undefined, best_moment: 'Lo mejor' }), ctx).call.p_row.q_interest, 0, 'criterio omitido vale 0');
  assert.equal(mod.isFeedbackFn('submit_feedback'), true);
  assert.equal(mod.isFeedbackFn('log_practice'), false);
});

test('rechaza lo raro: estudiante ajeno, ids fuera del rango, mensajes vacíos o enormes, notas y criterios fuera de rango, docente que no es UUID, tipos raros', { skip }, () => {
  const bad = [
    sug({}, { student_id: 'otro' }), sug({ student_id: 'otro' }), sug({ id: 5 }), sug({ id: 2100000000 }), sug({ id: 1500000001.5 }), sug({ message: '   ' }), sug({ message: 'x'.repeat(2001) }), sug({ message: 5 }), sug({ type: 'rating' }),
    sug({ rating: 9 }), sug({ created_at: 'ayer' }), rat({ teacher_id: 'docente' }), rat({ rating: 0.5 }), rat({ rating: 5.1 }), rat({ rating: '4' }), rat({ q_interest: 6 }), rat({ q_clarity: 2.5 }), rat({ message: 'x'.repeat(2001) }),
    { seq: 1, fn: 'submit_feedback', student_id: S, args: { kind: 'queja', row: {} } }, { seq: 1, fn: 'submit_feedback', student_id: S }, { seq: 1, fn: 'drop_table', student_id: S, args: {} }, null,
  ];
  for (const b of bad) assert.equal(mod.validateFeedbackEvent(b, ctx).ok, false, JSON.stringify(b)?.slice(0, 120));
});
