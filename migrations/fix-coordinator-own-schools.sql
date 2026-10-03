-- Un coordinador también es docente y tiene sus propias clases
-- (teacher_assignments). set_school_public_projects solo miraba las escuelas
-- de los docentes que coordina, así que no podía cambiar el Hall de la Fama
-- de su propio establecimiento. Ahora también vale por sus clases propias.
create or replace function public.set_school_public_projects(p_school_code text, p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.coordinator_assignments ca
      join public.teacher_assignments ta on ta.teacher_id = ca.teacher_id
      where ca.coordinator_id = auth.uid() and ta.school_code = p_school_code
    )
    or exists (
      select 1 from public.teachers t
      join public.teacher_assignments ta on ta.teacher_id = t.id
      where t.id = auth.uid() and t.role = 'coordinador' and ta.school_code = p_school_code
    )
  ) then
    raise exception 'No tenés permiso sobre ese establecimiento';
  end if;

  update public.schools set public_projects = p_public where code = p_school_code;
end;
$$;
