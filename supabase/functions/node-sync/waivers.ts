// Solicitudes de permiso de asistencia («hoy no pasé lista por...») que un docente hizo EN EL NODO sin internet (lógica pura, sin red ni base de
// datos, para probarla). La nube las deja siempre «pendientes»: el administrador las aprueba en línea. Pruebas: tests-unit/node-sync-waivers.test.mjs.
// TypeScript sin sintaxis no borrable (Node 22 también lo importa).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 3600_000;
type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };

export interface WaiverOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface WaiverCtx { schoolCode: string; now: number; assignments: Assignment[]; adminIds: Set<string> }
export type WaiverAction = { seq: number; row: Record<string, unknown> };
export type WaiverResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

export const isWaiverTable = (t: unknown): boolean => t === 'attendance_waivers';
const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();

export function planWaiverOps(ops: WaiverOp[], ctx: WaiverCtx): { actions: WaiverAction[]; results: WaiverResult[] } {
  const actions: WaiverAction[] = [];
  const results: WaiverResult[] = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const no = (error: string) => { results.push({ seq, ok: false, permanent: true, error }); };
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    const id = typeof raw.pk === 'string' ? raw.pk : '';
    if (raw.op === 'delete') { results.push({ seq, ok: true }); continue; } // borrar lo ya enviado se hace en línea
    if (raw.op !== 'insert' && raw.op !== 'update') { no('Cambio no permitido.'); continue; }
    if (!UUID.test(id)) { no('Identificador inválido.'); continue; }
    const teacher = typeof row.teacher_id === 'string' ? row.teacher_id : '';
    const mine = ctx.assignments.filter((a) => a.teacher_id === teacher && a.school_code === ctx.schoolCode);
    if (!ctx.adminIds.has(teacher) && !mine.length) { no('El docente no es de la escuela de este nodo.'); continue; }
    if (row.school_code !== ctx.schoolCode) { no('La escuela no es la de este nodo.'); continue; }
    if (row.grade != null || row.section != null) {
      if (typeof row.grade !== 'string' || typeof row.section !== 'string' || !(ctx.adminIds.has(teacher) || mine.some((a) => a.grade === row.grade && a.section === row.section))) { no('El docente no está asignado a esa clase.'); continue; }
    }
    const reason = typeof row.reason === 'string' ? clean(row.reason) : '';
    if (!reason || reason.length > 1000) { no('El motivo debe tener entre 1 y 1000 caracteres.'); continue; }
    const t = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? Date.parse(`${row.date}T00:00:00Z`) : NaN;
    if (Number.isNaN(t) || t > ctx.now + DAY_MS || t < ctx.now - 45 * DAY_MS) { no('Fecha inválida o muy antigua.'); continue; }
    results.push({ seq, ok: true });
    actions.push({ seq, row: { id, teacher_id: teacher, date: row.date, reason, school_code: ctx.schoolCode, grade: row.grade ?? null, section: row.section ?? null, status: 'pending' } });
  }
  return { actions, results };
}
