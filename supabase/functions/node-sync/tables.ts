// Bloque genérico `tables` de la bajada de node-sync: las tablas que el nodo sirve a la app real con la capa local
// compatible con Supabase (school-node/rest). LISTA PERMITIDA de tablas y columnas: nunca `*`, nunca PIN, correos,
// contraseñas ni datos internos (IP, metadatos). Todo con el alcance de la escuela del nodo.
//
// Las columnas de cada tabla tienen que ser las mismas que el nodo sirve (school-node/rest/schema.js); una prueba lo
// comprueba. Más abajo, los verificadores de contraseña de clase: el nodo recibe un hash con sal, nunca la contraseña.

import { ANNOUNCEMENT_COLUMNS, announcementVisibleToSchool, restrictToSchool } from './announcements.ts';

export const TABLE_COLUMNS: Record<string, string[]> = {
  schools: ['id', 'code', 'name', 'address', 'department', 'municipality', 'sector', 'level', 'schedule', 'area', 'created_at',
    'latitude', 'longitude', 'geofence_radius', 'projects_per_bimestre', 'programa', 'public_projects'],
  students: ['id', 'full_name', 'username', 'school_code', 'grade', 'section', 'profile_photo_url', 'role', 'created_at', 'xp', 'gems',
    'streak', 'last_login', 'streak_freeze', 'daily_chest_last_claimed', 'gems_earned_total', 'has_gold_frame', 'has_mascot_glasses',
    'status', 'companion_equipped', 'companion_species', 'season_id', 'season_xp', 'league_tier', 'league_week', 'league_last_result',
    'duel_win_streak', 'best_duel_win_streak'],
  teacher_assignments: ['id', 'teacher_id', 'school_code', 'grade', 'section', 'created_at'],
  teachers: ['id', 'full_name', 'profile_photo_url', 'role', 'created_at', 'xp', 'gems', 'streak', 'last_login', 'daily_chest_last_claimed',
    'rank_title', 'certification_points', 'is_coordinator'],
  groups: ['id', 'name', 'school_code', 'grade', 'section', 'created_by', 'created_at'],
  group_members: ['id', 'group_id', 'student_id', 'role', 'is_leader', 'created_at'],
  projects: ['id', 'user_id', 'group_id', 'title', 'description', 'video_url', 'score', 'votes', 'created_at', 'bimestre'],
  evaluations: ['id', 'project_id', 'teacher_id', 'creativity_score', 'clarity_score', 'functionality_score', 'teamwork_score',
    'social_impact_score', 'total_score', 'comments', 'created_at', 'feedback'],
  project_likes: ['id', 'project_id', 'user_id', 'created_at', 'reaction'],
  courses: ['id', 'title', 'description', 'school_code', 'grade', 'section', 'created_by', 'is_shared', 'tags', 'created_at', 'weight',
    'bimestre', 'tinkercad_class_url', 'cnb_area', 'weights_approved_at', 'weights_approved_by'],
  lessons: ['id', 'title', 'description', 'content_type', 'content_url', 'school_code', 'grade', 'section', 'created_by', 'created_at',
    'content_path', 'is_shared', 'tags', 'course_id', 'order_index', 'quiz_data', 'audience', 'grade_points', 'counts_for_grade'],
  lesson_completions: ['id', 'lesson_id', 'student_id', 'completed_at', 'score', 'status', 'raw_data'],
  announcements: ANNOUNCEMENT_COLUMNS,
  announcement_reads: ['id', 'announcement_id', 'user_id', 'read_at'],
  badges: ['id', 'code', 'name', 'description', 'icon', 'category', 'criteria_type', 'criteria_value', 'created_at'],
  student_badges: ['id', 'student_id', 'badge_id', 'earned_at', 'celebrated'],
};

const list = (table: string) => TABLE_COLUMNS[table].join(', ');
const PROJECTS_PER_CHUNK = 200;

type Fetch = (build: (from: number, to: number) => any) => Promise<any[]>;
type Chunk = <T>(arr: T[], size?: number) => T[][];

