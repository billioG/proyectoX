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

  groups: table({
    pk: 'id',
    columns: ['id', 'name', 'school_code', 'grade', 'section', 'created_by', 'created_at'],
    relations: {
      group_members: { type: 'many', table: 'group_members', fk: 'group_id', ref: 'id' },
      schools: { type: 'one', table: 'schools', fk: 'school_code', ref: 'code' },
    },
  }),

  group_members: table({
    pk: 'id',
    columns: ['id', 'group_id', 'student_id', 'role', 'is_leader', 'created_at'],
    relations: {
      groups: { type: 'one', table: 'groups', fk: 'group_id', ref: 'id' },
      students: { type: 'one', table: 'students', fk: 'student_id', ref: 'id' },
    },
  }),

  projects: table({
    pk: 'id',
    columns: ['id', 'user_id', 'group_id', 'title', 'description', 'video_url', 'score', 'votes', 'created_at', 'bimestre'],
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
  resource_comments: emptyTable(),
  comment_notifications: emptyTable(),
  student_duels: emptyTable(),
  student_hangman_duels: emptyTable(),
  student_timed_math_duels: emptyTable(),
  student_debug_duels: emptyTable(),
  student_spelling_duels: emptyTable(),
  project_reaction_notifications: emptyTable(),
  student_challenges: emptyTable(),
  attendance: emptyTable(),
  exams: emptyTable(),
  exam_results: emptyTable(),
  teacher_rocks: emptyTable(),
  teacher_rock_completions: emptyTable(),
  ai_evaluations: emptyTable(),
  ai_code_evaluations: emptyTable(),

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
