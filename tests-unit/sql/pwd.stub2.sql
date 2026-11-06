-- Lo que security-hardening-2026-10.sql exige que ya exista (guardians.sql lo crea en producción).
create or replace function public.can_manage_student(p_student uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select public.is_admin() or exists (
    select 1 from public.students s join public.teacher_assignments ta
      on ta.school_code = s.school_code and ta.grade = s.grade and ta.section = s.section
    where s.id = p_student and ta.teacher_id = auth.uid());
$f$;
grant execute on function public.can_manage_student(uuid) to anon, authenticated, service_role;
