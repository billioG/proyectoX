// Ahorcado 1 contra 1 jugado EN EL NODO sin internet. El nodo sube una «foto» del duelo (la última gana): el reto, la palabra de cada jugador (del banco fijo)
// y las letras jugadas. Lógica pura (sin red ni base de datos) para probarla: aquí solo se valida la FORMA; la función SQL apply_node_hangman_duel
// (migrations/node-hangman-duel.sql) comprueba que las palabras sean del banco, recalcula acierto y errores con las letras, y el disparador de la nube liquida.
// Pruebas: tests-unit/node-sync-hangman.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

export const HANGMAN_FN = 'hangman_duel';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['pending', 'rejected', 'cancelled', 'active', 'completed'];
const MAX_TIME_MS = 3_600_000;

export const isHangmanFn = (fn: unknown): boolean => fn === HANGMAN_FN;

const isoOrNull = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined;
};
const wordOrNull = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  return typeof v === 'string' && /^[A-Za-z]{2,30}$/.test(v) ? v : undefined;
};
const textOrNull = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  return typeof v === 'string' && v.length <= 300 ? v : undefined;
};

export function validateHangmanEvent(raw: any, ctx: { studentIds: Set<string> }): { ok: true; snapshot: Record<string, unknown> } | { ok: false; error: string } {
  const a = raw?.args;
  if (!raw || raw.fn !== HANGMAN_FN || !a || typeof a !== 'object') return { ok: false, error: 'Acción no soportada' };
  if (typeof a.id !== 'string' || !UUID.test(a.id)) return { ok: false, error: 'Desafío inválido' };
  for (const k of ['challenger_id', 'opponent_id']) if (typeof a[k] !== 'string' || !UUID.test(a[k]) || !ctx.studentIds.has(a[k])) return { ok: false, error: 'Los jugadores no son de la escuela de este nodo' };
  if (a.challenger_id === a.opponent_id || raw.student_id !== a.challenger_id) return { ok: false, error: 'Desafío inválido' };
  if (!Number.isInteger(a.wager_gems) || a.wager_gems < 0 || a.wager_gems > 100000) return { ok: false, error: 'Apuesta inválida' };
  if (typeof a.topic !== 'string' || a.topic.length < 1 || a.topic.length > 80) return { ok: false, error: 'Tema inválido' };
  if (typeof a.status !== 'string' || !STATUSES.includes(a.status)) return { ok: false, error: 'Estado inválido' };
  const created = isoOrNull(a.created_at), cs = isoOrNull(a.challenger_started_at), os = isoOrNull(a.opponent_started_at);
  if (created === undefined || cs === undefined || os === undefined) return { ok: false, error: 'Fecha inválida' };
  const word = wordOrNull(a.word), wordB = wordOrNull(a.word_b), hint = textOrNull(a.hint), hintB = textOrNull(a.hint_b);
  if (word === undefined || wordB === undefined || hint === undefined || hintB === undefined) return { ok: false, error: 'Palabra inválida' };
  const results: Array<Record<string, unknown>> = [];
  if (a.results != null) {
    if (!Array.isArray(a.results) || a.results.length > 2) return { ok: false, error: 'Resultados inválidos' };
    for (const r of a.results) {
      if (!r || (r.student_id !== a.challenger_id && r.student_id !== a.opponent_id) || !Number.isInteger(r.time_ms) || r.time_ms < 0 || r.time_ms > MAX_TIME_MS) return { ok: false, error: 'Resultado inválido' };
      if (!Array.isArray(r.guessed) || r.guessed.length > 60 || r.guessed.some((x: unknown) => typeof x !== 'string' || !/^[a-zA-Z]$/.test(x))) return { ok: false, error: 'Letras inválidas' };
      const at = isoOrNull(r.completed_at);
      if (at === undefined) return { ok: false, error: 'Fecha inválida' };
      results.push({ student_id: r.student_id, guessed: r.guessed, time_ms: r.time_ms, completed_at: at });
    }
    if (results.length === 2 && results[0].student_id === results[1].student_id) return { ok: false, error: 'Resultado inválido' };
  }
  if (results.length && (!word || (a.status !== 'active' && a.status !== 'completed'))) return { ok: false, error: 'Resultado inválido' };
  return {
    ok: true,
    snapshot: {
      id: a.id, challenger_id: a.challenger_id, opponent_id: a.opponent_id, wager_gems: a.wager_gems, topic: a.topic, status: a.status, created_at: created,
      word, hint, word_b: wordB, hint_b: hintB, challenger_started_at: cs, opponent_started_at: os, results,
    },
  };
}
