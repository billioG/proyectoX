// Mascota (compañero) del estudiante en la capa local: elegir la primera, comprar huevos, cambiar de compañero, comprar y ponerse accesorios.
// Las MISMAS reglas y mensajes que las funciones de la nube (migrations/companion-collection.sql y companion-cosmetics.sql). La nube es la única
// que guarda gemas y mascotas: el nodo anota cada acción en la bandeja (_rpc), la reproduce sobre lo que bajó la sincronización para que el
// estudiante la vea al instante, y la nube la aplica al sincronizar (apply_node_companion, migrations/node-companion.sql). Si la nube la
// rechaza (por ejemplo, gastó las gemas en otro lado), su estado manda en la siguiente bajada.
import crypto from 'node:crypto';
import { RestError } from './query.js';

export const SPECIES = ['quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati'];
export const SLOTS = ['head', 'face', 'back', 'skin'];
export const EGG_PRICE = 150;
export const COMPANION_FNS = ['choose_companion', 'buy_companion_egg', 'set_active_companion', 'buy_cosmetic', 'equip_cosmetic'];
// Mismos umbrales que companion_stage() de la nube (y STAGE_THRESHOLDS de js/companion.js).
export const stageOf = (total) => (total >= 1600 ? 5 : total >= 1000 ? 4 : total >= 600 ? 3 : total >= 300 ? 2 : total >= 100 ? 1 : 0);
const bad = (message) => new RestError(400, message, 'P0001');

/** Estado inicial: lo que bajó de la nube (más las gemas ya sumadas por lo ganado aquí). */
export function baseState(student, { companions = [], cosmetics = [] } = {}) {
  return {
    species: student.companion_species ?? null,
    equipped: { ...(student.companion_equipped || {}) },
    gems: Number(student.gems) || 0,
    earned: Number(student.gems_earned_total) || 0,
    owned: new Set(companions),
    cosmetics: new Set(cosmetics),
  };
}

/** Aplica UNA acción a un estado (nuevo objeto) o lanza el mismo error que daría la nube. catalog: Map(id -> { slot, price, min_stage }). */
export function applyAction(state, { fn, args }, catalog) {
  const s = { ...state, equipped: { ...state.equipped }, owned: new Set(state.owned), cosmetics: new Set(state.cosmetics) };
  const species = args?.p_species;
  switch (fn) {
    case 'choose_companion':
      if (!SPECIES.includes(species)) throw bad('Mascota inválida');
      if (s.species !== null) throw bad('Ya elegiste tu primera mascota: las demás se consiguen en la Quetzadex');
      s.species = species;
      s.owned.add(species);
      s.result = species;
      return s;
    case 'buy_companion_egg':
      if (!SPECIES.includes(species)) throw bad('Mascota inválida');
      if (s.species === null) throw bad('Primero elegí tu mascota inicial (es gratis)');
      if (s.owned.has(species)) throw bad('Ya tenés esta mascota');
      if (s.gems < EGG_PRICE) throw bad(`Te faltan ${EGG_PRICE - s.gems} gemas para este huevo`);
      s.gems -= EGG_PRICE;
      s.species = species;
      s.owned.add(species);
      s.result = { species, gems: s.gems };
      return s;
    case 'set_active_companion':
      if (!s.owned.has(species)) throw bad('Todavía no tenés esa mascota');
      s.species = species;
      s.result = species;
      return s;
    case 'buy_cosmetic': {
      const item = catalog.get(args?.p_item);
      if (!item) throw bad('Ese accesorio no existe');
      if (item.price === 0) throw bad('Este se desbloquea gratis al evolucionar');
      if (stageOf(s.earned) < item.min_stage) throw bad('Tu mascota todavía no evolucionó lo suficiente');
      if (s.cosmetics.has(args.p_item)) throw bad('Ya lo tenés');
      if (s.gems < item.price) throw bad('No tenés suficientes gemas');
      s.gems -= item.price;
      s.cosmetics.add(args.p_item);
      s.result = { gems: s.gems };
      return s;
    }
    case 'equip_cosmetic': {
      const slot = args?.p_slot;
      if (!SLOTS.includes(slot)) throw bad('Slot inválido');
      if (args.p_item == null) delete s.equipped[slot];
      else {
        const item = catalog.get(args.p_item);
        if (!item || item.slot !== slot) throw bad('Accesorio inválido');
        if (stageOf(s.earned) < item.min_stage) throw bad('Tu mascota todavía no evolucionó lo suficiente');
        if (item.price > 0 && !s.cosmetics.has(args.p_item)) throw bad('Todavía no lo compraste');
        s.equipped[slot] = args.p_item;
      }
      s.result = { ...s.equipped };
      return s;
    }
    default:
      throw bad('Acción no soportada');
  }
}

