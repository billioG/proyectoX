// Funciones (RPC) de la nube que la app llama y que el nodo emula con la misma respuesta. `ctx` = quién llama.
// Las que cambian datos del estudiante no tocan la réplica: anotan lo pendiente (xp.js) y la nube lo valida al sincronizar.
import { RestError } from './query.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAMES = ['quiz', 'hangman', 'spelling', 'debug', 'timed_math'];
const invalid = (message) => new RestError(400, message, 'P0001');
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

    // Práctica del Centro de Juego (no necesita IA): mismas reglas que la nube; la nube la guarda al sincronizar.
    log_practice: (args, ctx) => {
      // Solo estudiantes: si un docente prueba la práctica no se guarda nada (igual que en la nube).
      if (ctx?.role !== 'student') return null;
      if (!GAMES.includes(args?.p_game)) throw invalid('Juego no válido');
      const { p_total: total, p_correct: correct } = args;
      if (!Number.isInteger(total) || total < 1 || total > 50 || !Number.isInteger(correct) || correct < 0 || correct > total) throw invalid('Resultado no válido');
      if (typeof args.p_client_ref !== 'string' || !UUID.test(args.p_client_ref)) throw invalid('Falta la referencia del registro');
      if (store.hasPendingRpc('log_practice', args.p_client_ref)) return null; // reintento de la app: ya está anotada
      store.enqueue([{ op: 'log_practice', table: '_rpc', row: { ref: args.p_client_ref, student_id: ctx.uid, args } }]);
      return null;
    },

    claim_daily_chest: (args, ctx) => {
      studentOnly(ctx, 'El cofre diario');
      return xp.claimChest(ctx.uid);
    },
  };
}
