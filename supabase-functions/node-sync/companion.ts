// Acciones de la mascota (compañero) que un estudiante hizo EN EL NODO sin internet: elegir la primera, comprar un huevo, cambiar de compañero,
// comprar y ponerse accesorios. Lógica pura (sin red ni base de datos) para probarla: aquí solo se valida la FORMA de lo que manda el nodo; las
// reglas del juego (gemas, etapas, si ya la tiene...) las aplica la función SQL apply_node_companion (migrations/node-companion.sql), las mismas
// de la nube. Pruebas: tests-unit/node-sync-companion.test.mjs. TypeScript sin sintaxis no borrable (Node 22 lo importa).

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
