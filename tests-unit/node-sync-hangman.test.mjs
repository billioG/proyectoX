// Ahorcado que sube un nodo (supabase/functions/node-sync/duels.ts): solo se valida la forma de la foto; la nube comprueba las palabras y recalcula.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/duels.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /duels\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', D = '11111111-1111-1111-1111-111111111111';
const ctx = { studentIds: new Set([A, B]) };
const res = (sid, over = {}) => ({ student_id: sid, guessed: ['q', 'u'], time_ms: 1000, completed_at: '2026-11-02T15:00:30.000Z', solved: true, wrong_guesses: 99, ...over });
const snap = (over = {}) => ({ id: D, challenger_id: A, opponent_id: B, wager_gems: 10, topic: 'Vida silvestre de Guatemala', status: 'completed', winner_id: A, created_at: '2026-11-02T15:00:00.000Z',
  word: 'QUETZAL', hint: 'Ave nacional', word_b: 'JAGUAR', hint_b: 'Felino', challenger_started_at: '2026-11-02T15:00:10.000Z', opponent_started_at: '2026-11-02T15:00:20.000Z',
  results: [res(A), res(B)], settle: { gems: { [A]: 10 } }, ...over });
const ev = (args, sid = A) => ({ seq: 1, fn: 'hangman_duel', student_id: sid, args });

test('acepta la foto de un duelo y la deja limpia: sin el acierto ni la liquidación del nodo (la nube los recalcula)', { skip }, () => {
  const r = mod.validateHangmanEvent(ev(snap()), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.snapshot).sort(), ['challenger_id', 'challenger_started_at', 'created_at', 'hint', 'hint_b', 'id', 'opponent_id', 'opponent_started_at', 'results', 'status', 'topic', 'wager_gems', 'word', 'word_b']);
  assert.deepEqual(r.snapshot.results.map((x) => Object.keys(x).sort()), [['completed_at', 'guessed', 'student_id', 'time_ms'], ['completed_at', 'guessed', 'student_id', 'time_ms']]);
  assert.equal(mod.validateHangmanEvent(ev(snap({ status: 'pending', word: null, word_b: null, hint: null, hint_b: null, results: [], challenger_started_at: null, opponent_started_at: null })), ctx).ok, true);
  assert.equal(mod.isHangmanFn('hangman_duel'), true);
  assert.equal(mod.isHangmanFn('timed_math_duel'), false);
});

test('rechaza lo raro: jugadores ajenos, apuestas malas, palabras con símbolos, letras que no son letras, resultados sin partida o repetidos', { skip }, () => {
  const bad = [
    ev(snap(), B), ev(snap({ opponent_id: 'otro' })), ev(snap({ opponent_id: A })), ev(snap({ id: 'x' })), ev(snap({ wager_gems: -1 })), ev(snap({ wager_gems: 1e9 })),
    ev(snap({ topic: '' })), ev(snap({ topic: 'x'.repeat(81) })), ev(snap({ status: 'ganado' })), ev(snap({ word: 'QUE TZAL' })), ev(snap({ word_b: "JAGUAR'; drop" })), ev(snap({ hint: 5 })),
    ev(snap({ created_at: 'ayer' })), ev(snap({ status: 'pending' })), ev(snap({ word: null })), ev(snap({ results: [res(A), res(A)] })), ev(snap({ results: [res('otro')] })),
    ev(snap({ results: [res(A, { time_ms: -5 })] })), ev(snap({ results: [res(A, { time_ms: 9e9 })] })), ev(snap({ results: [res(A, { guessed: ['qq'] })] })),
    ev(snap({ results: [res(A, { guessed: [1] })] })), ev(snap({ results: [res(A, { guessed: Array(61).fill('a') })] })), ev(snap({ results: [{}, {}, {}] })),
    { seq: 1, fn: 'hangman_duel', student_id: A }, { seq: 1, fn: 'drop_table', student_id: A, args: snap() }, null,
  ];
  for (const b of bad) assert.equal(mod.validateHangmanEvent(b, ctx).ok, false, JSON.stringify(b)?.slice(0, 120));
});
