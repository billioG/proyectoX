// Inicio del estudiante en el nodo: arma la lista de proyectos con las mismas reglas de visibilidad
// que la nube (aprobado, o del propio estudiante, o de su equipo) pero SOLO de su grado y sección,
// porque son menores. Las fichas vienen del pull (cloud_projects, sin videos); además se muestran,
// primero, los proyectos propios guardados en este nodo que todavía no están en esas fichas.

/**
 * @param db        base SQLite del nodo
 * @param student   fila de students (id, grade, section)
 * @param localRows store.feedRows(student.id)
 * @returns FeedItem[] = { id, title, description, bimestre, score, votes, created_at, author_name,
 *                         group_name, kind, feedback, mine, state: 'cloud'|'uploading'|'pending'|'synced' }
 */
import { createReactionStore } from './reactions.js';
import { createEvaluationStore } from './evaluations.js';

export function buildStudentFeed(db, student, localRows = []) {
  const reactions = createReactionStore(db);
  const evaluations = createEvaluationStore(db);
  const myGroups = new Set(db.prepare('SELECT group_id FROM group_members WHERE student_id = ?').all(student.id).map(m => m.group_id));
  const cloud = db.prepare('SELECT * FROM cloud_projects WHERE grade = ? AND section = ? ORDER BY created_at DESC, id').all(student.grade, student.section);

  const items = [];
  const cloudIds = new Set(cloud.map(p => p.id));
  for (const p of cloud) {
    const mine = p.user_id === student.id;
    const team = p.group_id !== null && myGroups.has(p.group_id);
    // Si un docente ya evaluó en este nodo, la nota y la observación nuevas mandan sobre las de la última sincronización.
    const ev = evaluations.effectiveForCloud(p.id);
    const score = ev ? ev.total_score : p.score;
    const feedback = ev ? ev.feedback || null : p.feedback;
    if (!(score > 0) && !mine && !team) continue;
    items.push({
      id: p.id, title: p.title, description: p.description, bimestre: p.bimestre, score, votes: p.votes,
      created_at: p.created_at, author_name: p.author_name, group_name: p.group_name, kind: p.kind,
      feedback: mine || team ? feedback : null, mine, state: 'cloud',
      // Mi reacción (la pendiente o la de la última sincronización) y los votos con todo lo pendiente del nodo.
      my_reaction: reactions.effective(student.id, p.id), votes: reactions.adjustVotes(p.id, p.votes),
    });
  }

  // Propios guardados en el nodo que la nube todavía no muestra: primero.
  const local = [];
  for (const r of localRows) {
    if (r.cloud_project_id && cloudIds.has(r.cloud_project_id)) continue;
    const lev = evaluations.effectiveForLocal(r.id);
    local.push({
      id: r.id, title: r.title, description: r.description, bimestre: r.bimestre, score: lev ? lev.total_score : null, votes: 0,
      created_at: r.created_at, author_name: '', group_name: null, kind: r.kind === 'model' ? 'model' : 'video',
      feedback: lev ? lev.feedback || null : null, mine: true, state: r.status, my_reaction: null,
    });
  }
  return [...local, ...items];
}
