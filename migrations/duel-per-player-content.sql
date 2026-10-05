-- ============================================================
-- RETOS: CADA JUGADOR RECIBE SU PROPIO CONTENIDO
--
-- Problema: en los 5 retos 1v1 los dos jugadores recibían LA MISMA palabra /
-- preguntas / problemas / afirmaciones. Sentados juntos, uno veía la pantalla
-- del otro (o el primero que terminaba, al que el servidor le mostraba la
-- palabra o el bloque con el error, se lo contaba al segundo).
--
-- Solución: cada duelo guarda DOS contenidos. El retador usa las columnas de
-- siempre; el rival usa las nuevas columnas *_b. Si *_b está vacía (duelos
-- viejos, o la edge function todavía sin actualizar) el rival usa el mismo
-- contenido que el retador -- nada se rompe, solo no hay la separación.
--
--   student_duels             questions_b
--   student_hangman_duels     word_b, hint_b
--   student_spelling_duels    word_b, hint_b
--   student_debug_duels       steps_b
--   student_timed_math_duels  problems_b
--
-- Las columnas nuevas NO tienen GRANT de lectura (los GRANT de esas tablas son
-- por columna), así que el cliente no las puede leer: solo las RPC.
--
-- Además: el "¿Sabías que?" del rival puede ser distinto (hangman_b, etc.), y
-- el banco del Ahorcado elige 2 palabras distintas sin repetir las que cada
-- jugador ya jugó.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Requiere haber corrido antes las migraciones de los 5
-- retos (student-duels, duel-harden, student-hangman-duels, hangman-word-bank,
-- student-spelling-duels, student-debug-duels, student-timed-math-duels,
-- timed-math-word-problems, duel-facts, duel-review-rpc).
-- ============================================================

alter table public.student_duels            add column if not exists questions_b jsonb;
alter table public.student_hangman_duels    add column if not exists word_b text;
alter table public.student_hangman_duels    add column if not exists hint_b text;
alter table public.student_spelling_duels   add column if not exists word_b text;
alter table public.student_spelling_duels   add column if not exists hint_b text;
alter table public.student_debug_duels      add column if not exists steps_b jsonb;
alter table public.student_timed_math_duels add column if not exists problems_b jsonb;

