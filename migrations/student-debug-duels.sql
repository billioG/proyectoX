-- ============================================================
-- Encontrá el Error 1v1 -- se muestra una secuencia corta de "bloques" de
-- programación (estilo Scratch, pero como tarjetas apiladas, no un editor
-- real) generada por IA, uno de los pasos tiene un error de lógica. Gana
-- quien lo encuentra primero (async, como Ahorcado y Contrarreloj).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_debug_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.students(id) on delete cascade,
  opponent_id uuid not null references public.students(id) on delete cascade,
  wager_gems integer not null check (wager_gems >= 0),
  topic text not null,
  steps jsonb, -- [{label, isBug, explanation}], generado por IA al aceptar -- oculto del cliente
  status text not null default 'pending' check (status in ('pending', 'rejected', 'cancelled', 'active', 'completed')),
  winner_id uuid references public.students(id),
  challenger_started_at timestamptz,
  opponent_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists public.student_debug_results (
  duel_id uuid not null references public.student_debug_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  correct boolean not null,
  time_ms integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);

alter table public.student_debug_duels enable row level security;
alter table public.student_debug_results enable row level security;

grant select, insert, update on public.student_debug_duels to authenticated;
grant select, insert on public.student_debug_results to authenticated;

drop policy if exists "student_debug_duels_select_participant_or_staff" on public.student_debug_duels;
create policy "student_debug_duels_select_participant_or_staff"
  on public.student_debug_duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_debug_duels_insert_challenger" on public.student_debug_duels;
create policy "student_debug_duels_insert_challenger"
  on public.student_debug_duels for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "student_debug_duels_update_participant" on public.student_debug_duels;
create policy "student_debug_duels_update_participant"
  on public.student_debug_duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_debug_results_select_participant" on public.student_debug_results;
create policy "student_debug_results_select_participant"
  on public.student_debug_results for select
  using (exists (select 1 from public.student_debug_duels d where d.id = duel_id and (auth.uid() = d.challenger_id or auth.uid() = d.opponent_id)) or public.is_staff());

drop policy if exists "student_debug_results_insert_own" on public.student_debug_results;
create policy "student_debug_results_insert_own"
  on public.student_debug_results for insert
  with check (auth.uid() = student_id);

-- Los pasos (con cuál es el bug) no viajan al cliente hasta terminar --
-- mismo criterio que los otros 2 desafíos.
revoke select on public.student_debug_duels from authenticated, anon;
grant select (id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at)
  on public.student_debug_duels to authenticated;

-- RPC: arranca el reloj del jugador que llama (idempotente) y devuelve
-- solo las etiquetas de los bloques (sin decir cuál es el error).
create or replace function public.start_debug_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_labels jsonb;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.steps is null then
    raise exception 'Este desafío aún no tiene pasos generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_debug_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_debug_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  select jsonb_agg(s -> 'label') into v_labels from jsonb_array_elements(v_duel.steps) s;
  return jsonb_build_object('labels', v_labels);
end;
$$;

grant execute on function public.start_debug_duel(uuid) to authenticated;

-- RPC: recibe el índice del bloque que el alumno marcó como el error,
-- valida EN SERVIDOR y calcula el tiempo tomado.
create or replace function public.submit_debug_result(p_duel_id uuid, p_selected_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_bug_index integer;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  select i into v_bug_index
    from jsonb_array_elements(v_duel.steps) with ordinality as t(step, i)
    where (step ->> 'isBug')::boolean is true
    limit 1;
  if v_bug_index is null then
    raise exception 'Este desafío no tiene un error marcado -- avisale a un admin';
  end if;
  v_bug_index := v_bug_index - 1; -- ordinality empieza en 1, el cliente cuenta desde 0

  v_correct := (p_selected_index = v_bug_index);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_debug_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object(
    'correct', v_correct, 'time_ms', v_time_ms, 'bug_index', v_bug_index,
    'explanation', (v_duel.steps -> v_bug_index ->> 'explanation')
  );
end;
$$;

grant execute on function public.submit_debug_result(uuid, integer) to authenticated;

-- Liquidación automática: gana quien encontró el error Y fue más rápido;
-- si solo uno acertó, gana ese; si ninguno acertó, empate sin transferencia.
create or replace function public.settle_student_debug_duel()
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
  select * into v_duel from public.student_debug_duels where id = new.duel_id;
  if v_duel.status = 'completed' then
    return new;
  end if;

  select count(*) into v_count from public.student_debug_results where duel_id = new.duel_id;
  if v_count < 2 then
    return new;
  end if;

  select
    max(case when student_id = v_duel.challenger_id then correct::int end) as challenger_correct,
    max(case when student_id = v_duel.challenger_id then time_ms end) as challenger_time,
    max(case when student_id = v_duel.opponent_id then correct::int end) as opponent_correct,
    max(case when student_id = v_duel.opponent_id then time_ms end) as opponent_time
  into v_results
  from public.student_debug_results where duel_id = new.duel_id;

  if v_results.challenger_correct = 1 and v_results.opponent_correct = 1 then
    v_winner_id := case when v_results.challenger_time <= v_results.opponent_time then v_duel.challenger_id else v_duel.opponent_id end;
  elsif v_results.challenger_correct = 1 then
    v_winner_id := v_duel.challenger_id;
  elsif v_results.opponent_correct = 1 then
    v_winner_id := v_duel.opponent_id;
  else
    v_winner_id := null;
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

  update public.student_debug_duels
    set status = 'completed', winner_id = v_winner_id, resolved_at = timezone('utc', now())
    where id = new.duel_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_student_debug_duel on public.student_debug_results;
create trigger trg_settle_student_debug_duel
  after insert on public.student_debug_results
  for each row execute function public.settle_student_debug_duel();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_debug_duels'
  ) then
    alter publication supabase_realtime add table public.student_debug_duels;
  end if;
end $$;

notify pgrst, 'reload schema';
