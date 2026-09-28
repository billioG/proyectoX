-- ============================================================
-- EL COORDINADOR VE LOS AVISOS DE SUS DOCENTES Y DEL ADMIN (SOLO DE SU
-- ESTABLECIMIENTO)
--
-- Hasta ahora un coordinador veía los avisos exactamente igual que
-- cualquier docente (solo los suyos, o los de audiencia "docentes"/
-- "todos"). Ahora además ve, sin importar a quién iban dirigidos:
--   - los avisos de los docentes que tiene asignados
--     (coordinator_assignments, ver coordinador-role.sql).
--   - los avisos del admin, PERO solo si son un aviso general (sin
--     alcance, para todo el sistema) o si su alcance incluye alguno de
--     los establecimientos donde da clase alguno de sus docentes
--     asignados. Un aviso del admin dirigido a OTRO colegio nunca se
--     le muestra: el admin puede mandar avisos privados a un
--     establecimiento distinto sin que ningún coordinador ajeno los vea.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Requiere
-- announcements-targeting.sql y coordinador-role.sql corridas antes.
-- ============================================================

create or replace function public.can_see_announcement(
  p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me record;
  my_schools text[];
begin
  if auth.uid() is null then return false; end if;
  if p_sender = auth.uid() or public.is_admin() then return true; end if;

  -- Coordinador: ve lo que mandan sus docentes asignados (sin importar
  -- a quién iba dirigido) y lo del admin, pero solo si el aviso del
  -- admin es general o toca alguno de SUS establecimientos.
  if exists (select 1 from public.teachers where id = auth.uid() and role = 'coordinador') then
    if public.is_coordinator_of(p_sender) then return true; end if;

    if exists (select 1 from public.teachers where id = p_sender and role = 'admin') then
      if p_school is null and p_schools is null and p_groups is null then return true; end if; -- aviso general

      select array_agg(distinct ta.school_code) into my_schools
        from public.coordinator_assignments ca
        join public.teacher_assignments ta on ta.teacher_id = ca.teacher_id
        where ca.coordinator_id = auth.uid();

      if p_school is not null then return p_school = any(coalesce(my_schools, '{}')); end if;
      if p_schools is not null then return p_schools && coalesce(my_schools, '{}'); end if;
      if p_groups is not null then
        return exists (select 1 from jsonb_array_elements(p_groups) e
          where e->>'school_code' = any(coalesce(my_schools, '{}')));
      end if;
      return false;
    end if;
  end if;

  select school_code, grade, section into me from public.students where id = auth.uid();
  if found then
    if coalesce(p_audience, 'all') not in ('all', 'students') then return false; end if;
    if p_school is not null then
      return me.school_code = p_school and me.grade = p_grade and me.section = p_section;
    end if;
    if p_groups is not null then
      return exists (select 1 from jsonb_array_elements(p_groups) e
        where e->>'school_code' = me.school_code and e->>'grade' = me.grade and e->>'section' = me.section);
    end if;
    if p_schools is not null then return me.school_code = any(p_schools); end if;
    return true;
  end if;

  if exists (select 1 from public.teachers where id = auth.uid()) then
    if coalesce(p_audience, 'all') not in ('all', 'teachers') then return false; end if;
    if p_school is not null then return false; end if; -- avisos de clase: son para los alumnos
    if p_groups is not null then
      return exists (select 1 from jsonb_array_elements(p_groups) e
        join public.teacher_assignments ta on ta.teacher_id = auth.uid()
          and ta.school_code = e->>'school_code' and ta.grade = e->>'grade' and ta.section = e->>'section');
    end if;
    if p_schools is not null then
      return exists (select 1 from public.teacher_assignments ta where ta.teacher_id = auth.uid() and ta.school_code = any(p_schools));
    end if;
    return true;
  end if;

  return false;
end;
$$;
grant execute on function public.can_see_announcement(text, text, text, text, text[], jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
