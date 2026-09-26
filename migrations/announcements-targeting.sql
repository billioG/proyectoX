-- ============================================================
-- AVISOS CON DESTINATARIOS A ELECCIÓN
--
-- audience: 'all' (todos), 'students' (solo estudiantes), 'teachers'
-- (solo docentes). Alcance opcional, además de la clase única de antes
-- (school_code/grade/section):
--   target_schools: lista de códigos de establecimiento.
--   target_groups:  lista de grupos [{school_code, grade, section}].
-- Un estudiante lo ve si su grupo/establecimiento está en el alcance; un
-- docente, si tiene alguna asignación en esos grupos/establecimientos.
--
-- Quién envía qué:
--   admin   -> cualquier combinación.
--   docente -> solo a estudiantes de SUS grupos (uno o varios).
--
-- Reemplaza las políticas RLS de announcements (se borran las que haya y
-- se crean estas). ADITIVO en datos, seguro de re-ejecutar.
-- ============================================================

alter table public.announcements add column if not exists target_schools text[];
alter table public.announcements add column if not exists target_groups jsonb;

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
begin
  if auth.uid() is null then return false; end if;
  if p_sender = auth.uid() or public.is_admin() then return true; end if;

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

create or replace function public.can_send_announcement(
  p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_sender is distinct from auth.uid() then return false; end if;
  if public.is_admin() then return true; end if;
  if not exists (select 1 from public.teachers where id = auth.uid()) then return false; end if;

  -- Docente: solo estudiantes de sus grupos.
  if p_audience <> 'students' or p_schools is not null then return false; end if;
  if p_school is not null then
    return p_groups is null and exists (select 1 from public.teacher_assignments
      where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section);
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_groups) e
    where not exists (select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.school_code = e->>'school_code' and ta.grade = e->>'grade' and ta.section = e->>'section')
  );
end;
$$;
grant execute on function public.can_send_announcement(text, text, text, text, text[], jsonb, uuid) to authenticated;

alter table public.announcements enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'announcements' loop
    execute format('drop policy %I on public.announcements', p.policyname);
  end loop;
end $$;

create policy "announcements_select" on public.announcements for select to authenticated
  using (public.can_see_announcement(audience, school_code, grade, section, target_schools, target_groups, sender_id));
create policy "announcements_insert" on public.announcements for insert to authenticated
  with check (public.can_send_announcement(audience, school_code, grade, section, target_schools, target_groups, sender_id));
create policy "announcements_delete" on public.announcements for delete to authenticated
  using (public.is_admin() or sender_id = auth.uid());

grant select, insert, delete on public.announcements to authenticated;

notify pgrst, 'reload schema';