-- ------------------------------------------------------------
-- 1. COMPRENSIÓN LECTORA (quiz: texto + preguntas; antes trivia)
-- ------------------------------------------------------------
create or replace function public.get_duel_questions(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_qs jsonb;
  v_result jsonb;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;

  v_qs := case when auth.uid() = v_duel.opponent_id and v_duel.questions_b is not null
               then v_duel.questions_b else v_duel.questions end;
  if v_qs is null then
    return '[]'::jsonb;
  end if;

  -- passage/title: texto de Comprensión Lectora (null en los retos viejos de trivia).
  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options',
                                      'passage', q->>'passage', 'title', q->>'title'))
    into v_result
    from jsonb_array_elements(v_qs) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.submit_duel_answers(p_duel_id uuid, p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_qs jsonb;
  v_score integer := 0;
  v_correct integer;
  v_selected integer;
  i integer;
  v_len integer;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_duel_answers where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya respondiste este duelo';
  end if;

  v_qs := case when auth.uid() = v_duel.opponent_id and v_duel.questions_b is not null
               then v_duel.questions_b else v_duel.questions end;
  if v_qs is null then
    raise exception 'Este duelo aún no tiene preguntas';
  end if;

  v_len := jsonb_array_length(v_qs);
  for i in 0..v_len - 1 loop
    v_correct := (v_qs->i->>'correctIndex')::integer;
    v_selected := (p_answers->i)::integer;
    if v_selected = v_correct then
      v_score := v_score + 1;
    end if;
  end loop;

  insert into public.student_duel_answers (duel_id, student_id, answers, score)
    values (p_duel_id, auth.uid(), p_answers, v_score);

  return v_score;
end;
$$;

-- La retroalimentación muestra las preguntas QUE EL JUGADOR respondió.
create or replace function public.get_duel_review(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.status != 'completed' then
    raise exception 'Este duelo todavía no terminó';
  end if;

  return coalesce(
    case when auth.uid() = v_duel.opponent_id and v_duel.questions_b is not null
         then v_duel.questions_b else v_duel.questions end,
    '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- 2. AHORCADO
-- ------------------------------------------------------------
create or replace function public.start_hangman_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_word text;
  v_hint text;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_hangman_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_hangman_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  v_word := case when not v_is_challenger and v_duel.word_b is not null then v_duel.word_b else v_duel.word end;
  v_hint := case when not v_is_challenger and v_duel.word_b is not null then v_duel.hint_b else v_duel.hint end;

  return jsonb_build_object('hint', v_hint, 'wordLength', length(v_word));
end;
$$;

create or replace function public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_word text;
  v_letter text;
  v_positions integer[];
  v_guessed text[];
  v_letters text[];
  i integer;
  v_solved boolean;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_word := lower(case when auth.uid() = v_duel.opponent_id and v_duel.word_b is not null then v_duel.word_b else v_duel.word end);
  v_letter := lower(left(p_letter, 1));
  v_positions := array[]::integer[];

  for i in 1..length(v_word) loop
    if substr(v_word, i, 1) = v_letter then
      v_positions := array_append(v_positions, i - 1);
    end if;
  end loop;

  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);
  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);

  return jsonb_build_object(
    'correct', array_length(v_positions, 1) > 0,
    'positions', to_jsonb(v_positions),
    'solved', coalesce(v_solved, false)
  );
end;
$$;

-- Ya no entrega la palabra de nadie más: devuelve la PROPIA (que es distinta a
-- la del rival), así que no sirve para soplársela.
create or replace function public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_word text;
  v_letters text[];
  v_guessed text[];
  v_wrong integer := 0;
  v_solved boolean;
  v_time_ms integer;
  v_letter text;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_word := lower(case when not v_is_challenger and v_duel.word_b is not null then v_duel.word_b else v_duel.word end);
  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);

  foreach v_letter in array v_guessed loop
    if position(v_letter in v_word) = 0 then
      v_wrong := v_wrong + 1;
    end if;
  end loop;

  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_hangman_results (duel_id, student_id, solved, wrong_guesses, time_ms)
    values (p_duel_id, auth.uid(), coalesce(v_solved, false), v_wrong, v_time_ms);

  return jsonb_build_object('solved', coalesce(v_solved, false), 'wrong_guesses', v_wrong, 'time_ms', v_time_ms, 'word', v_word);
end;
$$;

