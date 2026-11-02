// Avisos y lecturas de avisos hechos en un nodo escolar. Lógica pura (sin acceso a la base) para probarla.
// Las mismas reglas que can_send_announcement (migrations/announcements-targeting.sql): el docente solo avisa a ESTUDIANTES
// de SUS grupos, de la escuela del nodo; nunca a docentes, a todos ni por escuela. El nodo no es de confianza: se valida otra vez.

export const ANNOUNCEMENT_COLUMNS = ['id', 'sender_id', 'sender_role', 'audience', 'school_code', 'grade', 'section', 'target_schools', 'target_groups', 'title', 'message', 'created_at'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 3600_000;
const MAX_TITLE = 150;
const MAX_MESSAGE = 2000;
const MAX_GROUPS = 20;

type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };
type Fail = { ok: false; error: string };

// Caracteres de control a espacio. El HTML NO se toca: la app lo muestra siempre escapado.
const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const reasonableDate = (v: unknown, now: number): string => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return new Date(Number.isNaN(t) || t > now + 5 * 60_000 || t < now - 30 * DAY_MS ? now : t).toISOString();
};
const isGroup = (g: any) => g && typeof g === 'object' && typeof g.school_code === 'string' && typeof g.grade === 'string' && typeof g.section === 'string';

export function validateAnnouncementEvent(
  raw: any,
  ctx: { schoolCode: string; now: number; assignments: Assignment[] },
): { ok: true; row: Record<string, unknown> } | Fail {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Aviso inválido' };
  if (typeof raw.id !== 'string' || !UUID.test(raw.id)) return { ok: false, error: 'Identificador del aviso inválido' };
  if (typeof raw.sender_id !== 'string' || raw.sender_role !== 'docente' || raw.audience !== 'students' || (raw.target_schools ?? null) !== null) {
    return { ok: false, error: 'Un docente solo puede avisar a estudiantes de sus grupos' };
  }
  const mine = ctx.assignments.filter((a) => a.teacher_id === raw.sender_id && a.school_code === ctx.schoolCode);
  if (!mine.length) return { ok: false, error: 'El docente no es de la escuela de este nodo' };
  const isMine = (g: { school_code: string; grade: string; section: string }) => mine.some((m) => m.school_code === g.school_code && m.grade === g.grade && m.section === g.section);

  const title = typeof raw.title === 'string' ? clean(raw.title) : '';
  const message = typeof raw.message === 'string' ? clean(raw.message) : '';
  if (!title || title.length > MAX_TITLE) return { ok: false, error: 'El título debe tener entre 1 y 150 caracteres' };
  if (!message || message.length > MAX_MESSAGE) return { ok: false, error: 'El mensaje debe tener entre 1 y 2000 caracteres' };

  let schoolCode: string | null = null, grade: string | null = null, section: string | null = null;
  let groups: Array<{ school_code: string; grade: string; section: string }> | null = null;
  if (raw.school_code != null) {
    // Una sola clase suya (y sin lista de grupos).
    if ((raw.target_groups ?? null) !== null || !isGroup(raw) || !isMine(raw)) return { ok: false, error: 'Solo puedes avisar a tus grupos' };
    schoolCode = raw.school_code; grade = raw.grade; section = raw.section;
  } else {
    const list = raw.target_groups;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_GROUPS || !list.every((g) => isGroup(g) && isMine(g))) return { ok: false, error: 'Solo puedes avisar a tus grupos' };
    groups = list.map((g: any) => ({ school_code: g.school_code, grade: g.grade, section: g.section }));
  }

  return {
    ok: true,
    row: {
      id: raw.id, sender_id: raw.sender_id, sender_role: 'docente', audience: 'students', school_code: schoolCode, grade, section,
      target_groups: groups, target_schools: null, title, message, created_at: reasonableDate(raw.created_at, ctx.now),
    },
  };
}

export function validateReadEvent(
  raw: any,
  ctx: { userIds: Set<string>; now: number },
): { ok: true; row: { announcement_id: string; user_id: string; read_at: string } } | Fail {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Lectura inválida' };
  if (typeof raw.announcement_id !== 'string' || !UUID.test(raw.announcement_id)) return { ok: false, error: 'Aviso inválido' };
  if (typeof raw.user_id !== 'string' || !ctx.userIds.has(raw.user_id)) return { ok: false, error: 'Usuario no encontrado en esta escuela' };
  return { ok: true, row: { announcement_id: raw.announcement_id, user_id: raw.user_id, read_at: reasonableDate(raw.read_at, ctx.now) } };
}

/** ¿Este aviso alcanza a alguien de la escuela? (para decidir qué baja al nodo; el nodo aplica después sus propias reglas de lectura) */
export function announcementVisibleToSchool(a: any, schoolCode: string): boolean {
  if (a.school_code != null) return a.school_code === schoolCode;
  if (Array.isArray(a.target_groups)) return a.target_groups.some((g: any) => g?.school_code === schoolCode);
  if (Array.isArray(a.target_schools)) return a.target_schools.includes(schoolCode);
  return true;
}

export function shapeAnnouncements(rows: any[]): Array<Record<string, unknown>> {
  return (rows || []).map((r) => Object.fromEntries(ANNOUNCEMENT_COLUMNS.map((c) => [c, r[c] === undefined ? null : r[c]])));
}
