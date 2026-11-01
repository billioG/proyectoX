// Lógica PURA del XP que maneja la función de la nube node-sync (sin red ni base de datos, para poder
// probarla). La usa index.ts; las pruebas están en tests-unit/node-sync-xp.test.mjs.
// TypeScript sin sintaxis no borrable (enum, namespace...) para que Node 22 también la importe.
// Las constantes (10 XP por lección, premios del cofre) viven también en migrations/xp-events.sql:
// si se cambian aquí, cámbialas allá.

export const XP_PER_LESSON = 10;

/** Los tres premios del cofre diario (igual que claim_daily_chest). */
export const CHEST_PRIZES: ReadonlyArray<{ xp: number; gems: number }> = [
  { xp: 20, gems: 5 },
  { xp: 50, gems: 15 },
  { xp: 100, gems: 50 },
];

const DAY_MS = 86400_000;
const MAX_DAYS_BACK = 14; // un nodo sin internet (o que sincroniza por USB) puede tardar: igual que apply_node_chest
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Fecha YYYY-MM-DD real (rechaza 2026-02-30).
function dayNumber(day: string): number | null {
  if (!ISO_DAY.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === day ? Math.round(t / DAY_MS) : null;
}

type Fail = { ok: false; error: string };

export function validateXpEvent(
  ev: { kind?: unknown; student_id?: unknown; ref?: unknown; xp?: unknown; gems?: unknown },
  ctx: { studentIds: Set<string>; today: string },
): { ok: true; event: { student_id: string; ref: string; xp: number; gems: number } } | Fail {
  if (ev.kind !== 'chest') return { ok: false, error: 'Tipo de evento no permitido.' };
  if (typeof ev.student_id !== 'string' || !ctx.studentIds.has(ev.student_id)) return { ok: false, error: 'El estudiante no es de la escuela de este nodo.' };
  const day = typeof ev.ref === 'string' ? dayNumber(ev.ref) : null;
  const today = dayNumber(ctx.today);
  if (day === null || today === null) return { ok: false, error: 'Fecha del cofre inválida.' };
  if (day > today) return { ok: false, error: 'El cofre no puede ser de una fecha futura.' };
  if (day < today - MAX_DAYS_BACK) return { ok: false, error: 'El cofre es demasiado viejo.' };
  const prize = CHEST_PRIZES.find((p) => p.xp === ev.xp && p.gems === ev.gems);
  if (!prize) return { ok: false, error: 'Premio del cofre inválido.' };
  return { ok: true, event: { student_id: ev.student_id, ref: ev.ref as string, xp: prize.xp, gems: prize.gems } };
}

/**
 * XP total y gemas de cada estudiante, con la misma fórmula que calculateStudentXP de la app:
 * proyectos×50 + votos×10 + suma de notas + insignias×100 + students.xp. Los proyectos de un estudiante
 * son los suyos y los de sus equipos (sin contar dos veces el mismo).
 */
export function computeStudentXp(input: {
  students: Array<{ id: string; xp?: number | null; gems?: number | null }>;
  projects: Array<{ id: string; user_id: string; group_id: number | null; score: number | null; votes: number | null }>;
  memberships: Array<{ group_id: number; student_id: string }>;
  badgeCounts: Map<string, number>;
}): Map<string, { xp_total: number; gems: number }> {
  const groupsOf = new Map<string, Set<number>>();
  for (const m of input.memberships) {
    if (!groupsOf.has(m.student_id)) groupsOf.set(m.student_id, new Set());
    groupsOf.get(m.student_id)!.add(m.group_id);
  }
  const out = new Map<string, { xp_total: number; gems: number }>();
  for (const s of input.students) {
    const groups = groupsOf.get(s.id);
    const seen = new Set<string>();
    let projects = 0, votes = 0, score = 0;
    for (const p of input.projects) {
      const mine = p.user_id === s.id || (p.group_id !== null && p.group_id !== undefined && groups?.has(p.group_id));
      if (!mine || seen.has(p.id)) continue;
      seen.add(p.id);
      projects += 1;
      votes += Number(p.votes) || 0;
      score += Number(p.score) || 0;
    }
    const badges = input.badgeCounts.get(s.id) || 0;
    out.set(s.id, { xp_total: projects * 50 + votes * 10 + score + badges * 100 + (Number(s.xp) || 0), gems: Number(s.gems) || 0 });
  }
  return out;
}
