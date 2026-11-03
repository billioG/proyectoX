// Avances de lecciones que sube un nodo (supabase/functions/node-sync/validators.ts): solo lecciones reales de la escuela,
// estudiantes de la escuela, sin repetidos en el mismo lote (un repetido hace fallar todo el upsert) y datos acotados.
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
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

const ctx = () => ({ studentIds: new Set(['s1', 's2']), lessonIds: new Set(['l1', 'l2']) });
const c = (patch = {}) => ({ lesson_id: 'l1', student_id: 's1', score: 80, status: 'completed', ...patch });

test('deja pasar lo válido y descarta lo que la nube rechazaría (estudiante ajeno, lección inventada, tipos raros)', { skip }, () => {
  const out = mod.sanitizeCompletions([
    c(), c({ student_id: 'otra-escuela' }), c({ lesson_id: 'inventada' }), c({ lesson_id: { x: 1 } }), c({ student_id: null }), null, 'basura', c({ lesson_id: 'l2', student_id: 's2' }),
  ], ctx());
  assert.deepEqual(out.map((r) => `${r.lesson_id}|${r.student_id}`).sort(), ['l1|s1', 'l2|s2']);
});

test('acota la nota (0-100, nulo si no es número) y el estado (texto corto, «completed» por omisión)', { skip }, () => {
  const by = (patch) => mod.sanitizeCompletions([c(patch)], ctx())[0];
  assert.equal(by({ score: 500 }).score, 100);
  assert.equal(by({ score: -3 }).score, 0);
  assert.equal(by({ score: 'mucho' }).score, null);
  assert.equal(by({ score: null }).score, null);
  assert.equal(by({ status: undefined }).status, 'completed');
  assert.equal(by({ status: 'x'.repeat(100) }).status, 'completed');
  assert.equal(by({ status: 'incomplete' }).status, 'incomplete');
});

test('el mismo par lección-estudiante dos veces en el lote se junta en una fila (mejor nota; completado gana)', { skip }, () => {
  const out = mod.sanitizeCompletions([c({ score: 50, status: 'incomplete' }), c({ score: 90, status: 'completed' }), c({ score: 70, status: 'incomplete' })], ctx());
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].score, out[0].status], [90, 'completed']);
  const nulls = mod.sanitizeCompletions([c({ score: null, status: null }), c({ score: 60, status: 'incomplete' })], ctx());
  assert.deepEqual([nulls[0].score, nulls[0].status], [60, 'completed'], 'sin estado = completado (como ya hacía la subida del nodo)');
});
