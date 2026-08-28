-- ============================================================
-- Contrarreloj 1v1 -- operaciones matemáticas cronometradas, gana quien
-- saca más correctas (y de empate, quien fue más rápido). Igual que
-- Ahorcado, es async: cada uno juega cuando puede. A diferencia de los
-- otros 2 desafíos, NO usa IA -- los problemas se generan con una función
-- determinística según el grado del alumno, sin riesgo de que un modelo
-- invente una cuenta mal hecha.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_timed_math_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.students(id) on delete cascade,
  opponent_id uuid not null references public.students(id) on delete cascade,
  wager_gems integer not null check (wager_gems >= 0),
  problem_count integer not null default 10,
  problems jsonb, -- [{question, answer}], generado al aceptar -- oculto del cliente
  status text not null default 'pending' check (status in ('pending', 'rejected', 'cancelled', 'active', 'completed')),
  winner_id uuid references public.students(id),
  challenger_started_at timestamptz,
  opponent_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists public.student_timed_math_results (
  duel_id uuid not null references public.student_timed_math_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score integer not null,
  time_ms integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);

alter table public.student_timed_math_duels enable row level security;
alter table public.student_timed_math_results enable row level security;

grant select, insert, update on public.student_timed_math_duels to authenticated;
grant select, insert on public.student_timed_math_results to authenticated;

drop policy if exists "student_timed_math_duels_select_participant_or_staff" on public.student_timed_math_duels;
create policy "student_timed_math_duels_select_participant_or_staff"
  on public.student_timed_math_duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_timed_math_duels_insert_challenger" on public.student_timed_math_duels;
create policy "student_timed_math_duels_insert_challenger"
  on public.student_timed_math_duels for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "student_timed_math_duels_update_participant" on public.student_timed_math_duels;
create policy "student_timed_math_duels_update_participant"
  on public.student_timed_math_duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_timed_math_results_select_participant" on public.student_timed_math_results;
create policy "student_timed_math_results_select_participant"
  on public.student_timed_math_results for select
  using (exists (select 1 from public.student_timed_math_duels d where d.id = duel_id and (auth.uid() = d.challenger_id or auth.uid() = d.opponent_id)) or public.is_staff());

drop policy if exists "student_timed_math_results_insert_own" on public.student_timed_math_results;
create policy "student_timed_math_results_insert_own"
  on public.student_timed_math_results for insert
  with check (auth.uid() = student_id);

-- Los problemas (con la respuesta) no viajan al cliente hasta terminar --
-- mismo criterio que duel-harden.sql / student-hangman-duels.sql.
revoke select on public.student_timed_math_duels from authenticated, anon;
grant select (id, challenger_id, opponent_id, wager_gems, problem_count, status, winner_id, created_at, resolved_at)
  on public.student_timed_math_duels to authenticated;

-- Generador determinístico de problemas según el grado -- sin IA, así que
-- no hay riesgo de una cuenta mal hecha inventada por un modelo. El nivel
-- se aproxima por texto (mismo criterio que getGradeRank() en utils.js,
-- que no se puede compartir directo entre JS y SQL).
create or replace function public.generate_math_problems(p_grade text, p_count integer default 10)
returns jsonb
language plpgsql
as $$
declare
  v_rank integer;
  v_level text := lower(coalesce(p_grade, ''));
  v_problems jsonb := '[]'::jsonb;
  i integer;
  a integer;
  b integer;
  op text;
  answer numeric;
  question text;
  v_percents integer[] := array[10, 20, 25, 50, 75];
  v_bases integer[] := array[40, 80, 100, 200, 50];
begin
  if v_level like '%primaria%' then
    if v_level like '1ro%' or v_level like '2do%' or v_level like '3ro%' then v_rank := 2; else v_rank := 5; end if;
  elsif v_level like '%básico%' or v_level like '%basico%' then
    v_rank := 8;
  elsif v_level like '%diversificado%' then
    v_rank := 11;
  else
    v_rank := 5;
  end if;

  for i in 1..p_count loop
    if v_rank <= 3 then
      -- 1ro-3ro primaria: suma/resta hasta 20, sin negativos.
      a := floor(random() * 20)::integer + 1;
      b := floor(random() * 20)::integer + 1;
      if random() < 0.5 then
        op := '+'; answer := a + b;
      else
        if a < b then a := a + b; b := a - b; a := a - b; end if;
        op := '-'; answer := a - b;
      end if;

    elsif v_rank <= 6 then
      -- 4to-6to primaria: suma/resta hasta 100, multiplicación tabla 1-10.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          op := '+'; answer := a + b;
        when 1 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          if a < b then a := a + b; b := a - b; a := a - b; end if;
          op := '-'; answer := a - b;
        else
          a := floor(random() * 10)::integer + 1; b := floor(random() * 10)::integer + 1;
          op := '×'; answer := a * b;
      end case;

    elsif v_rank <= 9 then
      -- Básico: multiplicación/división exacta/potencias simples.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 20)::integer + 2; b := floor(random() * 20)::integer + 2;
          op := '×'; answer := a * b;
        when 1 then
          b := floor(random() * 10)::integer + 2; answer := floor(random() * 15)::integer + 1; a := b * answer::integer;
          op := '÷';
        else
          a := floor(random() * 10)::integer + 2; b := floor(random() * 3)::integer + 2;
          op := '^'; answer := a ^ b;
      end case;

    else
      -- Diversificado: ecuación de un paso o porcentaje.
      if random() < 0.5 then
        a := floor(random() * 15)::integer + 1; answer := floor(random() * 15)::integer + 1; b := a + answer::integer;
        op := 'x+';
      else
        a := v_percents[floor(random() * array_length(v_percents, 1))::integer + 1];
        b := v_bases[floor(random() * array_length(v_bases, 1))::integer + 1];
        answer := round(a * b / 100.0);
        op := '%';
      end if;
    end if;

    question := case op
      when '+' then a || ' + ' || b
      when '-' then a || ' - ' || b
      when '×' then a || ' × ' || b
      when '÷' then a || ' ÷ ' || b
      when '^' then a || '^' || b
      when 'x+' then 'x + ' || a || ' = ' || b || '  (¿cuánto vale x?)'
      when '%' then '¿Cuánto es el ' || a || '% de ' || b || '?'
    end;

    v_problems := v_problems || jsonb_build_object('question', question, 'answer', answer);
  end loop;

  return v_problems;
