-- ============================================================
-- Práctica Solo no mostraba retroalimentación al terminar (a diferencia
-- de los Duelos, que sí tienen "Revisar" con las respuestas correctas
-- resaltadas) -- submit_practice_answers() ahora devuelve, además del
-- score, el detalle de cada pregunta (texto, opciones, cuál era la
-- correcta y cuál eligió el alumno) para armar esa pantalla en el cliente.
-- Seguro revelar correctIndex acá porque la sesión ya queda resuelta.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase (reemplaza la función de student-practice-quiz.sql).
-- ============================================================

create or replace function public.submit_practice_answers(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_score integer := 0;
  v_correct integer;
  v_selected integer;
  i integer;
  v_len integer;
  v_already_rewarded_today boolean;
  v_xp_awarded integer := 0;
  v_gems_awarded integer := 0;
  v_review jsonb := '[]'::jsonb;
begin
  select * into v_session from public.student_practice_sessions where id = p_session_id;
  if v_session is null then
    raise exception 'Sesión no encontrada';
  end if;
  if auth.uid() != v_session.student_id then
    raise exception 'No autorizado';
  end if;
  if v_session.status = 'resolved' then
    raise exception 'Esta sesión ya fue resuelta';
  end if;
  if v_session.questions is null then
    raise exception 'Esta sesión aún no tiene preguntas';
  end if;

  v_len := jsonb_array_length(v_session.questions);
  for i in 0..v_len - 1 loop
    v_correct := (v_session.questions->i->>'correctIndex')::integer;
    v_selected := (p_answers->i)::integer;
    if v_selected = v_correct then
      v_score := v_score + 1;
    end if;
    v_review := v_review || jsonb_build_object(
      'question', v_session.questions->i->>'question',
      'options', v_session.questions->i->'options',
      'correctIndex', v_correct,
      'selected', v_selected
    );
  end loop;

  select exists (
    select 1 from public.student_practice_sessions
    where student_id = auth.uid() and topic = v_session.topic and status = 'resolved'
      and created_at::date = current_date and id != p_session_id
  ) into v_already_rewarded_today;

  if not v_already_rewarded_today then
    v_xp_awarded := v_score * 5;
    v_gems_awarded := v_score * 2;
    update public.students set xp = coalesce(xp, 0) + v_xp_awarded, gems = coalesce(gems, 0) + v_gems_awarded
      where id = auth.uid();
  end if;

  update public.student_practice_sessions
    set status = 'resolved', score = v_score, resolved_at = now()
    where id = p_session_id;

  return jsonb_build_object(
    'score', v_score, 'total', v_len,
    'xp_awarded', v_xp_awarded, 'gems_awarded', v_gems_awarded,
    'review', v_review
  );
end;
$$;

grant execute on function public.submit_practice_answers(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
