// Retos «Contrarreloj» jugados EN EL NODO sin internet. El nodo sube una «foto» del duelo (la última gana): el reto, los problemas de cada jugador y las
// respuestas jugadas. Lógica pura (sin red ni base de datos) para probarla: aquí solo se valida la FORMA; la función SQL apply_node_timed_math_duel
// (migrations/node-timed-math-duel.sql) recalcula los puntajes con las respuestas y deja que el disparador de la nube reparta gemas y XP como siempre.
// Pruebas: tests-unit/node-sync-timedmath.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

export const TIMED_MATH_FN = 'timed_math_duel';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['pending', 'rejected', 'cancelled', 'active', 'completed'];
const MAX_TIME_MS = 3_600_000;

export const isTimedMathFn = (fn: unknown): boolean => fn === TIMED_MATH_FN;

const isoOrNull = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined;
};
const problemSet = (v: unknown, count: number): Array<{ question: string; answer: number }> | null | undefined => {
  if (v == null) return null;
  if (!Array.isArray(v) || v.length !== count) return undefined;
  const out: Array<{ question: string; answer: number }> = [];
  for (const p of v) {
    if (!p || typeof p.question !== 'string' || p.question.length < 1 || p.question.length > 300 || typeof p.answer !== 'number' || !Number.isFinite(p.answer) || Math.abs(p.answer) > 1e9) return undefined;
    out.push({ question: p.question, answer: p.answer });
  }
  return out;
};

export function validateTimedMathEvent(raw: any, ctx: { studentIds: Set<string> }): { ok: true; snapshot: Record<string, unknown> } | { ok: false; error: string } {
  const a = raw?.args;
  if (!raw || raw.fn !== TIMED_MATH_FN || !a || typeof a !== 'object') return { ok: false, error: 'Acción no soportada' };
  if (typeof a.id !== 'string' || !UUID.test(a.id)) return { ok: false, error: 'Desafío inválido' };
  for (const k of ['challenger_id', 'opponent_id']) if (typeof a[k] !== 'string' || !UUID.test(a[k]) || !ctx.studentIds.has(a[k])) return { ok: false, error: 'Los jugadores no son de la escuela de este nodo' };
  if (a.challenger_id === a.opponent_id || raw.student_id !== a.challenger_id) return { ok: false, error: 'Desafío inválido' };
  if (!Number.isInteger(a.wager_gems) || a.wager_gems < 0 || a.wager_gems > 100000) return { ok: false, error: 'Apuesta inválida' };
  if (a.problem_count !== 10) return { ok: false, error: 'Desafío inválido' };
  if (typeof a.status !== 'string' || !STATUSES.includes(a.status)) return { ok: false, error: 'Estado inválido' };
  const created = isoOrNull(a.created_at), cs = isoOrNull(a.challenger_started_at), os = isoOrNull(a.opponent_started_at);
  if (created === undefined || cs === undefined || os === undefined) return { ok: false, error: 'Fecha inválida' };
  const problems = problemSet(a.problems, a.problem_count), problemsB = problemSet(a.problems_b, a.problem_count);
  if (problems === undefined || problemsB === undefined) return { ok: false, error: 'Problemas inválidos' };
  const results: Array<Record<string, unknown>> = [];
  if (a.results != null) {
    if (!Array.isArray(a.results) || a.results.length > 2) return { ok: false, error: 'Resultados inválidos' };
    for (const r of a.results) {
      if (!r || (r.student_id !== a.challenger_id && r.student_id !== a.opponent_id) || !Number.isInteger(r.time_ms) || r.time_ms < 0 || r.time_ms > MAX_TIME_MS) return { ok: false, error: 'Resultado inválido' };
      if (!Array.isArray(r.answers) || r.answers.length > 25 || r.answers.some((x: unknown) => typeof x !== 'string' || x.length > 30)) return { ok: false, error: 'Respuestas inválidas' };
      const at = isoOrNull(r.completed_at);
      if (at === undefined) return { ok: false, error: 'Fecha inválida' };
      results.push({ student_id: r.student_id, answers: r.answers, time_ms: r.time_ms, completed_at: at });
    }
    if (results.length === 2 && results[0].student_id === results[1].student_id) return { ok: false, error: 'Resultado inválido' };
  }
  // Sin problemas no hay nada que haber jugado, y una partida necesita que el jugador haya arrancado.
  if (results.length && (!problems || (a.status !== 'active' && a.status !== 'completed'))) return { ok: false, error: 'Resultado inválido' };
  return {
    ok: true,
    snapshot: {
      id: a.id, challenger_id: a.challenger_id, opponent_id: a.opponent_id, wager_gems: a.wager_gems, problem_count: a.problem_count, status: a.status,
      created_at: created, problems, problems_b: problemsB, challenger_started_at: cs, opponent_started_at: os, results,
    },
  };
}