-- Banco del Ahorcado: dos palabras DISTINTAS (una por jugador), de largo
-- parecido para que el tiempo sea comparable, evitando las que cualquiera de
-- los dos ya jugó en cualquier tema.
create or replace function public.assign_hangman_bank_word(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_a record;
  v_b record;
  v_seen text[];
begin
  select id, topic, word, challenger_id, opponent_id into v_duel
  from public.student_hangman_duels where id = p_duel_id;

  if v_duel.id is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() not in (v_duel.challenger_id, v_duel.opponent_id) then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is not null then
    return; -- ya generado, no regenerar
  end if;

  select coalesce(array_agg(distinct upper(w)), array[]::text[]) into v_seen
  from (
    select word as w from public.student_hangman_duels
      where (challenger_id in (v_duel.challenger_id, v_duel.opponent_id) or opponent_id in (v_duel.challenger_id, v_duel.opponent_id))
        and word is not null
    union all
    select word_b from public.student_hangman_duels
      where (challenger_id in (v_duel.challenger_id, v_duel.opponent_id) or opponent_id in (v_duel.challenger_id, v_duel.opponent_id))
        and word_b is not null
  ) s;

  -- Palabra del retador: al azar, prefiriendo las que nadie jugó todavía.
  select id, word, hint, fact into v_a
  from public.hangman_word_bank
  where category = v_duel.topic
  order by (upper(word) = any(v_seen)), random() limit 1;

  if v_a.id is null then
    raise exception 'No hay palabras en el banco para esta categoría';
  end if;

  -- Palabra del rival: distinta, de largo parecido (±2) si hay, sin repetir.
  select id, word, hint, fact into v_b
  from public.hangman_word_bank
  where category = v_duel.topic and id <> v_a.id and upper(word) <> upper(v_a.word)
  order by (upper(word) = any(v_seen)), (abs(length(word) - length(v_a.word)) > 2), random() limit 1;

  update public.student_hangman_duels
  set word = v_a.word, hint = v_a.hint,
      word_b = v_b.word, hint_b = v_b.hint,
      status = 'active'
  where id = p_duel_id and word is null;

  if v_a.fact is not null then
    insert into public.duel_facts (game, duel_id, fact)
    values ('hangman', p_duel_id, v_a.fact)
    on conflict (game, duel_id) do update set fact = excluded.fact;
  end if;
  if v_b.id is not null and v_b.fact is not null then
    insert into public.duel_facts (game, duel_id, fact)
    values ('hangman_b', p_duel_id, v_b.fact)
    on conflict (game, duel_id) do update set fact = excluded.fact;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. ORTOGRAFÍA
-- ------------------------------------------------------------
create or replace function public.start_spelling_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_spelling_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_spelling_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  return jsonb_build_object('hint',
    case when not v_is_challenger and v_duel.word_b is not null then v_duel.hint_b else v_duel.hint end);
end;
$$;

create or replace function public.submit_spelling_answer(p_duel_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_word text;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_word := case when not v_is_challenger and v_duel.word_b is not null then v_duel.word_b else v_duel.word end;
  v_correct := lower(trim(p_answer)) = lower(trim(v_word));
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_spelling_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object('correct', v_correct, 'time_ms', v_time_ms, 'word', v_word);
end;
$$;

-- ------------------------------------------------------------
-- 4. ENCONTRÁ EL ERROR
-- ------------------------------------------------------------
create or replace function public.start_debug_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_steps jsonb;
  v_labels jsonb;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.steps is null then
    raise exception 'Este desafío aún no tiene pasos generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_debug_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_debug_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  v_steps := case when not v_is_challenger and v_duel.steps_b is not null then v_duel.steps_b else v_duel.steps end;
  select jsonb_agg(s -> 'label') into v_labels from jsonb_array_elements(v_steps) s;
  return jsonb_build_object('labels', v_labels);
end;
$$;

create or replace function public.submit_debug_result(p_duel_id uuid, p_selected_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_steps jsonb;
  v_bug_index integer;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_steps := case when not v_is_challenger and v_duel.steps_b is not null then v_duel.steps_b else v_duel.steps end;

  select i into v_bug_index
    from jsonb_array_elements(v_steps) with ordinality as t(step, i)
    where (step ->> 'isBug')::boolean is true
    limit 1;
  if v_bug_index is null then
    raise exception 'Este desafío no tiene un error marcado -- avisale a un admin';
  end if;
  v_bug_index := v_bug_index - 1; -- ordinality empieza en 1, el cliente cuenta desde 0

  v_correct := (p_selected_index = v_bug_index);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_debug_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object(
    'correct', v_correct, 'time_ms', v_time_ms, 'bug_index', v_bug_index,
    'explanation', (v_steps -> v_bug_index ->> 'explanation')
  );
end;
$$;

-- ------------------------------------------------------------
-- 5. CONTRARRELOJ: problemas distintos para cada uno (mismo generador, mismo
--    nivel, sorteados por separado).
-- ------------------------------------------------------------
-- Generador de problemas: sin repetir cuentas dentro de un mismo juego y sin
-- "1 huevos" (cantidades de al menos 2 en los problemas con texto).
create or replace function public.generate_math_problems(p_grade text, p_count integer default 10)
returns jsonb
language plpgsql
as $$
declare
  v_rank integer;
  v_level text := lower(coalesce(p_grade, ''));
  v_problems jsonb := '[]'::jsonb;
  i integer;
  a integer;
  b integer;
  op text;
  answer numeric;
  question text;
  v_seen text[] := array[]::text[];
  v_tries integer;
  v_percents integer[] := array[10, 20, 25, 50, 75];
  v_bases integer[] := array[40, 80, 100, 200, 50];
  v_plus text[] := array[
    'Un bus llevaba %s pasajeros y en la siguiente parada subieron %s más. ¿Cuántos pasajeros lleva ahora?',
    'En la tienda escolar vendieron %s panes en la mañana y %s en la tarde. ¿Cuántos panes vendieron en total?',
    'Una cooperativa empacó %s quintales de café el lunes y %s el martes. ¿Cuántos quintales empacó en total?',
    'Un agricultor cosechó %s costales de maíz el lunes y %s costales más el martes. ¿Cuántos costales tiene en total?'
  ];
  v_minus text[] := array[
    'Había %s huevos en la granja y se vendieron %s. ¿Cuántos huevos quedan?',
    'Un camión salía con %s cajas de tomate y entregó %s en el mercado. ¿Cuántas cajas le quedan?',
    'Una tienda tenía %s libras de azúcar y vendió %s. ¿Cuántas libras le quedan?',
    'En un vivero hay %s árboles y ya se trasplantaron %s. ¿Cuántos árboles faltan por trasplantar?'
  ];
  v_mult text[] := array[
    'Un vivero siembra %s hileras con %s plantas cada una. ¿Cuántas plantas hay en total?',
    'Cada canasta tiene %s naranjas. Si hay %s canastas, ¿cuántas naranjas hay en total?',
    'Un salón tiene %s filas de %s pupitres cada una. ¿Cuántos pupitres hay en total?',
    'Una avícola guarda %s huevos en cada cartón. ¿Cuántos huevos hay en %s cartones?'
  ];
  v_div text[] := array[
    'Se repartieron %s libras de frijol en partes iguales entre %s familias. ¿Cuántas libras le tocan a cada una?',
    'Un docente reparte %s lápices en partes iguales entre %s estudiantes. ¿Cuántos lápices le tocan a cada uno?',
    'Una cooperativa envasó %s litros de miel en botellas iguales y llenó %s botellas. ¿Cuántos litros tiene cada botella?',
    'Se juntaron %s quetzales para el paseo escolar entre %s estudiantes en partes iguales. ¿Cuánto puso cada uno?'
  ];
begin
  if v_level like '%primaria%' then
    if v_level like '1ro%' or v_level like '2do%' or v_level like '3ro%' then v_rank := 2; else v_rank := 5; end if;
  elsif v_level like '%básico%' or v_level like '%basico%' then
    v_rank := 8;
  elsif v_level like '%diversificado%' then
    v_rank := 11;
  else
    v_rank := 5;
  end if;

  for i in 1..p_count loop
    v_tries := 0;
    loop
    if v_rank <= 3 then
      -- 1ro-3ro primaria: suma/resta hasta 20, sin negativos.
      a := floor(random() * 20)::integer + 1;
      b := floor(random() * 20)::integer + 1;
      if random() < 0.5 then
        op := '+'; answer := a + b;
      else
        if a < b then a := a + b; b := a - b; a := a - b; end if;
        op := '-'; answer := a - b;
      end if;

    elsif v_rank <= 6 then
      -- 4to-6to primaria: suma/resta hasta 100, multiplicación tabla 1-10.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          op := '+'; answer := a + b;
        when 1 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          if a < b then a := a + b; b := a - b; a := a - b; end if;
          op := '-'; answer := a - b;
        else
          a := floor(random() * 10)::integer + 1; b := floor(random() * 10)::integer + 1;
          op := '×'; answer := a * b;
      end case;

    elsif v_rank <= 9 then
      -- Básico: multiplicación/división exacta/potencias simples.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 20)::integer + 2; b := floor(random() * 20)::integer + 2;
          op := '×'; answer := a * b;
        when 1 then
          b := floor(random() * 10)::integer + 2; answer := floor(random() * 15)::integer + 1; a := b * answer::integer;
          op := '÷';
        else
          a := floor(random() * 10)::integer + 2; b := floor(random() * 3)::integer + 2;
          op := '^'; answer := a ^ b;
      end case;

    else
      -- Diversificado: ecuación de un paso o porcentaje.
      if random() < 0.5 then
        a := floor(random() * 15)::integer + 1; answer := floor(random() * 15)::integer + 1; b := a + answer::integer;
        op := 'x+';
      else
        a := v_percents[floor(random() * array_length(v_percents, 1))::integer + 1];
        b := v_bases[floor(random() * array_length(v_bases, 1))::integer + 1];
        answer := round(a * b / 100.0);
        op := '%';
      end if;
    end if;

    -- Problemas con texto: cantidades de al menos 2 ("1 huevos" / "1 canastas"
    -- sonaba mal) y se recalcula la respuesta con los valores ajustados.
    if v_rank > 3 and op in ('+', '-', '×') then
      a := greatest(a, 2); b := greatest(b, 2);
      if op = '-' and a < b then a := a + b; b := a - b; a := a - b; end if;
      answer := case op when '+' then a + b when '-' then a - b else a * b end;
    end if;

    question := case
      when v_rank > 3 and op = '+' then format(v_plus[floor(random() * array_length(v_plus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '-' then format(v_minus[floor(random() * array_length(v_minus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '×' then format(v_mult[floor(random() * array_length(v_mult, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '÷' then format(v_div[floor(random() * array_length(v_div, 1))::integer + 1], a, b)
      when op = '+' then a || ' + ' || b
      when op = '-' then a || ' - ' || b
      when op = '×' then a || ' × ' || b
      when op = '÷' then a || ' ÷ ' || b
      when op = '^' then a || '^' || b
      when op = 'x+' then 'x + ' || a || ' = ' || b || '  (¿cuánto vale x?)'
      when op = '%' then '¿Cuánto es el ' || a || '% de ' || b || '?'
    end;

    -- Sin preguntas repetidas dentro del mismo juego (con rangos chicos salía
    -- la misma cuenta dos veces); tope de intentos por si el rango es muy chico.
    v_tries := v_tries + 1;
    exit when v_tries >= 25 or not (question = any(v_seen));
    end loop;
    v_seen := v_seen || question;

    v_problems := v_problems || jsonb_build_object('question', question, 'answer', answer);
  end loop;

  return v_problems;
end;
$$;;

create or replace function public.accept_timed_math_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_grade text;
  v_a jsonb;
  v_b jsonb;
  v_try integer;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.status != 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  select grade into v_grade from public.students where id = v_duel.challenger_id;

  v_a := public.generate_math_problems(v_grade, v_duel.problem_count);
  -- El juego del rival no repite ninguna pregunta del retador (hasta 5 intentos).
  for v_try in 1..5 loop
    v_b := public.generate_math_problems(v_grade, v_duel.problem_count);
    exit when not exists (
      select 1 from jsonb_array_elements(v_a) x join jsonb_array_elements(v_b) y
        on x ->> 'question' = y ->> 'question');
  end loop;

  update public.student_timed_math_duels
    set problems = v_a, problems_b = v_b, status = 'active'
    where id = p_duel_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.start_timed_math_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_questions jsonb;
  v_problems jsonb;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.problems is null then
    raise exception 'Este desafío aún no tiene problemas generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_timed_math_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_timed_math_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  v_problems := case when not v_is_challenger and v_duel.problems_b is not null then v_duel.problems_b else v_duel.problems end;
  select jsonb_agg(q -> 'question') into v_questions from jsonb_array_elements(v_problems) q;
  return jsonb_build_object('questions', v_questions);
end;
$$;

create or replace function public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_problems jsonb;
  v_len integer;
  i integer;
  v_correct numeric;
  v_given text;
  v_score integer := 0;
  v_time_ms integer;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_timed_math_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_problems := case when not v_is_challenger and v_duel.problems_b is not null then v_duel.problems_b else v_duel.problems end;
  v_len := jsonb_array_length(v_problems);
  for i in 0..v_len - 1 loop
    v_correct := (v_problems -> i ->> 'answer')::numeric;
    v_given := p_answers ->> i;
    begin
      if v_given is not null and v_given::numeric = v_correct then
        v_score := v_score + 1;
      end if;
    exception when others then
      null; -- respuesta no numérica: cuenta como mal, no rompe el submit
    end;
  end loop;

  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_timed_math_results (duel_id, student_id, score, time_ms)
    values (p_duel_id, auth.uid(), v_score, v_time_ms);

  return jsonb_build_object('score', v_score, 'total', v_len, 'time_ms', v_time_ms);
end;
$$;

-- ------------------------------------------------------------
-- 6. "¿Sabías que?": el rival puede tener un dato distinto (el de SU palabra)
-- ------------------------------------------------------------
alter table public.duel_facts drop constraint if exists duel_facts_game_check;
alter table public.duel_facts add constraint duel_facts_game_check
  check (game in ('quiz', 'hangman', 'spelling', 'debug', 'hangman_b', 'spelling_b', 'debug_b'));

create or replace function public.get_duel_fact(p_game text, p_duel_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_played boolean;
  v_is_opp boolean := false;
  v_fact text;
begin
  v_played := case p_game
    when 'quiz' then exists (select 1 from public.student_duel_answers where duel_id = p_duel_id and student_id = auth.uid())
    when 'hangman' then exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'spelling' then exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'debug' then exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid())
    else false
  end;
  if not v_played then return null; end if;

  v_is_opp := case p_game
    when 'hangman' then exists (select 1 from public.student_hangman_duels where id = p_duel_id and opponent_id = auth.uid())
    when 'spelling' then exists (select 1 from public.student_spelling_duels where id = p_duel_id and opponent_id = auth.uid())
    when 'debug' then exists (select 1 from public.student_debug_duels where id = p_duel_id and opponent_id = auth.uid())
    else false
  end;

  if v_is_opp then
    select fact into v_fact from public.duel_facts where game = p_game || '_b' and duel_id = p_duel_id;
  end if;
  if v_fact is null then
    select fact into v_fact from public.duel_facts where game = p_game and duel_id = p_duel_id;
  end if;
  return v_fact;
end;
$$;

grant execute on function public.get_duel_questions(uuid) to authenticated;
grant execute on function public.submit_duel_answers(uuid, jsonb) to authenticated;
grant execute on function public.get_duel_review(uuid) to authenticated;
grant execute on function public.start_hangman_duel(uuid) to authenticated;
grant execute on function public.check_hangman_letter(uuid, text, jsonb) to authenticated;
grant execute on function public.submit_hangman_result(uuid, jsonb) to authenticated;
grant execute on function public.assign_hangman_bank_word(uuid) to authenticated;
grant execute on function public.start_spelling_duel(uuid) to authenticated;
grant execute on function public.submit_spelling_answer(uuid, text) to authenticated;
grant execute on function public.start_debug_duel(uuid) to authenticated;
grant execute on function public.submit_debug_result(uuid, integer) to authenticated;
grant execute on function public.accept_timed_math_duel(uuid) to authenticated;
grant execute on function public.start_timed_math_duel(uuid) to authenticated;
grant execute on function public.submit_timed_math_result(uuid, jsonb) to authenticated;
grant execute on function public.get_duel_fact(text, uuid) to authenticated;
-- El modo práctica (Contrarreloj) genera sus problemas llamando directo al generador.
grant execute on function public.generate_math_problems(text, integer) to authenticated;

-- ------------------------------------------------------------
-- 7. Banco del Ahorcado ampliado (de 20 a 34 palabras): con solo 20, dos
--    compañeros que juegan seguido veían repetirse las palabras. Cada duelo
--    usa 2 (una por jugador), así que ahora hay para ~17 duelos sin repetir
--    por pareja. Idempotente.
-- ------------------------------------------------------------
insert into public.hangman_word_bank (category, word, hint, fact)
select * from (values
  ('Vida silvestre de Guatemala', 'TUCAN', 'Ave de pico grande y colorido que vive en la selva.', 'El pico del tucán es grande pero muy liviano, y le sirve para alcanzar frutas y también para regular su temperatura.'),
  ('Vida silvestre de Guatemala', 'OCELOTE', 'Felino manchado de tamaño mediano que caza de noche.', 'Cada ocelote tiene un patrón de manchas distinto, como una huella: los científicos lo usan para reconocerlos en las fotos de cámaras trampa.'),
  ('Vida silvestre de Guatemala', 'IGUANA', 'Reptil verde que descansa sobre las ramas de los árboles.', 'Las iguanas verdes comen sobre todo hojas y frutos, y al comer frutos ayudan a dispersar semillas.'),
  ('Vida silvestre de Guatemala', 'TEPEZCUINTLE', 'Roedor grande de la selva con manchas claras en el costado.', 'El tepezcuintle es un roedor nocturno que vive en madrigueras cerca de los ríos; en varias zonas ya es escaso por la cacería.'),
  ('Vida silvestre de Guatemala', 'ARMADILLO', 'Mamífero cubierto de placas óseas que cava madrigueras.', 'El armadillo se alimenta de insectos y lombrices, y sus madrigueras sirven de refugio a otros animales pequeños.'),
  ('Vida silvestre de Guatemala', 'COLIBRI', 'Ave diminuta que bate las alas muy rápido y toma néctar.', 'Los colibríes polinizan las flores mientras se alimentan de su néctar, y pueden quedarse suspendidos en el aire.'),
  ('Vida silvestre de Guatemala', 'VENADO', 'Mamífero de astas ramificadas que vive en los bosques.', 'En el venado cola blanca solo los machos tienen astas, y las pierden y les vuelven a crecer cada año.'),
  ('Vida silvestre de Guatemala', 'MURCIELAGO', 'Mamífero volador que de noche se orienta con sonidos.', 'Muchos murciélagos polinizan flores y dispersan semillas; otros controlan plagas porque comen muchos insectos.'),
  ('Vida silvestre de Guatemala', 'MONJABLANCA', 'Flor nacional de Guatemala, una orquídea de bosque nuboso.', 'La monja blanca es una orquídea que crece en los bosques nubosos de Alta Verapaz y está protegida por la ley.'),
  ('Vida silvestre de Guatemala', 'VOLCAN', 'Montaña que puede expulsar lava y ceniza; Guatemala tiene varios.', 'La ceniza volcánica aporta minerales al suelo, por eso muchas tierras cercanas a los volcanes son muy fértiles.'),
  ('Vida silvestre de Guatemala', 'CUENCA', 'Territorio donde toda el agua de lluvia baja hacia un mismo río o lago.', 'Cuidar los bosques de una cuenca ayuda a que el agua llegue más limpia a los ríos y lagos.'),
  ('Vida silvestre de Guatemala', 'COMPOSTA', 'Abono natural que se prepara con restos de comida y hojas.', 'Hacer composta con los restos de comida reduce la basura y devuelve nutrientes a la tierra.'),
  ('Vida silvestre de Guatemala', 'ZOPILOTE', 'Ave oscura que se alimenta de animales muertos.', 'Los zopilotes ayudan a limpiar el ambiente porque se comen los animales muertos antes de que se descompongan.'),
  ('Vida silvestre de Guatemala', 'CAIMAN', 'Reptil parecido al cocodrilo que vive en ríos y lagunas.', 'Los caimanes son parte del equilibrio de las lagunas y los ríos: se alimentan de peces, ranas y otros animales.')
) as v(category, word, hint, fact)
where not exists (
  select 1 from public.hangman_word_bank b where b.category = v.category and b.word = v.word
);

notify pgrst, 'reload schema';
