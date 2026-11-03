// Prácticas que sube un nodo (supabase/functions/node-sync/validators.ts): mismas reglas que log_practice en la nube.
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

const NOW = Date.parse('2026-11-02T12:00:00Z');
const REF = '123e4567-e89b-42d3-a456-426614174000';
const ctx = () => ({ studentIds: new Set(['s1']), now: NOW });
const ev = (patch = {}) => ({ student_id: 's1', args: { p_game: 'quiz', p_topic: 'Fracciones', p_correct: 4, p_total: 5, p_duration_ms: 42000, p_source: 'bank', p_client_ref: REF, p_played_at: '2026-11-02T11:00:00Z' }, ...patch });
const withArgs = (a) => ev({ args: { ...ev().args, ...a } });
const bad = (e, c) => { const r = mod.validatePracticeEvent(e, c || ctx()); assert.equal(r.ok, false, JSON.stringify(e)); assert.ok(r.error); };

test('un resultado válido se convierte en la fila de practice_results, con competencia y puntaje calculados aquí', { skip }, () => {
  const r = mod.validatePracticeEvent(ev(), ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.row, {
    student_id: 's1', client_ref: REF, game: 'quiz', competency: 'lectura', topic: 'Fracciones', correct: 4, total: 5, score: 0.8,
    duration_ms: 42000, source: 'bank', played_at: '2026-11-02T11:00:00.000Z',
  });
});

test('la competencia de cada juego es la de la nube', { skip }, () => {
  const comp = (game) => mod.validatePracticeEvent(withArgs({ p_game: game }), ctx()).row.competency;
  assert.deepEqual(['quiz', 'timed_math', 'debug', 'hangman', 'spelling'].map(comp), ['lectura', 'matematica', 'pensamiento', 'lenguaje', 'lenguaje']);
});

test('rechaza lo que la nube rechaza: estudiante ajeno, juego, total, aciertos, referencia', { skip }, () => {
  bad(ev({ student_id: 'otro' }));
  bad(ev({ student_id: undefined }));
  bad(withArgs({ p_game: 'ruleta' }));
  bad(withArgs({ p_total: 0 }));
  bad(withArgs({ p_total: 51 }));
  bad(withArgs({ p_correct: 6 }));
  bad(withArgs({ p_correct: -1 }));
  bad(withArgs({ p_correct: 1.5 }));
  bad(withArgs({ p_client_ref: 'no-es-uuid' }));
  bad(withArgs({ p_client_ref: undefined }));
  bad(null);
  bad({ student_id: 's1' });
  bad(withArgs({ p_duration_ms: 3_600_001 }));
});

test('la hora del dispositivo solo vale si es razonable; la fuente y el tema se normalizan', { skip }, () => {
  const played = (iso) => mod.validatePracticeEvent(withArgs({ p_played_at: iso }), ctx()).row.played_at;
  assert.equal(played('2026-11-02T13:00:00Z'), '2026-11-02T12:00:00.000Z', 'del futuro: ahora');
  assert.equal(played('2026-09-01T00:00:00Z'), '2026-11-02T12:00:00.000Z', 'de hace más de 30 días: ahora');
  assert.equal(played(undefined), '2026-11-02T12:00:00.000Z');
  assert.equal(played('basura'), '2026-11-02T12:00:00.000Z');
  assert.equal(mod.validatePracticeEvent(withArgs({ p_source: 'ai' }), ctx()).row.source, 'ai');
  assert.equal(mod.validatePracticeEvent(withArgs({ p_source: 'x' }), ctx()).row.source, 'ai');
  assert.equal(mod.validatePracticeEvent(withArgs({ p_topic: 'x'.repeat(500) }), ctx()).row.topic.length, 200);
  assert.equal(mod.validatePracticeEvent(withArgs({ p_topic: null }), ctx()).row.topic, null);
  assert.equal(mod.validatePracticeEvent(withArgs({ p_duration_ms: null }), ctx()).row.duration_ms, null);
});
