// Evaluación de proyectos por un docente en el nodo escolar (sin internet).
// La nube es la única que guarda la evaluación definitiva y la nota del proyecto; el nodo
//  - baja los docentes (teachers) y las evaluaciones de los proyectos del Inicio (cloud_evaluations),
//  - guarda la evaluación FINAL pendiente de cada proyecto (evaluations_local), con su docente,
//  - la manda al sincronizar (la nube valida que el docente esté asignado a la clase y RECALCULA el total).
// Un proyecto se identifica con una clave: "c:<id en la nube>" o "l:<uuid del nodo>" (aún sin publicar o ya
// publicado pero con copia local); el docente solo ve y evalúa proyectos de las clases que tiene asignadas.

export const CRITERIA = ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact'];
export const MAX_CRITERION = 20;
const MAX_FEEDBACK = 1000;

export class EvaluationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'EvaluationError';
    this.status = status;
  }
}

const cleanFeedback = (v) => String(v).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, MAX_FEEDBACK);
const scoreCols = CRITERIA.map(c => `${c}_score`);

/**
 * @param db   base SQLite del nodo
 * @param opts { now?: () => number }
 */
export function createEvaluationStore(db, { now = Date.now } = {}) {
  // El docente puede venir de la base (assignments como texto JSON) o de teachers.js (ya como lista).
  const assignmentsOf = (teacher) => {
    if (Array.isArray(teacher?.assignments)) return teacher.assignments;
    try { return JSON.parse(teacher?.assignments || '[]'); } catch { return []; }
  };
  const allowed = (teacher, grade, section) => assignmentsOf(teacher).some(a => a.grade === grade && a.section === section);
  const evalOf = (r) => (r ? {
    teacher_id: r.teacher_id, total_score: r.total_score, feedback: r.feedback ?? '',
    ...Object.fromEntries(scoreCols.map(c => [c, r[c]])),
  } : null);

  /** Datos del proyecto detrás de una clave, o lanza 404. */
  function resolve(key) {
    let m;
    if ((m = /^c:(\d{1,10})$/.exec(String(key)))) {
      const p = db.prepare('SELECT * FROM cloud_projects WHERE id = ?').get(m[1]);
      if (!p) throw new EvaluationError(404, 'Proyecto no encontrado.');
      return { key: `c:${m[1]}`, source: 'cloud', project_id: Number(m[1]), node_ref: null, title: p.title, description: p.description, bimestre: p.bimestre,
        author_name: p.author_name, grade: p.grade, section: p.section, kind: p.kind, created_at: p.created_at, cloud_score: p.score, state: 'cloud' };
    }
    if ((m = /^l:([0-9a-f-]{36})$/i.exec(String(key)))) {
      const p = db.prepare(`SELECT p.*, s.full_name, s.grade, s.section FROM projects p JOIN students s ON s.id = p.student_id WHERE p.id = ?`).get(m[1]);
      if (!p || p.status === 'uploading') throw new EvaluationError(404, 'Proyecto no encontrado.');
      const cloudId = /^\d+$/.test(String(p.cloud_project_id || '')) ? Number(p.cloud_project_id) : null;
      return { key: `l:${p.id}`, source: 'local', project_id: cloudId, node_ref: p.id, local_id: p.id, title: p.title, description: p.description, bimestre: p.bimestre,
        author_name: p.full_name, grade: p.grade, section: p.section, kind: p.kind, created_at: p.created_at, cloud_score: null, state: p.status };
    }
    throw new EvaluationError(404, 'Proyecto no encontrado.');
  }

  /** La evaluación vigente de una clave: la pendiente del nodo; para un proyecto de la nube también la de la nube. */
  function effective(p) {
    const local = db.prepare('SELECT * FROM evaluations_local WHERE project_key = ?').get(p.key);
    if (local) return { ...evalOf(local), updated_at: local.updated_at, pending: true };
    if (p.project_id !== null) {
      const base = db.prepare('SELECT * FROM cloud_evaluations WHERE project_id = ?').get(p.project_id);
      if (base) return { ...evalOf(base), pending: false };
    }
    return null;
  }

  function checkAccess(teacher, p) {
    if (!allowed(teacher, p.grade, p.section)) throw new EvaluationError(403, 'Ese proyecto no es de una de tus clases.');
  }

  return {
    /** Proyectos de las clases del docente: los de la nube (fichas) y los guardados en este nodo; sin evaluar primero. */
    listForTeacher(teacher) {
      const classes = assignmentsOf(teacher);
      if (!classes.length) return [];
      const items = [];
      const cloudIds = new Set();
      for (const p of db.prepare('SELECT id FROM cloud_projects ORDER BY created_at DESC, id').all()) {
        const r = resolve(`c:${p.id}`);
        if (!classes.some(c => c.grade === r.grade && c.section === r.section)) continue;
        cloudIds.add(r.project_id);
        const ev = effective(r);
        const linked = db.prepare("SELECT id FROM projects WHERE cloud_project_id = ? AND status != 'uploading' LIMIT 1").get(String(r.project_id));
        items.push({ key: r.key, source: 'cloud', title: r.title, author_name: r.author_name, grade: r.grade, section: r.section, kind: r.kind,
          created_at: r.created_at, state: 'cloud', local_id: linked?.id ?? null, evaluated: !!ev, score: ev ? ev.total_score : (r.cloud_score > 0 ? r.cloud_score : null) });
      }
      for (const p of db.prepare("SELECT id FROM projects WHERE status IN ('pending', 'synced') ORDER BY created_at DESC, rowid DESC").all()) {
        const r = resolve(`l:${p.id}`);
        if (r.project_id !== null && cloudIds.has(r.project_id)) continue; // ya aparece el de la nube
        if (!classes.some(c => c.grade === r.grade && c.section === r.section)) continue;
        const ev = effective(r);
        items.push({ key: r.key, source: 'local', title: r.title, author_name: r.author_name, grade: r.grade, section: r.section, kind: r.kind,
          created_at: r.created_at, state: r.state, local_id: r.local_id, evaluated: !!ev, score: ev ? ev.total_score : null });
      }
      return items.sort((a, b) => (a.evaluated === b.evaluated ? String(b.created_at).localeCompare(String(a.created_at)) : (a.evaluated ? 1 : -1)));
    },

    /** Detalle de un proyecto con su evaluación vigente. 404 si no existe, 403 si no es de una clase del docente. */
    get(teacher, key) {
      const p = resolve(key);
      checkAccess(teacher, p);
      const { cloud_score, ...rest } = p;
      return { ...rest, evaluation: effective(p) };
    },

    /** Guarda la evaluación final (el total se calcula aquí). Devuelve { key, total_score }. */
    save(teacher, key, input = {}) {
      const p = resolve(key);
      checkAccess(teacher, p);
      const scores = {};
      let total = 0;
      for (const col of scoreCols) {
        const v = input[col];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CRITERION) throw new EvaluationError(400, `Cada nota debe ser un número entero de 0 a ${MAX_CRITERION}.`);
        scores[col] = v;
        total += v;
      }
      if (input.feedback !== undefined && input.feedback !== null && typeof input.feedback !== 'string') throw new EvaluationError(400, 'La observación debe ser texto.');
      const feedback = cleanFeedback(input.feedback ?? '');
      db.prepare(`INSERT INTO evaluations_local (project_key, project_id, node_ref, teacher_id, total_score, ${scoreCols.join(', ')}, feedback, updated_at)
        VALUES (@key, @project_id, @node_ref, @teacher_id, @total, ${scoreCols.map(c => '@' + c).join(', ')}, @feedback, @updated_at)
        ON CONFLICT(project_key) DO UPDATE SET project_id = excluded.project_id, node_ref = excluded.node_ref, teacher_id = excluded.teacher_id,
          total_score = excluded.total_score, ${scoreCols.map(c => `${c} = excluded.${c}`).join(', ')}, feedback = excluded.feedback, updated_at = excluded.updated_at`)
        .run({ key: p.key, project_id: p.project_id, node_ref: p.node_ref, teacher_id: teacher.id, total, ...scores, feedback, updated_at: new Date(now()).toISOString() });
      return { key: p.key, total_score: total };
    },

    /**
     * La evaluación que ve el estudiante de un proyecto de la nube (nota y observación): la pendiente más reciente
     * (por la clave de la nube o por su copia local ya publicada) o, si no hay, la que bajó el pull. null si no hay.
     */
    effectiveForCloud(projectId) {
      const id = Number(projectId);
      if (!Number.isInteger(id)) return null;
      const rows = db.prepare(`SELECT * FROM evaluations_local WHERE project_key = ?
        OR project_key IN (SELECT 'l:' || id FROM projects WHERE cloud_project_id = ?) ORDER BY updated_at DESC LIMIT 1`).get(`c:${id}`, String(id));
      if (rows) return { ...evalOf(rows), updated_at: rows.updated_at, pending: true };
      const base = db.prepare('SELECT * FROM cloud_evaluations WHERE project_id = ?').get(id);
      return base ? { ...evalOf(base), pending: false } : null;
    },

    /** La evaluación que ve el dueño de un proyecto guardado en el nodo: la pendiente o, si ya se publicó, la de la nube. */
    effectiveForLocal(uuid) {
      const l = db.prepare('SELECT * FROM evaluations_local WHERE project_key = ?').get(`l:${uuid}`);
      if (l) return { ...evalOf(l), updated_at: l.updated_at, pending: true };
      const cid = db.prepare('SELECT cloud_project_id FROM projects WHERE id = ?').get(uuid)?.cloud_project_id;
      return /^\d+$/.test(String(cid || '')) ? this.effectiveForCloud(Number(cid)) : null;
    },

    /** Lo que falta por mandar a la nube: project_id si se conoce, si no el uuid del nodo (node_ref). */
    pending() {
      return db.prepare('SELECT * FROM evaluations_local ORDER BY updated_at, rowid').all().map(r => {
        let projectId = r.project_id;
        if (projectId === null && r.node_ref) {
          const cid = db.prepare('SELECT cloud_project_id FROM projects WHERE id = ?').get(r.node_ref)?.cloud_project_id;
          if (/^\d+$/.test(String(cid || ''))) projectId = Number(cid);
        }
        return {
          key: r.project_key, teacher_id: r.teacher_id, project_id: projectId, node_ref: projectId === null ? r.node_ref : null,
          ...Object.fromEntries(scoreCols.map(c => [c, r[c]])), feedback: r.feedback ?? '', updated_at: r.updated_at,
        };
      });
    },

    /**
     * Borra lo que la nube resolvió: confirmado en `applied` (claves de applied.evaluations) o rechazado de forma
     * definitiva (`errors` con permanent: true). Un error pasajero, "aún no publicado", o una función anterior que no
     * responde applied.evaluations, la deja para reintentar. Si se evaluó otra vez durante la sincronización
     * (otro updated_at), se conserva la nueva.
     */
    clearSent(pushed = [], { applied, errors } = {}) {
      if (!Array.isArray(applied)) return;
      const done = new Set(applied);
      for (const e of (Array.isArray(errors) ? errors : [])) if (e && e.permanent === true) done.add(e.key);
      const del = db.prepare('DELETE FROM evaluations_local WHERE project_key = ? AND updated_at = ?');
      for (const r of pushed) if (done.has(r.key)) del.run(r.key, r.updated_at);
    },
  };
}
