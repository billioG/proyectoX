-- Aserciones: migrations/performance-2026-11.sql (índices y latido). Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

insert into public.students values ('00000000-0000-0000-0000-0000000000b1', 'ESC1');
insert into public.teachers values ('00000000-0000-0000-0000-0000000000a1', 'docente'), ('00000000-0000-0000-0000-0000000000a2', 'admin'), ('00000000-0000-0000-0000-0000000000a3', 'coordinador');
insert into public.teacher_assignments (teacher_id, school_code) values ('00000000-0000-0000-0000-0000000000a1', 'ESC2');

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;
grant execute on function pg_temp.fails(text, text) to public;

\ir ../../migrations/performance-2026-11.sql
\ir ../../migrations/performance-2026-11.sql

-- 1) Índices: los de tablas que existen con sus columnas, listos (parcial y con el orden del Ranking); lo ausente, saltado sin error.
do $$ begin
  if to_regclass('public.idx_projects_ranking') is null then raise exception 'FALTA_RANKING'; end if;
  if (select indexdef from pg_indexes where indexname = 'idx_projects_ranking') !~* 'votes DESC, score DESC\)\s*WHERE \(score IS NOT NULL\)' then
    raise exception 'RANKING_DEFINICION: %', (select indexdef from pg_indexes where indexname = 'idx_projects_ranking');
  end if;
  if to_regclass('public.idx_announcement_reads_user') is null then raise exception 'FALTA_READS'; end if;
  if to_regclass('public.idx_attendance_teacher_date') is null then raise exception 'FALTA_ATTENDANCE'; end if;
  if to_regclass('public.idx_student_duels_topic') is not null then raise exception 'NO_DEBIO_CREAR_SIN_COLUMNA_TOPIC'; end if;
end $$;

-- 2) El Ranking usa el índice (con datos suficientes y estadísticas): mismo orden que la consulta del cliente, sin ordenar toda la tabla.
insert into public.projects (votes, score) select (g % 50), 50 + (g % 50) from generate_series(1, 3000) g;
insert into public.projects (votes, score) select 5, null from generate_series(1, 2000);
analyze public.projects;
do $$ declare r record; usa boolean := false; begin
  set local enable_seqscan = off; -- fuerza a comparar: ¿el índice sirve para ESTE orden y filtro?
  for r in execute 'explain select id from public.projects where score is not null order by votes desc, score desc limit 20' loop
    if r."QUERY PLAN" ilike '%idx_projects_ranking%' then usa := true; end if;
  end loop;
  if not usa then raise exception 'RANKING_NO_USA_EL_INDICE'; end if;
end $$;

-- 3) Latido: estudiante cuenta 30; una segunda llamada inmediata NO suma; pasados 25 s sí; solo con sesión; rol y escuela los decide el servidor.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
select public.record_active_heartbeat();
select public.record_active_heartbeat();
do $$ begin
  if (select total_seconds from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000b1') <> 30 then raise exception 'LATIDO_DOBLE: %', (select total_seconds from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000b1'); end if;
  if (select role from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000b1') <> 'estudiante' then raise exception 'LATIDO_ROL'; end if;
  if (select school_code from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000b1') <> 'ESC1' then raise exception 'LATIDO_ESCUELA'; end if;
end $$;
reset role;
update public.active_time_tracking set last_heartbeat = now() - interval '26 seconds' where user_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
select public.record_active_heartbeat();
do $$ begin if (select total_seconds from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000b1') <> 60 then raise exception 'LATIDO_TRAS_26S'; end if; end $$;
-- Docente: escuela de su primera asignación; coordinador y admin: su rol, escuela GENERAL; usuario desconocido: nada; sin sesión: error.
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
select public.record_active_heartbeat();
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
select public.record_active_heartbeat();
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
select public.record_active_heartbeat();
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ee', false);
select public.record_active_heartbeat();
do $$ begin
  if (select school_code || '/' || role from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000a1') <> 'ESC2/docente' then raise exception 'LATIDO_DOCENTE'; end if;
  if (select school_code || '/' || role from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000a2') <> 'GENERAL/admin' then raise exception 'LATIDO_ADMIN'; end if;
  if (select school_code || '/' || role from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000a3') <> 'GENERAL/coordinador' then raise exception 'LATIDO_COORDINADOR'; end if;
  if exists (select 1 from public.active_time_tracking where user_id = '00000000-0000-0000-0000-0000000000ee') then raise exception 'LATIDO_DESCONOCIDO'; end if;
end $$;
select set_config('test.uid', '', false);
select pg_temp.fails($q$select public.record_active_heartbeat()$q$, 'No autenticado');
-- La app no escribe la tabla directo (los permisos de tabla no se tocaron: aquí nunca se dieron).
select pg_temp.fails($q$update public.active_time_tracking set total_seconds = 999999$q$, 'permission denied');
reset role;
-- anon no ejecuta el latido; service_role sí.
set role anon;
select pg_temp.fails($q$select public.record_active_heartbeat()$q$, 'permission denied');
reset role;

select 'PERF_SQL_OK';
