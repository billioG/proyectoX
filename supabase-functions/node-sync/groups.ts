// Equipos (groups) y sus miembros (group_members) que un docente armó EN EL NODO sin internet (lógica pura, sin red ni base de datos, para
// probarla). Lo que se crea en el nodo trae un id entero en un rango reservado (1 500 000 000 a 2 099 999 999) que no choca con el serial de
// la nube; lo que ya existía en la nube conserva su id. El nodo no es de confianza total: aquí se valida otra vez, y solo se toca lo de la
// escuela del nodo. Pruebas: tests-unit/node-sync-groups.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

export const RESERVED_MIN = 1_500_000_000;
export const RESERVED_MAX = 2_100_000_000;

type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };
export interface GroupOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface GroupCtx {
  schoolCode: string;
  students: Map<string, { grade: string; section: string }>;
  assignments: Assignment[];
  adminIds: Set<string>;
  /** equipos que ya existen (de la nube o de este lote) */
  groups: Map<number, { school_code: string; grade: string; section: string }>;
  /** miembros que ya existen (de la nube o de este lote) */
  members: Map<number, { group_id: number }>;
}
export type GroupAction =
  | { seq: number; table: 'groups' | 'group_members'; kind: 'upsert'; row: Record<string, unknown> }
  | { seq: number; table: 'groups' | 'group_members'; kind: 'delete'; id: number };
export type GroupResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

export const isGroupTable = (t: unknown): boolean => t === 'groups' || t === 'group_members';

const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const reserved = (id: number) => id >= RESERVED_MIN && id < RESERVED_MAX;

export function planGroupOps(ops: GroupOp[], ctx: GroupCtx): { actions: GroupAction[]; results: GroupResult[] } {
  const actions: GroupAction[] = [];
  const results: GroupResult[] = [];
  const teacherFor = (grade: string, section: string) =>
    ctx.assignments.find((a) => a.school_code === ctx.schoolCode && a.grade === grade && a.section === section)?.teacher_id ?? [...ctx.adminIds][0];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const no = (error: string) => { results.push({ seq, ok: false, permanent: true, error }); };
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    const id = Number(raw.pk);
    const op = raw.op;
    if (!Number.isInteger(id) || id < 1 || (op !== 'insert' && op !== 'update' && op !== 'delete')) { no('Cambio inválido.'); continue; }

    if (raw.tbl === 'groups') {
      const existing = ctx.groups.get(id);
      if (existing && existing.school_code !== ctx.schoolCode) { no('Ese equipo es de otra escuela.'); continue; }
      if (op === 'delete') {
        if (existing) {
          ctx.groups.delete(id);
          for (const [mid, m] of ctx.members) if (m.group_id === id) ctx.members.delete(mid);
          actions.push({ seq, table: 'groups', kind: 'delete', id });
        }
        results.push({ seq, ok: true });
        continue;
      }
      if (!existing && !reserved(id)) { no('Identificador de equipo inválido.'); continue; }
      const name = typeof row.name === 'string' ? clean(row.name) : '';
      if (!name || name.length > 80) { no('El nombre del equipo debe tener entre 1 y 80 caracteres.'); continue; }
      const classOk = typeof row.grade === 'string' && typeof row.section === 'string' && row.school_code === ctx.schoolCode
        && (ctx.adminIds.size > 0 || teacherFor(row.grade, row.section) !== undefined)
        && ctx.assignments.some((a) => a.school_code === ctx.schoolCode && a.grade === row.grade && a.section === row.section);
      if (!classOk && !(existing && existing.grade === row.grade && existing.section === row.section)) { no('La clase no es de esta escuela.'); continue; }
      ctx.groups.set(id, { school_code: ctx.schoolCode, grade: row.grade, section: row.section });
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'groups', kind: 'upsert', row: { id, name, school_code: ctx.schoolCode, grade: row.grade, section: row.section, ...(existing ? {} : { created_by: teacherFor(row.grade, row.section) }) } });
    } else if (raw.tbl === 'group_members') {
      const existing = ctx.members.get(id);
      if (op === 'delete') {
        const g = existing ? ctx.groups.get(existing.group_id) : undefined;
        if (existing && g && g.school_code !== ctx.schoolCode) { no('Ese miembro es de otra escuela.'); continue; }
        if (existing) { ctx.members.delete(id); actions.push({ seq, table: 'group_members', kind: 'delete', id }); }
        results.push({ seq, ok: true });
        continue;
      }
      if (!existing && !reserved(id)) { no('Identificador de miembro inválido.'); continue; }
      const gid = row.group_id;
      const group = Number.isInteger(gid) ? ctx.groups.get(gid) : undefined;
      if (!group || group.school_code !== ctx.schoolCode) { no('El equipo no existe en esta escuela.'); continue; }
      const st = typeof row.student_id === 'string' ? ctx.students.get(row.student_id) : undefined;
      if (!st || st.grade !== group.grade || st.section !== group.section) { no('El estudiante no es de la clase del equipo.'); continue; }
      if (!(row.role == null || (typeof row.role === 'string' && row.role.length <= 30)) || !(row.is_leader == null || typeof row.is_leader === 'boolean')) { no('Datos del miembro inválidos.'); continue; }
      ctx.members.set(id, { group_id: gid });
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'group_members', kind: 'upsert', row: { id, group_id: gid, student_id: row.student_id, role: row.role ?? null, ...(row.is_leader != null ? { is_leader: row.is_leader } : {}) } });
    } else {
      no('Tabla no permitida.');
    }
  }
  return { actions, results };
}