/** Baja las tablas de la escuela del nodo. Cada consulta es independiente: si una falla, el pull entero falla (el nodo conserva lo que tenía). */
export async function pullTables(
  admin: any,
  node: { school_code: string },
  helpers: { studentIds: Set<string>; fetchAll: Fetch; chunk: Chunk },
): Promise<Record<string, any[]>> {
  const { studentIds, fetchAll, chunk } = helpers;
  const school = node.school_code;
  const out: Record<string, any[]> = {};
  const students = [...studentIds];

  const bySchool = (table: string, column: string) =>
    fetchAll((from, to) => admin.from(table).select(list(table)).eq(column, school).order('id').range(from, to));
  const byIds = async (table: string, column: string, ids: unknown[], orderBy = 'id') => {
    const rows: any[] = [];
    for (const part of chunk(ids)) {
      rows.push(...await fetchAll((from, to) => (orderBy === 'id'
        ? admin.from(table).select(list(table)).in(column, part).order('id')
        : admin.from(table).select(list(table)).in(column, part).order(orderBy).order('id')).range(from, to)));
    }
    return rows;
  };

  out.schools = await bySchool('schools', 'code');
  out.students = await bySchool('students', 'school_code');
  out.teacher_assignments = await bySchool('teacher_assignments', 'school_code');
  // Docentes asignados a la escuela (sin correo, sueldo ni nada sensible: solo las columnas permitidas).
  out.teachers = await byIds('teachers', 'id', [...new Set(out.teacher_assignments.map((a) => a.teacher_id))]);
  out.groups = await bySchool('groups', 'school_code');
  out.group_members = await byIds('group_members', 'group_id', out.groups.map((g) => g.id));

  // Proyectos de los estudiantes de la escuela (los más recientes de cada tanda), con sus evaluaciones y reacciones.
  const projects: any[] = [];
  for (const part of chunk(students)) {
    const { data, error } = await admin.from('projects').select(list('projects')).in('user_id', part)
      .order('created_at', { ascending: false }).limit(PROJECTS_PER_CHUNK);
    if (error) throw error;
    projects.push(...(data || []));
  }
  out.projects = projects;
  const projectIds = projects.map((p) => p.id);
  out.evaluations = await byIds('evaluations', 'project_id', projectIds);
  out.project_likes = await byIds('project_likes', 'project_id', projectIds);

  out.courses = await bySchool('courses', 'school_code');
  out.lessons = await byIds('lessons', 'course_id', out.courses.map((c) => c.id));
  out.lesson_completions = await byIds('lesson_completions', 'student_id', students);
  // Avisos de los últimos 90 días que alcanzan a la escuela (el nodo aplica después las reglas de quién ve cuál) y sus lecturas.
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  // Con un criterio de orden único (fecha e id) y solo los que son de la escuela o generales (los de grupos se afinan abajo).
  const recent = await fetchAll((from, to) => admin.from('announcements').select(list('announcements')).gte('created_at', since)
    .or(`school_code.eq.${school},school_code.is.null`).order('created_at', { ascending: false }).order('id').range(from, to));
  // Del aviso solo baja lo de esta escuela: los grupos y escuelas de otras escuelas nunca viajan al nodo.
  out.announcements = recent.filter((a) => announcementVisibleToSchool(a, school)).slice(0, 200).map((a) => restrictToSchool(a, school));
  const userIds = new Set<string>([...students, ...out.teachers.map((t) => t.id as string)]);
  out.announcement_reads = (await byIds('announcement_reads', 'announcement_id', out.announcements.map((a) => a.id), 'announcement_id')).filter((r) => userIds.has(r.user_id));

  out.badges = await fetchAll((from, to) => admin.from('badges').select(list('badges')).order('id').range(from, to));
  out.student_badges = await byIds('student_badges', 'student_id', students);
  return out;
}

// ---- Verificadores de contraseña de clase ----
// Mismos parámetros que school-node/rest/auth.js (PBKDF2-SHA256, 150 000 vueltas, 32 bytes, hex).
const PBKDF2_ITERATIONS = 150000;
const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function deriveClassVerifier(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(new Uint8Array(bits));
}

/**
 * De class_passwords (escuela, grado, sección, contraseña, requires_password) al verificador que baja al nodo.
 * Una clase que exige contraseña y no tiene ninguna no se puede verificar: se omite (el nodo no deja entrar a
 * nadie de una clase que no conoce). Una clase sin contraseña no manda ni sal ni hash.
 */
export async function buildClassVerifiers(rows: Array<Record<string, any>>) {
  const out: Array<{ class_key: string; requires_password: boolean; salt: string; hash: string }> = [];
  for (const r of rows || []) {
    const class_key = `${r.school_code}|${r.grade}|${r.section}`;
    if (r.requires_password === false) { out.push({ class_key, requires_password: false, salt: '', hash: '' }); continue; }
    if (!r.password) continue;
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    out.push({ class_key, requires_password: true, salt, hash: await deriveClassVerifier(String(r.password), salt) });
  }
  return out;
}

// ---- Entrada de los docentes ----
const sha256Hex = async (text: string) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

/**
 * Del correo y del PIN (hash + sal, fijado EN LÍNEA por el docente) a lo que baja al nodo: la huella SHA-256 del correo en
 * minúsculas (mismo cálculo que school-node/rest/auth.js emailHash) y el PIN ya hasheado. Sin PIN o sin correo no hay entrada:
 * un docente que nunca fijó su PIN no entra al nodo. El correo en claro no baja.
 */
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Entrada de los docentes al nodo: huella SHA-256 del correo + la huella bcrypt de la contraseña de su cuenta (la que ya guarda la
 * nube; nunca la contraseña). Sigue aceptando el PIN anterior (pin_hash + pin_salt) para quien aún lo tenga y no tenga bcrypt.
 */
export async function buildTeacherLogins(rows: Array<Record<string, any>>) {
  const out: Array<{ teacher_id: string; email_hash: string; bcrypt?: string; pin_hash?: string; pin_salt?: string }> = [];
  for (const r of rows || []) {
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    if (!r.teacher_id || !email) continue;
    if (typeof r.password_hash === 'string' && BCRYPT.test(r.password_hash)) {
      out.push({ teacher_id: r.teacher_id, email_hash: await sha256Hex(email), bcrypt: r.password_hash });
    } else if (r.pin_hash && r.pin_salt) {
      out.push({ teacher_id: r.teacher_id, email_hash: await sha256Hex(email), pin_hash: r.pin_hash, pin_salt: r.pin_salt });
    }
  }
  return out;
}
