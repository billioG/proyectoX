-- ============================================================
-- RENDIMIENTO -- NOVIEMBRE 2026: índices que faltaban y latido más liviano
-- (hallazgos y mediciones: docs/PERFORMANCE.md)
--
-- 1. ÍNDICES. Se compararon, una por una, las consultas del código (js/ y supabase/functions/) con los índices del volcado de producción
--    y de las migraciones. Estos filtros no tenían ningún índice que EMPIECE por la columna que filtran, así que cada consulta recorría la
--    tabla completa:
--      projects (votes desc, score desc) donde score no es null   -> el Ranking (top 20 ordenado así) ordenaba TODA la tabla
--      announcement_reads (user_id)       -> el punto rojo de la campana, que corre en cada inicio de sesión y cada refresco
--      push_subscriptions (user_id)       -> cada aviso push busca las suscripciones de cada destinatario
--      resource_comments (author_id)      -> insignias de comentarios (cada «me gusta» a un comentario)
--      survey_responses (user_id)         -> encuestas pendientes, parte del punto rojo de la campana
--      attendance (teacher_id, date)      -> tableros de docentes y «¿ya pasé lista hoy?»
--      teacher_challenges (teacher_id)    -> retos del docente (bonos, gamificación)
--      student_*_duels (topic, created_at desc) -> las funciones de IA buscan los temas ya usados para no repetir
--    Cada uno se crea solo si la tabla y la columna existen en TU base (si no, se salta sin error).
--
-- 2. LATIDO (record_active_heartbeat). Corre cada 30 s por cada estudiante o docente con la app abierta y activa: con 150 personas son
--    300 llamadas por minuto. Hacía 4 consultas por llamada (dos para saber si es estudiante, otra para la escuela, otra para ver si ya contó
--    hace 25 s, y al final el insert). Ahora son 2: una para el rol y la escuela, y un solo INSERT ... ON CONFLICT cuyo DO UPDATE solo aplica si pasaron
--    25 s (atómico: dos pestañas del mismo usuario ya no pueden contar doble). Misma regla de siempre: +30 s fijos, como mucho una vez cada 25 s,
--    día de Guatemala, rol y escuela decididos por el servidor.
--
-- ADITIVO / NO DESTRUCTIVO. Seguro de re-ejecutar. Los índices se crean sin CONCURRENTLY (no se puede dentro del SQL Editor): con las
-- tablas de este tamaño (miles de filas) el bloqueo dura una fracción de segundo; si alguna tuviera millones, correr en un momento sin clase.
-- Pegar completo en el SQL Editor de Supabase.
-- ============================================================

begin;
set local lock_timeout = '10s';

do $$
declare
  r record;
  v_created integer := 0;
  v_skipped text[] := '{}';
begin
  for r in select * from (values
    -- tabla, nombre del índice, columnas (como van en CREATE INDEX), columnas que deben existir, condición parcial
    ('projects',            'idx_projects_ranking',            'votes desc, score desc',   array['votes','score'],            'score is not null'),
    ('announcement_reads',  'idx_announcement_reads_user',     'user_id',                  array['user_id'],                  null),
    ('push_subscriptions',  'idx_push_subscriptions_user',     'user_id',                  array['user_id'],                  null),
    ('resource_comments',   'idx_resource_comments_author',    'author_id',                array['author_id'],                null),
    ('survey_responses',    'idx_survey_responses_user',       'user_id',                  array['user_id'],                  null),
    ('attendance',          'idx_attendance_teacher_date',     'teacher_id, date',         array['teacher_id','date'],        null),
    ('teacher_challenges',  'idx_teacher_challenges_teacher',  'teacher_id',               array['teacher_id'],               null),
    ('student_duels',          'idx_student_duels_topic',          'topic, created_at desc', array['topic','created_at'],     null),
    ('student_hangman_duels',  'idx_student_hangman_duels_topic',  'topic, created_at desc', array['topic','created_at'],     null),
    ('student_spelling_duels', 'idx_student_spelling_duels_topic', 'topic, created_at desc', array['topic','created_at'],     null),
    ('student_debug_duels',    'idx_student_debug_duels_topic',    'topic, created_at desc', array['topic','created_at'],     null)
  ) as t(tbl, idx, cols, need, pred)
  loop
    if to_regclass(format('public.%I', r.tbl)) is null
       or (select count(*) from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = any (r.need)) <> array_length(r.need, 1) then
      v_skipped := array_append(v_skipped, r.tbl);
      continue;
    end if;
    execute format('create index if not exists %I on public.%I (%s)%s', r.idx, r.tbl, r.cols, case when r.pred is not null then ' where ' || r.pred else '' end);
    v_created := v_created + 1;
  end loop;
  raise notice 'performance-2026-11: % índice(s) listos (los que ya existían no se tocan); tablas o columnas ausentes, saltadas: %', v_created, coalesce(nullif(array_to_string(v_skipped, ', '), ''), 'ninguna');
end $$;

-- ---------- latido más liviano ----------
create or replace function public.record_active_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_school text;
  v_today date := (now() at time zone 'America/Guatemala')::date;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Una sola búsqueda decide rol y escuela (antes: dos consultas a students solo para esto).
  select s.school_code into v_school from public.students s where s.id = v_uid;
  if found then
    v_role := 'estudiante';
  elsif exists (select 1 from public.teachers where id = v_uid) then
    select case when t.role in ('admin', 'coordinador') then t.role else 'docente' end into v_role
      from public.teachers t where t.id = v_uid;
    if v_role = 'docente' then
      select ta.school_code into v_school from public.teacher_assignments ta where ta.teacher_id = v_uid limit 1;
    end if;
  else
    return;
  end if;

  v_school := coalesce(v_school, 'GENERAL');

  -- +30 s fijos, como mucho una vez cada 25 s: la condición va DENTRO del DO UPDATE (una sola sentencia, sin carrera entre pestañas).
  insert into public.active_time_tracking as a (user_id, school_code, role, activity_date, total_seconds, last_heartbeat)
    values (v_uid, v_school, v_role, v_today, 30, now())
  on conflict (user_id, school_code, activity_date)
    do update set total_seconds = a.total_seconds + 30, last_heartbeat = now()
    where a.last_heartbeat is null or a.last_heartbeat <= now() - interval '25 seconds';
end;
$$;

-- Los permisos no cambian: solo quien tiene sesión (ver security-function-exposure-2026-11.sql).
revoke all on function public.record_active_heartbeat() from public, anon;
grant execute on function public.record_active_heartbeat() to authenticated;
grant execute on function public.record_active_heartbeat() to service_role;

notify pgrst, 'reload schema';

commit;
