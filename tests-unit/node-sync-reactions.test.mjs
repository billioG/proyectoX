// Lógica pura de las reacciones que sube un nodo (supabase/functions/node-sync/validators.ts).
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/validators.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /validators\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e; // en Node 22 falta el archivo: fallo real
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const ctx = (over = {}) => ({ studentIds: new Set(['s1', 's2']), ...over });
const ev = (patch = {}) => ({ student_id: 's1', project_id: 27, reaction: 'like', ...patch });
const bad = (patch, c) => { const r = mod.validateReactionEvent(ev(patch), c || ctx()); assert.equal(r.ok, false, JSON.stringify(patch)); assert.ok(r.error); };

test('las cinco reacciones acordadas', { skip }, () => {
  assert.deepEqual([...mod.REACTIONS], ['like', 'excelente', 'wow', 'destacar', 'animo']);
});

test('validateReactionEvent acepta cada reacción y también null (quitar)', { skip }, () => {
  for (const reaction of [...mod.REACTIONS, null]) {
    const r = mod.validateReactionEvent(ev({ reaction }), ctx());
    assert.equal(r.ok, true, String(reaction));
    assert.deepEqual(r.event, { student_id: 's1', project_id: 27, reaction });
  }
});

test('validateReactionEvent rechaza estudiante ajeno, proyecto inválido y reacción inventada', { skip }, () => {
  bad({ student_id: 'ajeno' });
  bad({ student_id: 5 });
  bad({ project_id: 0 });
  bad({ project_id: -3 });
  bad({ project_id: 1.5 });
  bad({ project_id: '27' });
  bad({ project_id: undefined });
  bad({ reaction: 'love' });
  bad({ reaction: '' });
  bad({ reaction: 5 });
  bad({ reaction: undefined });
});

test('validateReactionEvent acepta un project_id enorme pero entero seguro y rechaza uno que no lo es', { skip }, () => {
  assert.equal(mod.validateReactionEvent(ev({ project_id: 2147483647 }), ctx()).ok, true);
  bad({ project_id: 2147483648 });          // fuera del integer de Postgres
  bad({ project_id: Number.MAX_SAFE_INTEGER + 2 });
});
