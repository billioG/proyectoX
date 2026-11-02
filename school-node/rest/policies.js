// Reglas de acceso por fila (RLS en código) de la capa local, copiadas de las políticas reales de la nube
// (pg_policies). Lo que no tiene regla explícita se DENIEGA. `ctx` = { uid, role: 'student'|'teacher'|'admin',
// classKey: 'escuela|grado|sección' (solo estudiantes) }. is_staff() de la nube = docente o administrador.

export function createPolicy({ store }) {
  const staff = (ctx) => ctx.role === 'teacher' || ctx.role === 'admin';
  const own = (ctx, id) => id === ctx.uid;
  const classKeyOf = (s) => `${s.school_code}|${s.grade}|${s.section}`;

  // Proyecto del estudiante, o de un equipo del que es miembro.
  const mine = (ctx, project) => {
    if (!project) return false;
    if (project.user_id === ctx.uid) return true;
    return project.group_id != null && store.all('group_members').some((m) => m.group_id === project.group_id && m.student_id === ctx.uid);
  };

  // Un avance solo vale si la lección existe y es de estudiantes, y los datos tienen sentido (si no, la nube lo rechazaría
  // y trabaría la sincronización de toda la escuela, y el XP de la lección sería falso).
  const validCompletion = (row) => {
    if (typeof row.lesson_id !== 'string' || typeof row.student_id !== 'string') return false;
    if (!store.all('lessons').some((l) => l.id === row.lesson_id && l.audience === 'estudiante')) return false;
    if (row.score != null && !(typeof row.score === 'number' && Number.isFinite(row.score) && row.score >= 0 && row.score <= 100)) return false;
    if (row.status != null && !(typeof row.status === 'string' && row.status.length <= 30)) return false;
    if (row.completed_at != null && !(typeof row.completed_at === 'string' && row.completed_at.length <= 40 && !Number.isNaN(Date.parse(row.completed_at)))) return false;
    if (row.raw_data != null && JSON.stringify(row.raw_data).length > 20000) return false;
    return true;
  };

  // ---- Avisos (mismas reglas que can_see_announcement / can_send_announcement de la nube) ----
  const sameGroup = (g, c) => !!g && g.school_code === c.school_code && g.grade === c.grade && g.section === c.section;
  const classOf = (ctx) => { const [school_code, grade, section] = String(ctx.classKey || '').split('|'); return { school_code, grade, section }; };
  const assignmentsOf = (ctx) => store.all('teacher_assignments').filter((a) => a.teacher_id === ctx.uid);
  const canSeeAnnouncement = (ctx, a) => {
    if (ctx.role === 'admin' || a.sender_id === ctx.uid) return true;
    const audience = a.audience ?? 'all';
    if (ctx.role === 'student') {
      if (audience !== 'all' && audience !== 'students') return false;
      const c = classOf(ctx);
      if (a.school_code != null) return sameGroup(a, c);
      if (Array.isArray(a.target_groups)) return a.target_groups.some((g) => sameGroup(g, c));
      if (Array.isArray(a.target_schools)) return a.target_schools.includes(c.school_code);
      return true;
    }
    if (ctx.role === 'teacher') {
      if (audience !== 'all' && audience !== 'teachers') return false;
      if (a.school_code != null) return false; // avisos de una clase: son para sus estudiantes
      const mine = assignmentsOf(ctx);
      if (Array.isArray(a.target_groups)) return a.target_groups.some((g) => mine.some((m) => sameGroup(g, m)));
      if (Array.isArray(a.target_schools)) return mine.some((m) => a.target_schools.includes(m.school_code));
      return true;
    }
    return false;
  };
  // Mismo limpiado que hace la nube (caracteres de control a espacio) ANTES de contar: si no, un título de puro control pasa aquí,
  // la nube lo rechaza para siempre y el aviso se pierde sin avisar.
  const CONTROL = /[\u0000-\u001F\u007F]+/g;
  const text = (v, max) => {
    if (typeof v !== 'string') return false;
    const n = v.replace(CONTROL, ' ').replace(/ {2,}/g, ' ').trim().length;
    return n >= 1 && n <= max;
  };
  // El docente solo envía a estudiantes de SUS grupos: una sola clase, o una lista de grupos; nunca a docentes, a todos ni por escuela.
  const canSendAnnouncement = (ctx, a) => {
    if (ctx.role !== 'teacher' || a.sender_id !== ctx.uid || a.sender_role !== 'docente' || a.audience !== 'students' || a.target_schools != null) return false;
    if (!text(a.title, 150) || !text(a.message, 2000)) return false;
    const mine = assignmentsOf(ctx);
    if (a.school_code != null) return a.target_groups == null && mine.some((m) => sameGroup(a, m));
    const groups = a.target_groups;
    return Array.isArray(groups) && groups.length >= 1 && groups.length <= 20 && groups.every((g) => g && typeof g === 'object' && mine.some((m) => sameGroup(g, m)));
  };
  const validDate = (v) => v == null || (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)));
  const canMarkRead = (ctx, r) => own(ctx, r.user_id) && validDate(r.read_at)
    && (() => { const a = store.all('announcements').find((x) => x.id === r.announcement_id); return !!a && canSeeAnnouncement(ctx, a); })();

  // ---- Cursos y recursos que el docente crea sin internet (la nube los valida otra vez al sincronizar) ----
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LESSON_TYPES = ['video', 'pdf', 'image', 'scorm', 'h5p', 'html5', 'quiz', 'tinkercad'];
  const nullOr = (v, ok) => v == null || ok(v);
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const tagsOk = (v) => Array.isArray(v) && v.length <= 30 && v.every((t) => str(t, 50));
  // Los mismos sitios que permite la nube para enlaces externos (disparador check_lesson_content_url).
  const EXTERNAL_HOSTS = ['youtube.com', 'youtu.be', 'drive.google.com', 'tinkercad.com'];
  const allowedExternal = (v) => { try { const h = new URL(v).hostname.toLowerCase(); return EXTERNAL_HOSTS.some((x) => h === x || h.endsWith('.' + x)); } catch { return false; } };
  const httpsUrl = (v) => str(v, 1000) && /^https:\/\/[^\s]+$/i.test(v) && !/[\u0000-\u001F\u007F]/.test(v);
  const myClass = (ctx, c) => ctx.role === 'admin' || assignmentsOf(ctx).some((m) => sameGroup(c, m));
  const mayEditCourse = (ctx, course) => !!course && staff(ctx) && (ctx.role === 'admin' || course.created_by === ctx.uid);

  const validCourse = (ctx, c) => c.created_by === ctx.uid && text(c.title, 200)
    && nullOr(c.description, (v) => str(v, 2000)) && str(c.school_code, 60) && str(c.grade, 60) && str(c.section, 60) && myClass(ctx, c)
    && typeof c.is_shared === 'boolean' && nullOr(c.tags, tagsOk) && nullOr(c.weight, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)
    && nullOr(c.bimestre, (v) => int(v, 1, 4)) && nullOr(c.tinkercad_class_url, httpsUrl) && nullOr(c.cnb_area, (v) => str(v, 80));

  // La dirección de un recurso subido aquí: la de Storage (o el visor SCORM) con la ruta lessons/<id de la lección>/...; o un https externo.
  const ownFile = (id) => (v) => {
    let u; try { u = new URL(v, 'http://nodo.local'); } catch { return false; }
    const prefix = `lessons/${id}`;
    if (u.pathname.startsWith('/content/')) { const rel = decodeURIComponent(u.pathname.slice('/content/'.length)); return rel === prefix || rel.startsWith(`${prefix}/`); }
    if (u.pathname.startsWith('/storage/v1/object/public/course-content/')) {
      const rel = decodeURIComponent(u.pathname.slice('/storage/v1/object/public/course-content/'.length));
      return rel === prefix || rel.startsWith(`${prefix}/`);
    }
    if (u.pathname === '/functions/v1/serve-scorm-entry') { const rel = u.searchParams.get('path') || ''; return rel === prefix || rel.startsWith(`${prefix}/`); }
    return false;
  };
  const validLesson = (ctx, l) => {
    const course = store.all('courses').find((c) => c.id === l.course_id);
    return typeof l.id === 'string' && UUID.test(l.id) && mayEditCourse(ctx, course) && l.created_by === ctx.uid
      && l.school_code === course.school_code && l.grade === course.grade && l.section === course.section
      && LESSON_TYPES.includes(l.content_type) && text(l.title, 200) && nullOr(l.description, (v) => str(v, 2000))
      && (l.audience === 'estudiante' || l.audience === 'docente') && int(l.order_index, 0, 100000) && nullOr(l.tags, tagsOk)
      && typeof l.is_shared === 'boolean' && nullOr(l.counts_for_grade, (v) => typeof v === 'boolean')
      && nullOr(l.grade_points, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)
      && nullOr(l.content_path, (v) => v === `lessons/${l.id}`)
      && (l.content_type === 'quiz'
        ? l.content_url == null && Array.isArray(l.quiz_data) && l.quiz_data.length >= 1 && l.quiz_data.length <= 200 && JSON.stringify(l.quiz_data).length <= 300000
        : l.quiz_data == null && typeof l.content_url === 'string' && ((httpsUrl(l.content_url) && allowedExternal(l.content_url)) || (str(l.content_url, 1000) && ownFile(l.id)(l.content_url))));
  };

  const readRules = {
    announcements: (ctx, r) => canSeeAnnouncement(ctx, r),
    announcement_reads: (ctx, r) => own(ctx, r.user_id),
    // Públicas para cualquier sesión (select true en la nube).
    schools: () => true,
    teacher_assignments: () => true,
    groups: () => true,
    group_members: () => true,
    projects: () => true,
    project_likes: () => true,
    courses: () => true,
    badges: () => true,
    student_badges: () => true,

    // students_select_self_staff_or_classmate
    students: (ctx, r) => staff(ctx) || own(ctx, r.id) || (ctx.classKey != null && ctx.classKey === classKeyOf(r)),
    // teachers_select_self_or_admin
    teachers: (ctx, r) => ctx.role === 'admin' || own(ctx, r.id),
    // lessons_select_restrict_teacher_only: los estudiantes solo ven lo de audiencia «estudiante»
    lessons: (ctx, r) => staff(ctx) || r.audience === 'estudiante',
    // lesson_completions_select_own_or_staff
    lesson_completions: (ctx, r) => staff(ctx) || own(ctx, r.student_id),
    // evaluaciones: staff, o el dueño del proyecto / miembro de su equipo
    evaluations: (ctx, r) => staff(ctx) || mine(ctx, store.all('projects').find((p) => p.id === r.project_id)),
  };

  return {
    canRead: (ctx, table, row) => (readRules[table] ? readRules[table](ctx, row) === true : false),

    // lesson_completions_insert_own
    canInsert: (ctx, table, row) => (table === 'lesson_completions' && own(ctx, row.student_id) && validCompletion(row))
      || (table === 'announcements' && canSendAnnouncement(ctx, row))
      || (table === 'announcement_reads' && canMarkRead(ctx, row))
      || (table === 'courses' && staff(ctx) && validCourse(ctx, row))
      || (table === 'lessons' && staff(ctx) && validLesson(ctx, row)),

    // lesson_completions_update_own (la nueva fila también debe ser propia)
    canUpdate: (ctx, table, oldRow, newRow) => (table === 'lesson_completions' && own(ctx, oldRow.student_id) && own(ctx, newRow.student_id) && validCompletion(newRow))
      || (table === 'announcement_reads' && own(ctx, oldRow.user_id) && canMarkRead(ctx, newRow))
      || (table === 'courses' && mayEditCourse(ctx, oldRow) && newRow.created_by === oldRow.created_by && validCourse({ ...ctx, uid: oldRow.created_by }, newRow))
      || (table === 'lessons' && staff(ctx) && newRow.id === oldRow.id && newRow.course_id === oldRow.course_id && newRow.created_by === oldRow.created_by
        && mayEditCourse(ctx, store.all('courses').find((c) => c.id === oldRow.course_id)) && validLesson({ ...ctx, uid: oldRow.created_by }, newRow)),

    // lesson_completions_delete_own_or_admin
    canDelete: (ctx, table, row) => (table === 'lesson_completions' && (own(ctx, row.student_id) || ctx.role === 'admin'))
      // Sin internet solo se borra lo propio; un curso compartido con otras escuelas se borra en línea (se puede dejar de compartir).
      || (table === 'courses' && mayEditCourse(ctx, row) && row.is_shared !== true)
      || (table === 'lessons' && mayEditCourse(ctx, store.all('courses').find((c) => c.id === row.course_id))),
  };
}
