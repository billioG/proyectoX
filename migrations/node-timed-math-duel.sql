-- ============================================================
-- Retos «Contrarreloj» (matemática contra reloj 1 contra 1) jugados EN EL NODO escolar sin internet. La función node-sync (service_role) sube una
-- «foto» del duelo: el reto, los problemas de cada jugador y las respuestas jugadas. Esta función la aplica SIN confiar en el puntaje del nodo: lo
-- recalcula con las respuestas contra los problemas, igual que submit_timed_math_result, y el disparador de siempre (settle_student_timed_math_duel
-- -> finish_student_duel) reparte gemas (con el tope de lo que tenga quien pierde) y XP. Si el duelo ya estaba terminado en la nube, no se toca.
--
-- Requiere student-timed-math-duels.sql, duel-per-player-content.sql y audit-fixes.sql. Solo service_role puede ejecutarla (ni la app ni anon).
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.apply_node_timed_math_duel(p_snapshot jsonb)
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
  v_cloud record;
  v_duel record;
  v_r jsonb;
  v_student uuid;
  v_problems jsonb;
  v_score integer;
  v_i integer;
  v_given text;
  v_len integer;
  v_time integer;
  v_set_status text;
begin
  if v_ch = v_op then raise exception 'Desafío inválido'; end if;
  if v_wager is null or v_wager < 0 then raise exception 'Apuesta inválida'; end if;
  if v_status not in ('pending', 'rejected', 'cancelled', 'active', 'completed') then raise exception 'Estado inválido'; end if;
  if (select count(*) from public.students where id in (v_ch, v_op) and school_code = (select school_code from public.students where id = v_ch)) <> 2 then
    raise exception 'Los jugadores no son de la misma escuela';
  end if;

  -- La nube guarda «active» hasta que el disparador liquida al llegar el segundo resultado.
  v_set_status := case when v_status = 'completed' then 'active' else v_status end;

  select * into v_cloud from public.student_timed_math_duels where id = v_id for update;
  if found then
    if v_cloud.status = 'completed' then return jsonb_build_object('skipped', 'completed'); end if;
    if v_cloud.challenger_id <> v_ch or v_cloud.opponent_id <> v_op then raise exception 'Desafío inválido'; end if;
    update public.student_timed_math_duels set
      -- Solo hacia adelante: pendiente -> aceptado / rechazado / cancelado. Si en la nube ya cambió, manda la nube.
      status = case when v_cloud.status = 'pending' then v_set_status else v_cloud.status end,
      problems = coalesce(v_cloud.problems, p_snapshot -> 'problems'),
      problems_b = coalesce(v_cloud.problems_b, p_snapshot -> 'problems_b'),
      challenger_started_at = coalesce(v_cloud.challenger_started_at, (p_snapshot ->> 'challenger_started_at')::timestamptz),
      opponent_started_at = coalesce(v_cloud.opponent_started_at, (p_snapshot ->> 'opponent_started_at')::timestamptz)
    where id = v_id;
  else
    insert into public.student_timed_math_duels
      (id, challenger_id, opponent_id, wager_gems, problem_count, problems, problems_b, status, challenger_started_at, opponent_started_at, created_at)
    values (v_id, v_ch, v_op, v_wager, 10, nullif(p_snapshot -> 'problems', 'null'::jsonb), nullif(p_snapshot -> 'problems_b', 'null'::jsonb), v_set_status,
      (p_snapshot ->> 'challenger_started_at')::timestamptz, (p_snapshot ->> 'opponent_started_at')::timestamptz,
      coalesce((p_snapshot ->> 'created_at')::timestamptz, timezone('utc', now())));
  end if;

  select * into v_duel from public.student_timed_math_duels where id = v_id;
  if v_duel.problems is null or v_duel.status <> 'active' then return jsonb_build_object('ok', true); end if;

  -- Resultados: el puntaje se recalcula con las respuestas (nunca el que dice el nodo); el trigger liquida al llegar el segundo.
  for v_r in select * from jsonb_array_elements(coalesce(p_snapshot -> 'results', '[]'::jsonb)) loop
    v_student := (v_r ->> 'student_id')::uuid;
    if v_student not in (v_ch, v_op) then raise exception 'Resultado inválido'; end if;
    if (v_student = v_ch and v_duel.challenger_started_at is null) or (v_student = v_op and v_duel.opponent_started_at is null) then continue; end if;
    v_problems := case when v_student = v_op and v_duel.problems_b is not null then v_duel.problems_b else v_duel.problems end;
    v_len := jsonb_array_length(v_problems);
    v_score := 0;
    for v_i in 0..v_len - 1 loop
      v_given := v_r -> 'answers' ->> v_i;
      begin
        if v_given is not null and v_given::numeric = (v_problems -> v_i ->> 'answer')::numeric then v_score := v_score + 1; end if;
      exception when others then
        null; -- respuesta no numérica: cuenta como mal
      end;
    end loop;
    v_time := least(greatest(coalesce((v_r ->> 'time_ms')::integer, 0), 0), 3600000);
    insert into public.student_timed_math_results (duel_id, student_id, score, time_ms, completed_at)
      values (v_id, v_student, v_score, v_time, coalesce((v_r ->> 'completed_at')::timestamptz, timezone('utc', now())))
      on conflict (duel_id, student_id) do nothing;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apply_node_timed_math_duel(jsonb) from public, anon, authenticated;
grant execute on function public.apply_node_timed_math_duel(jsonb) to service_role;

notify pgrst, 'reload schema';
