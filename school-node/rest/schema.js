// Esquema que sirve la capa local compatible con Supabase: LISTA PERMITIDA de tablas y columnas (según el esquema
// real de la nube, exportado de information_schema) y sus relaciones (claves foráneas). Lo que no está aquí no existe
// para el navegador: columnas como pin_hash, pin_salt, upload_ip o client_metadata dan error 400, y tablas como
// xp_events, class_passwords, student_guardians o school_nodes responden 404.
//
// `masked`: columnas que la app pide en sus consultas (p. ej. STUDENT_COLS pide email, fecha de nacimiento y género)
// pero que el nodo NUNCA sirve: se aceptan en el select y valen siempre null.
//
// Tablas de la prueba de concepto (F1, estudiante). Las que no tienen una sola columna de identificación
// (class_weekly_topics, student_companions, student_cosmetics...) se añaden cuando el almacén soporte claves compuestas.

const table = (def) => def;
// Lo que la app consulta al entrar y el nodo todavía no tiene: responde vacío (nada pendiente) en vez de error.
const emptyTable = () => ({ pk: 'id', columns: [], relations: {}, empty: true });

export const SCHEMA = {
  schools: table({
    pk: 'id',
    columns: ['id', 'code', 'name', 'address', 'department', 'municipality', 'sector', 'level', 'schedule', 'area', 'created_at',
      'latitude', 'longitude', 'geofence_radius', 'projects_per_bimestre', 'programa', 'public_projects'],
    masked: ['phone', 'email'],
    relations: {},
  }),

  students: table({
    pk: 'id',
    columns: ['id', 'full_name', 'username', 'school_code', 'grade', 'section', 'profile_photo_url', 'role', 'created_at', 'xp', 'gems',
      'streak', 'last_login', 'streak_freeze', 'daily_chest_last_claimed', 'gems_earned_total', 'has_gold_frame', 'has_mascot_glasses',
      'status', 'companion_equipped', 'companion_species', 'season_id', 'season_xp', 'league_tier', 'league_week', 'league_last_result',
      'duel_win_streak', 'best_duel_win_streak'],
    masked: ['email', 'cui', 'birth_date', 'gender', 'codigo_personal', 'qr_code', 'qr_data', 'password_generated', 'created_by', 'pin_updated_at'],
    relations: { schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' } },
  }),

  teachers: table({
    pk: 'id',
    columns: ['id', 'full_name', 'profile_photo_url', 'role', 'created_at', 'xp', 'gems', 'streak', 'last_login', 'daily_chest_last_claimed',
      'rank_title', 'certification_points', 'is_coordinator'],
    masked: ['email', 'phone', 'birth_date', 'base_salary', 'bonus_admin_max', 'bonus_prod_max', 'bonus_coordinator_max', 'is_1bot_team'],
    relations: {},
  }),

  teacher_assignments: table({
    pk: 'id',
    columns: ['id', 'teacher_id', 'school_code', 'grade', 'section', 'created_at'],
    relations: { schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' } },
  }),

  // Equipos: el docente los arma sin internet. En la nube el id es un serial; lo que se crea aquí recibe un número entero en un rango reservado
  // (no choca con los de la nube y sirve tal cual al sincronizar). Al borrar un equipo se van sus miembros.
  groups: table({
    pk: 'id',
    columns: ['id', 'name', 'school_code', 'grade', 'section', 'created_by', 'created_at'],
    writable: ['name', 'school_code', 'grade', 'section'],
    defaults: { id: () => 1_500_000_000 + Math.floor(Math.random() * 500_000_000), created_at: () => new Date().toISOString() },
    cascade: [{ table: 'group_members', fk: 'group_id' }],
    relations: {
      group_members: { type: 'many', table: 'group_members', fk: 'group_id', ref: 'id' },
      projects: { type: 'many', table: 'projects', fk: 'group_id', ref: 'id' },
      schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' },
    },
  }),

  group_members: table({
    pk: 'id',
    columns: ['id', 'group_id', 'student_id', 'role', 'is_leader', 'created_at'],
    writable: ['group_id', 'student_id', 'role', 'is_leader'],
    coerce: { group_id: 'integer' },
    unique: [['group_id', 'student_id']],
    defaults: { id: () => 1_500_000_000 + Math.floor(Math.random() * 500_000_000), created_at: () => new Date().toISOString() },
    relations: {
      groups: { type: 'one', table: 'groups', fk: 'group_id', ref: 'id' },
      students: { type: 'one', table: 'students', fk: 'student_id', ref: 'id' },
    },
  }),

  // Proyectos: el estudiante sube el suyo con la app real. La fila local sale ya (id de un rango reservado) y NO viaja por la bandeja: el archivo y los
  // datos pasan al almacén de proyectos del nodo (projects.js), que los sube a la nube por el camino ya probado. Al sincronizar, la bajada
  // trae el proyecto con su id de la nube y reemplaza a esta fila. `ignore`: lo que la app manda y el nodo no guarda (IP, metadatos, miniatura).
  projects: table({
    pk: 'id',
    noPush: true,
    columns: ['id', 'user_id', 'group_id', 'title', 'description', 'video_url', 'score', 'votes', 'created_at', 'bimestre'],
    writable: ['user_id', 'group_id', 'title', 'description', 'video_url', 'bimestre'],
    ignore: ['upload_ip', 'client_metadata', 'thumbnail_url', 'kind'],
    coerce: { group_id: 'integer', bimestre: 'integer' },
    defaults: { id: () => 1_500_000_000 + Math.floor(Math.random() * 500_000_000), votes: () => 0, created_at: () => new Date().toISOString() },
    relations: {
      students: { type: 'one', table: 'students', fk: 'user_id', ref: 'id' },
      groups: { type: 'one', table: 'groups', fk: 'group_id', ref: 'id' },
      evaluations: { type: 'many', unique: true, table: 'evaluations', fk: 'project_id', ref: 'id' },
      project_likes: { type: 'many', table: 'project_likes', fk: 'project_id', ref: 'id' },
    },
  }),

  evaluations: table({
    pk: 'id',
    columns: ['id', 'project_id', 'teacher_id', 'creativity_score', 'clarity_score', 'functionality_score', 'teamwork_score',
      'social_impact_score', 'total_score', 'comments', 'created_at', 'feedback'],
    relations: { projects: { type: 'one', table: 'projects', fk: 'project_id', ref: 'id' } },
  }),

  project_likes: table({
    pk: 'id',
    columns: ['id', 'project_id', 'user_id', 'created_at', 'reaction'],
    relations: { projects: { type: 'one', table: 'projects', fk: 'project_id', ref: 'id' } },
  }),

  courses: table({
    pk: 'id',
    columns: ['id', 'title', 'description', 'school_code', 'grade', 'section', 'created_by', 'is_shared', 'tags', 'created_at', 'weight',
      'bimestre', 'tinkercad_class_url', 'cnb_area', 'weights_approved_at', 'weights_approved_by'],
    // El docente crea y edita SUS cursos sin internet (sube a la nube al sincronizar). Borrar un curso borra sus recursos aquí; la nube
    // hace lo mismo con su clave foránea. Las aprobaciones de ponderación (weights_approved_*) son solo de la nube.
    writable: ['title', 'description', 'school_code', 'grade', 'section', 'created_by', 'is_shared', 'tags', 'weight', 'bimestre', 'tinkercad_class_url', 'cnb_area'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString(), is_shared: () => false },
    cascade: [{ table: 'lessons', fk: 'course_id' }],
    relations: {
      lessons: { type: 'many', table: 'lessons', fk: 'course_id', ref: 'id' },
      schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' },
      teachers: { type: 'one', table: 'teachers', fk: 'created_by', ref: 'id' },
    },
  }),

  lessons: table({
    pk: 'id',
    columns: ['id', 'title', 'description', 'content_type', 'content_url', 'school_code', 'grade', 'section', 'created_by', 'created_at',
      'content_path', 'is_shared', 'tags', 'course_id', 'order_index', 'quiz_data', 'audience', 'grade_points', 'counts_for_grade'],
    // `id` lo pone el navegador (la ruta de sus archivos lleva ese id), igual que en la nube.
    writable: ['id', 'title', 'description', 'content_type', 'content_url', 'content_path', 'school_code', 'grade', 'section', 'created_by', 'is_shared',
      'tags', 'course_id', 'order_index', 'quiz_data', 'audience', 'grade_points', 'counts_for_grade'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString(), is_shared: () => false },
    relations: { courses: { type: 'one', table: 'courses', fk: 'course_id', ref: 'id' } },
  }),

  lesson_completions: table({
    pk: 'id',
    columns: ['id', 'lesson_id', 'student_id', 'completed_at', 'score', 'status', 'raw_data'],
    writable: ['lesson_id', 'student_id', 'completed_at', 'score', 'status', 'raw_data'],
    unique: [['lesson_id', 'student_id']],
    defaults: { id: () => globalThis.crypto.randomUUID(), completed_at: () => new Date().toISOString() },
    relations: {
      lessons: { type: 'one', table: 'lessons', fk: 'lesson_id', ref: 'id' },
      students: { type: 'one', table: 'students', fk: 'student_id', ref: 'id' },
    },
  }),

  badges: table({
    pk: 'id',
    columns: ['id', 'code', 'name', 'description', 'icon', 'category', 'criteria_type', 'criteria_value', 'created_at'],
    relations: {},
  }),

  student_badges: table({
    pk: 'id',
    columns: ['id', 'student_id', 'badge_id', 'earned_at', 'celebrated'],
    relations: {
      students: { type: 'one', table: 'students', fk: 'student_id', ref: 'id' },
      badges: { type: 'one', table: 'badges', fk: 'badge_id', ref: 'id' },
    },
  }),

  surveys: emptyTable(),
  comment_notifications: emptyTable(),
  student_duels: emptyTable(),
  student_debug_duels: emptyTable(),
  student_spelling_duels: emptyTable(),
  project_reaction_notifications: emptyTable(),
  student_challenges: emptyTable(),
  teacher_rocks: emptyTable(),
  teacher_rock_completions: emptyTable(),
  ai_evaluations: emptyTable(),
  ai_code_evaluations: emptyTable(),

  // Mascota (compañero): solo lectura para la app; se cambia con las funciones choose_companion, buy_companion_egg, etc. (companion.js).
  // En la nube la clave de estas dos es compuesta; aquí el id es «estudiante:especie» / «estudiante:accesorio» (la bajada lo arma igual).
  student_companions: table({
    pk: 'id',
    columns: ['id', 'student_id', 'species', 'obtained_at'],
    relations: {},
  }),
  student_cosmetics: table({
    pk: 'id',
    columns: ['id', 'student_id', 'item_id', 'acquired_at'],
    relations: {},
  }),
  cosmetic_items: table({
    pk: 'id',
    columns: ['id', 'slot', 'name', 'price', 'min_stage', 'sort'],
    relations: {},
  }),

  // Permisos de asistencia: el docente los pide (siempre «pendientes»; el administrador los aprueba en línea). No se editan ni se borran sin internet.
  attendance_waivers: table({
    pk: 'id',
    noUpdate: true,
    columns: ['id', 'teacher_id', 'date', 'reason', 'status', 'admin_comment', 'created_at', 'school_code', 'grade', 'section', 'updated_at'],
    writable: ['teacher_id', 'date', 'reason', 'status', 'school_code', 'grade', 'section'],
    defaults: { id: () => globalThis.crypto.randomUUID(), status: () => 'pending', created_at: () => new Date().toISOString(), updated_at: () => new Date().toISOString() },
    relations: {},
  }),

  // Exámenes con hoja de respuestas (migrations/exams.sql): el docente crea el examen con su clave y califica escaneando. La clave solo la ve su
  // docente; el estudiante ve sus notas. id y fecha las pone el nodo (el id viaja a la nube); la nota es única por examen y estudiante.
  exams: table({
    pk: 'id',
    columns: ['id', 'teacher_id', 'school_code', 'grade', 'section', 'title', 'bimestre', 'question_count', 'answer_key', 'points', 'created_at'],
    writable: ['teacher_id', 'school_code', 'grade', 'section', 'title', 'bimestre', 'question_count', 'answer_key', 'points'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString(), bimestre: () => 1, points: () => 10 },
    cascade: [{ table: 'exam_results', fk: 'exam_id' }],
    relations: { exam_results: { type: 'many', table: 'exam_results', fk: 'exam_id', ref: 'id' } },
  }),
  exam_results: table({
    pk: 'id',
    columns: ['id', 'exam_id', 'student_id', 'answers', 'correct', 'wrong', 'blank', 'score', 'scanned_by', 'scanned_at'],
    writable: ['exam_id', 'student_id', 'answers', 'correct', 'wrong', 'blank', 'score', 'scanned_by'],
    unique: [['exam_id', 'student_id']],
    defaults: { id: () => globalThis.crypto.randomUUID(), scanned_at: () => new Date().toISOString() },
    relations: { exams: { type: 'one', table: 'exams', fk: 'exam_id', ref: 'id' } },
  }),

  // Retos «Contrarreloj» entre estudiantes (duels.js). El reto lo crea la app con insert (retador, rival y apuesta); aceptar, jugar y enviar son
  // funciones. Los problemas, las horas de arranque y cómo se liquidó se guardan en la fila pero NO son columnas: el navegador no las ve.
  // La fila no va por la bandeja normal: sube como una «foto» del duelo (_rpc timed_math_duel).
  student_timed_math_duels: table({
    pk: 'id',
    noPush: true,
    columns: ['id', 'challenger_id', 'opponent_id', 'wager_gems', 'problem_count', 'status', 'winner_id', 'created_at', 'resolved_at'],
    writable: ['challenger_id', 'opponent_id', 'wager_gems', 'status'],
    defaults: { id: () => globalThis.crypto.randomUUID(), status: () => 'pending', problem_count: () => 10, winner_id: () => null, created_at: () => new Date().toISOString() },
    relations: {
      'students!challenger_id': { type: 'one', table: 'students', fk: 'challenger_id', ref: 'id' },
      'students!opponent_id': { type: 'one', table: 'students', fk: 'opponent_id', ref: 'id' },
    },
  }),
  student_timed_math_results: table({
    pk: 'id',
    columns: ['id', 'duel_id', 'student_id', 'score', 'time_ms', 'completed_at'],
    relations: {},
  }),

  // Ahorcado 1 contra 1 (hangman.js): como Contrarreloj, la palabra, la pista y las horas de arranque quedan fuera de las columnas visibles.
  student_hangman_duels: table({
    pk: 'id',
    noPush: true,
    columns: ['id', 'challenger_id', 'opponent_id', 'wager_gems', 'topic', 'status', 'winner_id', 'created_at', 'resolved_at'],
    writable: ['challenger_id', 'opponent_id', 'wager_gems', 'topic', 'status'],
    defaults: { id: () => globalThis.crypto.randomUUID(), status: () => 'pending', winner_id: () => null, created_at: () => new Date().toISOString() },
    relations: {
      'students!challenger_id': { type: 'one', table: 'students', fk: 'challenger_id', ref: 'id' },
      'students!opponent_id': { type: 'one', table: 'students', fk: 'opponent_id', ref: 'id' },
    },
  }),
  student_hangman_results: table({
    pk: 'id',
    columns: ['id', 'duel_id', 'student_id', 'solved', 'wrong_guesses', 'time_ms', 'completed_at'],
    relations: {},
  }),
  // Banco fijo de palabras del Ahorcado: INTERNO (en la nube tampoco lo lee la app; delataría la palabra).
  hangman_word_bank: table({
    pk: 'id',
    hidden: true,
    columns: ['id', 'category', 'word', 'hint', 'fact'],
    relations: {},
  }),

  // Retos ya jugados (los cinco juegos) de los estudiantes de la escuela, uno por fila y ya con el porcentaje de aciertos: INTERNOS, solo alimentan el progreso.
  reto_plays: table({
    pk: 'id',
    hidden: true,
    columns: ['id', 'student_id', 'game', 'competency', 'ok', 'played_at'],
    relations: {},
  }),

  // Práctica ya guardada en la nube: INTERNA (nadie la lee directo; en la nube tampoco). Solo alimenta get_*_progress (progress.js).
  practice_results: table({
    pk: 'id',
    hidden: true,
    columns: ['id', 'student_id', 'game', 'competency', 'topic', 'correct', 'total', 'score', 'played_at'],
    relations: {},
  }),

  // Asistencia: el docente pasa lista (la app la manda con upsert por estudiante y día). En la nube la clave es un serial; aquí el id de lo que
  // se marca sin internet es «estudiante:fecha» y al sincronizar vuelve con el número de la nube. Sin borrar (solo administradores, en la nube).
  attendance: table({
    pk: 'id',
    columns: ['id', 'student_id', 'teacher_id', 'school_code', 'grade', 'section', 'date', 'time', 'status', 'created_at'],
    writable: ['student_id', 'teacher_id', 'school_code', 'grade', 'section', 'date', 'time', 'status'],
    unique: [['student_id', 'date']],
    defaults: {
      id: (row) => `${row.student_id}:${row.date}`,
      time: () => new Date().toTimeString().slice(0, 8),
      status: () => 'present',
      created_at: () => new Date().toISOString(),
    },
    relations: { students: { type: 'one', table: 'students', fk: 'student_id', ref: 'id' } },
  }),

  // Comentarios de equipo, «me gusta» y notas privadas de los recursos (reglas en policies.js, las de la nube). Sin adjuntos: subir una
  // imagen necesita internet. id y fecha las pone el nodo (el id viaja a la nube, que lo usa para no duplicar).
  resource_comments: table({
    pk: 'id',
    noUpdate: true,
    columns: ['id', 'lesson_id', 'group_id', 'parent_id', 'author_id', 'author_name', 'author_role', 'content', 'attachment_url', 'created_at'],
    coerce: { group_id: 'integer' }, // la app manda el equipo como texto del <select>; en la nube es integer
    writable: ['lesson_id', 'group_id', 'parent_id', 'author_id', 'author_name', 'author_role', 'content', 'attachment_url'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString() },
    cascade: [{ table: 'resource_comments', fk: 'parent_id' }, { table: 'resource_comment_likes', fk: 'comment_id' }],
    relations: {},
  }),
  // En la nube la clave es (comment_id, user_id); aquí el id es «comentario:usuario» (igual lo arma la bajada).
  resource_comment_likes: table({
    pk: 'id',
    columns: ['comment_id', 'user_id', 'created_at'],
    writable: ['comment_id', 'user_id'],
    unique: [['comment_id', 'user_id']],
    defaults: { id: (row) => `${row.comment_id}:${row.user_id}`, created_at: () => new Date().toISOString() },
    relations: {},
  }),
  resource_notes: table({
    pk: 'id',
    noUpdate: true,
    columns: ['id', 'lesson_id', 'student_id', 'content', 'updated_at', 'created_at'],
    writable: ['lesson_id', 'student_id', 'content'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString(), updated_at: () => new Date().toISOString() },
    relations: {},
  }),

  // Avisos: los envía el docente a sus grupos (reglas en policies.js, las mismas de can_send_announcement) y los ven según
  // can_see_announcement. id y fecha las pone el nodo (el id viaja a la nube, que lo usa para no duplicar).
  announcements: table({
    pk: 'id',
    noUpdate: true,
    columns: ['id', 'sender_id', 'sender_role', 'audience', 'school_code', 'grade', 'section', 'target_schools', 'target_groups', 'title', 'message', 'created_at'],
    writable: ['sender_id', 'sender_role', 'audience', 'school_code', 'grade', 'section', 'target_schools', 'target_groups', 'title', 'message'],
    defaults: { id: () => globalThis.crypto.randomUUID(), created_at: () => new Date().toISOString() },
    relations: {},
  }),
  announcement_reads: table({
    pk: 'id',
    columns: ['id', 'announcement_id', 'user_id', 'read_at'],
    writable: ['announcement_id', 'user_id', 'read_at'],
    unique: [['announcement_id', 'user_id']],
    defaults: { id: () => globalThis.crypto.randomUUID(), read_at: () => new Date().toISOString() },
    relations: { announcements: { type: 'one', table: 'announcements', fk: 'announcement_id', ref: 'id' } },
  }),
};
