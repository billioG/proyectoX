// Comentarios de equipo, «me gusta» y notas privadas de los recursos que se hicieron EN EL NODO sin internet (lógica pura, sin red ni
// base de datos, para probarla). Mismas reglas que las políticas de la nube (migrations/resource-notes-comments.sql y
// resource-comments-likes-replies.sql) y el mismo filtro de malas palabras (public.contains_profanity). El nodo no es de confianza
// total: aquí se valida otra vez. Pruebas: tests-unit/node-sync-social.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORDS = 'mierda|pendej[oa]|idiota|est[uú]pid[oa]|imb[eé]cil|put[oa]|maric[oó]n|cabr[oó]n|verga|culer[oa]|gilipollas|joder|hijueputa|hijo de puta|malparid[oa]|carajo|zorra|perra|weon|hue[oó]n';
const PROFANITY = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${WORDS})(?![\\p{L}\\p{N}_])`, 'iu');
const STAFF_ROLES = ['docente', 'admin', 'coordinador'];
const CONTROL = /[\u0000-\u001F\u007F]+/g;

type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };

export const SOCIAL_TABLES = ['resource_comments', 'resource_comment_likes', 'resource_notes'];
export const isSocialTable = (t: unknown): boolean => typeof t === 'string' && SOCIAL_TABLES.includes(t);

export interface SocialOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface SocialCtx {
  schoolCode: string;
  studentIds: Set<string>;
  assignments: Assignment[];
  adminIds: Set<string>;
  /** equipos de la escuela */
  groups: Set<number>;
  /** `${equipo}:${estudiante}` */
  groupMembers: Set<string>;
  /** lecciones de la escuela */
  lessons: Set<string>;
  /** comentarios que ya existen (de los equipos de la escuela); se actualiza con lo que crea este lote */
  comments: Map<string, { lesson_id: string; group_id: number }>;
}
export type SocialAction =
  | { seq: number; table: string; kind: 'upsert'; row: Record<string, unknown>; onConflict: string }
  | { seq: number; table: string; kind: 'delete'; match: Record<string, unknown> };
export type SocialResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

const clean = (v: string): string => v.replace(CONTROL, ' ').replace(/ {2,}/g, ' ').trim();
const fail = (seq: number, error: string): SocialResult => ({ seq, ok: false, permanent: true, error });

function isStaffOfSchool(ctx: SocialCtx, uid: string): boolean {
  return ctx.adminIds.has(uid) || ctx.assignments.some((a) => a.teacher_id === uid && a.school_code === ctx.schoolCode);
}
const canUseGroup = (ctx: SocialCtx, uid: string, group: number): boolean =>
  isStaffOfSchool(ctx, uid) || (ctx.studentIds.has(uid) && ctx.groupMembers.has(`${group}:${uid}`));

/** Valida EN ORDEN lo que mandó el nodo y dice qué escribir en la nube. Un cambio inválido no frena a los demás. */
export function planSocialOps(ops: SocialOp[], ctx: SocialCtx): { actions: SocialAction[]; results: SocialResult[] } {
  const actions: SocialAction[] = [];
  const results: SocialResult[] = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    const op = raw.op;
    const pk = typeof raw.pk === 'string' ? raw.pk : '';
    const ok = (a?: SocialAction) => { results.push({ seq, ok: true }); if (a) actions.push(a); };
    const no = (error: string) => { results.push(fail(seq, error)); };
    if (op !== 'insert' && op !== 'delete') { no('Cambio no permitido.'); continue; }

    if (raw.tbl === 'resource_comments') {
      if (!UUID.test(pk)) { no('Identificador del comentario inválido.'); continue; }
      if (op === 'delete') { ctx.comments.delete(pk); ok({ seq, table: 'resource_comments', kind: 'delete', match: { id: pk } }); continue; }
      const author = typeof row.author_id === 'string' ? row.author_id : '';
      const group = row.group_id;
      if (!Number.isInteger(group) || !ctx.groups.has(group)) { no('El equipo no es de la escuela de este nodo.'); continue; }
      if (typeof row.lesson_id !== 'string' || !ctx.lessons.has(row.lesson_id)) { no('El recurso no es de la escuela de este nodo.'); continue; }
      if (!canUseGroup(ctx, author, group)) { no('El autor no es de ese equipo.'); continue; }
      const staff = isStaffOfSchool(ctx, author);
      if (!(staff ? STAFF_ROLES.includes(row.author_role) : row.author_role === 'estudiante')) { no('Rol del autor inválido.'); continue; }
      const name = typeof row.author_name === 'string' ? clean(row.author_name) : '';
      const content = typeof row.content === 'string' ? clean(row.content) : '';
      if (!name || name.length > 120) { no('Nombre del autor inválido.'); continue; }
      if (!content || content.length > 2000) { no('El comentario debe tener entre 1 y 2000 caracteres.'); continue; }
      if (PROFANITY.test(content)) { no('CONTENIDO_INAPROPIADO: el texto contiene lenguaje no permitido'); continue; }
      if (row.attachment_url != null) { no('Los adjuntos no se suben desde el nodo.'); continue; }
      let parent: string | null = null;
      if (row.parent_id != null) {
        const p = typeof row.parent_id === 'string' ? ctx.comments.get(row.parent_id) : undefined;
        if (!p || p.lesson_id !== row.lesson_id || p.group_id !== group) { no('El comentario al que responde no existe.'); continue; }
        parent = row.parent_id;
      }
      ctx.comments.set(pk, { lesson_id: row.lesson_id, group_id: group });
      ok({ seq, table: 'resource_comments', kind: 'upsert', onConflict: 'id', row: { id: pk, lesson_id: row.lesson_id, group_id: group, parent_id: parent, author_id: author, author_name: name, author_role: row.author_role, content, ...(typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at)) ? { created_at: row.created_at } : {}) } });
    } else if (raw.tbl === 'resource_comment_likes') {
      const [commentId, userId] = pk.split(':');
      if (!UUID.test(commentId || '') || !userId) { no('Identificador inválido.'); continue; }
      if (op === 'delete') { ok({ seq, table: 'resource_comment_likes', kind: 'delete', match: { comment_id: commentId, user_id: userId } }); continue; }
      const c = ctx.comments.get(commentId);
      if (!c) { no('El comentario ya no existe.'); continue; }
      if (row.comment_id !== commentId || row.user_id !== userId || !canUseGroup(ctx, userId, c.group_id)) { no('El usuario no es de ese equipo.'); continue; }
      ok({ seq, table: 'resource_comment_likes', kind: 'upsert', onConflict: 'comment_id,user_id', row: { comment_id: commentId, user_id: userId } });
    } else if (raw.tbl === 'resource_notes') {
      if (!UUID.test(pk)) { no('Identificador de la nota inválido.'); continue; }
      const student = typeof row.student_id === 'string' ? row.student_id : '';
      if (!ctx.studentIds.has(student)) { no('El estudiante no es de la escuela de este nodo.'); continue; }
      if (op === 'delete') { ok({ seq, table: 'resource_notes', kind: 'delete', match: { id: pk, student_id: student } }); continue; }
      if (typeof row.lesson_id !== 'string' || !ctx.lessons.has(row.lesson_id)) { no('El recurso no es de la escuela de este nodo.'); continue; }
      const content = typeof row.content === 'string' ? clean(row.content) : '';
      if (!content || content.length > 5000) { no('La nota debe tener entre 1 y 5000 caracteres.'); continue; }
      if (PROFANITY.test(content)) { no('CONTENIDO_INAPROPIADO: el texto contiene lenguaje no permitido'); continue; }
      ok({ seq, table: 'resource_notes', kind: 'upsert', onConflict: 'id', row: { id: pk, lesson_id: row.lesson_id, student_id: student, content } });
    } else {
      no('Tabla no permitida.');
    }
  }
  return { actions, results };
}
