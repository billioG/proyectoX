-- Aserciones sobre migrations/feedback-inbox.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/feedback-inbox.sql
\ir ../../migrations/feedback-inbox.sql

insert into public.schools values ('ESC1', 'Escuela Uno'), ('ESC2', 'Escuela Dos');
insert into public.students (id, full_name, school_code, grade, section) values
  ('00000000-0000-0000-0000-00000000000a', 'Ana López', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-00000000000b', 'Beto Ruiz', 'ESC1', 'Segundo', 'B'), ('00000000-0000-0000-0000-00000000000c', 'Carla Paz', 'ESC2', 'Primero', 'A');
insert into public.teachers (id, full_name, role, coordinator_of) values
  ('00000000-0000-0000-0000-0000000000a1', 'Marta Docente', 'docente', null), ('00000000-0000-0000-0000-0000000000a2', 'Raúl Docente', 'docente', null),
  ('00000000-0000-0000-0000-0000000000ad', 'Admin', 'admin', null), ('00000000-0000-0000-0000-0000000000c0', 'Coordinadora', 'docente', '00000000-0000-0000-0000-0000000000a1');
insert into public.teacher_assignments (teacher_id, school_code, grade, section) values
  ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-0000000000a2', 'ESC1', 'Segundo', 'B');
insert into public.student_suggestions (student_id, type, message, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'suggestion', 'Más tiempo de laboratorio', now()), ('00000000-0000-0000-0000-00000000000b', 'suggestion', 'Más computadoras', now()), ('00000000-0000-0000-0000-00000000000c', 'suggestion', 'Otra escuela', now());
insert into public.teacher_ratings (student_id, teacher_id, rating, message, best_moment, q_interest, q_practice, created_at) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 4.2, 'La robótica', 'La robótica', 4, 5, now()),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2', 3.0, 'Muy rápido', null, 3, 3, now());

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

-- 1) DOCENTE: ve solo lo suyo y ANÓNIMO (ni nombre del estudiante, ni su id, ni nombres ajenos); las sugerencias solo de sus clases.
do $$ declare r jsonb; begin
  set local test.uid = '00000000-0000-0000-0000-0000000000a1';
  r := get_feedback_inbox();
  if r ->> 'role' <> 'teacher' then raise exception 'ROL'; end if;
  if jsonb_array_length(r -> 'ratings') <> 1 or r -> 'ratings' -> 0 ->> 'message' <> 'La robótica' or (r -> 'ratings' -> 0 ->> 'q_practice')::int <> 5 then raise exception 'EVALS: %', r -> 'ratings'; end if;
  if jsonb_array_length(r -> 'suggestions') <> 1 or r -> 'suggestions' -> 0 ->> 'message' <> 'Más tiempo de laboratorio' then raise exception 'SUGS: %', r -> 'suggestions'; end if;
  if r::text like '%Ana%' or r::text like '%Beto%' or r::text like '%student_id%' or r::text like '%student_name%' or r::text like '%00000000-0000-0000-0000-00000000000a%' then raise exception 'REVELA_AL_ESTUDIANTE: %', r; end if;
  if r -> 'ratings' -> 0 ? 'teacher_name' then raise exception 'NOMBRE_PROPIO_INNECESARIO'; end if;
end $$;

-- 2) ADMINISTRADOR: ve todo con nombres; puede filtrar por escuela.
do $$ declare r jsonb; begin
  set local test.uid = '00000000-0000-0000-0000-0000000000ad';
  r := get_feedback_inbox();
  if r ->> 'role' <> 'admin' or jsonb_array_length(r -> 'suggestions') <> 3 or jsonb_array_length(r -> 'ratings') <> 2 then raise exception 'ADMIN_TODO: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'ratings') x where x ->> 'student_name' = 'Ana López' and x ->> 'teacher_name' = 'Marta Docente') then raise exception 'ADMIN_NOMBRES'; end if;
  if jsonb_array_length(get_feedback_inbox('ESC2') -> 'suggestions') <> 1 or jsonb_array_length(get_feedback_inbox('ESC2') -> 'ratings') <> 0 then raise exception 'FILTRO_ESCUELA'; end if;
end $$;

-- 3) COORDINADORA: las evaluaciones de su docente, sin quién las escribió pero con el nombre del docente; ninguna sugerencia.
do $$ declare r jsonb; begin
  set local test.uid = '00000000-0000-0000-0000-0000000000c0';
  r := get_feedback_inbox();
  if jsonb_array_length(r -> 'ratings') <> 1 or r -> 'ratings' -> 0 ->> 'teacher_name' <> 'Marta Docente' or jsonb_array_length(r -> 'suggestions') <> 0 then raise exception 'COORD: %', r; end if;
  if r::text like '%Ana%' then raise exception 'COORD_REVELA'; end if;
end $$;

-- 4) El anonimato es real: el docente ya NO puede leer las tablas directamente; el estudiante sigue viendo lo suyo; el administrador todo.
set role authenticated;
do $$ begin
  set local test.uid = '00000000-0000-0000-0000-0000000000a1';
  if (select count(*) from public.teacher_ratings) <> 0 then raise exception 'DOCENTE_LEE_EVALUACIONES'; end if;
  if (select count(*) from public.student_suggestions) <> 0 then raise exception 'DOCENTE_LEE_SUGERENCIAS'; end if;
  set local test.uid = '00000000-0000-0000-0000-00000000000a';
  if (select count(*) from public.teacher_ratings) <> 1 or (select count(*) from public.student_suggestions) <> 1 then raise exception 'ESTUDIANTE_LO_SUYO'; end if;
  set local test.uid = '00000000-0000-0000-0000-0000000000ad';
  if (select count(*) from public.teacher_ratings) <> 2 or (select count(*) from public.student_suggestions) <> 3 then raise exception 'ADMIN_LEE'; end if;
  set local test.uid = '00000000-0000-0000-0000-0000000000c0';
  if (select count(*) from public.teacher_ratings) <> 1 then raise exception 'COORD_SIGUE_LEYENDO'; end if;
end $$;
reset role;

-- 5) Las notas del docente para su perfil (solo la nota); sin sesión no hay buzón; permisos.
do $$ begin
  set local test.uid = '00000000-0000-0000-0000-0000000000a1';
  if (get_my_ratings() -> 0 ->> 'rating')::numeric <> 4.2 or jsonb_array_length(get_my_ratings()) <> 1 or get_my_ratings()::text like '%student%' then raise exception 'MIS_NOTAS'; end if;
  set local test.uid = '';
  perform pg_temp.fails($q$select get_feedback_inbox()$q$, 'No autenticado');
  if has_function_privilege('anon', 'public.get_feedback_inbox(text, integer)', 'execute') or has_function_privilege('anon', 'public.get_my_ratings()', 'execute') then raise exception 'PERMISOS_ANON'; end if;
  if not has_function_privilege('authenticated', 'public.get_feedback_inbox(text, integer)', 'execute') then raise exception 'PERMISOS_USO'; end if;
end $$;

select 'INBOX_SQL_OK';
