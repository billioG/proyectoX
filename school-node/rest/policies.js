// Reglas de acceso por fila (RLS en código) de la capa local, copiadas de las políticas reales de la nube
// (pg_policies). Lo que no tiene regla explícita se DENIEGA. `ctx` = { uid, role: 'student'|'teacher'|'admin',
// classKey: 'escuela|grado|sección' (solo estudiantes) }. is_staff() de la nube = docente o administrador.

import { RestError } from './query.js';
import { containsProfanity } from './profanity.js';
import { PROJECT_LIMITS, validateProjectDraft } from '../project-rules.js';

// `projects` (opcional): { upload(nombre) -> { owner, used } | null, pendingCount(estudiante) } del almacén de proyectos del nodo.
export function createPolicy({ store, projects = null }) {
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

  // ---- Comentarios de equipo, «me gusta» y notas privadas de los recursos (reglas de la nube; la nube las valida otra vez al sincronizar) ----
  const inGroup = (uid, groupId) => store.all('group_members').some((m) => m.group_id === groupId && m.student_id === uid);
  const canSeeComment = (ctx, c) => staff(ctx) || inGroup(ctx.uid, c.group_id);
  const lessonKnown = (id) => typeof id === 'string' && store.all('lessons').some((l) => l.id === id);
  // Igual que el disparador de la nube: el mensaje trae CONTENIDO_INAPROPIADO y la app lo traduce a «lenguaje no permitido».
  const noProfanity = (t) => { if (containsProfanity(t)) throw new RestError(400, 'CONTENIDO_INAPROPIADO: el texto contiene lenguaje no permitido', 'P0001'); return true; };
  const canComment = (ctx, c) => {
    if (c.author_id !== ctx.uid || (!staff(ctx) && ctx.role !== 'student')) return false;
    if (typeof c.author_name !== 'string' || !c.author_name.trim() || c.author_name.length > 120) return false;
    if (!(staff(ctx) ? ['docente', 'admin', 'coordinador'].includes(c.author_role) : c.author_role === 'estudiante')) return false;
    if (!Number.isInteger(c.group_id) || !store.all('groups').some((g) => g.id === c.group_id) || !lessonKnown(c.lesson_id)) return false;
    if (!staff(ctx) && !inGroup(ctx.uid, c.group_id)) return false;
    if (!text(c.content, 2000) || c.attachment_url != null) return false;
    if (c.parent_id != null) {
      const p = store.all('resource_comments').find((x) => x.id === c.parent_id);
      if (!p || p.lesson_id !== c.lesson_id || p.group_id !== c.group_id) return false;
    }
    return noProfanity(c.content);
  };
  const canLike = (ctx, l) => l.user_id === ctx.uid && (staff(ctx) || ctx.role === 'student')
    && (() => { const c = store.all('resource_comments').find((x) => x.id === l.comment_id); return !!c && canSeeComment(ctx, c); })();
  const canNote = (ctx, n) => ctx.role === 'student' && n.student_id === ctx.uid && lessonKnown(n.lesson_id) && text(n.content, 5000) && noProfanity(n.content);

  // ---- Asistencia (reglas de la nube: el docente inserta y ve lo suyo; la nube valida otra vez al sincronizar) ----
  const ATT_STATUS = ['present', 'absent', 'late', 'excused'];
  const dayMs = 24 * 3600_000;
  const validAttendance = (ctx, a) => {
    if (a.teacher_id !== ctx.uid || !staff(ctx) || !ATT_STATUS.includes(a.status)) return false;
    if (typeof a.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return false;
    const t = Date.parse(`${a.date}T00:00:00Z`);
    if (Number.isNaN(t) || t > Date.now() + dayMs || t < Date.now() - 45 * dayMs) return false;
    if (typeof a.time !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(a.time)) return false;
    const st = store.all('students').find((s) => s.id === a.student_id);
    if (!st || a.school_code !== st.school_code || a.grade !== st.grade || a.section !== st.section) return false;
    return myClass(ctx, st);
  };

  // ---- Equipos (en la nube: solo personal; aquí además solo de sus clases) ----
  const groupOf = (id) => store.all('groups').find((g) => g.id === id);
  const memberOk = (m) => (m.role == null || (typeof m.role === 'string' && m.role.length <= 30)) && (m.is_leader == null || typeof m.is_leader === 'boolean');
  const canAddMember = (ctx, m) => {
    const g = groupOf(m.group_id);
    const st = store.all('students').find((s) => s.id === m.student_id);
    return staff(ctx) && !!g && myClass(ctx, g) && !!st && sameGroup(st, g) && memberOk(m);
  };

  // ---- Proyecto del estudiante (mismas reglas que el flujo del nodo y que js/project-modals.js; la nube las vuelve a validar al sincronizar) ----
  const uploadNameOf = (url) => {
    try { return /^\/storage\/v1\/object\/public\/project-videos\/([^/]+)$/.exec(new URL(url, 'http://nodo.local').pathname)?.[1] ?? null; } catch { return null; }
  };
  const canSubmitProject = (ctx, p) => {
    if (ctx.role !== 'student' || p.user_id !== ctx.uid || !projects || typeof p.video_url !== 'string') return false;
    const memberGroupIds = store.all('group_members').filter((m) => m.student_id === ctx.uid).map((m) => m.group_id);
    const v = validateProjectDraft({ title: p.title, description: p.description, bimestre: p.bimestre, group_id: p.group_id, filename: 'archivo.mp4', size: 1 }, { memberGroupIds });
    if (!v.ok) throw new RestError(400, v.error, 'P0001');
    const up = projects.upload(uploadNameOf(p.video_url) || '');
    if (!up || up.owner !== ctx.uid || up.used) throw new RestError(400, 'El archivo del proyecto no se subió en este servidor o ya se usó. Súbelo de nuevo.', 'P0001');
    if (projects.pendingCount(ctx.uid) >= PROJECT_LIMITS.maxPendingPerStudent) throw new RestError(409, `Ya tienes ${PROJECT_LIMITS.maxPendingPerStudent} proyectos esperando para subirse. Espera a que se sincronicen.`, 'P0001');
    return true;
  };

  // ---- Exámenes (migrations/exams.sql): el docente maneja los suyos; el estudiante solo ve sus notas, nunca la clave ----
  const examOwner = (ctx, e) => !!e && staff(ctx) && (ctx.role === 'admin' || e.teacher_id === ctx.uid);
  const examOk = (ctx, e) => typeof e.teacher_id === 'string' && (ctx.role === 'admin' || (e.teacher_id === ctx.uid && myClass(ctx, e)))
    && typeof e.school_code === 'string' && typeof e.grade === 'string' && typeof e.section === 'string' && text(e.title, 120)
    && int(e.bimestre, 1, 4) && int(e.question_count, 1, 100) && typeof e.answer_key === 'string' && /^[A-E]+$/.test(e.answer_key) && e.answer_key.length === e.question_count
    && typeof e.points === 'number' && e.points > 0 && e.points <= 1000;
  const examById = (id) => store.all('exams').find((e) => e.id === id);
  const resultOk = (ctx, r) => {
    const e = examById(r.exam_id);
    const st = store.all('students').find((s) => s.id === r.student_id);
    return examOwner(ctx, e) && !!st && sameGroup(st, e) && typeof r.answers === 'string' && r.answers.length === e.question_count && /^[A-E*-]+$/.test(r.answers)
      && int(r.correct, 0, 1000) && int(r.wrong, 0, 1000) && int(r.blank, 0, 1000) && typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100000
      && (r.scanned_by == null || r.scanned_by === ctx.uid);
  };

  // ---- Permisos de asistencia (en la nube: el docente inserta los suyos, siempre pendientes) ----
  const canRequestWaiver = (ctx, w) => ctx.role === 'teacher' && w.teacher_id === ctx.uid && w.status === 'pending' && text(w.reason, 1000)
    && typeof w.school_code === 'string' && assignmentsOf(ctx).some((m) => m.school_code === w.school_code) && w.admin_comment == null
    && (w.grade == null ? w.section == null : typeof w.grade === 'string' && typeof w.section === 'string' && myClass(ctx, w))
    && typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Math.abs(Date.parse(`${w.date}T00:00:00Z`) - Date.now()) <= 45 * dayMs;

  const readRules = {
    attendance_waivers: (ctx, r) => ctx.role === 'admin' || r.teacher_id === ctx.uid,
    exams: (ctx, r) => ctx.role === 'admin' || (ctx.role === 'teacher' && r.teacher_id === ctx.uid),
    exam_results: (ctx, r) => (staff(ctx) ? examOwner(ctx, examById(r.exam_id)) : r.student_id === ctx.uid),
    attendance: (ctx, r) => ctx.role === 'admin' || r.teacher_id === ctx.uid,
    resource_comments: (ctx, r) => canSeeComment(ctx, r),
    resource_comment_likes: (ctx, r) => { const c = store.all('resource_comments').find((x) => x.id === r.comment_id); return !!c && canSeeComment(ctx, c); },
    resource_notes: (ctx, r) => r.student_id === ctx.uid,
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
      || (table === 'attendance' && validAttendance(ctx, row))
      || (table === 'attendance_waivers' && canRequestWaiver(ctx, row))
      || (table === 'exams' && staff(ctx) && examOk(ctx, row))
      || (table === 'exam_results' && resultOk(ctx, row))
      || (table === 'projects' && canSubmitProject(ctx, row))
      || (table === 'groups' && staff(ctx) && text(row.name, 80) && typeof row.school_code === 'string' && myClass(ctx, row) && row.created_by == null)
      || (table === 'group_members' && canAddMember(ctx, row))
      || (table === 'resource_comments' && canComment(ctx, row))
      || (table === 'resource_comment_likes' && canLike(ctx, row))
      || (table === 'resource_notes' && canNote(ctx, row))
      || (table === 'courses' && staff(ctx) && validCourse(ctx, row))
      || (table === 'lessons' && staff(ctx) && validLesson(ctx, row)),

    // lesson_completions_update_own (la nueva fila también debe ser propia)
    canUpdate: (ctx, table, oldRow, newRow) => (table === 'lesson_completions' && own(ctx, oldRow.student_id) && own(ctx, newRow.student_id) && validCompletion(newRow))
      || (table === 'announcement_reads' && own(ctx, oldRow.user_id) && canMarkRead(ctx, newRow))
      || (table === 'groups' && staff(ctx) && myClass(ctx, oldRow) && newRow.school_code === oldRow.school_code && newRow.grade === oldRow.grade && newRow.section === oldRow.section && text(newRow.name, 80))
      || (table === 'group_members' && newRow.group_id === oldRow.group_id && newRow.student_id === oldRow.student_id && canAddMember(ctx, newRow))
      || (table === 'exams' && examOwner(ctx, oldRow) && newRow.teacher_id === oldRow.teacher_id && examOk(ctx, newRow))
      || (table === 'exam_results' && newRow.exam_id === oldRow.exam_id && newRow.student_id === oldRow.student_id && resultOk(ctx, newRow))
      || (table === 'attendance' && oldRow.teacher_id === ctx.uid && newRow.student_id === oldRow.student_id && newRow.date === oldRow.date && validAttendance(ctx, newRow))
      || (table === 'courses' && mayEditCourse(ctx, oldRow) && newRow.created_by === oldRow.created_by && validCourse({ ...ctx, uid: oldRow.created_by }, newRow))
      || (table === 'lessons' && staff(ctx) && newRow.id === oldRow.id && newRow.course_id === oldRow.course_id && newRow.created_by === oldRow.created_by
        && mayEditCourse(ctx, store.all('courses').find((c) => c.id === oldRow.course_id)) && validLesson({ ...ctx, uid: oldRow.created_by }, newRow)),

    // lesson_completions_delete_own_or_admin
    canDelete: (ctx, table, row) => (table === 'lesson_completions' && (own(ctx, row.student_id) || ctx.role === 'admin'))
      || (table === 'exams' && examOwner(ctx, row))
      || (table === 'exam_results' && examOwner(ctx, examById(row.exam_id)))
      || (table === 'groups' && staff(ctx) && myClass(ctx, row))
      || (table === 'group_members' && staff(ctx) && !!groupOf(row.group_id) && myClass(ctx, groupOf(row.group_id)))
      || (table === 'resource_comments' && (row.author_id === ctx.uid || staff(ctx)))
      || (table === 'resource_comment_likes' && row.user_id === ctx.uid)
      || (table === 'resource_notes' && row.student_id === ctx.uid)
      // Sin internet solo se borra lo propio; un curso compartido con otras escuelas se borra en línea (se puede dejar de compartir).
      || (table === 'courses' && mayEditCourse(ctx, row) && row.is_shared !== true)
      || (table === 'lessons' && mayEditCourse(ctx, store.all('courses').find((c) => c.id === row.course_id))),
  };
}
