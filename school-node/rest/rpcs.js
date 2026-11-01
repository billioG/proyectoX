// Funciones (RPC) de la nube que la app llama y que el nodo emula con la misma respuesta. `ctx` = quién llama.
// Las que cambian datos del estudiante no tocan la réplica: anotan lo pendiente (xp.js) y la nube lo valida al sincronizar.
import { RestError } from './query.js';

const unavailable = (what) => new RestError(400, `${what} aún no está disponible sin internet`, 'P0001');

export function createRpcs({ store, xp }) {
  const studentOnly = (ctx, what) => { if (ctx?.role !== 'student') throw unavailable(what); };

  return {
    // La app lo llama cada 30 s para el tiempo de actividad: sin internet no se registra.
    record_active_heartbeat: () => null,

    // La racha la calcula la nube (con la fecha real de su base): el nodo no inventa cambios, devuelve el estado actual.
    touch_daily_login: (args, ctx) => {
      studentOnly(ctx, 'La racha diaria');
      const row = store.all('students').find((s) => s.id === ctx.uid);
      return { streak: row?.streak || 0, changed: false, lastLogin: row?.last_login ?? null };
    },

    claim_daily_chest: (args, ctx) => {
      studentOnly(ctx, 'El cofre diario');
      return xp.claimChest(ctx.uid);
    },
  };
}
