// Validadores PUROS (sin red ni base de datos) de lo que sube un nodo escolar: reacciones a proyectos, avances de lecciones, acciones de la mascota
// y prácticas del Centro de Juego. Los usa index.ts; las pruebas están en tests-unit/node-sync-{reactions,completions,companion,practice}.test.mjs.
// Estaban en cuatro archivos y se juntaron en uno porque el editor de funciones de Supabase solo admite 16 archivos por función.
// TypeScript sin sintaxis no borrable (enum, namespace...) para que Node 22 también lo importe.

// ============================================================
// Reacciones a proyectos
// ============================================================
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

// ============================================================
// Avances de lecciones
// ============================================================
export type CompletionRow = { lesson_id: string; student_id: string; score: number | null; status: string };

export function sanitizeCompletions(
  raw: unknown,
  ctx: { studentIds: Set<string>; lessonIds: Set<string> },
): CompletionRow[] {
  const byKey = new Map<string, CompletionRow>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const c: any = item;
    if (!c || typeof c.lesson_id !== 'string' || typeof c.student_id !== 'string') continue;
    if (!ctx.studentIds.has(c.student_id) || !ctx.lessonIds.has(c.lesson_id)) continue;
    const score = typeof c.score === 'number' && Number.isFinite(c.score) ? Math.min(100, Math.max(0, c.score)) : null;
    const status = typeof c.status === 'string' && c.status.length > 0 && c.status.length <= 30 ? c.status : 'completed';
    const key = `${c.lesson_id}|${c.student_id}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { lesson_id: c.lesson_id, student_id: c.student_id, score, status }); continue; }
    // Mismo par repetido: gana la mejor nota y «completed» sobre lo demás.
    prev.score = score === null ? prev.score : prev.score === null ? score : Math.max(prev.score, score);
    if (prev.status !== 'completed' && status === 'completed') prev.status = 'completed';
    else if (prev.status !== 'completed' && c.status != null) prev.status = status;
  }
  return [...byKey.values()];
}

// ============================================================
// Mascota (compañero)
// ============================================================
export const COMPANION_FNS = ['choose_companion', 'buy_companion_egg', 'set_active_companion', 'buy_cosmetic', 'equip_cosmetic'];
const SPECIES = ['quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati'];
const SLOTS = ['head', 'face', 'back', 'skin'];
const ITEM = /^[a-z0-9_]{1,60}$/;

export const isCompanionFn = (fn: unknown): boolean => typeof fn === 'string' && COMPANION_FNS.includes(fn);

export type CompanionCall = { p_student_id: string; p_fn: string; p_species: string | null; p_item: string | null; p_slot: string | null };

export function validateCompanionEvent(raw: any, ctx: { studentIds: Set<string> }): { ok: true; call: CompanionCall } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || !isCompanionFn(raw.fn)) return { ok: false, error: 'Acción no soportada' };
  if (typeof raw.student_id !== 'string' || !ctx.studentIds.has(raw.student_id)) return { ok: false, error: 'El estudiante no es de la escuela de este nodo' };
  const a = raw.args && typeof raw.args === 'object' ? raw.args : {};
  const call: CompanionCall = { p_student_id: raw.student_id, p_fn: raw.fn, p_species: null, p_item: null, p_slot: null };
  if (raw.fn === 'buy_cosmetic') {
    if (typeof a.p_item !== 'string' || !ITEM.test(a.p_item)) return { ok: false, error: 'Accesorio inválido' };
    call.p_item = a.p_item;
  } else if (raw.fn === 'equip_cosmetic') {
    if (typeof a.p_slot !== 'string' || !SLOTS.includes(a.p_slot)) return { ok: false, error: 'Slot inválido' };
    if (a.p_item != null && (typeof a.p_item !== 'string' || !ITEM.test(a.p_item))) return { ok: false, error: 'Accesorio inválido' };
    call.p_slot = a.p_slot;
    call.p_item = a.p_item ?? null;
  } else {
    if (typeof a.p_species !== 'string' || !SPECIES.includes(a.p_species)) return { ok: false, error: 'Mascota inválida' };
    call.p_species = a.p_species;
  }
  return { ok: true, call };
}

// ============================================================
// Práctica del Centro de Juego
// ============================================================
const GAME_COMPETENCY: Record<string, string> = {
  quiz: 'lectura', timed_math: 'matematica', debug: 'pensamiento', hangman: 'lenguaje', spelling: 'lenguaje',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 3600_000;

export type PracticeRow = {
  student_id: string; client_ref: string; game: string; competency: string; topic: string | null; correct: number; total: number;
  score: number; duration_ms: number | null; source: 'ai' | 'bank'; played_at: string;
};

/** `raw` = { student_id, args: { p_game, p_topic, p_correct, p_total, p_duration_ms, p_source, p_client_ref, p_played_at } }. */
export function validatePracticeEvent(
  raw: any,
  ctx: { studentIds: Set<string>; now: number },
): { ok: true; row: PracticeRow } | { ok: false; error: string } {
  const a = raw?.args;
  const studentId = typeof raw?.student_id === 'string' ? raw.student_id : '';
  if (!studentId || !ctx.studentIds.has(studentId)) return { ok: false, error: 'Estudiante no encontrado en esta escuela' };
  if (!a || typeof a !== 'object') return { ok: false, error: 'Falta el resultado' };
  const game = String(a.p_game ?? '');
  if (!(game in GAME_COMPETENCY)) return { ok: false, error: 'Juego no válido' };
  const total = a.p_total, correct = a.p_correct;
  if (!Number.isInteger(total) || total < 1 || total > 50 || !Number.isInteger(correct) || correct < 0 || correct > total) {
    return { ok: false, error: 'Resultado no válido' };
  }
  if (typeof a.p_client_ref !== 'string' || !UUID.test(a.p_client_ref)) return { ok: false, error: 'Falta la referencia del registro' };
  const duration = a.p_duration_ms ?? null;
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 3_600_000)) return { ok: false, error: 'Duración no válida' };

  // La práctica sin internet se sube después: la hora del dispositivo vale solo si es razonable (hasta 30 días atrás, no del futuro).
  const asked = typeof a.p_played_at === 'string' ? Date.parse(a.p_played_at) : NaN;
  const played = Number.isNaN(asked) || asked > ctx.now + 5 * 60_000 || asked < ctx.now - 30 * DAY_MS ? ctx.now : asked;

  return {
    ok: true,
    row: {
      student_id: studentId, client_ref: a.p_client_ref, game, competency: GAME_COMPETENCY[game],
      topic: typeof a.p_topic === 'string' ? a.p_topic.slice(0, 200) : null,
      correct, total, score: Math.round((correct / total) * 1000) / 1000, duration_ms: duration,
      source: a.p_source === 'bank' ? 'bank' : 'ai', played_at: new Date(played).toISOString(),
    },
  };
}

// ============================================================
// Foto de perfil cambiada en el nodo sin internet
// ============================================================
// La imagen sube a Storage con una URL firmada (acción profile_photo_upload_url) y después el nodo manda la función claim_first_profile_photo_reward con el NOMBRE de la imagen;
// la nube arma la dirección pública ella misma y la aplica con apply_node_profile_photo (migrations/node-profile-photo.sql). `member` = el usuario es un estudiante de la escuela
// del nodo o un docente asignado a ella (lo averigua index.ts con la base).
export const PROFILE_PHOTO_FN = 'claim_first_profile_photo_reward';
export const PROFILE_PHOTO_BUCKET = 'profile-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const isProfilePhotoFn = (fn: unknown): boolean => fn === PROFILE_PHOTO_FN;

/** `<id del usuario>_<hora>.<extensión>`, el nombre que arma la app; el id es un UUID y el prefijo tiene que ser el del propio usuario. */
export function validProfilePhotoName(name: unknown, userId: unknown): boolean {
  if (typeof name !== 'string' || typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return false;
  return new RegExp('^' + userId + '_\\d{9,15}\\.(png|jpe?g|webp|gif)$', 'i').test(name);
}

export function validateProfilePhotoRequest(body: any, ctx: { member: boolean }): { ok: true; path: string } | { ok: false; error: string } {
  if (!body || !validProfilePhotoName(body.name, body.user_id)) return { ok: false, error: 'El nombre de la foto no es válido' };
  if (!ctx.member) return { ok: false, error: 'Ese usuario no es de la escuela de este nodo' };
  if (!Number.isInteger(body.size) || body.size < 1 || body.size > MAX_PHOTO_BYTES) return { ok: false, error: 'La foto no debe superar 5MB' };
  return { ok: true, path: body.name };
}

export function validateProfilePhotoEvent(raw: any, ctx: { member: boolean }): { ok: true; call: { p_user: string; p_name: string } } | { ok: false; error: string } {
  if (!raw || raw.fn !== PROFILE_PHOTO_FN) return { ok: false, error: 'Acción no soportada' };
  const name = raw.args?.p_name;
  if (!validProfilePhotoName(name, raw.student_id)) return { ok: false, error: 'El nombre de la foto no es válido' };
  if (!ctx.member) return { ok: false, error: 'Ese usuario no es de la escuela de este nodo' };
  return { ok: true, call: { p_user: raw.student_id, p_name: name } };
}
