// Reacciones a proyectos en el nodo escolar. La nube es la única que cuenta votos; el nodo solo guarda
//  - la base que bajó la última sincronización (cloud_reactions: la reacción de cada estudiante a cada proyecto),
//  - la reacción FINAL pendiente de cada par (reactions_local; null = la quitó), no un contador: así reenviar
//    el mismo estado no suma dos veces,
// y muestra base + pendiente. Una reacción por estudiante y proyecto, como con internet: tocar la misma la quita y
// otra distinta la reemplaza. Solo 'like' y 'excelente' cuentan como voto (igual que projects.votes en la nube).

export const REACTIONS = ['like', 'excelente', 'wow', 'destacar', 'animo'];
const COUNTS = new Set(['like', 'excelente']);

export class ReactionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ReactionError';
    this.status = status;
  }
}

/**
 * @param db   base SQLite del nodo
 * @param opts { now?: () => number }
 */
export function createReactionStore(db, { now = Date.now } = {}) {
  const base = (studentId, projectId) => db.prepare('SELECT reaction FROM cloud_reactions WHERE student_id = ? AND project_id = ?').get(studentId, Number(projectId))?.reaction ?? null;
  const local = (studentId, projectId) => db.prepare('SELECT reaction FROM reactions_local WHERE student_id = ? AND project_id = ?').get(studentId, Number(projectId));

  /** La reacción que ve el estudiante: la pendiente si la hay (puede ser null = quitada), si no la de la nube. */
  const effective = (studentId, projectId) => {
    const l = local(studentId, projectId);
    return l ? l.reaction : base(studentId, projectId);
  };

  return {
    effective,

    /** Alterna como la app: la misma reacción la quita, otra distinta la reemplaza. Devuelve { mine }. */
    react(studentId, projectId, reaction) {
      if (!REACTIONS.includes(reaction)) throw new ReactionError(400, 'Reacción no válida.');
      const next = effective(studentId, projectId) === reaction ? null : reaction;
      db.prepare(`INSERT INTO reactions_local (student_id, project_id, reaction, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id, project_id) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at`)
        .run(studentId, Number(projectId), next, new Date(now()).toISOString());
      return { mine: next };
    },

    /** Votos del proyecto: los de la nube (que ya cuentan mi reacción de la base) corregidos por mi cambio pendiente. */
    adjustVotes(studentId, projectId, cloudVotes) {
      const before = COUNTS.has(base(studentId, projectId)) ? 1 : 0;
      const after = COUNTS.has(effective(studentId, projectId)) ? 1 : 0;
      return Math.max(0, (Number(cloudVotes) || 0) - before + after);
    },

    /** Lo que falta por mandar a la nube. */
    pending() {
      return db.prepare('SELECT student_id, project_id, reaction, updated_at FROM reactions_local ORDER BY updated_at, rowid').all().map(r => ({ ...r }));
    },

    /**
     * Borra lo que la nube resolvió: confirmado en `applied` (claves "estudiante|proyecto" de applied.reactions) o
     * rechazado de forma definitiva (`errors` con permanent: true). Un error pasajero, o una función anterior que
     * no responde applied.reactions, la deja para reintentar. Si el estudiante cambió de reacción mientras se
     * sincronizaba (otro updated_at), se conserva la nueva.
     */
    clearSent(pushed = [], { applied, errors } = {}) {
      if (!Array.isArray(applied)) return;
      const done = new Set(applied);
      for (const e of (Array.isArray(errors) ? errors : [])) if (e && e.permanent === true) done.add(`${e.student_id}|${e.project_id}`);
      const del = db.prepare('DELETE FROM reactions_local WHERE student_id = ? AND project_id = ? AND updated_at = ?');
      for (const r of pushed) if (done.has(`${r.student_id}|${r.project_id}`)) del.run(r.student_id, Number(r.project_id), r.updated_at);
    },
  };
}
