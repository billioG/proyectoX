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

  const readRules = {
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
    canInsert: (ctx, table, row) => table === 'lesson_completions' && own(ctx, row.student_id) && validCompletion(row),

    // lesson_completions_update_own (la nueva fila también debe ser propia)
    canUpdate: (ctx, table, oldRow, newRow) => table === 'lesson_completions' && own(ctx, oldRow.student_id) && own(ctx, newRow.student_id) && validCompletion(newRow),

    // lesson_completions_delete_own_or_admin
    canDelete: (ctx, table, row) => table === 'lesson_completions' && (own(ctx, row.student_id) || ctx.role === 'admin'),
  };
}
