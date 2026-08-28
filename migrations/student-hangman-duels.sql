-- ============================================================
-- Ahorcado 1v1 -- mismo espíritu que los Desafíos de Código (student_duels)
-- pero en vez de puntaje por preguntas, gana quien adivina la palabra
-- correcta MÁS RÁPIDO (async: cada uno juega cuando puede, se compara el
-- tiempo que tardó cada uno desde que empezó su turno).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_hangman_duels (
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

create table if not exists public.student_hangman_results (
  duel_id uuid not null references public.student_hangman_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  solved boolean not null,
  wrong_guesses integer not null,
  time_ms integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);

alter table public.student_hangman_duels enable row level security;
alter table public.student_hangman_results enable row level security;

grant select, insert, update on public.student_hangman_duels to authenticated;
grant select, insert on public.student_hangman_results to authenticated;

drop policy if exists "student_hangman_duels_select_participant_or_staff" on public.student_hangman_duels;
create policy "student_hangman_duels_select_participant_or_staff"
  on public.student_hangman_duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_hangman_duels_insert_challenger" on public.student_hangman_duels;
create policy "student_hangman_duels_insert_challenger"
  on public.student_hangman_duels for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "student_hangman_duels_update_participant" on public.student_hangman_duels;
create policy "student_hangman_duels_update_participant"
  on public.student_hangman_duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_hangman_results_select_participant" on public.student_hangman_results;
create policy "student_hangman_results_select_participant"
  on public.student_hangman_results for select
  using (exists (select 1 from public.student_hangman_duels d where d.id = duel_id and (auth.uid() = d.challenger_id or auth.uid() = d.opponent_id)) or public.is_staff());

drop policy if exists "student_hangman_results_insert_own" on public.student_hangman_results;
create policy "student_hangman_results_insert_own"
  on public.student_hangman_results for insert
  with check (auth.uid() = student_id);

-- La palabra real (y las marcas de tiempo de inicio) no viajan al cliente
-- hasta que termina el juego -- mismo criterio que duel-harden.sql con
-- correctIndex en los quiz de trivia.
revoke select on public.student_hangman_duels from authenticated, anon;
grant select (id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at)
  on public.student_hangman_duels to authenticated;

-- RPC: arranca el reloj del jugador que llama (idempotente) y devuelve
-- pista + longitud de palabra, nunca la palabra en sí.
create or replace function public.start_hangman_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
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
    update public.student_hangman_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_hangman_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  return jsonb_build_object('hint', v_duel.hint, 'wordLength', length(v_duel.word));
end;
$$;

grant execute on function public.start_hangman_duel(uuid) to authenticated;

-- RPC: revela si UNA letra está en la palabra y en qué posiciones, sin
-- exponer el resto de la palabra -- así el juego puede pintar cada acierto
-- al toque, como el ahorcado de verdad, sin que el cliente vea la palabra.
create or replace function public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_word text;
  v_letter text;
  v_positions integer[];
  v_guessed text[];
  v_letters text[];
  i integer;
  v_solved boolean;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_word := lower(v_duel.word);
  v_letter := lower(left(p_letter, 1));
  v_positions := array[]::integer[];

  for i in 1..length(v_word) loop
    if substr(v_word, i, 1) = v_letter then
      v_positions := array_append(v_positions, i - 1);
    end if;
  end loop;

  -- p_guessed_letters ya incluye la letra actual (la manda el cliente en
  -- su lista acumulada) -- se usa para saber si con esta jugada se
  -- completó la palabra.
  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);
  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);

  return jsonb_build_object(
    'correct', array_length(v_positions, 1) > 0,
    'positions', to_jsonb(v_positions),
    'solved', coalesce(v_solved, false)
  );
end;
$$;

grant execute on function public.check_hangman_letter(uuid, text, jsonb) to authenticated;

-- RPC: recibe las letras que probó el alumno, valida EN SERVIDOR contra la
-- palabra real (nunca viajó al cliente) y calcula el tiempo tomado.
create or replace function public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_word text;
  v_letters text[];
  v_guessed text[];
  v_wrong integer := 0;
  v_solved boolean;
  v_time_ms integer;
  v_letter text;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_word := lower(v_duel.word);
  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);

  foreach v_letter in array v_guessed loop
    if position(v_letter in v_word) = 0 then
      v_wrong := v_wrong + 1;
    end if;
  end loop;

  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_hangman_results (duel_id, student_id, solved, wrong_guesses, time_ms)
    values (p_duel_id, auth.uid(), coalesce(v_solved, false), v_wrong, v_time_ms);

  return jsonb_build_object('solved', coalesce(v_solved, false), 'wrong_guesses', v_wrong, 'time_ms', v_time_ms, 'word', v_duel.word);
end;
$$;

grant execute on function public.submit_hangman_result(uuid, jsonb) to authenticated;

-- Liquidación automática: cuando ambos ya jugaron, gana quien resolvió la
-- palabra más rápido (si solo uno la resolvió, gana ese sin importar el
-- tiempo del otro; si ninguno la resolvió, empate sin transferencia).
create or replace function public.settle_student_hangman_duel()
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
  select * into v_duel from public.student_hangman_duels where id = new.duel_id;
  if v_duel.status = 'completed' then
    return new;
  end if;

  select count(*) into v_count from public.student_hangman_results where duel_id = new.duel_id;
  if v_count < 2 then
    return new;
  end if;

  select
    max(case when student_id = v_duel.challenger_id then solved::int end) as challenger_solved,
    max(case when student_id = v_duel.challenger_id then time_ms end) as challenger_time,
    max(case when student_id = v_duel.opponent_id then solved::int end) as opponent_solved,
    max(case when student_id = v_duel.opponent_id then time_ms end) as opponent_time
  into v_results
  from public.student_hangman_results where duel_id = new.duel_id;

  if v_results.challenger_solved = 1 and v_results.opponent_solved = 1 then
    v_winner_id := case when v_results.challenger_time <= v_results.opponent_time then v_duel.challenger_id else v_duel.opponent_id end;
  elsif v_results.challenger_solved = 1 then
    v_winner_id := v_duel.challenger_id;
  elsif v_results.opponent_solved = 1 then
    v_winner_id := v_duel.opponent_id;
  else
    v_winner_id := null; -- ninguno la resolvió, empate sin transferencia
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

  update public.student_hangman_duels
    set status = 'completed', winner_id = v_winner_id, resolved_at = timezone('utc', now())
    where id = new.duel_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_student_hangman_duel on public.student_hangman_results;
create trigger trg_settle_student_hangman_duel
  after insert on public.student_hangman_results
  for each row execute function public.settle_student_hangman_duel();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_hangman_duels'
  ) then
    alter publication supabase_realtime add table public.student_hangman_duels;
  end if;
end $$;

notify pgrst, 'reload schema';
