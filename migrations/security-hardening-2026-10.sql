-- ============================================================
-- ENDURECIMIENTO DE SEGURIDAD Y RENDIMIENTO -- auditoría de octubre 2026
--
-- IMPORTANTE -- ORDEN: publicar PRIMERO la versión de la app v1.0.172 (o
-- posterior) y DESPUÉS correr este SQL. Las versiones anteriores de la app
-- piden select('*') sobre students, que con este cambio deja de estar
-- permitido (daría error al iniciar sesión).
--
-- ADITIVO / NO DESTRUCTIVO: no borra filas ni columnas. Seguro de
-- re-ejecutar. Pegar completo en el SQL Editor de Supabase.
--
-- 1. CONTRASEÑAS Y DATOS SENSIBLES DE ALUMNOS
--    students.password_generated es la contraseña REAL con la que el alumno
--    entra (student-login la compara en texto). Cualquier usuario con sesión
--    que pudiera leer la fila de otro alumno (un compañero de la misma clase,
--    según la política vigente) podía leer su contraseña y entrar como él,
--    además de su CUI (documento de identidad) y su código personal.
--    Ahora esas columnas NO se pueden leer directo desde la app: solo el
--    admin y el docente asignado a esa clase, mediante
--    staff_student_secrets(ids). Las Edge Functions (service_role) no cambian.
--    Si en el futuro se agrega una columna a students, hay que volver a correr
--    el bloque 1 para que la app pueda leerla.
--
-- 2. Un alumno podía cambiar en su propia fila su nombre (con eso inyectar
--    HTML que luego ve el docente), su estado (activo/baja) o su total de
--    gemas ganadas (evolucionar la mascota sin jugar). Un trigger nuevo
--    congela esos campos cuando el cambio viene directo de la app de un
--    alumno. Los cambios que hacen las funciones del servidor no se tocan.
--
-- 3. calculate_rocks_xp y get_teacher_rocks se podían llamar SIN sesión.
--
-- 4. Índices en las claves foráneas que usa la app para filtrar (retos,
--    resultados, avisos, lecciones, torneos...). Sin ellos cada consulta
--    recorre la tabla completa, y eso es lo primero que se pone lento cuando
--    crecen los datos.
-- ============================================================


-- ---------- 1. columnas sensibles de students ----------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students'
    and column_name not in ('password_generated', 'cui', 'codigo_personal', 'pin_hash', 'pin_salt', 'qr_code', 'qr_data');

  -- Un permiso de tabla completo tapa cualquier permiso por columna: hay que
  -- quitarlo y dar el de columnas.
  execute 'revoke select on public.students from anon, authenticated';
  execute format('grant select (%s) on public.students to authenticated', v_cols);
end $$;

