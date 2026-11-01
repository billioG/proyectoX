// Prácticas (Centro de Juego -> Práctica) hechas en un nodo escolar: se validan con las mismas reglas de log_practice
// (migrations/practice-progress.sql) y se guardan en practice_results. Lógica pura (sin acceso a la base) para probarla.

const GAME_COMPETENCY: Record<string, string> = {
  quiz: 'lectura', timed_math: 'matematica', debug: 'pensamiento', hangman: 'lenguaje', spelling: 'lenguaje',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 3600_000;

export type PracticeRow = {
  student_id: string; client_ref: string; game: string; competency: string; topic: string | null; correct: number; total: number;
  score: number; duration_ms: number | null; source: 'ai' | 'bank'; played_at: string;
};

/** `raw` = { student_id, args: { p_game, p_topic, p_correct, p_total, p_duration_ms, p_source, p_client_ref, p_played_at } }. */
export function validatePracticeEvent(
  raw: any,
  ctx: { studentIds: Set<string>; now: number },
): { ok: true; row: PracticeRow } | { ok: false; error: string } {
  const a = raw?.args;
  const studentId = typeof raw?.student_id === 'string' ? raw.student_id : '';
  if (!studentId || !ctx.studentIds.has(studentId)) return { ok: false, error: 'Estudiante no encontrado en esta escuela' };
  if (!a || typeof a !== 'object') return { ok: false, error: 'Falta el resultado' };
  const game = String(a.p_game ?? '');
  if (!(game in GAME_COMPETENCY)) return { ok: false, error: 'Juego no válido' };
  const total = a.p_total, correct = a.p_correct;
  if (!Number.isInteger(total) || total < 1 || total > 50 || !Number.isInteger(correct) || correct < 0 || correct > total) {
    return { ok: false, error: 'Resultado no válido' };
  }
  if (typeof a.p_client_ref !== 'string' || !UUID.test(a.p_client_ref)) return { ok: false, error: 'Falta la referencia del registro' };
  const duration = a.p_duration_ms ?? null;
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 3_600_000)) return { ok: false, error: 'Duración no válida' };

  // La práctica sin internet se sube después: la hora del dispositivo vale solo si es razonable (hasta 30 días atrás, no del futuro).
  const asked = typeof a.p_played_at === 'string' ? Date.parse(a.p_played_at) : NaN;
  const played = Number.isNaN(asked) || asked > ctx.now + 5 * 60_000 || asked < ctx.now - 30 * DAY_MS ? ctx.now : asked;

  return {
    ok: true,
    row: {
      student_id: studentId, client_ref: a.p_client_ref, game, competency: GAME_COMPETENCY[game],
      topic: typeof a.p_topic === 'string' ? a.p_topic.slice(0, 200) : null,
      correct, total, score: Math.round((correct / total) * 1000) / 1000, duration_ms: duration,
      source: a.p_source === 'bank' ? 'bank' : 'ai', played_at: new Date(played).toISOString(),
    },
  };
}
