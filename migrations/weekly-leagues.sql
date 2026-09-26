-- ============================================================
-- Ligas semanales (estilo Duolingo). 5 divisiones: Bronce, Plata, Oro,
-- Diamante, Jade. Cada semana (lunes a domingo, hora de Guatemala) se
-- compite por XP contra los de TU escuela en TU misma división.
--   - Top 3 ascienden (si la división tiene 3+ activos).
--   - Últimos 3 descienden (si hay 6+ activos).
--   - Sin XP en la semana: se queda donde está.
--
-- Sin cron: los puntos de cada semana quedan fijos en
-- league_weekly_points, y el ascenso/descenso de cada alumno se calcula
-- la primera vez que vuelve a ganar XP o abre la liga -- el resultado es
-- el mismo sin importar cuándo se calcule.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students add column if not exists league_tier integer not null default 0 check (league_tier between 0 and 4);
alter table public.students add column if not exists league_week text;
alter table public.students add column if not exists league_last_result text;

create table if not exists public.league_weekly_points (
  student_id uuid not null references public.students(id) on delete cascade,
  week_id text not null,
  school_code text,
  tier integer not null,
  xp integer not null default 0,
  primary key (student_id, week_id)
);
create index if not exists idx_league_group on public.league_weekly_points (week_id, school_code, tier, xp desc);

alter table public.league_weekly_points enable row level security;
revoke all on public.league_weekly_points from anon, authenticated; -- solo vía get_my_league()

create or replace function public.current_week_id()
returns text
language sql
stable
as $$ select to_char(now() at time zone 'America/Guatemala', 'IYYY-"W"IW'); $$;

-- Resultado de la semana p_week para un alumno (no escribe nada).
create or replace function public.league_resolution(p_student uuid, p_week text, p_tier integer, out new_tier integer, out result text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_rank integer;
  v_size integer;
begin
  new_tier := p_tier;
  result := 'stay';
  if p_week is null then return; end if;

  select * into v_row from public.league_weekly_points where student_id = p_student and week_id = p_week;
  if v_row is null then return; end if;

  select count(*) into v_size from public.league_weekly_points
    where week_id = p_week and school_code is not distinct from v_row.school_code and tier = v_row.tier;
  select count(*) + 1 into v_rank from public.league_weekly_points
    where week_id = p_week and school_code is not distinct from v_row.school_code and tier = v_row.tier and xp > v_row.xp;

  if v_rank <= 3 and v_size >= 3 and v_row.tier < 4 then
    new_tier := v_row.tier + 1; result := 'up';
  elsif v_row.tier > 0 and v_size >= 6 and v_rank > v_size - 3 then
    new_tier := v_row.tier - 1; result := 'down';
  else
    new_tier := v_row.tier;
  end if;
end;
$$;

-- Cada vez que sube students.xp: si arrancó una semana nueva, primero
-- resuelve la anterior; después suma el XP a la semana actual.
create or replace function public.track_league_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := public.current_week_id();
  v_res record;
begin
  if coalesce(new.xp, 0) <= coalesce(old.xp, 0) then
    return new;
  end if;

  if new.league_week is distinct from v_week then
    select * into v_res from public.league_resolution(new.id, new.league_week, new.league_tier);
    new.league_tier := v_res.new_tier;
    new.league_last_result := case when new.league_week is null then null else v_res.result end;
    new.league_week := v_week;
  end if;

  insert into public.league_weekly_points (student_id, week_id, school_code, tier, xp)
    values (new.id, v_week, new.school_code, new.league_tier, new.xp - coalesce(old.xp, 0))
  on conflict (student_id, week_id)
    do update set xp = public.league_weekly_points.xp + excluded.xp;
  return new;
end;
$$;

drop trigger if exists trg_track_league_xp on public.students;
create trigger trg_track_league_xp
before update on public.students
for each row execute function public.track_league_xp();

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

  -- Semana nueva sin XP todavía: resolver la anterior acá.
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

  -- El resultado (subiste/bajaste) se muestra una sola vez.
  v_result := v_me.league_last_result;
  if v_result is not null then
    update public.students set league_last_result = null where id = v_me.id;
  end if;

  select coalesce(xp, 0) into v_my_xp from public.league_weekly_points where student_id = v_me.id and week_id = v_week;

  select count(*) into v_size from public.league_weekly_points
    where week_id = v_week and school_code is not distinct from v_me.school_code and tier = v_me.league_tier;

  select coalesce(jsonb_agg(row_to_json(b) order by b.xp desc, b.full_name), '[]'::jsonb) into v_board from (
    select s.id, s.full_name, s.profile_photo_url, s.companion_species, s.gems_earned_total, s.companion_equipped, p.xp
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
revoke execute on function public.league_resolution(uuid, text, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR (consola, logueado como estudiante):
--   await window._supabase.rpc('get_my_league')   -> tier 0 (Bronce), board de tu escuela
-- ============================================================