create or replace function public.staff_student_secrets(p_ids uuid[])
returns table (id uuid, password_generated text, cui text, codigo_personal text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.password_generated::text, s.cui::text, s.codigo_personal
  from public.students s
  where s.id = any(p_ids)
    and public.can_manage_student(s.id);
$$;
revoke all on function public.staff_student_secrets(uuid[]) from public, anon;
grant execute on function public.staff_student_secrets(uuid[]) to authenticated;

-- Para no importar dos veces al mismo alumno: dice cuáles de estos CUI ya
-- existen (sin decir de quién son). Solo personal.
create or replace function public.staff_existing_cuis(p_cuis text[])
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.cui::text
  from public.students s
  where public.is_staff() and s.cui is not null and s.cui::text = any(p_cuis);
$$;
revoke all on function public.staff_existing_cuis(text[]) from public, anon;
grant execute on function public.staff_existing_cuis(text[]) to authenticated;


-- ---------- 2. un alumno no puede cambiar campos clave de su propia fila ----------
-- SECURITY INVOKER a propósito: así current_user dice QUIÉN ejecuta el UPDATE.
-- Desde la app es 'authenticated'; dentro de una función SECURITY DEFINER
-- (gemas, mascotas, ligas) es el dueño de la función, y esos cambios pasan.
create or replace function public.guard_student_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and not public.is_staff() then
    new.full_name := old.full_name;
    new.email := old.email;
    new.status := old.status;
    new.gems_earned_total := old.gems_earned_total;
    new.birth_date := old.birth_date;
    new.gender := old.gender;
    new.codigo_personal := old.codigo_personal;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.qr_code := old.qr_code;
    new.qr_data := old.qr_data;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_student_self_update on public.students;
create trigger trg_guard_student_self_update
  before update on public.students
  for each row execute function public.guard_student_self_update();


-- ---------- 3. funciones que no deben llamarse sin sesión ----------
do $$
begin
  if to_regprocedure('public.calculate_rocks_xp(uuid, integer, integer)') is not null then
    revoke all on function public.calculate_rocks_xp(uuid, integer, integer) from public, anon;
    grant execute on function public.calculate_rocks_xp(uuid, integer, integer) to authenticated;
  end if;
  if to_regprocedure('public.get_teacher_rocks(uuid, integer, integer)') is not null then
    revoke all on function public.get_teacher_rocks(uuid, integer, integer) from public, anon;
    grant execute on function public.get_teacher_rocks(uuid, integer, integer) to authenticated;
  end if;
end $$;


-- ---------- 4. índices en claves foráneas ----------
-- (si alguna tabla o columna no existe en esta base, se salta sin error)
do $$
declare
  r record;
  v_name text;
begin
  for r in
    select * from (values
      ('student_duels', 'challenger_id'), ('student_duels', 'opponent_id'), ('student_duels', 'winner_id'),
      ('student_duel_answers', 'student_id'),
      ('student_hangman_duels', 'challenger_id'), ('student_hangman_duels', 'opponent_id'), ('student_hangman_duels', 'winner_id'),
      ('student_hangman_results', 'student_id'),
      ('student_spelling_duels', 'challenger_id'), ('student_spelling_duels', 'opponent_id'), ('student_spelling_duels', 'winner_id'),
      ('student_spelling_results', 'student_id'),
      ('student_debug_duels', 'challenger_id'), ('student_debug_duels', 'opponent_id'), ('student_debug_duels', 'winner_id'),
      ('student_debug_results', 'student_id'),
      ('student_timed_math_duels', 'challenger_id'), ('student_timed_math_duels', 'opponent_id'), ('student_timed_math_duels', 'winner_id'),
      ('student_timed_math_results', 'student_id'),
      ('notifications', 'user_id'),
      ('project_likes', 'user_id'),
      ('lessons', 'course_id'), ('lessons', 'school_code'), ('lessons', 'created_by'),
      ('lesson_completions', 'student_id'),
      ('courses', 'school_code'), ('courses', 'created_by'),
      ('groups', 'school_code'), ('groups', 'created_by'),
      ('resource_comments', 'group_id'), ('resource_comments', 'parent_id'),
      ('resource_notes', 'lesson_id'), ('resource_notes', 'student_id'),
      ('comment_notifications', 'comment_id'), ('comment_notifications', 'lesson_id'),
      ('coordinator_assignments', 'teacher_id'),
      ('attendance_reports', 'teacher_id'),
      ('attendance_waivers', 'school_code'), ('attendance_waivers', 'teacher_id'),
      ('course_feedback', 'teacher_id'),
      ('guardian_push_subscriptions', 'guardian_id'),
      ('kpi_tasks', 'kpi_id'), ('kpi_tasks', 'teacher_id'),
      ('kpi_task_completions', 'teacher_id'),
      ('manual_kpi_entries', 'teacher_id'),
      ('teacher_rock_completions', 'rock_id'),
      ('teacher_notifications', 'project_id'),
      ('survey_answers', 'question_id'), ('survey_answers', 'response_id'),
      ('survey_questions', 'survey_id'),
      ('tournament_matches', 'season_id'), ('tournament_matches', 'team_a_id'), ('tournament_matches', 'team_b_id'),
      ('tournament_matches', 'challenger_team_id'), ('tournament_matches', 'winner_team_id'),
      ('tournament_match_answers', 'team_id'), ('tournament_match_answers', 'submitted_by'),
      ('tournament_team_members', 'team_id'), ('tournament_team_members', 'student_id'),
      ('tournament_teams', 'captain_id'),
      ('tutor_attendance', 'school_id'), ('tutor_attendance', 'tutor_id'),
      ('node_session_logs', 'node_id'), ('node_session_logs', 'student_id'),
      ('student_cosmetics', 'item_id'),
      ('user_badges', 'badge_id'),
      ('school_programs', 'program_id'),
      ('ai_code_evaluations', 'project_id'), ('ai_code_evaluations', 'teacher_id'),
      ('asset_audits', 'school_id'), ('asset_audits', 'tutor_id')
    ) as t(tbl, col)
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = r.tbl and column_name = r.col) then
      v_name := left('idx_' || r.tbl || '_' || r.col, 63);
      execute format('create index if not exists %I on public.%I (%I)', v_name, r.tbl, r.col);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';


-- ---------- Verificación (debe dar: false, false, true, true) ----------
select
  has_column_privilege('authenticated', 'public.students', 'password_generated', 'SELECT') as alumno_ve_password,
  has_column_privilege('authenticated', 'public.students', 'cui', 'SELECT') as alumno_ve_cui,
  has_column_privilege('authenticated', 'public.students', 'full_name', 'SELECT') as app_ve_nombre,
  exists (select 1 from pg_trigger where tgname = 'trg_guard_student_self_update') as trigger_activo;
