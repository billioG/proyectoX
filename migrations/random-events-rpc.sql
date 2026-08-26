-- Igual que get_duel_questions: entrega las preguntas del evento SIN
-- correctIndex, solo a quien ya se unió (tiene fila en event_participants).
create or replace function public.get_event_questions(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_result jsonb;
begin
  select * into v_event from public.random_events where id = p_event_id;
  if v_event is null then
    raise exception 'Evento no encontrado';
  end if;
  if v_event.status != 'active' then
    raise exception 'Este evento no está activo';
  end if;
  if not exists (select 1 from public.event_participants where event_id = p_event_id and student_id = auth.uid()) then
    raise exception 'No te uniste a este evento';
  end if;
  if v_event.questions is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result
    from jsonb_array_elements(v_event.questions) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function public.get_event_questions(uuid) to authenticated;

notify pgrst, 'reload schema';
