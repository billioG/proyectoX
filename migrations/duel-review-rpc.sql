-- Una vez que el duelo terminó, ya no hay nada que blindar -- entrega las
-- preguntas COMPLETAS (con correctIndex) para que el alumno vea qué
-- acertó y qué no. Antes de 'completed' sigue sin exponerlo.
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

  return coalesce(v_duel.questions, '[]'::jsonb);
end;
$$;

grant execute on function public.get_duel_review(uuid) to authenticated;

notify pgrst, 'reload schema';
