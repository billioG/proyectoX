// Lógica PURA de los proyectos que sube un nodo escolar (sin red ni base de datos, para poder
// probarla). La usa index.ts; las pruebas están en tests-unit/node-sync-projects.test.mjs.
// Escrita en TypeScript sin sintaxis no borrable (enum, namespace...) para que Node 22 también
// pueda importarla. El nodo ya validó todo, pero NO es de confianza total: aquí se valida otra vez.

export const MAX_PROJECT_BYTES = 150 * 1024 * 1024;

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', '3gp', 'avi', 'mkv', 'stl', 'obj', 'glb'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Ruta que genera esta función: <timestamp>_<aleatorio>.<ext> (igual que el flujo actual de la app).
const CLOUD_PATH = /^\d+_[a-z0-9]+\.(mp4|mov|m4v|webm|3gp|avi|mkv|stl|obj|glb)$/;

type Fail = { ok: false; error: string };

export function validateUploadRequest(
  req: { client_ref?: unknown; ext?: unknown; size?: unknown },
  deps: { now?: () => number; rand?: () => string } = {},
): { ok: true; path: string } | Fail {
  const now = deps.now ?? (() => Date.now());
  const rand = deps.rand ?? (() => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10));
  if (typeof req.client_ref !== 'string' || !UUID.test(req.client_ref)) return { ok: false, error: 'Referencia del proyecto inválida.' };
  if (typeof req.ext !== 'string' || !EXTENSIONS.includes(req.ext)) return { ok: false, error: 'Tipo de archivo no permitido.' };
  const size = req.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_PROJECT_BYTES) return { ok: false, error: 'El archivo debe pesar entre 1 byte y 150 MB.' };
  return { ok: true, path: `${now()}_${rand()}.${req.ext}` };
}

export interface PushedProject {
  client_ref?: unknown;
  student_id?: unknown;
  group_id?: unknown;
  title?: unknown;
  description?: unknown;
  bimestre?: unknown;
  upload_ip?: unknown;
  cloud_path?: unknown;
  created_at?: unknown;
}

export interface PushContext {
  nodeId: string;
  studentIds: Set<string>;
  /** equipo (id) → estudiantes que son miembros; solo equipos de la escuela del nodo */
  membersOf: Map<number, Set<string>>;
  /** tamaño del objeto en Storage, o null si no existe */
  objectSize: (path: string) => number | null;
}

