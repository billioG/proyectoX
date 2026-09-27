-- ============================================================
-- Quita el plantel de DEMOSTRACIÓN (DEMO-QUETZAL) creado con
-- migrations/demo-school.sql. No toca ningún otro plantel.
-- El docente de demo NO se borra (se creó desde la app): quitalo
-- desde admin → Docentes si ya no lo necesitás.
-- ============================================================
do $$
declare
  v_school text := 'DEMO-QUETZAL';
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.students where school_code = v_school;

  delete from public.attendance where school_code = v_school;
  delete from public.projects where group_id in (select id from public.groups where school_code = v_school)
                              or user_id = any(coalesce(v_ids, '{}'));
  delete from public.group_members where group_id in (select id from public.groups where school_code = v_school);
  delete from public.groups where school_code = v_school;
  delete from public.teacher_assignments where school_code = v_school;
  delete from public.class_passwords where school_code = v_school;
  delete from public.students where school_code = v_school;
  -- Solo cuentas de alumnos demo (usuario terminado en "demo").
  delete from auth.users where id = any(coalesce(v_ids, '{}')) and email like '%demo@estudiante.edu.gt';
  delete from public.schools where code = v_school;

  raise notice 'Plantel de demostración eliminado (% alumnos).', coalesce(array_length(v_ids, 1), 0);
end $$;
