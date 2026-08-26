-- Blinda las respuestas del Desafío 1v1: el cliente ya no puede leer
-- correctIndex directo de student_duels.questions, ni insertar su propio
-- score en student_duel_answers (podía falsificarlo). Todo pasa por RPCs
-- SECURITY DEFINER que validan participante y calculan el score en servidor.

-- 1. Quitar acceso directo a la columna "questions" (tiene correctIndex).
revoke select on public.student_duels from authenticated, anon;
grant select (id, challenger_id, opponent_id, wager_gems, topic, question_count, status, winner_id, created_at, resolved_at)
  on public.student_duels to authenticated;

-- 2. RPC: devuelve las preguntas SIN correctIndex al participante.
create or replace function public.get_duel_questions(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_result jsonb;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.questions is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result
    from jsonb_array_elements(v_duel.questions) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function public.get_duel_questions(uuid) to authenticated;

-- 3. RPC: recibe las respuestas del alumno, calcula el score EN SERVIDOR
--    (nunca confía en un score enviado por el cliente) e inserta la fila.
create or replace function public.submit_duel_answers(p_duel_id uuid, p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
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
  if v_duel.questions is null then
    raise exception 'Este duelo aún no tiene preguntas';
  end if;

  v_len := jsonb_array_length(v_duel.questions);
  for i in 0..v_len - 1 loop
    v_correct := (v_duel.questions->i->>'correctIndex')::integer;
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

grant execute on function public.submit_duel_answers(uuid, jsonb) to authenticated;

-- 4. El cliente ya no inserta directo en student_duel_answers (podía
--    falsificar el score) -- todo pasa por submit_duel_answers().
drop policy if exists student_duel_answers_insert_own on public.student_duel_answers;

notify pgrst, 'reload schema';
