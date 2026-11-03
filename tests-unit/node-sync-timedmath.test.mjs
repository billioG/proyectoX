// Retos Contrarreloj que sube un nodo (supabase/functions/node-sync/duels.ts): solo se valida la forma de la foto; la nube recalcula los puntajes.
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
const set = (n) => Array.from({ length: n }, (_, i) => ({ question: `${i + 1} + ${i + 2}`, answer: 2 * i + 3 }));
const snap = (over = {}) => ({ id: D, challenger_id: A, opponent_id: B, wager_gems: 10, problem_count: 10, status: 'completed', winner_id: A, created_at: '2026-11-02T15:00:00.000Z',
  resolved_at: '2026-11-02T15:01:00.000Z', problems: set(10), problems_b: set(10), challenger_started_at: '2026-11-02T15:00:10.000Z', opponent_started_at: '2026-11-02T15:00:20.000Z',
  results: [{ student_id: A, answers: ['3', '5'], score: 99, time_ms: 20000, completed_at: '2026-11-02T15:00:30.000Z' }, { student_id: B, answers: [], score: 99, time_ms: 25000, completed_at: '2026-11-02T15:00:45.000Z' }],
  settle: { gems: { [A]: 10, [B]: -10 }, xp: { [A]: 20, [B]: 5 } }, ...over });
const ev = (args, sid = A) => ({ seq: 1, fn: 'timed_math_duel', student_id: sid, args });

test('acepta la foto de un duelo y la deja limpia: sin el puntaje ni la liquidación del nodo (la nube los recalcula)', { skip }, () => {
  const r = mod.validateTimedMathEvent(ev(snap()), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.snapshot).sort(), ['challenger_id', 'challenger_started_at', 'created_at', 'id', 'opponent_id', 'opponent_started_at', 'problem_count', 'problems', 'problems_b', 'results', 'status', 'wager_gems']);
  assert.deepEqual(r.snapshot.results.map((x) => Object.keys(x).sort()), [['answers', 'completed_at', 'student_id', 'time_ms'], ['answers', 'completed_at', 'student_id', 'time_ms']]);
  assert.equal(mod.validateTimedMathEvent(ev(snap({ status: 'pending', problems: null, problems_b: null, results: [], challenger_started_at: null, opponent_started_at: null })), ctx).ok, true);
  assert.equal(mod.isTimedMathFn('timed_math_duel'), true);
  assert.equal(mod.isTimedMathFn('log_practice'), false);
});

test('rechaza lo raro: jugadores ajenos, apuestas malas, problemas mal formados, resultados sin partida o repetidos (nada llega a la base)', { skip }, () => {
  const bad = [
    ev(snap(), B), ev(snap({ opponent_id: 'otro' })), ev(snap({ opponent_id: A })), ev(snap({ id: 'x' })), ev(snap({ wager_gems: -1 })), ev(snap({ wager_gems: 1.5 })), ev(snap({ wager_gems: 1e9 })),
    ev(snap({ problem_count: 3 })), ev(snap({ status: 'ganado' })), ev(snap({ problems: set(9) })), ev(snap({ problems_b: [{ question: 'x', answer: 'y' }, ...set(9)] })),
    ev(snap({ problems: set(10).map((p, i) => (i ? p : { ...p, answer: Infinity })) })), ev(snap({ created_at: 'ayer' })), ev(snap({ challenger_started_at: 5 })),
    ev(snap({ status: 'pending' })), // resultados sin que el duelo esté activo
    ev(snap({ problems: null })), ev(snap({ results: [snap().results[0], snap().results[0]] })),
    ev(snap({ results: [{ ...snap().results[0], student_id: 'otro' }] })), ev(snap({ results: [{ ...snap().results[0], time_ms: -5 }] })), ev(snap({ results: [{ ...snap().results[0], time_ms: 9e9 }] })),
    ev(snap({ results: [{ ...snap().results[0], answers: [1, 2] }] })), ev(snap({ results: [{ ...snap().results[0], answers: Array(30).fill('1') }] })), ev(snap({ results: [{}, {}, {}] })),
    { seq: 1, fn: 'timed_math_duel', student_id: A }, { seq: 1, fn: 'drop_table', student_id: A, args: snap() }, null,
  ];
  for (const b of bad) assert.equal(mod.validateTimedMathEvent(b, ctx).ok, false, JSON.stringify(b)?.slice(0, 120));
});
