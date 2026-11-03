-- Aserciones sobre migrations/node-hangman-duel.sql (con la liquidación de la nube como disparador). Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/node-hangman-duel.sql
\ir ../../migrations/node-hangman-duel.sql

insert into public.students (id, school_code, gems, xp) values
  ('00000000-0000-0000-0000-00000000000a', 'ESC1', 100, 50),
  ('00000000-0000-0000-0000-00000000000b', 'ESC1', 30, 10),
  ('00000000-0000-0000-0000-00000000000c', 'OTRA', 100, 0);
insert into public.hangman_word_bank (category, word, hint) values ('Fauna', 'QUETZAL', 'Ave nacional'), ('Fauna', 'JAGUAR', 'Felino de Peten');

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

create or replace function pg_temp.res(p_student text, p_letters text, p_time integer) returns jsonb language sql as $f$
  select jsonb_build_object('student_id', p_student, 'guessed', to_jsonb(string_to_array(p_letters, ',')), 'time_ms', p_time, 'solved', true) $f$;

create or replace function pg_temp.snap(p_id text, p_wager integer, p_status text, p_results jsonb) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000b',
    'wager_gems', p_wager, 'topic', 'Fauna', 'status', p_status, 'word', 'QUETZAL', 'hint', 'Ave nacional', 'word_b', 'JAGUAR', 'hint_b', 'Felino de Peten',
    'challenger_started_at', '2026-11-02T15:00:10Z', 'opponent_started_at', '2026-11-02T15:00:20Z', 'created_at', '2026-11-02T15:00:00Z', 'results', p_results) $f$;

create or replace function pg_temp.gems(p_id text) returns integer language sql as $f$ select gems from public.students where id = p_id::uuid $f$;
create or replace function pg_temp.xp(p_id text) returns integer language sql as $f$ select xp from public.students where id = p_id::uuid $f$;

-- 1) Reto pendiente: se crea sin palabra ni resultados.
do $$ begin
  perform apply_node_hangman_duel(jsonb_build_object('id', '11111111-1111-1111-1111-111111111111', 'challenger_id', '00000000-0000-0000-0000-00000000000a',
    'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 20, 'topic', 'Fauna', 'status', 'pending', 'results', '[]'::jsonb));
  if (select status from public.student_hangman_duels) <> 'pending' then raise exception 'PENDIENTE'; end if;
end $$;

-- 2) Jugado: la nube recalcula acierto y errores (el nodo manda solved=true para todos y no cuenta). El retador adivina QUETZAL con 1 error en 20 s; el rival
--    no completa JAGUAR (le falta la r) aunque diga haberlo hecho.
do $$ begin
  perform apply_node_hangman_duel(pg_temp.snap('11111111-1111-1111-1111-111111111111', 20, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 'x,q,u,e,t,z,a,l', 20000),
    pg_temp.res('00000000-0000-0000-0000-00000000000b', 'j,a,g,u', 5000))));
  if not (select solved from public.student_hangman_results where student_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'SOLVED_A'; end if;
  if (select wrong_guesses from public.student_hangman_results where student_id = '00000000-0000-0000-0000-00000000000a') <> 1 then raise exception 'ERRORES_A'; end if;
  if (select solved from public.student_hangman_results where student_id = '00000000-0000-0000-0000-00000000000b') then raise exception 'SOLVED_B'; end if;
  if (select winner_id from public.student_hangman_duels) <> '00000000-0000-0000-0000-00000000000a' or (select status from public.student_hangman_duels) <> 'completed' then raise exception 'LIQUIDA'; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 120 or pg_temp.gems('00000000-0000-0000-0000-00000000000b') <> 10 then raise exception 'GEMAS'; end if;
  if pg_temp.xp('00000000-0000-0000-0000-00000000000a') <> 70 or pg_temp.xp('00000000-0000-0000-0000-00000000000b') <> 15 then raise exception 'XP'; end if;
end $$;

-- 3) Reintento: no cambia nada ni paga dos veces.
do $$ declare r jsonb; begin
  r := apply_node_hangman_duel(pg_temp.snap('11111111-1111-1111-1111-111111111111', 20, 'completed', '[]'::jsonb));
  if r ->> 'skipped' <> 'completed' then raise exception 'REINTENTO: %', r; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 120 then raise exception 'DOBLE_PAGO'; end if;
