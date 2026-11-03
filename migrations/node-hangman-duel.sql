-- ============================================================
-- Ahorcado 1 contra 1 jugado EN EL NODO escolar sin internet. La función node-sync (service_role) sube una «foto» del duelo: el reto, la palabra de cada
-- jugador (del banco fijo hangman_word_bank) y las letras jugadas. Esta función la aplica SIN confiar en el nodo: comprueba que las palabras sean del
-- banco para ese tema, recalcula si adivinó y cuántos errores tuvo con las letras (igual que submit_hangman_result) y deja que el disparador de siempre
-- (settle_student_hangman_duel -> finish_student_duel) reparta gemas (con el tope de lo que tenga quien pierde) y XP. Un duelo ya terminado no se toca.
--
-- Requiere student-hangman-duels.sql, hangman-word-bank.sql, duel-per-player-content.sql y audit-fixes.sql. Solo service_role puede ejecutarla.
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.apply_node_hangman_duel(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_snapshot ->> 'id')::uuid;
  v_ch uuid := (p_snapshot ->> 'challenger_id')::uuid;
  v_op uuid := (p_snapshot ->> 'opponent_id')::uuid;
  v_wager integer := (p_snapshot ->> 'wager_gems')::integer;
  v_status text := p_snapshot ->> 'status';
  v_topic text := p_snapshot ->> 'topic';
  v_word text := nullif(p_snapshot ->> 'word', '');
  v_hint text := p_snapshot ->> 'hint';
  v_word_b text := nullif(p_snapshot ->> 'word_b', '');
  v_hint_b text := p_snapshot ->> 'hint_b';
  v_cloud record;
  v_duel record;
  v_r jsonb;
  v_student uuid;
  v_play text;
  v_letters text[];
  v_guessed text[];
  v_letter text;
  v_wrong integer;
  v_solved boolean;
  v_time integer;
  v_set_status text;
begin
  if v_ch = v_op then raise exception 'Desafío inválido'; end if;
  if v_wager is null or v_wager < 0 then raise exception 'Apuesta inválida'; end if;
  if v_status not in ('pending', 'rejected', 'cancelled', 'active', 'completed') then raise exception 'Estado inválido'; end if;
  if (select count(*) from public.students where id in (v_ch, v_op) and school_code = (select school_code from public.students where id = v_ch)) <> 2 then
    raise exception 'Los jugadores no son de la misma escuela';
  end if;
  -- Las palabras tienen que ser del banco fijo de ese tema (el nodo no puede inventar la suya).
  if v_word is not null and not exists (select 1 from public.hangman_word_bank where category = v_topic and upper(word) = upper(v_word)) then raise exception 'Palabra inválida'; end if;
  if v_word_b is not null and not exists (select 1 from public.hangman_word_bank where category = v_topic and upper(word) = upper(v_word_b)) then raise exception 'Palabra inválida'; end if;

  v_set_status := case when v_status = 'completed' then 'active' else v_status end;

  select * into v_cloud from public.student_hangman_duels where id = v_id for update;
  if found then
    if v_cloud.status = 'completed' then return jsonb_build_object('skipped', 'completed'); end if;
    if v_cloud.challenger_id <> v_ch or v_cloud.opponent_id <> v_op then raise exception 'Desafío inválido'; end if;
    update public.student_hangman_duels set
      status = case when v_cloud.status = 'pending' then v_set_status else v_cloud.status end,
      word = coalesce(v_cloud.word, v_word), hint = coalesce(v_cloud.hint, v_hint),
      word_b = coalesce(v_cloud.word_b, v_word_b), hint_b = coalesce(v_cloud.hint_b, v_hint_b),
      challenger_started_at = coalesce(v_cloud.challenger_started_at, (p_snapshot ->> 'challenger_started_at')::timestamptz),
      opponent_started_at = coalesce(v_cloud.opponent_started_at, (p_snapshot ->> 'opponent_started_at')::timestamptz)
    where id = v_id;
  else
    insert into public.student_hangman_duels
      (id, challenger_id, opponent_id, wager_gems, topic, word, hint, word_b, hint_b, status, challenger_started_at, opponent_started_at, created_at)
    values (v_id, v_ch, v_op, v_wager, v_topic, v_word, v_hint, v_word_b, v_hint_b, v_set_status,
      (p_snapshot ->> 'challenger_started_at')::timestamptz, (p_snapshot ->> 'opponent_started_at')::timestamptz,
      coalesce((p_snapshot ->> 'created_at')::timestamptz, timezone('utc', now())));
  end if;

  select * into v_duel from public.student_hangman_duels where id = v_id;
  if v_duel.word is null or v_duel.status <> 'active' then return jsonb_build_object('ok', true); end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_snapshot -> 'results', '[]'::jsonb)) loop
    v_student := (v_r ->> 'student_id')::uuid;
    if v_student not in (v_ch, v_op) then raise exception 'Resultado inválido'; end if;
    if (v_student = v_ch and v_duel.challenger_started_at is null) or (v_student = v_op and v_duel.opponent_started_at is null) then continue; end if;
    v_play := lower(case when v_student = v_op and v_duel.word_b is not null then v_duel.word_b else v_duel.word end);
    select array_agg(distinct c) into v_letters from regexp_split_to_table(v_play, '') c where c <> '';
    select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(coalesce(v_r -> 'guessed', '[]'::jsonb)) x;
    v_guessed := coalesce(v_guessed, array[]::text[]);
    v_wrong := 0;
    foreach v_letter in array v_guessed loop
      if position(v_letter in v_play) = 0 then v_wrong := v_wrong + 1; end if;
    end loop;
    v_solved := coalesce((select bool_and(l = any(v_guessed)) from unnest(v_letters) l), false);
    v_time := least(greatest(coalesce((v_r ->> 'time_ms')::integer, 0), 0), 3600000);
    insert into public.student_hangman_results (duel_id, student_id, solved, wrong_guesses, time_ms, completed_at)
      values (v_id, v_student, v_solved, v_wrong, v_time, coalesce((v_r ->> 'completed_at')::timestamptz, timezone('utc', now())))
      on conflict (duel_id, student_id) do nothing;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apply_node_hangman_duel(jsonb) from public, anon, authenticated;
grant execute on function public.apply_node_hangman_duel(jsonb) to service_role;

notify pgrst, 'reload schema';