end;
$$;

-- RPC: acepta el desafío y genera los problemas (según el grado de quien
-- retó) -- no necesita IA, así que no hace falta llamar a ninguna edge
-- function desde el cliente para este juego.
create or replace function public.accept_timed_math_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_grade text;
  v_problems jsonb;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.status != 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  select grade into v_grade from public.students where id = v_duel.challenger_id;
  v_problems := public.generate_math_problems(v_grade, v_duel.problem_count);

  update public.student_timed_math_duels set problems = v_problems, status = 'active' where id = p_duel_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.accept_timed_math_duel(uuid) to authenticated;

-- RPC: arranca el reloj del jugador que llama (idempotente) y devuelve
-- solo los enunciados (sin las respuestas).
create or replace function public.start_timed_math_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_questions jsonb;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.problems is null then
    raise exception 'Este desafío aún no tiene problemas generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_timed_math_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_timed_math_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  select jsonb_agg(q -> 'question') into v_questions from jsonb_array_elements(v_duel.problems) q;
  return jsonb_build_object('questions', v_questions);
end;
$$;

grant execute on function public.start_timed_math_duel(uuid) to authenticated;

-- RPC: recibe las respuestas, valida EN SERVIDOR contra los problemas
-- reales (nunca viajaron al cliente) y calcula el tiempo tomado.
create or replace function public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_len integer;
  i integer;
  v_correct numeric;
  v_given text;
  v_score integer := 0;
  v_time_ms integer;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_timed_math_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_len := jsonb_array_length(v_duel.problems);
  for i in 0..v_len - 1 loop
    v_correct := (v_duel.problems -> i ->> 'answer')::numeric;
    v_given := p_answers ->> i;
    begin
      if v_given is not null and v_given::numeric = v_correct then
        v_score := v_score + 1;
      end if;
    exception when others then
      -- respuesta no numérica (dejó el campo vacío o escribió texto) -- cuenta como mal, no rompe el submit.
      null;
    end;
  end loop;

  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_timed_math_results (duel_id, student_id, score, time_ms)
    values (p_duel_id, auth.uid(), v_score, v_time_ms);

  return jsonb_build_object('score', v_score, 'total', v_len, 'time_ms', v_time_ms);
end;
$$;

grant execute on function public.submit_timed_math_result(uuid, jsonb) to authenticated;

-- Liquidación automática: gana quien tuvo más correctas; si empatan en
-- correctas, gana quien fue más rápido; si empatan en todo, no hay ganador.
create or replace function public.settle_student_timed_math_duel()
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
  select * into v_duel from public.student_timed_math_duels where id = new.duel_id;
  if v_duel.status = 'completed' then
    return new;
  end if;

  select count(*) into v_count from public.student_timed_math_results where duel_id = new.duel_id;
  if v_count < 2 then
    return new;
  end if;

  select
    max(case when student_id = v_duel.challenger_id then score end) as challenger_score,
    max(case when student_id = v_duel.challenger_id then time_ms end) as challenger_time,
    max(case when student_id = v_duel.opponent_id then score end) as opponent_score,
    max(case when student_id = v_duel.opponent_id then time_ms end) as opponent_time
  into v_results
  from public.student_timed_math_results where duel_id = new.duel_id;

  if v_results.challenger_score > v_results.opponent_score then
    v_winner_id := v_duel.challenger_id;
  elsif v_results.opponent_score > v_results.challenger_score then
    v_winner_id := v_duel.opponent_id;
  elsif v_results.challenger_time < v_results.opponent_time then
    v_winner_id := v_duel.challenger_id;
  elsif v_results.opponent_time < v_results.challenger_time then
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

  update public.student_timed_math_duels
    set status = 'completed', winner_id = v_winner_id, resolved_at = timezone('utc', now())
    where id = new.duel_id;

  return new;
end;
$$;

drop trigger if exists trg_settle_student_timed_math_duel on public.student_timed_math_results;
create trigger trg_settle_student_timed_math_duel
  after insert on public.student_timed_math_results
  for each row execute function public.settle_student_timed_math_duel();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_timed_math_duels'
  ) then
    alter publication supabase_realtime add table public.student_timed_math_duels;
  end if;
end $$;

notify pgrst, 'reload schema';
