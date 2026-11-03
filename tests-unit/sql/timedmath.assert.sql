-- Aserciones sobre migrations/node-timed-math-duel.sql (con la liquidación de la nube como disparador). Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/node-timed-math-duel.sql
\ir ../../migrations/node-timed-math-duel.sql

insert into public.students (id, school_code, gems, xp) values
  ('00000000-0000-0000-0000-00000000000a', 'ESC1', 100, 50),
  ('00000000-0000-0000-0000-00000000000b', 'ESC1', 30, 10),
  ('00000000-0000-0000-0000-00000000000c', 'OTRA', 100, 0);

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

create or replace function pg_temp.probs(n integer) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('question', i || ' + ' || i, 'answer', 2 * i)) from generate_series(1, n) i $f$;

create or replace function pg_temp.answers(n_ok integer) returns jsonb language sql as $f$
  select jsonb_agg(to_jsonb(case when i <= n_ok then (2 * i)::text else 'x' end)) from generate_series(1, 10) i $f$;

create or replace function pg_temp.res(p_student text, p_ok integer, p_time integer) returns jsonb language sql as $f$
  select jsonb_build_object('student_id', p_student, 'answers', pg_temp.answers(p_ok), 'score', 99, 'time_ms', p_time) $f$;

create or replace function pg_temp.snap(p_id text, p_wager integer, p_status text, p_results jsonb) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000b',
    'wager_gems', p_wager, 'problem_count', 10, 'status', p_status, 'problems', pg_temp.probs(10), 'problems_b', pg_temp.probs(10),
    'challenger_started_at', '2026-11-02T15:00:10Z', 'opponent_started_at', '2026-11-02T15:00:20Z', 'created_at', '2026-11-02T15:00:00Z', 'results', p_results) $f$;

create or replace function pg_temp.gems(p_id text) returns integer language sql as $f$ select gems from public.students where id = p_id::uuid $f$;
create or replace function pg_temp.xp(p_id text) returns integer language sql as $f$ select xp from public.students where id = p_id::uuid $f$;

-- 1) Reto pendiente: se crea como en la nube, sin problemas ni resultados.
do $$ begin
  perform apply_node_timed_math_duel(jsonb_build_object('id', '11111111-1111-1111-1111-111111111111', 'challenger_id', '00000000-0000-0000-0000-00000000000a',
    'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 20, 'problem_count', 10, 'status', 'pending', 'results', '[]'::jsonb));
  if (select status from public.student_timed_math_duels) <> 'pending' then raise exception 'PENDIENTE'; end if;
  if (select count(*) from public.student_timed_math_results) <> 0 then raise exception 'SIN_RESULTADOS'; end if;
end $$;

-- 2) Aceptado y jugado: los problemas pasan a la nube; el puntaje se RECALCULA (el nodo manda score 99 y no cuenta) y el disparador liquida.
do $$ begin
  perform apply_node_timed_math_duel(pg_temp.snap('11111111-1111-1111-1111-111111111111', 20, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 10, 20000), pg_temp.res('00000000-0000-0000-0000-00000000000b', 6, 25000))));
  if (select score from public.student_timed_math_results where student_id = '00000000-0000-0000-0000-00000000000a') <> 10 then raise exception 'SCORE_A'; end if;
  if (select score from public.student_timed_math_results where student_id = '00000000-0000-0000-0000-00000000000b') <> 6 then raise exception 'SCORE_B'; end if;
  if (select status from public.student_timed_math_duels) <> 'completed' or (select winner_id from public.student_timed_math_duels) <> '00000000-0000-0000-0000-00000000000a' then raise exception 'LIQUIDA'; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 120 or pg_temp.gems('00000000-0000-0000-0000-00000000000b') <> 10 then raise exception 'GEMAS'; end if;
  if pg_temp.xp('00000000-0000-0000-0000-00000000000a') <> 70 or pg_temp.xp('00000000-0000-0000-0000-00000000000b') <> 15 then raise exception 'XP'; end if;
end $$;