// Caracteres de control a espacio. El HTML NO se toca: la app lo muestra siempre escapado.
const clean = (v: unknown): string => String(v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();

export function validateProjectPush(p: PushedProject, ctx: PushContext): { ok: true; row: Record<string, unknown> } | Fail {
  if (typeof p.client_ref !== 'string' || !UUID.test(p.client_ref)) return { ok: false, error: 'Referencia del proyecto inválida.' };
  const studentId = typeof p.student_id === 'string' ? p.student_id : '';
  if (!studentId || !ctx.studentIds.has(studentId)) return { ok: false, error: 'El estudiante no es de la escuela de este nodo.' };

  const title = clean(p.title);
  if (title.length < 5 || title.length > 120) return { ok: false, error: 'El título debe tener entre 5 y 120 caracteres.' };
  const description = clean(p.description);
  if (description.length < 40 || description.length > 2000) return { ok: false, error: 'La descripción debe tener entre 40 y 2000 caracteres.' };
  const bimestre = typeof p.bimestre === 'number' ? p.bimestre : Number(p.bimestre);
  if (!Number.isInteger(bimestre) || bimestre < 1 || bimestre > 4) return { ok: false, error: 'El bimestre debe ser de 1 a 4.' };

  let groupId: number | null = null;
  if (p.group_id !== null && p.group_id !== undefined && p.group_id !== '') {
    groupId = Number(p.group_id);
    if (!Number.isInteger(groupId)) return { ok: false, error: 'Equipo inválido.' };
    if (!ctx.membersOf.get(groupId)?.has(studentId)) return { ok: false, error: 'El estudiante no es miembro de ese equipo.' };
  }

  const path = typeof p.cloud_path === 'string' ? p.cloud_path : '';
  if (!CLOUD_PATH.test(path)) return { ok: false, error: 'La ruta del archivo no es válida.' };
  const size = ctx.objectSize(path);
  if (size === null) return { ok: false, error: 'El archivo no está en Storage: no se terminó de subir.' };
  if (size > MAX_PROJECT_BYTES) return { ok: false, error: 'El archivo supera los 150 MB.' };

  const row: Record<string, unknown> = {
    user_id: studentId,
    group_id: groupId,
    title,
    description,
    bimestre,
    upload_ip: clean(p.upload_ip).slice(0, 64),
    cloud_path: path,
    client_metadata: { source: 'nodo', node_ref: p.client_ref, node_id: ctx.nodeId },
  };
  // La hora en que se subió en la escuela (si es una fecha válida y no del futuro).
  const when = typeof p.created_at === 'string' ? new Date(p.created_at) : null;
  if (when && !Number.isNaN(when.getTime()) && when.getTime() <= Date.now() + 86400_000) row.created_at = when.toISOString();
  return { ok: true, row };
}

const ROLE_ORDER = ['planner', 'maker', 'speaker', 'helper'];

/** Rotación de roles del equipo tras publicar un proyecto (igual que rotateRoles en js/groups.js). */
export function nextRoles(members: Array<{ id: number; role: string }>): Array<{ id: number; role: string }> {
  if (members.length < 2) return [];
  const sorted = [...members].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return sorted.map((m) => ({ id: m.id, role: ROLE_ORDER[(ROLE_ORDER.indexOf(m.role) + 1) % ROLE_ORDER.length] }));
}

// ---- Fichas de proyectos para el Inicio del nodo (sin internet) ----
export const FEED_LIMIT = 300;
const MODEL_EXT = /\.(stl|obj|glb)(\?|$)/i;

export interface FeedProject {
  id: string;
  user_id: string;
  group_id: number | null;
  title: string;
  description: string;
  bimestre: number | null;
  score: number | null;
  votes: number;
  created_at: string;
  author_name: string;
  group_name: string | null;
  grade: string | null;
  section: string | null;
  kind: 'video' | 'model';
  feedback: string | null;
}

/**
 * Convierte filas de `projects` (con `evaluations` anidadas) en fichas para el nodo. Lista blanca de
 * campos: NUNCA sale `video_url` ni ninguna ruta de Storage (los videos no viajan al nodo). Solo proyectos
 * de estudiantes del nodo, del más nuevo al más viejo, hasta FEED_LIMIT.
 */
export function buildFeedProjects(
  rows: any[],
  students: Array<{ id: string; full_name?: string; grade?: string; section?: string }>,
  groups: Array<{ id: number; name?: string }>,
): FeedProject[] {
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const byGroup = new Map(groups.map((g) => [g.id, g]));
  const out: FeedProject[] = [];
  for (const r of rows || []) {
    const s = byStudent.get(r?.user_id);
    if (!s) continue;
    // PostgREST embebe la evaluación como objeto (no lista) porque evaluations.project_id es UNIQUE: se aceptan ambas.
    const evals = Array.isArray(r.evaluations) ? r.evaluations : (r.evaluations ? [r.evaluations] : []);
    let feedback: string | null = null;
    for (const e of evals) {
      const text = typeof e?.feedback === 'string' ? e.feedback.trim() : '';
      if (text) feedback = text.slice(0, 1000);
    }
    const groupId = r.group_id === null || r.group_id === undefined ? null : Number(r.group_id);
    out.push({
      id: String(r.id),
      user_id: String(r.user_id),
      group_id: groupId,
      title: String(r.title ?? ''),
      description: String(r.description ?? ''),
      bimestre: r.bimestre === null || r.bimestre === undefined ? null : Number(r.bimestre),
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      votes: Number(r.votes) || 0,
      created_at: String(r.created_at ?? ''),
      author_name: String(s.full_name ?? ''),
      group_name: groupId === null ? null : (byGroup.get(groupId)?.name ?? null),
      grade: s.grade ?? null,
      section: s.section ?? null,
      kind: MODEL_EXT.test(String(r.video_url ?? '')) ? 'model' : 'video',
      feedback,
    });
  }
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return out.slice(0, FEED_LIMIT);
}
