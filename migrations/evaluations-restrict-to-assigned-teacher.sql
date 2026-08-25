-- ============================================================
-- Solo el docente ASIGNADO a la clase del estudiante puede calificar
-- su proyecto (antes: cualquier docente autenticado podía escribir
-- una evaluación con teacher_id = su propio uid, sin importar si le
-- correspondía esa clase). Lectura sigue abierta a todos los
-- autenticados (ver/votar/comentar no se toca).
-- ============================================================

create or replace function public.is_assigned_teacher_for_project(p_project_id integer)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.projects p
    join public.students s on s.id = p.user_id
    join public.teacher_assignments ta
      on ta.school_code = s.school_code
     and ta.grade = s.grade
     and ta.section = s.section
    where p.id = p_project_id
      and ta.teacher_id = auth.uid()
  );
$$;

drop policy if exists "evaluations_write_teacher_or_admin" on public.evaluations;

create policy "evaluations_write_assigned_teacher_or_admin"
  on public.evaluations for all
  using (public.is_admin() or (auth.uid() = teacher_id and public.is_assigned_teacher_for_project(project_id)))
  with check (public.is_admin() or (auth.uid() = teacher_id and public.is_assigned_teacher_for_project(project_id)));

notify pgrst, 'reload schema';
