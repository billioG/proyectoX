-- ============================================================
-- Racha de victorias en duelos 1v1 (los 5 juegos cuentan juntos).
-- Ganar suma 1, perder la corta, empatar no la toca. Desde 3 seguidas,
-- cada victoria da +10 XP extra. Se calcula en finish_student_duel (el
-- cierre común de los 5 juegos, ver audit-fixes-duels-chest.sql).
-- Las columnas no son escribibles desde el cliente (grant por columnas).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere audit-fixes-duels-chest.sql y
-- weekly-leagues.sql.
-- ============================================================

alter table public.students add column if not exists duel_win_streak integer not null default 0;
alter table public.students add column if not exists best_duel_win_streak integer not null default 0;

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
  v_amount integer;
  v_streak integer;
begin
  if p_winner is not null then
    v_loser := case when p_winner = p_challenger then p_opponent else p_challenger end;

    if p_wager > 0 then
      select coalesce(gems, 0) into v_loser_gems from public.students where id = v_loser for update;
      v_amount := least(p_wager, greatest(coalesce(v_loser_gems, 0), 0));
      if v_amount > 0 then
        update public.students set gems = gems - v_amount where id = v_loser;
        update public.students set gems = coalesce(gems, 0) + v_amount where id = p_winner;
      end if;
    end if;

    update public.students
      set duel_win_streak = duel_win_streak + 1,
          best_duel_win_streak = greatest(best_duel_win_streak, duel_win_streak + 1)
      where id = p_winner
      returning duel_win_streak into v_streak;
    update public.students set duel_win_streak = 0 where id = v_loser;
  end if;

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

-- Mismo get_my_league de weekly-leagues.sql, sumando la racha de cada uno.
create or replace function public.get_my_league()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := public.current_week_id();
  v_me record;
  v_res record;
  v_result text;
  v_ends timestamp;
  v_board jsonb;
  v_size integer;
  v_my_xp integer;
begin
  select id, school_code, league_tier, league_week, league_last_result into v_me
    from public.students where id = auth.uid();
  if v_me is null then raise exception 'Solo los estudiantes tienen liga'; end if;

  if v_me.league_week is distinct from v_week then
    select * into v_res from public.league_resolution(v_me.id, v_me.league_week, v_me.league_tier);
    update public.students
      set league_tier = v_res.new_tier,
          league_last_result = case when v_me.league_week is null then null else v_res.result end,
          league_week = v_week
      where id = v_me.id;
    select id, school_code, league_tier, league_week, league_last_result into v_me
      from public.students where id = auth.uid();
  end if;

  v_result := v_me.league_last_result;
  if v_result is not null then
    update public.students set league_last_result = null where id = v_me.id;
  end if;

  select coalesce(xp, 0) into v_my_xp from public.league_weekly_points where student_id = v_me.id and week_id = v_week;

  select count(*) into v_size from public.league_weekly_points
    where week_id = v_week and school_code is not distinct from v_me.school_code and tier = v_me.league_tier;

  select coalesce(jsonb_agg(row_to_json(b) order by b.xp desc, b.full_name), '[]'::jsonb) into v_board from (
    select s.id, s.full_name, s.profile_photo_url, s.companion_species, s.gems_earned_total, s.companion_equipped,
           s.duel_win_streak, p.xp
    from public.league_weekly_points p
    join public.students s on s.id = p.student_id
    where p.week_id = v_week and p.school_code is not distinct from v_me.school_code and p.tier = v_me.league_tier
    order by p.xp desc
    limit 50
  ) b;

  v_ends := date_trunc('week', now() at time zone 'America/Guatemala') + interval '7 days';

  return jsonb_build_object(
    'tier', v_me.league_tier,
    'week_id', v_week,
    'ends_at', to_char(v_ends, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'result', v_result,
    'my_xp', coalesce(v_my_xp, 0),
    'group_size', v_size,
    'board', v_board
  );
end;
$$;

grant execute on function public.get_my_league() to authenticated;

notify pgrst, 'reload schema';
