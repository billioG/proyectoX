-- ============================================================
-- TORNEOS ENTRE ESTABLECIMIENTOS -- temporada tipo liga. Equipos nuevos
-- (no los grupos de proyecto), un capitán responde en nombre del equipo
-- un quiz grupal generado por IA contra un equipo de OTRO establecimiento,
-- se acumulan puntos en una tabla de posiciones durante la ventana de la
-- temporada. Mismo patrón de blindaje que el duelo 1v1: el cliente nunca
-- ve correctIndex antes de responder, el score se calcula en servidor.
-- ============================================================

create table if not exists public.tournament_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'closed')),
  points_win integer not null default 3,
  points_tie integer not null default 1,
  points_loss integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.tournament_seasons(id) on delete cascade,
  name text not null,
  school_code text not null,
  captain_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (season_id, name)
);

create table if not exists public.tournament_team_members (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.tournament_seasons(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  unique (season_id, student_id) -- un alumno solo puede estar en UN equipo por temporada
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.tournament_seasons(id) on delete cascade,
  team_a_id uuid not null references public.tournament_teams(id) on delete cascade,
  team_b_id uuid not null references public.tournament_teams(id) on delete cascade,
  challenger_team_id uuid not null references public.tournament_teams(id),
  status text not null default 'pending' check (status in ('pending', 'rejected', 'cancelled', 'active', 'completed')),
  topic text not null,
  question_count integer not null default 8,
  questions jsonb,
  team_a_score integer,
  team_b_score integer,
  winner_team_id uuid references public.tournament_teams(id),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (team_a_id <> team_b_id)
);

create table if not exists public.tournament_match_answers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  submitted_by uuid not null references public.students(id),
  answers jsonb not null,
  score integer not null default 0,
  time_taken_ms integer,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (match_id, team_id)
);

-- ================================================
-- RLS
-- ================================================
alter table public.tournament_seasons enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_team_members enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_match_answers enable row level security;

create policy tournament_seasons_select on public.tournament_seasons for select using (true);
create policy tournament_seasons_insert_staff on public.tournament_seasons for insert with check (is_staff());
create policy tournament_seasons_update_staff on public.tournament_seasons for update using (is_staff());

create policy tournament_teams_select on public.tournament_teams for select using (true);
create policy tournament_teams_insert_own on public.tournament_teams for insert with check (auth.uid() = captain_id);
create policy tournament_teams_update_captain on public.tournament_teams for update using (auth.uid() = captain_id or is_staff());

create policy tournament_team_members_select on public.tournament_team_members for select using (true);
create policy tournament_team_members_insert on public.tournament_team_members for insert with check (
  exists (select 1 from public.tournament_teams t where t.id = tournament_team_members.team_id and t.captain_id = auth.uid())
  or auth.uid() = student_id
);
create policy tournament_team_members_delete on public.tournament_team_members for delete using (
  exists (select 1 from public.tournament_teams t where t.id = tournament_team_members.team_id and t.captain_id = auth.uid())
  or auth.uid() = student_id
);

-- questions sin correctIndex para el cliente (igual que student_duels).
create policy tournament_matches_select on public.tournament_matches for select using (true);
revoke select on public.tournament_matches from authenticated, anon;
grant select (id, season_id, team_a_id, team_b_id, challenger_team_id, status, topic, question_count, team_a_score, team_b_score, winner_team_id, created_at, resolved_at)
  on public.tournament_matches to authenticated;

create policy tournament_matches_insert_captain on public.tournament_matches for insert with check (
  exists (select 1 from public.tournament_teams t where t.id = tournament_matches.challenger_team_id and t.captain_id = auth.uid())
);
create policy tournament_matches_update_captain on public.tournament_matches for update using (
  exists (select 1 from public.tournament_teams t where t.id = team_a_id and t.captain_id = auth.uid())
  or exists (select 1 from public.tournament_teams t where t.id = team_b_id and t.captain_id = auth.uid())
);

create policy tournament_match_answers_select on public.tournament_match_answers for select using (
  exists (
    select 1 from public.tournament_matches m
    join public.tournament_teams t on t.id in (m.team_a_id, m.team_b_id)
    where m.id = tournament_match_answers.match_id and t.captain_id = auth.uid()
  )
  or is_staff()
);

-- ================================================
-- RPC: preguntas sin correctIndex (solo capitán del equipo, partido activo)
-- ================================================
create or replace function public.get_tournament_match_questions(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_result jsonb;
  v_is_captain boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if v_match is null then raise exception 'Partido no encontrado'; end if;
  if v_match.status != 'active' then raise exception 'Este partido no está activo'; end if;

  select exists (
    select 1 from public.tournament_teams t
    where t.id in (v_match.team_a_id, v_match.team_b_id) and t.captain_id = auth.uid()
  ) into v_is_captain;
  if not v_is_captain then raise exception 'No autorizado'; end if;
  if v_match.questions is null then return '[]'::jsonb; end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result from jsonb_array_elements(v_match.questions) q;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;
grant execute on function public.get_tournament_match_questions(uuid) to authenticated;

-- Revisión post-partido: preguntas completas con correctIndex, solo si terminó.
create or replace function public.get_tournament_match_review(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_is_captain boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if v_match is null then raise exception 'Partido no encontrado'; end if;
  if v_match.status != 'completed' then raise exception 'Este partido todavía no terminó'; end if;

  select exists (
    select 1 from public.tournament_teams t
    where t.id in (v_match.team_a_id, v_match.team_b_id) and t.captain_id = auth.uid()
  ) into v_is_captain;
  if not v_is_captain then raise exception 'No autorizado'; end if;

  return coalesce(v_match.questions, '[]'::jsonb);
end;
$$;
grant execute on function public.get_tournament_match_review(uuid) to authenticated;

-- ================================================
-- Liquidación automática: cuando ambos equipos ya respondieron.
-- ================================================
create or replace function public.settle_tournament_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_count integer;
  v_a_score integer;
  v_b_score integer;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = new.match_id;
  if v_match.status = 'completed' then return new; end if;

  select count(*) into v_count from public.tournament_match_answers where match_id = new.match_id;
  if v_count < 2 then return new; end if;

  select score into v_a_score from public.tournament_match_answers where match_id = new.match_id and team_id = v_match.team_a_id;
  select score into v_b_score from public.tournament_match_answers where match_id = new.match_id and team_id = v_match.team_b_id;

  if v_a_score > v_b_score then v_winner := v_match.team_a_id;
  elsif v_b_score > v_a_score then v_winner := v_match.team_b_id;
  else v_winner := null; end if;

  update public.tournament_matches
    set status = 'completed', team_a_score = v_a_score, team_b_score = v_b_score,
        winner_team_id = v_winner, resolved_at = timezone('utc', now())
    where id = new.match_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_tournament_match on public.tournament_match_answers;
create trigger trg_settle_tournament_match
  after insert on public.tournament_match_answers
  for each row execute function public.settle_tournament_match();

notify pgrst, 'reload schema';