/** Solo los campos conocidos y acotados (lo demás no se guarda ni viaja a la nube). */
function cleanArgs(fn, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (fn === 'buy_cosmetic') return { p_item: typeof a.p_item === 'string' ? a.p_item.slice(0, 60) : null };
  if (fn === 'equip_cosmetic') return { p_slot: typeof a.p_slot === 'string' ? a.p_slot.slice(0, 10) : null, p_item: typeof a.p_item === 'string' ? a.p_item.slice(0, 60) : null };
  return { p_species: typeof a.p_species === 'string' ? a.p_species.slice(0, 20) : null };
}

export function createCompanion({ store, xp }) {
  const MAX_PENDING = 100;
  const catalog = () => new Map(store.raw('cosmetic_items').map((i) => [i.id, { slot: i.slot, price: Number(i.price) || 0, min_stage: Number(i.min_stage) || 0 }]));
  const pendingOf = (uid) => store.pending().filter((e) => e.table === '_rpc' && COMPANION_FNS.includes(e.op) && e.row?.student_id === uid)
    .map((e) => ({ fn: e.op, args: e.row.args }));
  const baseFor = (uid) => {
    const raw = store.raw('students').find((s) => s.id === uid);
    if (!raw) return null;
    const row = xp.overlay()(raw); // las gemas ganadas aquí ya cuentan
    return baseState(row, {
      companions: store.raw('student_companions').filter((c) => c.student_id === uid).map((c) => c.species),
      cosmetics: store.raw('student_cosmetics').filter((c) => c.student_id === uid).map((c) => c.item_id),
    });
  };
  const replay = (uid) => {
    const base = baseFor(uid);
    if (!base) return null;
    const items = catalog();
    let state = base;
    for (const a of pendingOf(uid)) { try { state = applyAction(state, a, items); } catch { /* la nube mandará: esa acción ya no cambia nada aquí */ } }
    return { base, state };
  };

  return {
    /** Valida la acción nueva sobre el estado actual y la anota; devuelve lo mismo que la función de la nube. */
    perform(fn, args, ctx) {
      if (ctx?.role !== 'student') throw bad('Solo los estudiantes tienen mascota');
      const r = replay(ctx.uid);
      if (!r) throw bad('Solo los estudiantes tienen mascota');
      if (pendingOf(ctx.uid).length >= MAX_PENDING) throw bad('Tienes muchas acciones esperando para subirse: conéctate a internet para sincronizar');
      const clean = cleanArgs(fn, args);
      const next = applyAction(r.state, { fn, args: clean }, catalog());
      store.enqueue([{ op: fn, table: '_rpc', row: { ref: crypto.randomUUID(), student_id: ctx.uid, args: clean } }]);
      return next.result;
    },

    /** Vista de `students`: su mascota, lo que lleva puesto y sus gemas, con lo pendiente aplicado. */
    overlayStudents() {
      const uids = new Set(store.pending().filter((e) => e.table === '_rpc' && COMPANION_FNS.includes(e.op)).map((e) => e.row?.student_id));
      if (!uids.size) return (row) => row;
      const states = new Map();
      for (const uid of uids) { const r = replay(uid); if (r) states.set(uid, r.state); }
      return (row) => {
        const s = states.get(row.id);
        return s ? { ...row, companion_species: s.species, companion_equipped: s.equipped, gems: s.gems } : row;
      };
    },

    /** Filas de student_companions / student_cosmetics que existen por acciones pendientes y la nube aún no confirma. */
    extraCompanions() {
      const out = [];
      for (const uid of new Set(store.pending().filter((e) => e.table === '_rpc' && COMPANION_FNS.includes(e.op)).map((e) => e.row?.student_id))) {
        const r = replay(uid);
        if (!r) continue;
        for (const sp of r.state.owned) if (!r.base.owned.has(sp)) out.push({ id: `${uid}:${sp}`, student_id: uid, species: sp, obtained_at: new Date(0).toISOString() });
      }
      return out;
    },
    extraCosmetics() {
      const out = [];
      for (const uid of new Set(store.pending().filter((e) => e.table === '_rpc' && COMPANION_FNS.includes(e.op)).map((e) => e.row?.student_id))) {
        const r = replay(uid);
        if (!r) continue;
        for (const it of r.state.cosmetics) if (!r.base.cosmetics.has(it)) out.push({ id: `${uid}:${it}`, student_id: uid, item_id: it, acquired_at: new Date(0).toISOString() });
      }
      return out;
    },
  };
}
