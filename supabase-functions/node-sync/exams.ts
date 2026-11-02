// Exámenes y notas que un docente creó o calificó EN EL NODO sin internet (lógica pura, sin red ni base de datos, para probarla). Mismas reglas
// que migrations/exams.sql (clave A-E del tamaño de las preguntas, respuestas A-E, «-» en blanco y «*» doble marca, nota única por examen y
// estudiante) más lo que el nodo ya exige: docente asignado a esa clase, estudiante de la misma clase. El nodo no es de confianza total: aquí se
// valida otra vez. Pruebas: tests-unit/node-sync-exams.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Assignment = { teacher_id: string; school_code: string; grade: string; section: string };

export interface ExamOp { seq?: unknown; tbl?: unknown; op?: unknown; pk?: unknown; row?: any }
export interface ExamCtx {
  schoolCode: string;
  students: Map<string, { grade: string; section: string }>;
  assignments: Assignment[];
  adminIds: Set<string>;
  /** exámenes que ya existen (de la nube o de este lote) */
  exams: Map<string, { school_code: string; teacher_id: string; grade: string; section: string; question_count: number }>;
}
export type ExamAction =
  | { seq: number; table: 'exams' | 'exam_results'; kind: 'upsert'; row: Record<string, unknown>; onConflict: string }
  | { seq: number; table: 'exams' | 'exam_results'; kind: 'delete'; match: Record<string, unknown> };
export type ExamResult = { seq: number; ok: true } | { seq: number; ok: false; permanent: true; error: string };

export const isExamTable = (t: unknown): boolean => t === 'exams' || t === 'exam_results';

const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const validDate = (v: unknown) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

export function planExamOps(ops: ExamOp[], ctx: ExamCtx): { actions: ExamAction[]; results: ExamResult[] } {
  const actions: ExamAction[] = [];
  const results: ExamResult[] = [];
  const staffOfClass = (uid: string, grade: string, section: string) => ctx.adminIds.has(uid)
    || ctx.assignments.some((a) => a.teacher_id === uid && a.school_code === ctx.schoolCode && a.grade === grade && a.section === section);
  const isStaff = (uid: string) => ctx.adminIds.has(uid) || ctx.assignments.some((a) => a.teacher_id === uid && a.school_code === ctx.schoolCode);
  for (const raw of Array.isArray(ops) ? ops : []) {
    const seq = typeof raw?.seq === 'number' ? raw.seq : NaN;
    if (!Number.isInteger(seq)) continue;
    const no = (error: string) => { results.push({ seq, ok: false, permanent: true, error }); };
    const row = raw.row && typeof raw.row === 'object' ? raw.row : {};
    const op = raw.op;
    if (op !== 'insert' && op !== 'update' && op !== 'delete') { no('Cambio no permitido.'); continue; }

    if (raw.tbl === 'exams') {
      const id = typeof raw.pk === 'string' ? raw.pk : '';
      if (!UUID.test(id)) { no('Identificador del examen inválido.'); continue; }
      const existing = ctx.exams.get(id);
      if (existing && existing.school_code !== ctx.schoolCode) { no('Ese examen es de otra escuela.'); continue; }
      if (op === 'delete') {
        if (existing) { ctx.exams.delete(id); actions.push({ seq, table: 'exams', kind: 'delete', match: { id } }); }
        results.push({ seq, ok: true });
        continue;
      }
      const title = typeof row.title === 'string' ? clean(row.title) : '';
      const key = row.answer_key;
      if (typeof row.teacher_id !== 'string' || typeof row.grade !== 'string' || typeof row.section !== 'string' || row.school_code !== ctx.schoolCode) { no('Datos del examen inválidos.'); continue; }
      if (!staffOfClass(row.teacher_id, row.grade, row.section)) { no('El docente no está asignado a esa clase de esta escuela.'); continue; }
      if (existing && existing.teacher_id !== row.teacher_id) { no('Solo el autor edita su examen.'); continue; }
      if (!title || title.length > 120 || !int(row.bimestre, 1, 4) || !int(row.question_count, 1, 100)) { no('Datos del examen inválidos.'); continue; }
      if (typeof key !== 'string' || !/^[A-E]+$/.test(key) || key.length !== row.question_count) { no('La clave de respuestas no coincide con las preguntas.'); continue; }
      if (typeof row.points !== 'number' || !(row.points > 0) || row.points > 1000) { no('Los puntos del examen son inválidos.'); continue; }
      ctx.exams.set(id, { school_code: ctx.schoolCode, teacher_id: row.teacher_id, grade: row.grade, section: row.section, question_count: row.question_count });
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'exams', kind: 'upsert', onConflict: 'id', row: { id, teacher_id: row.teacher_id, school_code: ctx.schoolCode, grade: row.grade, section: row.section, title, bimestre: row.bimestre, question_count: row.question_count, answer_key: key, points: row.points, ...(validDate(row.created_at) ? { created_at: row.created_at } : {}) } });
    } else if (raw.tbl === 'exam_results') {
      const examId = typeof row.exam_id === 'string' ? row.exam_id : '';
      const studentId = typeof row.student_id === 'string' ? row.student_id : '';
      const exam = ctx.exams.get(examId);
      if (op === 'delete') {
        if (exam && exam.school_code !== ctx.schoolCode) { no('Ese examen es de otra escuela.'); continue; }
        if (exam && studentId) actions.push({ seq, table: 'exam_results', kind: 'delete', match: { exam_id: examId, student_id: studentId } });
        results.push({ seq, ok: true });
        continue;
      }
      if (!exam || exam.school_code !== ctx.schoolCode) { no('El examen no existe en esta escuela.'); continue; }
      const st = ctx.students.get(studentId);
      if (!st || st.grade !== exam.grade || st.section !== exam.section) { no('El estudiante no es de la clase del examen.'); continue; }
      if (typeof row.answers !== 'string' || row.answers.length !== exam.question_count || !/^[A-E*-]+$/.test(row.answers)) { no('Las respuestas no coinciden con el examen.'); continue; }
      if (!int(row.correct, 0, 1000) || !int(row.wrong, 0, 1000) || !int(row.blank, 0, 1000) || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 100000) { no('La nota es inválida.'); continue; }
      if (row.scanned_by != null && (typeof row.scanned_by !== 'string' || !isStaff(row.scanned_by))) { no('Quien calificó no es docente de la escuela.'); continue; }
      results.push({ seq, ok: true });
      actions.push({ seq, table: 'exam_results', kind: 'upsert', onConflict: 'exam_id,student_id', row: { exam_id: examId, student_id: studentId, answers: row.answers, correct: row.correct, wrong: row.wrong, blank: row.blank, score: row.score, scanned_by: row.scanned_by ?? null, ...(validDate(row.scanned_at) ? { scanned_at: row.scanned_at } : {}) } });
    } else {
      no('Tabla no permitida.');
    }
  }
  return { actions, results };
}