end $$;

-- 4) Los dos la adivinan: gana el más rápido (empate de tiempo: el retador). Quien pierde paga la apuesta (50) porque tiene gemas de sobra; el tope por falta de gemas ya lo prueba Contrarreloj con la misma función.
do $$ begin
  update public.students set gems = 5 where id = '00000000-0000-0000-0000-00000000000b';
  perform apply_node_hangman_duel(pg_temp.snap('22222222-2222-2222-2222-222222222222', 50, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 'q,u,e,t,z,a,l', 9000), pg_temp.res('00000000-0000-0000-0000-00000000000b', 'j,a,g,u,r', 3000))));
  if (select winner_id from public.student_hangman_duels where id = '22222222-2222-2222-2222-222222222222') <> '00000000-0000-0000-0000-00000000000b' then raise exception 'MAS_RAPIDO'; end if;
  if pg_temp.gems('00000000-0000-0000-0000-00000000000a') <> 70 or pg_temp.gems('00000000-0000-0000-0000-00000000000b') <> 55 then raise exception 'TOPE'; end if;
end $$;

-- 5) Ninguno la adivina: empate sin gemas. Una palabra que no es del banco, se rechaza (el nodo no inventa palabras).
do $$ begin
  perform apply_node_hangman_duel(pg_temp.snap('33333333-3333-3333-3333-333333333333', 10, 'completed', jsonb_build_array(
    pg_temp.res('00000000-0000-0000-0000-00000000000a', 'x', 1000), pg_temp.res('00000000-0000-0000-0000-00000000000b', 'x', 1000))));
  if (select winner_id from public.student_hangman_duels where id = '33333333-3333-3333-3333-333333333333') is not null then raise exception 'EMPATE'; end if;
  if (select status from public.student_hangman_duels where id = '33333333-3333-3333-3333-333333333333') <> 'completed' then raise exception 'EMPATE_ESTADO'; end if;
  perform pg_temp.fails($q$select apply_node_hangman_duel(jsonb_set(pg_temp.snap('44444444-4444-4444-4444-444444444444', 0, 'active', '[]'::jsonb), '{word}', '"PALABRAINVENTADA"'))$q$, 'Palabra inválida');
end $$;

-- 6) Un duelo que la nube ya aceptó y el nodo manda pendiente: manda la nube. Validaciones y permisos.
do $$ begin
  insert into public.student_hangman_duels (id, challenger_id, opponent_id, wager_gems, topic, word, hint, status) values
    ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 0, 'Fauna', 'JAGUAR', 'x', 'active');
  perform apply_node_hangman_duel(jsonb_build_object('id', '55555555-5555-5555-5555-555555555555', 'challenger_id', '00000000-0000-0000-0000-00000000000a',
    'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', 0, 'topic', 'Fauna', 'status', 'pending', 'results', '[]'::jsonb));
  if (select status from public.student_hangman_duels where id = '55555555-5555-5555-5555-555555555555') <> 'active' then raise exception 'NO_RETROCEDE'; end if;
  perform pg_temp.fails($q$select apply_node_hangman_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000c', 'wager_gems', 0, 'topic', 'Fauna', 'status', 'pending'))$q$, 'misma escuela');
  perform pg_temp.fails($q$select apply_node_hangman_duel(jsonb_build_object('id', '66666666-6666-6666-6666-666666666666', 'challenger_id', '00000000-0000-0000-0000-00000000000a', 'opponent_id', '00000000-0000-0000-0000-00000000000b', 'wager_gems', -3, 'topic', 'Fauna', 'status', 'pending'))$q$, 'Apuesta inválida');
  if has_function_privilege('authenticated', 'public.apply_node_hangman_duel(jsonb)', 'execute') or has_function_privilege('anon', 'public.apply_node_hangman_duel(jsonb)', 'execute') then raise exception 'PERMISOS_APP'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_hangman_duel(jsonb)', 'execute') then raise exception 'PERMISOS_SERVICIO'; end if;
end $$;

select 'HANGMAN_SQL_OK';
