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
    canInsert: (ctx, table, row) => table === 'lesson_completions' && own(ctx, row.student_id),

    // lesson_completions_update_own (la nueva fila también debe ser propia)
    canUpdate: (ctx, table, oldRow, newRow) => table === 'lesson_completions' && own(ctx, oldRow.student_id) && own(ctx, newRow.student_id),

    // lesson_completions_delete_own_or_admin
    canDelete: (ctx, table, row) => table === 'lesson_completions' && (own(ctx, row.student_id) || ctx.role === 'admin'),
  };
}
