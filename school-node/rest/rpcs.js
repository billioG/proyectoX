// Funciones (RPC) de la nube que la app llama y que el nodo emula con la misma respuesta. `ctx` = quién llama.
// Las que cambian datos del estudiante no tocan la réplica: anotan lo pendiente (xp.js) y la nube lo valida al sincronizar.
import { RestError } from './query.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAMES = ['quiz', 'hangman', 'spelling', 'debug', 'timed_math'];
const MAX_PENDING_PRACTICE = 500;
const CRITERIA = ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact'];
const invalid = (message) => new RestError(400, message, 'P0001');
const unavailable = (what) => new RestError(400, `${what} aún no está disponible sin internet`, 'P0001');

export function createRpcs({ store, xp, now = Date.now }) {
  const studentOnly = (ctx, what) => { if (ctx?.role !== 'student') throw unavailable(what); };

  return {
    // La app lo llama cada 30 s para el tiempo de actividad: sin internet no se registra.
    record_active_heartbeat: () => null,

    // La racha la calcula la nube (con la fecha real de su base): el nodo no inventa cambios, devuelve el estado actual.
    touch_daily_login: (args, ctx) => {
      if (ctx?.role !== 'student' && ctx?.role !== 'teacher') throw unavailable('La racha diaria');
      const row = store.all(ctx.role === 'student' ? 'students' : 'teachers').find((s) => s.id === ctx.uid);
      return { streak: row?.streak || 0, changed: false, lastLogin: row?.last_login ?? null };
    },

    // Progreso de los grupos del docente (pantalla de Progreso): todavía no se calcula en el nodo.
    get_groups_progress: () => [],

    // Práctica del Centro de Juego (no necesita IA): mismas reglas que la nube; la nube la guarda al sincronizar.
    log_practice: (args, ctx) => {
      // Solo estudiantes: si un docente prueba la práctica no se guarda nada (igual que en la nube).
      if (ctx?.role !== 'student') return null;
      if (!GAMES.includes(args?.p_game)) throw invalid('Juego no válido');
      const { p_total: total, p_correct: correct } = args;
      if (!Number.isInteger(total) || total < 1 || total > 50 || !Number.isInteger(correct) || correct < 0 || correct > total) throw invalid('Resultado no válido');
      if (typeof args.p_client_ref !== 'string' || !UUID.test(args.p_client_ref)) throw invalid('Falta la referencia del registro');
      if (store.hasPendingRpc('log_practice', args.p_client_ref)) return null; // reintento de la app: ya está anotada
      if (store.pendingRpcCount('log_practice', ctx.uid) >= MAX_PENDING_PRACTICE) return null; // tope (la nube también tiene uno por día)
      // Solo los campos conocidos y acotados: lo demás no se guarda ni viaja a la nube.
      const clean = {
        p_game: args.p_game, p_topic: typeof args.p_topic === 'string' ? args.p_topic.slice(0, 200) : null, p_correct: correct, p_total: total,
        p_duration_ms: Number.isInteger(args.p_duration_ms) ? args.p_duration_ms : null, p_source: args.p_source === 'bank' ? 'bank' : 'ai',
        p_client_ref: args.p_client_ref, p_played_at: typeof args.p_played_at === 'string' ? args.p_played_at.slice(0, 40) : null,
      };
      store.enqueue([{ op: 'log_practice', table: '_rpc', row: { ref: clean.p_client_ref, student_id: ctx.uid, args: clean } }]);
      return null;
    },

    // Evaluar un proyecto (la cola de la app lo llama al guardar): mismas reglas que la nube (docente asignado a la clase del proyecto,
    // cinco notas enteras de 0 a 20, total recalculado). Se ve al instante y la nube la valida de nuevo al sincronizar.
    sync_save_evaluation: (args, ctx) => {
      if (ctx?.role !== 'teacher') throw invalid('Solo docentes pueden evaluar proyectos');
      const ev = args?.p_evaluation;
      if (!ev || typeof ev !== 'object') throw invalid('Falta la evaluación');
      const projectId = ev.project_id;
      if (!Number.isInteger(projectId) || projectId < 1) throw invalid('Proyecto inválido');
      const project = store.all('projects').find((p) => p.id === projectId);
      if (!project) throw invalid('Proyecto no encontrado');
      const author = store.all('students').find((s) => s.id === project.user_id);
      const assigned = store.all('teacher_assignments').some((a) => a.teacher_id === ctx.uid && author
        && a.school_code === author.school_code && a.grade === author.grade && a.section === author.section);
      if (!assigned) throw invalid('El proyecto no es de una de tus clases');
      const scores = {};
      let total = 0;
      for (const c of CRITERIA) {
        const v = ev[`${c}_score`];
        if (!Number.isInteger(v) || v < 0 || v > 20) throw invalid(`La nota de ${c} debe ser un entero de 0 a 20`);
        scores[`${c}_score`] = v;
        total += v;
      }
      if (ev.feedback != null && typeof ev.feedback !== 'string') throw invalid('La observación debe ser texto');
      // Caracteres de control a espacio; el HTML no se toca (la app lo muestra siempre escapado).
      const feedback = String(ev.feedback ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);

      const existing = store.all('evaluations').find((e) => e.project_id === projectId);
      store.put('evaluations', { id: existing?.id ?? `local-${projectId}`, project_id: projectId, teacher_id: ctx.uid, ...scores, total_score: total,
        comments: null, created_at: existing?.created_at ?? new Date(now()).toISOString(), feedback });
      store.put('projects', { ...project, score: total });
      // El docente es siempre quien llama: el teacher_id de los datos se ignora.
      store.replacePendingRpc('sync_save_evaluation', String(projectId), { teacher_id: ctx.uid, args: { project_id: projectId, ...scores, feedback } });
      return null;
    },

    claim_daily_chest: (args, ctx) => {
      studentOnly(ctx, 'El cofre diario');
      return xp.claimChest(ctx.uid);
    },
  };
}
