-- ============================================================
-- Docente autónomo: agrega alumnos a SUS clases y crea sus propios
-- clubes/secciones sin depender del administrador.
--
-- - students.created_by: quién creó a cada alumno (auditoría del admin).
-- - teacher_create_class(): el docente abre una clase nueva (ej. "Club de
--   Ajedrez" A) en un establecimiento donde YA da clases, y queda asignado.
--   No puede tomar una clase que ya existe (con alumnos u otro docente):
--   eso lo sigue haciendo el admin.
--
-- La creación de alumnos la valida la edge function
-- admin-bulk-import-students (redesplegar): un docente solo puede crear
-- alumnos en clases asignadas a él.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar.
-- ============================================================

alter table public.students add column if not exists created_by uuid;

create or replace function public.teacher_create_class(p_school_code text, p_grade text, p_section text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade text := btrim(regexp_replace(coalesce(p_grade, ''), '\s+', ' ', 'g'));
  v_section text := upper(btrim(coalesce(p_section, '')));
begin
  if not exists (select 1 from public.teachers where id = auth.uid()) then
    raise exception 'Solo docentes pueden crear clases';
  end if;
  if v_grade = '' or v_section = '' or length(v_grade) > 60 or length(v_section) > 10 then
    raise exception 'Escribí un nombre de grado/club y una sección válidos';
  end if;
  if not exists (select 1 from public.teacher_assignments where teacher_id = auth.uid() and school_code = p_school_code) then
    raise exception 'Solo podés crear clases en un establecimiento donde ya das clases';
  end if;
  if exists (select 1 from public.teacher_assignments
             where teacher_id = auth.uid() and school_code = p_school_code and grade = v_grade and section = v_section) then
    return; -- ya es tuya
  end if;
  if exists (select 1 from public.teacher_assignments where school_code = p_school_code and grade = v_grade and section = v_section)
     or exists (select 1 from public.students where school_code = p_school_code and grade = v_grade and section = v_section) then
    raise exception 'Esa clase ya existe en el establecimiento: pedile al administrador que te la asigne';
  end if;

  insert into public.teacher_assignments (teacher_id, school_code, grade, section)
  values (auth.uid(), p_school_code, v_grade, v_section);
end;
$$;

revoke all on function public.teacher_create_class(text, text, text) from public, anon;
grant execute on function public.teacher_create_class(text, text, text) to authenticated;

notify pgrst, 'reload schema';
