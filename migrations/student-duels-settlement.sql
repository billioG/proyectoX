-- ============================================================
-- Liquidación automática del Desafío 1v1: cuando ambos alumnos ya
-- respondieron, se calcula el ganador y se transfieren las gemas.
-- SECURITY DEFINER porque el segundo alumno en responder no tiene permiso
-- (por RLS) para actualizar las gemas/XP del OTRO alumno.
-- ============================================================

create or replace function public.settle_student_duel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_answers record;
  v_count integer;
  v_winner_id uuid;
begin
  select * into v_duel from public.student_duels where id = new.duel_id;
  if v_duel.status = 'completed' then
    return new;
  end if;

  select count(*) into v_count from public.student_duel_answers where duel_id = new.duel_id;
  if v_count < 2 then
    return new;
  end if;

  select
    max(case when student_id = v_duel.challenger_id then score end) as challenger_score,
    max(case when student_id = v_duel.opponent_id then score end) as opponent_score
  into v_answers
  from public.student_duel_answers where duel_id = new.duel_id;

  if v_answers.challenger_score > v_answers.opponent_score then
    v_winner_id := v_duel.challenger_id;
  elsif v_answers.opponent_score > v_answers.challenger_score then
    v_winner_id := v_duel.opponent_id;
  else
    v_winner_id := null; -- empate, sin transferencia de gemas
  end if;

  if v_winner_id is not null and v_duel.wager_gems > 0 then
    update public.students set gems = gems + v_duel.wager_gems where id = v_winner_id;
    update public.students set gems = greatest(0, gems - v_duel.wager_gems)
      where id = (case when v_winner_id = v_duel.challenger_id then v_duel.opponent_id else v_duel.challenger_id end);
  end if;

  -- Bono de XP: participación para ambos, extra para el ganador.
  update public.students set xp = coalesce(xp, 0) + 5 where id in (v_duel.challenger_id, v_duel.opponent_id);
  if v_winner_id is not null then
    update public.students set xp = coalesce(xp, 0) + 15 where id = v_winner_id;
  end if;

  update public.student_duels
    set status = 'completed', winner_id = v_winner_id, resolved_at = timezone('utc', now())
    where id = new.duel_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_student_duel on public.student_duel_answers;
create trigger trg_settle_student_duel
  after insert on public.student_duel_answers
  for each row execute function public.settle_student_duel();

notify pgrst, 'reload schema';