-- 3) Reintento (la misma foto otra vez) y duelo ya terminado: no cambia nada, no reparte dos veces.
do $$ declare r jsonb; begin
  r := apply_node_timed_math_duel(pg_temp.snap('11111111-1111-1111-1111-111111111111', 20, 'completed', '[]'::jsonb));
  if r ->> 'skipped' <> 'completed' then raise exception 'REINTENTO: %', r; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 120 then raise exception 'DOBLE_PAGO'; end if;
end $$;

-- 4) La apuesta se topa con las gemas de quien pierde (mismo tope que la nube); empate total: sin ganador ni gemas.
do $$ begin
  update public.students set gems = 5 where id = '00000000-0000-0000-0000-00000000000b';
  perform apply_node_timed_math_duel(pg_temp.snap('22222222-2222-2222-2222-222222222222', 50, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 10, 1000), pg_temp.res('00000000-0000-0000-0000-00000000000b', 0, 1000))));
  if pg_temp.gems('00000000-0000-0000-0000-00000000000b') <> 0 or pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 125 then raise exception 'TOPE'; end if;
  perform apply_node_timed_math_duel(pg_temp.snap('33333333-3333-3333-3333-333333333333', 10, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 0, 1000), pg_temp.res('00000000-0000-0000-0000-00000000000b', 0, 1000))));
  if (select status from public.student_timed_math_duels where id = '33333333-3333-3333-3333-333333333333') <> 'completed' then raise exception 'EMPATE_ESTADO'; end if;
  if (select winner_id from public.student_timed_math_duels where id = '33333333-3333-3333-3333-333333333333') is not null then raise exception 'EMPATE'; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 125 then raise exception 'EMPATE_GEMAS'; end if;
end $$;

-- 5) Un duelo que la nube ya aceptó y el nodo manda como pendiente: manda la nube (no vuelve atrás); uno rechazado en el nodo se rechaza en la nube.
do $$ begin
  insert into public.student_timed_math_duels (id, challenger_id, opponent_id, wager_gems, status, problems) values
    ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 0, 'active', pg_temp.probs(10));
  perform apply_node_timed_math_duel(jsonb_build_object('id', '44444444-4444-4444-4444-444444444444', 'challenger_id', '00000000-0000-0000-0000-00000000000a',
    'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 0, 'problem_count', 10, 'status', 'pending', 'results', '[]'::jsonb));
  if (select status from public.student_timed_math_duels where id = '44444444-4444-4444-4444-444444444444') <> 'active' then raise exception 'NO_RETROCEDE'; end if;
  perform apply_node_timed_math_duel(jsonb_build_object('id', '55555555-5555-5555-5555-555555555555', 'challenger_id', '00000000-0000-0000-0000-00000000000a',
    'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 0, 'problem_count', 10, 'status', 'rejected', 'results', '[]'::jsonb));
  if (select status from public.student_timed_math_duels where id = '55555555-5555-5555-5555-555555555555') <> 'rejected' then raise exception 'RECHAZADO'; end if;
end $$;

-- 6) Validaciones y permisos: escuelas distintas, contra uno mismo, apuesta negativa, estado raro; ni la app ni anon la ejecutan.
do $$ begin
  perform pg_temp.fails($q$select apply_node_timed_math_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000c', 'wager_gems', 0, 'status', 'pending'))$q$, 'misma escuela');
  perform pg_temp.fails($q$select apply_node_timed_math_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000a', 'wager_gems', 0, 'status', 'pending'))$q$, 'Desafío inválido');
  perform pg_temp.fails($q$select apply_node_timed_math_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', -3, 'status', 'pending'))$q$, 'Apuesta inválida');
  perform pg_temp.fails($q$select apply_node_timed_math_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 0, 'status', 'ganado'))$q$, 'Estado inválido');
  if has_function_privilege('authenticated', 'public.apply_node_timed_math_duel(jsonb)', 'execute') or has_function_privilege('anon', 'public.apply_node_timed_math_duel(jsonb)', 'execute') then raise exception 'PERMISOS_APP'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_timed_math_duel(jsonb)', 'execute') then raise exception 'PERMISOS_SERVICIO'; end if;
end $$;

select 'TIMEDMATH_SQL_OK';
