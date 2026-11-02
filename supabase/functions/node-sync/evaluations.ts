// Lógica PURA de las evaluaciones de proyectos que hace un docente en un nodo escolar (sin red ni base de datos,
// para poder probarla). La usa index.ts; las pruebas están en tests-unit/node-sync-evaluations.test.mjs.
// TypeScript sin sintaxis no borrable (enum, namespace...) para que Node 22 también la importe.
// Los cinco criterios (0 a 20 cada uno, total 0 a 100) son los de js/evaluation-modals.js y de la tabla evaluations.
// El nodo NO es de confianza total: aquí se valida otra vez y el total se RECALCULA (nunca se acepta el del nodo).

export const CRITERIA: ReadonlyArray<string> = ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact'];
export const MAX_CRITERION = 20;
export const MAX_FEEDBACK = 1000;

const MAX_PROJECT_ID = 2147483647; // integer de Postgres (projects.id)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fail = { ok: false; error: string };

export interface EvaluationEvent {
  teacher_id: string;
  project_id: number | null;
  node_ref: string | null;
  scores: Record<string, number>;
  total_score: number;
  feedback: string;
}

// Caracteres de control a espacio. El HTML NO se toca: la app lo muestra siempre escapado.
const clean = (v: string): string => v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();

/**
 * Una evaluación del docente: nota de cada criterio y observación. Identifica el proyecto por project_id (ya
 * publicado en la nube) o por node_ref (el uuid del nodo, si aún no se publicó): exactamente uno de los dos.
 */
export function validateEvaluationEvent(
  ev: Record<string, unknown>,
  ctx: { teacherIds: Set<string> },
): { ok: true; event: EvaluationEvent } | Fail {
  if (typeof ev.teacher_id !== 'string' || !ctx.teacherIds.has(ev.teacher_id)) return { ok: false, error: 'El docente no es de la escuela de este nodo.' };

  const hasId = ev.project_id !== null && ev.project_id !== undefined;
  const hasRef = ev.node_ref !== null && ev.node_ref !== undefined;
  if (hasId === hasRef) return { ok: false, error: 'Indica el proyecto con project_id o con node_ref (solo uno).' };
  let projectId: number | null = null;
  let nodeRef: string | null = null;
  if (hasId) {
    const id = ev.project_id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_PROJECT_ID) return { ok: false, error: 'Proyecto inválido.' };
    projectId = id;
  } else {
    if (typeof ev.node_ref !== 'string' || !UUID.test(ev.node_ref)) return { ok: false, error: 'Referencia del proyecto inválida.' };
    nodeRef = ev.node_ref;
  }

  const scores: Record<string, number> = {};
  let total = 0;
  for (const c of CRITERIA) {
    const v = ev[`${c}_score`];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CRITERION) return { ok: false, error: `La nota de ${c} debe ser un entero de 0 a ${MAX_CRITERION}.` };
    scores[`${c}_score`] = v;
    total += v;
  }

  if (ev.feedback !== undefined && ev.feedback !== null && typeof ev.feedback !== 'string') return { ok: false, error: 'La observación debe ser texto.' };
  const feedback = clean(String(ev.feedback ?? '')).slice(0, MAX_FEEDBACK);

  return { ok: true, event: { teacher_id: ev.teacher_id, project_id: projectId, node_ref: nodeRef, scores, total_score: total, feedback } };
}

/**
 * Docentes que el nodo conoce: solo los de rol docente con clases asignadas en la escuela del nodo, con sus clases.
 * Nunca correos ni contraseñas; el PIN personal vive solo en el nodo.
 */
export function buildTeacherList(
  teachers: Array<{ id: string; full_name?: string; role?: string }>,
  assignments: Array<{ teacher_id: string; school_code: string; grade: string; section: string }>,
  schoolCode: string,
): Array<{ id: string; full_name: string; assignments: Array<{ grade: string; section: string }> }> {
  const out: Array<{ id: string; full_name: string; assignments: Array<{ grade: string; section: string }> }> = [];
  for (const t of teachers || []) {
    if (t.role === 'admin') continue;
    const mine = (assignments || [])
      .filter((a) => a.teacher_id === t.id && a.school_code === schoolCode)
      .map((a) => ({ grade: String(a.grade), section: String(a.section) }));
    if (!mine.length) continue;
    out.push({ id: t.id, full_name: String(t.full_name ?? ''), assignments: mine });
  }
  return out;
}

/** Evaluaciones que baja el pull: lista blanca de campos. */
export function shapeEvaluations(rows: any[]): Array<Record<string, unknown>> {
  return (rows || []).map((r) => ({
    project_id: Number(r.project_id),
    teacher_id: r.teacher_id,
    total_score: Number(r.total_score) || 0,
    creativity_score: Number(r.creativity_score) || 0,
    clarity_score: Number(r.clarity_score) || 0,
    functionality_score: Number(r.functionality_score) || 0,
    teamwork_score: Number(r.teamwork_score) || 0,
    social_impact_score: Number(r.social_impact_score) || 0,
    feedback: typeof r.feedback === 'string' ? r.feedback.slice(0, MAX_FEEDBACK) : null,
  }));
}
