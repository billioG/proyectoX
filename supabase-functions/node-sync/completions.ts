// Avances de lecciones que sube un nodo escolar. Lógica pura (sin acceso a la base) para probarla.
// Un solo avance inválido (lección que no existe, tipo raro) o repetido en el lote hace fallar el upsert COMPLETO y con él
// toda la sincronización de la escuela: aquí se descarta lo inválido y se junta lo repetido antes de tocar la base.

export type CompletionRow = { lesson_id: string; student_id: string; score: number | null; status: string };

export function sanitizeCompletions(
  raw: unknown,
  ctx: { studentIds: Set<string>; lessonIds: Set<string> },
): CompletionRow[] {
  const byKey = new Map<string, CompletionRow>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const c: any = item;
    if (!c || typeof c.lesson_id !== 'string' || typeof c.student_id !== 'string') continue;
    if (!ctx.studentIds.has(c.student_id) || !ctx.lessonIds.has(c.lesson_id)) continue;
    const score = typeof c.score === 'number' && Number.isFinite(c.score) ? Math.min(100, Math.max(0, c.score)) : null;
    const status = typeof c.status === 'string' && c.status.length > 0 && c.status.length <= 30 ? c.status : 'completed';
    const key = `${c.lesson_id}|${c.student_id}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { lesson_id: c.lesson_id, student_id: c.student_id, score, status }); continue; }
    // Mismo par repetido: gana la mejor nota y «completed» sobre lo demás.
    prev.score = score === null ? prev.score : prev.score === null ? score : Math.max(prev.score, score);
    if (prev.status !== 'completed' && status === 'completed') prev.status = 'completed';
    else if (prev.status !== 'completed' && c.status != null) prev.status = status;
  }
  return [...byKey.values()];
}
