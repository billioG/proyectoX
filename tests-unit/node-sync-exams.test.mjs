// Exámenes y notas que sube un nodo escolar (supabase/functions/node-sync/exams.ts): la nube vuelve a validar clave, respuestas, clase y docente.
// TypeScript sin sintaxis no borrable: Node 22 lo importa; con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/exams.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /exams\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const E1 = '1f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const E2 = '2f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const ctx = () => ({
  schoolCode: 'ESC1',
  students: new Map([['s1', { grade: 'Primero', section: 'A' }], ['s3', { grade: 'Segundo', section: 'B' }]]),
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }],
  adminIds: new Set(['adm']),
  exams: new Map([[E2, { school_code: 'ESC2', teacher_id: 't9', grade: 'Primero', section: 'A', question_count: 5 }]]),
});
const exam = (patch = {}) => ({ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', title: 'Mate', bimestre: 2, question_count: 5, answer_key: 'ABCDE', points: 20, created_at: '2026-11-02T10:00:00Z', ...patch });
const res = (patch = {}) => ({ exam_id: E1, student_id: 's1', answers: 'ABCD-', correct: 4, wrong: 0, blank: 1, score: 16, scanned_by: 't1', scanned_at: '2026-11-02T11:00:00Z', ...patch });
const op = (seq, tbl, kind, pk, row) => ({ seq, tbl, op: kind, pk, row });
const oks = (ops, c) => mod.planExamOps(ops, c || ctx()).results.map((r) => r.ok);

test('un examen y su nota, en orden, se escriben: el examen por id y la nota por (examen, estudiante)', { skip }, () => {
  const { actions, results } = mod.planExamOps([op(1, 'exams', 'insert', E1, exam()), op(2, 'exam_results', 'insert', 'x', res())], ctx());
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.deepEqual(actions[0], { seq: 1, table: 'exams', kind: 'upsert', onConflict: 'id', row: { id: E1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', title: 'Mate', bimestre: 2, question_count: 5, answer_key: 'ABCDE', points: 20, created_at: '2026-11-02T10:00:00Z' } });
  assert.equal(actions[1].onConflict, 'exam_id,student_id');
  assert.equal(actions[1].row.id, undefined, 'el id local de la nota no viaja');
});

test('examen: clave que no mide lo que las preguntas, letras fuera de A-E, puntos o bimestre raros, escuela o clase ajenas, docente sin esa clase', { skip }, () => {
  for (const b of [exam({ answer_key: 'ABC' }), exam({ answer_key: 'ABCDF' }), exam({ question_count: 0, answer_key: '' }), exam({ question_count: 101, answer_key: 'A'.repeat(101) }), exam({ title: ' ' }), exam({ bimestre: 5 }),
    exam({ points: 0 }), exam({ points: 1001 }), exam({ school_code: 'ESC2' }), exam({ grade: 'Segundo', section: 'B' }), exam({ teacher_id: 't9' }), exam({ teacher_id: 'nadie' })]) {
    assert.equal(oks([op(1, 'exams', 'insert', E1, b)])[0], false, JSON.stringify(b).slice(0, 70));
  }
  assert.equal(oks([op(1, 'exams', 'insert', 'no-uuid', exam())])[0], false);
  assert.equal(oks([op(1, 'exams', 'insert', E1, exam({ teacher_id: 'adm', grade: 'Quinto', section: 'Z' }))])[0], true, 'el administrador puede en cualquier clase');
});

test('nota: respuestas del tamaño de la clave, estudiante de la misma clase, números válidos, calificó un docente de la escuela', { skip }, () => {
  const base = op(0, 'exams', 'insert', E1, exam());
  for (const r of [res({ answers: 'ABC' }), res({ answers: 'ABCDX' }), res({ student_id: 's3' }), res({ student_id: 'nadie' }), res({ correct: -1 }), res({ score: -3 }), res({ score: 'x' }), res({ scanned_by: 't9' }), res({ exam_id: E2 }), res({ exam_id: 'otro' })]) {
    assert.deepEqual(oks([{ ...base, seq: 1 }, op(2, 'exam_results', 'insert', 'x', r)]), [true, false], JSON.stringify(r).slice(0, 70));
  }
  assert.deepEqual(oks([{ ...base, seq: 1 }, op(2, 'exam_results', 'insert', 'x', res({ answers: '*B-DE' }))]), [true, true], 'doble marca y blancos valen');
});

test('borrar: examen y nota; lo de otra escuela no; lo que ya no existe es éxito; un cambio malo no frena al resto', { skip }, () => {
  const c = ctx();
  c.exams.set(E1, { school_code: 'ESC1', teacher_id: 't1', grade: 'Primero', section: 'A', question_count: 5 });
  const { actions, results } = mod.planExamOps([op(1, 'exam_results', 'delete', 'x', { exam_id: E1, student_id: 's1' }), op(2, 'exams', 'delete', E2, {}), op(3, 'exams', 'delete', E1, {}), op(4, 'exams', 'delete', '3f2b8c1e-5d4a-4e7b-9a10-123456789abc', {})], c);
  assert.deepEqual(results.map((r) => r.ok), [true, false, true, true]);
  assert.deepEqual(actions.map((a) => a.match), [{ exam_id: E1, student_id: 's1' }, { id: E1 }]);
  assert.deepEqual(oks([{ foo: 1 }, op(1, 'exams', 'insert', E1, exam({ answer_key: 'x' })), op(2, 'exams', 'insert', E1, exam())]), [false, true]);
});
