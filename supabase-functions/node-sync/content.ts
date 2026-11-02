// Cursos y recursos que un docente crea EN EL NODO sin internet (lógica pura, sin red ni base de datos, para probarla).
// El nodo ya validó todo, pero no es de confianza total: aquí se valida otra vez con las mismas reglas que la capa local y
// se decide qué escribir. Alcance: solo cursos y recursos de la escuela del nodo, hechos por un docente asignado a esa clase.
// Pruebas: tests-unit/node-sync-content.test.mjs. TypeScript sin sintaxis no borrable (Node 22 también lo importa).

export const MAX_FILE_BYTES = 150 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_CHARS = /[\u0000-\u001F\u007F\\:*?"<>|%]/;
const CONTROL = /[\u0000-\u001F\u007F]/;
const ALLOWED_EXT = new Set(('html htm xhtml js mjs css json xml xsd dtd png jpg jpeg gif svg webp ico bmp avif mp3 ogg oga wav m4a aac flac mp4 webm ogv mov m4v pdf '
  + 'txt csv md woff woff2 ttf otf eot wasm map glb gltf bin docx pptx xlsx doc ppt xls odt odp ods zip h5p vtt srt swf').split(' '));
const LESSON_TYPES = ['video', 'pdf', 'image', 'scorm', 'h5p', 'html5', 'quiz', 'tinkercad'];

type Fail = { ok: false; error: string };
type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };

/** `lessons/<uuid>/archivo` (con subcarpetas), sin trucos de ruta y con extensión conocida; o null. Igual que el nodo. */
export function validateObjectPath(rel: unknown): string | null {
  if (typeof rel !== 'string' || !rel || rel.length > 400 || BAD_CHARS.test(rel)) return null;
  const seg = rel.split('/');
  if (seg.length < 3 || seg.length > 12 || seg[0] !== 'lessons' || !UUID.test(seg[1])) return null;
  for (const s of seg.slice(2)) {
    if (!s || s === '.' || s === '..' || s.length > 200 || s.startsWith('.') || /[. ]$/.test(s)) return null;
  }
  const last = seg[seg.length - 1];
  if (!last.includes('.') || !ALLOWED_EXT.has(last.split('.').pop()!.toLowerCase())) return null;
  return rel;
}

/**
 * Permiso para subir UN archivo de un recurso. La ruta de una lección que ya existe en la nube solo se acepta si esa lección es de
 * la escuela del nodo (si no, un nodo podría pisar los archivos de otra escuela).
 */
export function validateContentUploadRequest(
  req: { path?: unknown; size?: unknown },
  ctx: { schoolCode: string; lessonSchool: (lessonId: string) => string | null | undefined },
): { ok: true; path: string } | Fail {
  const path = validateObjectPath(req.path);
  if (!path) return { ok: false, error: 'Ruta o tipo de archivo no permitido.' };
  const size = req.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) return { ok: false, error: 'El archivo debe pesar entre 1 byte y 150 MB.' };
  const owner = ctx.lessonSchool(path.split('/')[1].toLowerCase());
  if (owner != null && owner !== ctx.schoolCode) return { ok: false, error: 'Ese recurso es de otra escuela.' };
  return { ok: true, path };
}

export interface ContentOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface ContentCtx {
  schoolCode: string;
  /** Dirección pública del bucket de cursos terminada en «/» (…/storage/v1/object/public/course-content/) */
  storageBase: string;
  /** URL del proyecto de Supabase, sin «/» final (para el visor SCORM) */
  cloudUrl: string;
  assignments: Assignment[];
  adminIds: Set<string>;
  /** Lo que ya existe en la nube; se va actualizando con lo que este lote crea o borra. */
  courses: Map<string, { school_code: string; created_by: string | null; is_shared: boolean }>;
  lessons: Map<string, { school_code: string | null; course_id: string; created_by: string | null }>;
}
export type ContentAction =
  | { seq: number; table: 'courses' | 'lessons'; kind: 'upsert'; row: Record<string, unknown> }
  | { seq: number; table: 'courses' | 'lessons'; kind: 'delete'; id: string; removeFiles?: string };
export type ContentResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

const COURSE_COLUMNS = ['title', 'description', 'school_code', 'grade', 'section', 'created_by', 'is_shared', 'tags', 'weight', 'bimestre', 'tinkercad_class_url', 'cnb_area'];
const LESSON_COLUMNS = ['title', 'description', 'content_type', 'content_url', 'content_path', 'school_code', 'grade', 'section', 'created_by', 'is_shared', 'tags',
  'course_id', 'order_index', 'quiz_data', 'audience', 'grade_points', 'counts_for_grade'];

