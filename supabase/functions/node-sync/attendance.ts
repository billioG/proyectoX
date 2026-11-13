// Asistencia que un docente pasó EN EL NODO sin internet (lógica pura, sin red ni base de datos, para probarla). Mismas reglas que la
// nube (public.attendance: el docente inserta lo suyo) más lo que el nodo ya exige: estudiante de la escuela del nodo, de una clase a la
// que el docente está asignado, fecha reciente y estado válido. El nodo no es de confianza total: se valida otra vez.
// Pruebas: tests-unit/node-sync-attendance.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

const STATUSES = ['present', 'absent', 'late', 'excused'];
/** Motivo de la inasistencia (migrations/attendance-absence-reason.sql). Sin motivo = sin aviso. */
export const ABSENCE_REASONS = ['sin_aviso', 'enfermedad', 'permiso', 'otro'];
const DAY_MS = 24 * 3600_000;

type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };

export interface AttendanceOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface AttendanceCtx {
  schoolCode: string;
  now: number;
  /** estudiantes de la escuela con su clase */
  students: Map<string, { grade: string; section: string }>;
  assignments: Assignment[];
  adminIds: Set<string>;
}
export type AttendanceAction = { seq: number; row: Record<string, unknown> };
export type AttendanceResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

export const isAttendanceTable = (t: unknown): boolean => t === 'attendance';

/** Valida EN ORDEN lo que mandó el nodo; un registro inválido no frena a los demás. Siempre es un upsert por (estudiante, día). */
export function planAttendanceOps(ops: AttendanceOp[], ctx: AttendanceCtx): { actions: AttendanceAction[]; results: AttendanceResult[] } {
  const actions: AttendanceAction[] = [];
  const results: AttendanceResult[] = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const no = (error: string) => { results.push({ seq, ok: false, permanent: true, error }); };
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    if (raw.op !== 'insert' && raw.op !== 'update') { no('La asistencia no se borra desde el nodo.'); continue; }
    const student = typeof row.student_id === 'string' ? ctx.students.get(row.student_id) : undefined;
    if (!student) { no('El estudiante no es de la escuela de este nodo.'); continue; }
    if (row.school_code !== ctx.schoolCode || row.grade !== student.grade || row.section !== student.section) { no('La clase no coincide con la del estudiante.'); continue; }
    const teacher = typeof row.teacher_id === 'string' ? row.teacher_id : '';
    const allowed = ctx.adminIds.has(teacher) || ctx.assignments.some((a) => a.teacher_id === teacher && a.school_code === ctx.schoolCode && a.grade === student.grade && a.section === student.section);
    if (!allowed) { no('El docente no está asignado a esa clase.'); continue; }
    if (!STATUSES.includes(row.status)) { no('Estado de asistencia inválido.'); continue; }
    const t = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? Date.parse(`${row.date}T00:00:00Z`) : NaN;
    if (Number.isNaN(t) || t > ctx.now + DAY_MS || t < ctx.now - 45 * DAY_MS) { no('Fecha de asistencia inválida o muy antigua.'); continue; }
    if (row.absence_reason != null && !(row.status === 'absent' && ABSENCE_REASONS.includes(row.absence_reason))) { no('Motivo de inasistencia inválido.'); continue; }
    if (typeof row.time !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(row.time)) { no('Hora inválida.'); continue; }
    results.push({ seq, ok: true });
    actions.push({ seq, row: { student_id: row.student_id, teacher_id: teacher, school_code: ctx.schoolCode, grade: student.grade, section: student.section, date: row.date, time: row.time, status: row.status, ...(row.status === 'absent' && row.absence_reason ? { absence_reason: row.absence_reason } : {}) } });
  }
  return { actions, results };
}
