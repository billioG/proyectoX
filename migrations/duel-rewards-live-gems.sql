-- ============================================================
-- Gemas que se sienten: premio de la arena + avisos en vivo.
--
-- Antes los duelos eran SUMA CERO: el ganador solo recibía lo que había
-- apostado el rival. Con apuesta 0, o si el rival tenía 0 gemas, ganar daba
-- 0 gemas -- en la prueba con 10 alumnos todos terminaron en 0 y aburridos.
--
-- 1. Premio de la arena (sale "de la casa", no del rival), además de la
--    apuesta: ganar +5 (+2 extra con racha de 3 o más), empatar +2 cada
--    uno, perder +1 por jugar. Tope: los primeros 8 duelos de cada alumno
--    por día dan premio (evita farmear duelos entre amigos).
-- 2. student_gem_events: un registro por cada cambio de gemas (de
--    cualquier origen, lo escribe un trigger) con el motivo. La app lo
--    escucha por Realtime y actualiza el contador al instante con un aviso
--    "+7 💎 ¡Ganaste el duelo!" -- sin recargar.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere duel-streaks.sql.
-- ============================================================

-- ---------- 2. Registro de cambios de gemas (para avisos en vivo) ----------
create table if not exists public.student_gem_events (
  id bigserial primary key,
  student_id uuid not null,
  amount integer not null,
  reason text,
  balance integer,
  created_at timestamptz not null default now()
);
create index if not exists student_gem_events_student_idx on public.student_gem_events (student_id, created_at desc);

alter table public.student_gem_events enable row level security;
drop policy if exists "gem_events_select_own" on public.student_gem_events;
create policy "gem_events_select_own" on public.student_gem_events
  for select to authenticated using (student_id = auth.uid());
revoke all on public.student_gem_events from anon, authenticated;
grant select on public.student_gem_events to authenticated;

-- El motivo lo marca quien cambia las gemas con
-- set_config('quetzal.gem_reason', '...', true); si no, queda null.
create or replace function public.log_gem_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_gem_events (student_id, amount, reason, balance)
  values (new.id, coalesce(new.gems, 0) - coalesce(old.gems, 0),
          nullif(current_setting('quetzal.gem_reason', true), ''), new.gems);
  return null;
end;
$$;

drop trigger if exists trg_log_gem_change on public.students;
create trigger trg_log_gem_change
  after update of gems on public.students
  for each row when (new.gems is distinct from old.gems)
  execute function public.log_gem_change();

do $$
begin
  alter publication supabase_realtime add table public.student_gem_events;
exception when duplicate_object then null;
end $$;

-- ---------- 1. Premio de la arena con tope diario ----------
create table if not exists public.duel_daily_rewards (
  student_id uuid not null,
  day date not null,
  rewarded integer not null default 0,
  primary key (student_id, day)
);
alter table public.duel_daily_rewards enable row level security;
revoke all on public.duel_daily_rewards from anon, authenticated;

-- Devuelve cuántas gemas de premio le tocan (p_gems o 0 si ya llegó al
-- tope de hoy) y cuenta el duelo.
create or replace function public.duel_house_reward(p_student uuid, p_gems integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Guatemala')::date;
  v_n integer;
begin
  insert into public.duel_daily_rewards (student_id, day, rewarded) values (p_student, v_day, 1)
  on conflict (student_id, day) do update set rewarded = public.duel_daily_rewards.rewarded + 1
  returning rewarded into v_n;
  return case when v_n <= 8 then p_gems else 0 end;
end;
$$;
revoke execute on function public.duel_house_reward(uuid, integer) from public, anon, authenticated;

create or replace function public.finish_student_duel(
  p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loser uuid;
  v_loser_gems integer;
  v_amount integer := 0;
  v_streak integer;
begin
  if p_winner is not null then
    v_loser := case when p_winner = p_challenger then p_opponent else p_challenger end;

    if p_wager > 0 then
      select coalesce(gems, 0) into v_loser_gems from public.students where id = v_loser for update;
      v_amount := least(p_wager, greatest(coalesce(v_loser_gems, 0), 0));
    end if;

    update public.students
      set duel_win_streak = duel_win_streak + 1,
          best_duel_win_streak = greatest(best_duel_win_streak, duel_win_streak + 1)
      where id = p_winner
      returning duel_win_streak into v_streak;
    update public.students set duel_win_streak = 0 where id = v_loser;

    -- Ganador: la apuesta del rival + premio de la arena.
    perform set_config('quetzal.gem_reason', 'duel_win', true);
    update public.students
      set gems = coalesce(gems, 0) + v_amount
               + public.duel_house_reward(p_winner, 5 + (case when v_streak >= 3 then 2 else 0 end))
      where id = p_winner;

    -- Perdedor: pierde la apuesta pero suma +1 por jugar.
    perform set_config('quetzal.gem_reason', 'duel_loss', true);
    update public.students
      set gems = greatest(coalesce(gems, 0) - v_amount, 0) + public.duel_house_reward(v_loser, 1)
      where id = v_loser;
  else
    -- Empate: +2 a cada uno.
    perform set_config('quetzal.gem_reason', 'duel_tie', true);
    update public.students set gems = coalesce(gems, 0) + public.duel_house_reward(p_challenger, 2) where id = p_challenger;
    update public.students set gems = coalesce(gems, 0) + public.duel_house_reward(p_opponent, 2) where id = p_opponent;
  end if;
  perform set_config('quetzal.gem_reason', '', true);

  update public.students set xp = coalesce(xp, 0) + 5 where id in (p_challenger, p_opponent);
  if p_winner is not null then
    -- 15 por ganar + 10 extra si viene en racha de 3 o más.
    update public.students set xp = coalesce(xp, 0) + 15 + (case when v_streak >= 3 then 10 else 0 end) where id = p_winner;
  end if;

  execute format(
    'update public.%I set status = ''completed'', winner_id = $1, resolved_at = timezone(''utc'', now()) where id = $2',
    p_table
  ) using p_winner, p_duel_id;
end;
$$;

revoke execute on function public.finish_student_duel(text, uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;

-- Cuántos duelos con premio le quedan hoy (para mostrarlo en la guía).
create or replace function public.get_my_duel_rewards_left()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(8 - coalesce((
    select rewarded from public.duel_daily_rewards
    where student_id = auth.uid() and day = (now() at time zone 'America/Guatemala')::date
  ), 0), 0);
$$;
grant execute on function public.get_my_duel_rewards_left() to authenticated;

notify pgrst, 'reload schema';