const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const nullOr = (v: unknown, ok: (x: any) => boolean) => v == null || ok(v);
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const tagsOk = (v: unknown) => Array.isArray(v) && v.length <= 30 && v.every((t) => str(t, 50));
const httpsUrl = (v: unknown) => str(v, 1000) && /^https:\/\/[^\s]+$/i.test(v) && !CONTROL.test(v);
const fail = (seq: number, error: string): { result: ContentResult } => ({ result: { seq, ok: false, permanent: true, error } });

function actorMayUseClass(ctx: ContentCtx, actor: string, c: { school_code: unknown; grade: unknown; section: unknown }): boolean {
  if (c.school_code !== ctx.schoolCode) return false;
  if (ctx.adminIds.has(actor)) return true;
  return ctx.assignments.some((a) => a.teacher_id === actor && a.school_code === ctx.schoolCode && a.grade === c.grade && a.section === c.section);
}

function pick(row: any, cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (row[c] !== undefined) out[c] = row[c];
  return out;
}

function checkCourse(row: any, ctx: ContentCtx): string | null {
  if (typeof row.created_by !== 'string' || !actorMayUseClass(ctx, row.created_by, row)) return 'El docente no está asignado a esa clase de esta escuela.';
  if (typeof row.title !== 'string' || !clean(row.title) || row.title.length > 200) return 'El título del curso debe tener entre 1 y 200 caracteres.';
  if (!nullOr(row.description, (v) => str(v, 2000)) || !str(row.grade, 60) || !str(row.section, 60)) return 'Datos del curso inválidos.';
  if (row.is_shared != null && typeof row.is_shared !== 'boolean') return 'Datos del curso inválidos.';
  if (!nullOr(row.tags, tagsOk) || !nullOr(row.weight, (v) => num(v, 0, 100)) || !nullOr(row.bimestre, (v) => int(v, 1, 4))) return 'Datos del curso inválidos.';
  if (!nullOr(row.tinkercad_class_url, httpsUrl) || !nullOr(row.cnb_area, (v) => str(v, 80))) return 'Datos del curso inválidos.';
  return null;
}

