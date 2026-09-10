-- ============================================================
-- Ortografía 1v1 -- mismo espíritu que Ahorcado (student_hangman_duels)
-- pero en vez de adivinar letra por letra, el alumno escribe la palabra
-- COMPLETA a partir de una pista, con tildes/ñ incluidos (a diferencia del
-- ahorcado, que las saca para el teclado A-Z). Gana quien la escribe bien
-- MÁS RÁPIDO (async, mismo modelo de reloj que el ahorcado).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_spelling_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.students(id) on delete cascade,
  opponent_id uuid not null references public.students(id) on delete cascade,
  wager_gems integer not null check (wager_gems >= 0),
  topic text not null,
  word text, -- generado por IA al aceptar, oculto del cliente hasta que termina
  hint text,
  status text not null default 'pending' check (status in ('pending', 'rejected', 'cancelled', 'active', 'completed')),
  winner_id uuid references public.students(id),
  challenger_started_at timestamptz,
  opponent_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists public.student_spelling_results (
  duel_id uuid not null references public.student_spelling_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  correct boolean not null,
  time_ms integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);

alter table public.student_spelling_duels enable row level security;
alter table public.student_spelling_results enable row level security;

grant select, insert, update on public.student_spelling_duels to authenticated;
grant select, insert on public.student_spelling_results to authenticated;

drop policy if exists "student_spelling_duels_select_participant_or_staff" on public.student_spelling_duels;
create policy "student_spelling_duels_select_participant_or_staff"
  on public.student_spelling_duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_spelling_duels_insert_challenger" on public.student_spelling_duels;
create policy "student_spelling_duels_insert_challenger"
  on public.student_spelling_duels for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "student_spelling_duels_update_participant" on public.student_spelling_duels;
create policy "student_spelling_duels_update_participant"
  on public.student_spelling_duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_spelling_results_select_participant" on public.student_spelling_results;
create policy "student_spelling_results_select_participant"
  on public.student_spelling_results for select
  using (exists (select 1 from public.student_spelling_duels d where d.id = duel_id and (auth.uid() = d.challenger_id or auth.uid() = d.opponent_id)) or public.is_staff());

drop policy if exists "student_spelling_results_insert_own" on public.student_spelling_results;
create policy "student_spelling_results_insert_own"
  on public.student_spelling_results for insert
  with check (auth.uid() = student_id);

-- La palabra real (y las marcas de tiempo de inicio) no viajan al cliente
-- hasta que termina el juego -- mismo criterio que student-hangman-duels.sql.
revoke select on public.student_spelling_duels from authenticated, anon;
grant select (id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at)
  on public.student_spelling_duels to authenticated;

-- RPC: arranca el reloj del jugador que llama (idempotente) y devuelve
-- solo la pista, nunca la palabra en sí.
create or replace function public.start_spelling_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_spelling_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_spelling_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  return jsonb_build_object('hint', v_duel.hint);
end;
$$;

grant execute on function public.start_spelling_duel(uuid) to authenticated;

-- RPC: recibe la palabra que escribió el alumno, valida EN SERVIDOR contra
-- la real (nunca viajó al cliente) sin distinguir mayúsculas pero SÍ tildes
-- y ñ (el punto entero del juego es la ortografía), y calcula el tiempo.
create or replace function public.submit_spelling_answer(p_duel_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_correct := lower(trim(p_answer)) = lower(trim(v_duel.word));
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_spelling_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object('correct', v_correct, 'time_ms', v_time_ms, 'word', v_duel.word);
end;
$$;

grant execute on function public.submit_spelling_answer(uuid, text) to authenticated;

-- Liquidación automática: mismo criterio que el ahorcado -- gana quien
-- escribió bien la palabra más rápido; si solo uno acertó, gana ese sin
-- importar el tiempo del otro; si ninguno acertó, empate sin transferencia.
create or replace function public.settle_student_spelling_duel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_results record;
  v_count integer;
  v_winner_id uuid;
begin
  select * into v_duel from public.student_spelling_duels where id = new.duel_id;
  if v_duel.status = 'completed' then
    return new;
  end if;

  select count(*) into v_count from public.student_spelling_results where duel_id = new.duel_id;
  if v_count < 2 then
    return new;
  end if;

  select
    max(case when student_id = v_duel.challenger_id then correct::int end) as challenger_correct,
    max(case when student_id = v_duel.challenger_id then time_ms end) as challenger_time,
    max(case when student_id = v_duel.opponent_id then correct::int end) as opponent_correct,
    max(case when student_id = v_duel.opponent_id then time_ms end) as opponent_time
  into v_results
  from public.student_spelling_results where duel_id = new.duel_id;

  if v_results.challenger_correct = 1 and v_results.opponent_correct = 1 then
    v_winner_id := case when v_results.challenger_time <= v_results.opponent_time then v_duel.challenger_id else v_duel.opponent_id end;
  elsif v_results.challenger_correct = 1 then
    v_winner_id := v_duel.challenger_id;
  elsif v_results.opponent_correct = 1 then
    v_winner_id := v_duel.opponent_id;
  else
    v_winner_id := null; -- ninguno acertó, empate sin transferencia
  end if;

  if v_winner_id is not null and v_duel.wager_gems > 0 then
    update public.students set gems = gems + v_duel.wager_gems where id = v_winner_id;
    update public.students set gems = greatest(0, gems - v_duel.wager_gems)
      where id = (case when v_winner_id = v_duel.challenger_id then v_duel.opponent_id else v_duel.challenger_id end);
  end if;

  update public.students set xp = coalesce(xp, 0) + 5 where id in (v_duel.challenger_id, v_duel.opponent_id);
  if v_winner_id is not null then
    update public.students set xp = coalesce(xp, 0) + 15 where id = v_winner_id;
  end if;

  update public.student_spelling_duels
    set status = 'completed', winner_id = v_winner_id, resolved_at = timezone('utc', now())
    where id = new.duel_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_student_spelling_duel on public.student_spelling_results;
create trigger trg_settle_student_spelling_duel
  after insert on public.student_spelling_results
  for each row execute function public.settle_student_spelling_duel();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_spelling_duels'
  ) then
    alter publication supabase_realtime add table public.student_spelling_duels;
  end if;
end $$;

notify pgrst, 'reload schema';
