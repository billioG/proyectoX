-- Esquema mínimo para probar migrations/node-hangman-duel.sql sin Supabase: las tablas del Ahorcado, el banco fijo y su liquidación
-- (finish_student_duel + disparador, copiados de migrations/audit-fixes.sql en lo que importa para esta prueba).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table public.students (id uuid primary key default gen_random_uuid(), school_code text, gems integer not null default 0, xp integer not null default 0);
create table public.hangman_word_bank (id bigint generated always as identity primary key, category text not null, word text not null, hint text not null, fact text);
create table public.student_hangman_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.students(id) on delete cascade,
  opponent_id uuid not null references public.students(id) on delete cascade,
  wager_gems integer not null check (wager_gems >= 0),
  topic text not null,
  word text, hint text, word_b text, hint_b text,
  status text not null default 'pending' check (status in ('pending', 'rejected', 'cancelled', 'active', 'completed')),
  winner_id uuid references public.students(id),
  challenger_started_at timestamptz,
  opponent_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);
create table public.student_hangman_results (
  duel_id uuid not null references public.student_hangman_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  solved boolean not null,
  wrong_guesses integer not null,
  time_ms integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);
create or replace function public.finish_student_duel(p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $f$
declare v_loser uuid; v_loser_gems integer; v_amount integer;
begin
  if p_winner is not null and p_wager > 0 then
    v_loser := case when p_winner = p_challenger then p_opponent else p_challenger end;
    select coalesce(gems, 0) into v_loser_gems from public.students where id = v_loser for update;
    v_amount := least(p_wager, greatest(coalesce(v_loser_gems, 0), 0));
    if v_amount > 0 then
      update public.students set gems = gems - v_amount where id = v_loser;
      update public.students set gems = coalesce(gems, 0) + v_amount where id = p_winner;
    end if;
  end if;
  update public.students set xp = coalesce(xp, 0) + 5 where id in (p_challenger, p_opponent);
  if p_winner is not null then update public.students set xp = coalesce(xp, 0) + 15 where id = p_winner; end if;
  execute format('update public.%I set status = ''completed'', winner_id = $1, resolved_at = timezone(''utc'', now()) where id = $2', p_table) using p_winner, p_duel_id;
end $f$;
create or replace function public.settle_student_hangman_duel() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_duel record; v_r record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_hangman_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_hangman_results where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;
  select max(case when student_id = v_duel.challenger_id then solved::int end) as c_ok, max(case when student_id = v_duel.challenger_id then time_ms end) as c_time,
         max(case when student_id = v_duel.opponent_id then solved::int end) as o_ok, max(case when student_id = v_duel.opponent_id then time_ms end) as o_time
    into v_r from public.student_hangman_results where duel_id = new.duel_id;
  v_winner_id := case
    when v_r.c_ok = 1 and v_r.o_ok = 1 then case when v_r.c_time <= v_r.o_time then v_duel.challenger_id else v_duel.opponent_id end
    when v_r.c_ok = 1 then v_duel.challenger_id when v_r.o_ok = 1 then v_duel.opponent_id else null end;
  perform public.finish_student_duel('student_hangman_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end $f$;
create trigger trg_settle_student_hangman_duel after insert on public.student_hangman_results for each row execute function public.settle_student_hangman_duel();