function lessonUrlOk(row: any, id: string, ctx: ContentCtx): boolean {
  const url = row.content_url;
  if (row.content_type === 'quiz') return url == null;
  if (typeof url !== 'string' || url.length > 1000 || CONTROL.test(url)) return false;
  const own = `lessons/${id}`;
  const okRel = (rel: string) => rel === own || rel.startsWith(`${own}/`);
  if (url.startsWith(ctx.storageBase)) { try { return okRel(decodeURIComponent(url.slice(ctx.storageBase.length).split(/[?#]/)[0])); } catch { return false; } }
  if (url.startsWith(`${ctx.cloudUrl}/functions/v1/serve-scorm-entry?`)) {
    try { return okRel(new URL(url).searchParams.get('path') || ''); } catch { return false; }
  }
  return httpsUrl(url);
}

function checkLesson(row: any, id: string, ctx: ContentCtx): string | null {
  const course = typeof row.course_id === 'string' ? ctx.courses.get(row.course_id) : undefined;
  if (!course || course.school_code !== ctx.schoolCode) return 'El curso de este recurso no existe en la nube.';
  if (typeof row.created_by !== 'string' || (course.created_by !== row.created_by && !ctx.adminIds.has(row.created_by))) return 'Solo el autor del curso agrega recursos.';
  if (!actorMayUseClass(ctx, row.created_by, row)) return 'El docente no está asignado a esa clase de esta escuela.';
  if (!LESSON_TYPES.includes(row.content_type)) return 'Tipo de recurso no permitido.';
  if (typeof row.title !== 'string' || !clean(row.title) || row.title.length > 200 || !nullOr(row.description, (v) => str(v, 2000))) return 'El título del recurso debe tener entre 1 y 200 caracteres.';
  if (row.audience !== 'estudiante' && row.audience !== 'docente') return 'Audiencia inválida.';
  if (!int(row.order_index, 0, 100000) || !nullOr(row.tags, tagsOk)) return 'Datos del recurso inválidos.';
  if (!nullOr(row.grade_points, (v) => num(v, 0, 100)) || !nullOr(row.counts_for_grade, (v) => typeof v === 'boolean') || (row.is_shared != null && typeof row.is_shared !== 'boolean')) return 'Datos del recurso inválidos.';
  if (!nullOr(row.content_path, (v) => v === `lessons/${id}`)) return 'Ruta de archivos inválida.';
  if (row.content_type === 'quiz') {
    if (!Array.isArray(row.quiz_data) || row.quiz_data.length < 1 || row.quiz_data.length > 200 || JSON.stringify(row.quiz_data).length > 300000) return 'Cuestionario inválido.';
  } else if (row.quiz_data != null) return 'Datos del recurso inválidos.';
  if (!lessonUrlOk(row, id, ctx)) return 'La dirección del recurso no es válida.';
  return null;
}

/** Valida los cambios de cursos y recursos que mandó el nodo, EN ORDEN, y dice qué escribir. Un cambio inválido no frena a los demás. */
export function planContentOps(ops: ContentOp[], ctx: ContentCtx): { actions: ContentAction[]; results: ContentResult[] } {
  const actions: ContentAction[] = [];
  const results: ContentResult[] = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const done = (r: { result?: ContentResult; action?: ContentAction }) => { if (r.result) results.push(r.result); if (r.action) actions.push(r.action); };
    const id = typeof raw.pk === 'string' ? raw.pk : '';
    const op = raw.op;
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    if (!UUID.test(id) || (op !== 'insert' && op !== 'update' && op !== 'delete')) { done(fail(seq, 'Cambio inválido.')); continue; }

    if (raw.tbl === 'courses') {
      const existing = ctx.courses.get(id);
      if (op === 'delete') {
        if (!existing) { results.push({ seq, ok: true }); continue; } // ya no está: nada que borrar
        if (existing.school_code !== ctx.schoolCode) { done(fail(seq, 'Ese curso es de otra escuela.')); continue; }
        if (existing.is_shared) { done(fail(seq, 'Un curso compartido solo se borra en línea.')); continue; }
        ctx.courses.delete(id);
        for (const [lid, l] of ctx.lessons) if (l.course_id === id) ctx.lessons.delete(lid);
        results.push({ seq, ok: true });
        actions.push({ seq, table: 'courses', kind: 'delete', id });
        continue;
      }
      if (existing && existing.school_code !== ctx.schoolCode) { done(fail(seq, 'Ese curso es de otra escuela.')); continue; }
      if (existing && existing.created_by !== row.created_by) { done(fail(seq, 'Solo el autor edita su curso.')); continue; }
      const err = checkCourse(row, ctx);
      if (err) { done(fail(seq, err)); continue; }
      const next = { ...pick(row, COURSE_COLUMNS), id, school_code: ctx.schoolCode, is_shared: row.is_shared === true };
      ctx.courses.set(id, { school_code: ctx.schoolCode, created_by: row.created_by, is_shared: next.is_shared as boolean });
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'courses', kind: 'upsert', row: next });
    } else if (raw.tbl === 'lessons') {
      const existing = ctx.lessons.get(id);
      if (op === 'delete') {
        if (!existing) { results.push({ seq, ok: true }); continue; }
        const course = ctx.courses.get(existing.course_id);
        if ((course && course.school_code !== ctx.schoolCode) || (!course && existing.school_code !== ctx.schoolCode)) { done(fail(seq, 'Ese recurso es de otra escuela.')); continue; }
        ctx.lessons.delete(id);
        results.push({ seq, ok: true });
        actions.push({ seq, table: 'lessons', kind: 'delete', id, removeFiles: `lessons/${id}` });
        continue;
      }
      if (existing) {
        const course = ctx.courses.get(existing.course_id);
        if ((course && course.school_code !== ctx.schoolCode) || (!course && existing.school_code !== ctx.schoolCode)) { done(fail(seq, 'Ese recurso es de otra escuela.')); continue; }
        if (existing.course_id !== row.course_id) { done(fail(seq, 'Un recurso no cambia de curso.')); continue; }
      }
      const err = checkLesson(row, id, ctx);
      if (err) { done(fail(seq, err)); continue; }
      const next = { ...pick(row, LESSON_COLUMNS), id, school_code: ctx.schoolCode, is_shared: row.is_shared === true };
      ctx.lessons.set(id, { school_code: ctx.schoolCode, course_id: row.course_id, created_by: row.created_by });
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'lessons', kind: 'upsert', row: next });
    } else {
      done(fail(seq, 'Tabla no permitida.'));
    }
  }
  return { actions, results };
}
