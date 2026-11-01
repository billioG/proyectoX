// Lógica PURA de las reacciones a proyectos que sube un nodo escolar (sin red ni base de datos, para poder
// probarla). La usa index.ts; las pruebas están en tests-unit/node-sync-reactions.test.mjs.
// TypeScript sin sintaxis no borrable (enum, namespace...) para que Node 22 también la importe.
// Las cinco reacciones son las mismas de migrations/project-reactions.sql y de js/reactions.js.

export const REACTIONS: ReadonlyArray<string> = ['like', 'excelente', 'wow', 'destacar', 'animo'];

const MAX_PROJECT_ID = 2147483647; // integer de Postgres (projects.id)

type Fail = { ok: false; error: string };

/**
 * Un evento es la reacción FINAL de un estudiante a un proyecto (null = la quitó), no un contador: así reenviarlo
 * no suma dos veces. El nodo ya validó, pero NO es de confianza total: aquí se valida otra vez.
 */
export function validateReactionEvent(
  ev: { student_id?: unknown; project_id?: unknown; reaction?: unknown },
  ctx: { studentIds: Set<string> },
): { ok: true; event: { student_id: string; project_id: number; reaction: string | null } } | Fail {
  if (typeof ev.student_id !== 'string' || !ctx.studentIds.has(ev.student_id)) return { ok: false, error: 'El estudiante no es de la escuela de este nodo.' };
  const id = ev.project_id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_PROJECT_ID) return { ok: false, error: 'Proyecto inválido.' };
  if (ev.reaction !== null && (typeof ev.reaction !== 'string' || !REACTIONS.includes(ev.reaction))) return { ok: false, error: 'Reacción no válida.' };
  return { ok: true, event: { student_id: ev.student_id, project_id: id, reaction: ev.reaction as string | null } };
}
