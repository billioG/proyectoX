// Funciones (RPC) de la nube que la app llama y que el nodo emula con la misma respuesta. `ctx` = quién llama.
// Las que cambian datos del estudiante no tocan la réplica: anotan lo pendiente (xp.js) y la nube lo valida al sincronizar.
import { RestError } from './query.js';
import { createProgress } from './progress.js';
import { REACTIONS } from '../reactions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAMES = ['quiz', 'hangman', 'spelling', 'debug', 'timed_math'];
const MAX_PENDING_PRACTICE = 500;
const CRITERIA = ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact'];
const invalid = (message) => new RestError(400, message, 'P0001');
const unavailable = (what) => new RestError(400, `${what} aún no está disponible sin internet`, 'P0001');

export function createRpcs({ store, xp, now = Date.now, reactions = null, companion = null, duels = null, hangman = null, profilePhoto = null }) {
  const progress = createProgress({ store, now });
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

    // Mascota: mismas reglas y mensajes que la nube; se ve al instante y la nube la aplica al sincronizar (companion.js).
    choose_companion: (args, ctx) => companion.perform('choose_companion', args, ctx),
    buy_companion_egg: (args, ctx) => companion.perform('buy_companion_egg', args, ctx),
    set_active_companion: (args, ctx) => companion.perform('set_active_companion', args, ctx),
    buy_cosmetic: (args, ctx) => companion.perform('buy_cosmetic', args, ctx),
    equip_cosmetic: (args, ctx) => companion.perform('equip_cosmetic', args, ctx),

    // Retos Contrarreloj (duels.js): los de quiz, ortografía y depuración usan IA para crear el contenido y solo funcionan con internet.
    accept_timed_math_duel: (args, ctx) => duels.accept(args, ctx),
    start_timed_math_duel: (args, ctx) => duels.start(args, ctx),
    submit_timed_math_result: (args, ctx) => duels.submit(args, ctx),

    // Ahorcado: el tema tiene que ser del banco fijo; la palabra de cada jugador no sale del nodo.
    assign_hangman_bank_word: (args, ctx) => hangman.assign(args, ctx),
    start_hangman_duel: (args, ctx) => hangman.start(args, ctx),
    check_hangman_letter: (args, ctx) => hangman.check(args, ctx),
    submit_hangman_result: (args, ctx) => hangman.submit(args, ctx),
    get_duel_fact: (args, ctx) => hangman.fact(args, ctx),

    // Cambiar la foto de perfil (la imagen ya está guardada en el servidor, profile-photos.js): se ve al instante y la nube lo aplica al sincronizar.
    claim_first_profile_photo_reward: (args, ctx) => {
      if (!profilePhoto) throw unavailable('Cambiar la foto de perfil');
      return profilePhoto.claim(args, ctx);
    },

    // Mis notas de exámenes (el estudiante): el examen sin su clave y mi resultado.
    my_exam_results: (args, ctx) => {
      if (ctx?.role !== 'student') return [];
      const exams = new Map(store.all('exams').map((e) => [e.id, e]));
      return store.all('exam_results').filter((r) => r.student_id === ctx.uid && exams.has(r.exam_id))
        .sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)))
        .map((r) => { const e = exams.get(r.exam_id); return { exam_id: e.id, title: e.title, bimestre: e.bimestre, points: e.points, score: r.score, correct: r.correct, wrong: r.wrong, blank: r.blank, question_count: e.question_count, scanned_at: r.scanned_at }; });
    },

    // Reacciones a proyectos (estudiantes): una por estudiante y proyecto, como con internet. Se ven al instante; la nube las cuenta al sincronizar
    // (el almacén de reacciones del nodo, reactions.js, guarda solo la reacción FINAL de cada par, así reenviar no suma dos veces).
    react_to_project: (args, ctx) => {
      if (ctx?.role !== 'student' || !reactions) throw invalid('Solo estudiantes pueden reaccionar');
      const id = args?.p_project_id;
      const project = Number.isInteger(id) ? store.raw('projects').find((p) => p.id === id) : null; // sin la vista: adjustVotes ya corrige
      if (!project) throw invalid('Proyecto no encontrado');
      if (id >= 1_500_000_000) throw unavailable('Reaccionar a un proyecto que aún no se publica en la nube');
      if (!REACTIONS.includes(args?.p_reaction)) throw invalid('Reacción no válida');
      const { mine } = reactions.react(ctx.uid, id, args.p_reaction);
      const likeId = `${ctx.uid}:${id}`;
      const mineRow = store.all('project_likes').find((l) => l.project_id === id && l.user_id === ctx.uid);
      if (mine === null) { if (mineRow) store.remove('project_likes', mineRow.id); }
      else store.put('project_likes', { ...(mineRow || { id: likeId, project_id: id, user_id: ctx.uid, created_at: new Date(now()).toISOString() }), reaction: mine });
      return { mine, votes: reactions.adjustVotes(id, project.votes) };
    },
    get_project_reactions: (args, ctx) => {
      const id = args?.p_project_id;
      if (!reactions || !Number.isInteger(id)) throw invalid('Proyecto no encontrado');
      const counts = Object.fromEntries(REACTIONS.map((r) => [r, 0]));
      // La nube + lo pendiente de este nodo: el estado final de cada par (estudiante, proyecto) reemplaza al de la nube.
      const pending = new Map(reactions.pending().filter((p) => Number(p.project_id) === id).map((p) => [p.student_id, p.reaction]));
      for (const l of store.all('project_likes')) {
        if (l.project_id !== id || pending.has(l.user_id) || !(l.reaction in counts)) continue;
        counts[l.reaction]++;
      }
      for (const r of pending.values()) if (r && r in counts) counts[r]++;
      return { counts, mine: ctx?.role === 'student' ? reactions.effective(ctx.uid, id) : null };
    },

    // Progreso de práctica (pantalla de Progreso del docente y «Mi progreso» del estudiante): se calcula aquí con lo que bajó de la nube y lo pendiente.
    get_groups_progress: (args, ctx) => progress.getGroupsProgress(args, ctx),
    get_group_progress: (args, ctx) => progress.getGroupProgress(args, ctx),
    get_my_progress: (args, ctx) => progress.getMyProgress(args, ctx),

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
