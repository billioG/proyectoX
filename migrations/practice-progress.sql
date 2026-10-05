-- ============================================================
-- PROGRESO DEL ESTUDIANTE: práctica + retos, por competencia
--
-- "Lo que no se mide no se puede mejorar": la práctica (modo solo, sin rival)
-- se corregía en el teléfono y no dejaba rastro. Ahora cada práctica se
-- registra, y junto con los retos (que ya se guardaban) alimenta:
--   * el estudiante: "Mi progreso" (por competencia, semana a semana, racha)
--   * el docente: progreso de su clase por competencia y por alumno
--   * el coordinador / admin: resumen por centro educativo, grado y sección
--
-- Competencias (se asignan por juego):
--   lectura      <- Comprensión Lectora (quiz)
--   matematica   <- Contrarreloj (timed_math)
--   pensamiento  <- Encontrá el Error (debug)
--   lenguaje     <- Ortografía (spelling) y Ahorcado (hangman: vocabulario)
--
-- Honestidad de los datos: los RETOS se corrigen en el servidor (verificados);
-- la PRÁCTICA se corrige en el teléfono y el alumno la reporta, así que es
-- indicativa (no da gemas ni ranking, por eso no hay incentivo para falsearla).
-- Los reportes las muestran por separado.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Requiere haber corrido antes: student-duels,
-- student-hangman-duels, student-spelling-duels, student-debug-duels,
-- student-timed-math-duels y coordinador-role.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla de práctica (solo se escribe vía log_practice)
-- ------------------------------------------------------------
create table if not exists public.practice_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  client_ref uuid not null,                 -- idempotencia: un reintento de la cola offline no duplica
  game text not null check (game in ('quiz', 'hangman', 'spelling', 'debug', 'timed_math')),
  competency text not null check (competency in ('lectura', 'matematica', 'pensamiento', 'lenguaje')),
  topic text,
  correct integer not null check (correct >= 0),
  total integer not null check (total between 1 and 50),
  score numeric(4, 3) not null check (score between 0 and 1),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  source text not null default 'ai' check (source in ('ai', 'bank')),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_id, client_ref)
);

create index if not exists practice_results_student_idx on public.practice_results (student_id, played_at desc);

alter table public.practice_results enable row level security;
-- Sin acceso directo: todo pasa por las funciones de abajo (SECURITY DEFINER).
revoke all on public.practice_results from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Competencia de cada juego
-- ------------------------------------------------------------
create or replace function public.game_competency(p_game text)
returns text
language sql
immutable
as $$
  select case p_game
    when 'quiz' then 'lectura'
    when 'timed_math' then 'matematica'
    when 'debug' then 'pensamiento'
    when 'hangman' then 'lenguaje'
    when 'spelling' then 'lenguaje'
  end;
$$;

-- ------------------------------------------------------------
-- 3. Registrar una práctica
-- ------------------------------------------------------------
create or replace function public.log_practice(
  p_game text, p_topic text, p_correct integer, p_total integer,
  p_duration_ms integer, p_source text, p_client_ref uuid, p_played_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_played timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  -- Solo estudiantes: si un docente/admin prueba la práctica, no se guarda nada.
  if not exists (select 1 from public.students where id = auth.uid()) then
    return;
  end if;
  if p_game not in ('quiz', 'hangman', 'spelling', 'debug', 'timed_math') then
    raise exception 'Juego no válido';
  end if;
  if p_total is null or p_total < 1 or p_total > 50 or p_correct is null or p_correct < 0 or p_correct > p_total then
    raise exception 'Resultado no válido';
  end if;
  if p_client_ref is null then
    raise exception 'Falta la referencia del registro';
  end if;
  -- Tope por día: evita llenar la tabla con un ciclo.
  if (select count(*) from public.practice_results
        where student_id = auth.uid() and created_at > now() - interval '1 day') >= 300 then
    return;
  end if;

  -- La práctica sin internet se sube después: se acepta la hora del dispositivo
  -- solo si es razonable (hasta 30 días atrás, no del futuro).
  v_played := case
    when p_played_at is null then now()
    when p_played_at > now() + interval '5 minutes' then now()
    when p_played_at < now() - interval '30 days' then now()
    else p_played_at end;

  insert into public.practice_results
    (student_id, client_ref, game, competency, topic, correct, total, score, duration_ms, source, played_at)
  values
    (auth.uid(), p_client_ref, p_game, public.game_competency(p_game), left(p_topic, 200), p_correct, p_total,
     round(p_correct::numeric / p_total, 3), p_duration_ms,
     case when p_source = 'bank' then 'bank' else 'ai' end, v_played)
  on conflict (student_id, client_ref) do nothing;
end;
$$;

grant execute on function public.log_practice(text, text, integer, integer, integer, text, uuid, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 4. Quién puede ver el progreso de un grupo
--    admin; docente de ese grupo; coordinador de un docente de ese grupo.
-- ------------------------------------------------------------
create or replace function public.can_view_group(p_school text, p_grade text, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.teacher_assignments ta
      where ta.school_code = p_school and ta.grade = p_grade and ta.section = p_section
        and (ta.teacher_id = auth.uid() or public.is_coordinator_of(ta.teacher_id))
    );
$$;

grant execute on function public.can_view_group(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Práctica + retos en una sola lista (interna: no se llama desde el cliente)
--    ok = fracción de aciertos (0 a 1).
-- ------------------------------------------------------------
create or replace function public._student_plays(p_ids uuid[], p_since timestamptz)
returns table (student_id uuid, kind text, game text, competency text, topic text, ok numeric, played_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.student_id, 'practice'::text, p.game, p.competency, p.topic, p.score, p.played_at
    from public.practice_results p
    where p.student_id = any(p_ids) and p.played_at >= p_since
  union all
  select a.student_id, 'reto', 'quiz', 'lectura', d.topic,
         least(1, a.score::numeric / nullif(d.question_count, 0)), a.completed_at
    from public.student_duel_answers a join public.student_duels d on d.id = a.duel_id
    where a.student_id = any(p_ids) and a.completed_at >= p_since
  union all
  select r.student_id, 'reto', 'hangman', 'lenguaje', d.topic, case when r.solved then 1 else 0 end, r.completed_at
    from public.student_hangman_results r join public.student_hangman_duels d on d.id = r.duel_id
    where r.student_id = any(p_ids) and r.completed_at >= p_since
  union all
  select r.student_id, 'reto', 'spelling', 'lenguaje', d.topic, case when r.correct then 1 else 0 end, r.completed_at
    from public.student_spelling_results r join public.student_spelling_duels d on d.id = r.duel_id
    where r.student_id = any(p_ids) and r.completed_at >= p_since
  union all
  select r.student_id, 'reto', 'debug', 'pensamiento', d.topic, case when r.correct then 1 else 0 end, r.completed_at
    from public.student_debug_results r join public.student_debug_duels d on d.id = r.duel_id
    where r.student_id = any(p_ids) and r.completed_at >= p_since
  union all
  select r.student_id, 'reto', 'timed_math', 'matematica', 'Cálculo mental',
         least(1, r.score::numeric / nullif(d.problem_count, 0)), r.completed_at
    from public.student_timed_math_results r join public.student_timed_math_duels d on d.id = r.duel_id
    where r.student_id = any(p_ids) and r.completed_at >= p_since;
$$;

revoke all on function public._student_plays(uuid[], timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. Mi progreso (el estudiante)
-- ------------------------------------------------------------
create or replace function public.get_my_progress(p_weeks integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_weeks integer := greatest(2, least(coalesce(p_weeks, 8), 26));
  v_week0 timestamptz := date_trunc('week', now()) - make_interval(weeks => greatest(2, least(coalesce(p_weeks, 8), 26)) - 1);
  v_result jsonb;
  v_streak integer := 0;
  v_day date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Racha: días seguidos con al menos una práctica (cuenta si hoy aún no practicó
  -- pero ayer sí, para no "romperla" antes de que termine el día).
  v_day := current_date;
  if not exists (select 1 from public.practice_results where student_id = auth.uid() and played_at::date = v_day) then
    v_day := v_day - 1;
  end if;
  while v_streak < 365 and exists (
    select 1 from public.practice_results where student_id = auth.uid() and played_at::date = v_day
  ) loop
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  with plays as (
    select * from public._student_plays(array[auth.uid()], v_week0)
  ),
  comps as (
    select unnest(array['lectura', 'matematica', 'pensamiento', 'lenguaje']) as competency
  ),
  weeks as (
    select generate_series(date_trunc('week', v_week0), date_trunc('week', now()), interval '1 week') as wk
  ),
  per_comp as (
    select c.competency,
      count(p.*) filter (where p.kind = 'practice') as practice_n,
      count(p.*) filter (where p.kind = 'reto') as reto_n,
      round(avg(p.ok) * 100) as pct,
      round(avg(p.ok) filter (where p.played_at >= now() - interval '14 days') * 100) as pct_recent,
      round(avg(p.ok) filter (where p.played_at < now() - interval '14 days' and p.played_at >= now() - interval '28 days') * 100) as pct_prev,
      (select jsonb_agg(jsonb_build_object(
          'week', w.wk::date,
          'n', (select count(*) from plays x where x.competency = c.competency and date_trunc('week', x.played_at) = w.wk),
          'pct', (select round(avg(x.ok) * 100) from plays x where x.competency = c.competency and date_trunc('week', x.played_at) = w.wk)
        ) order by w.wk) from weeks w) as weekly
    from comps c left join plays p on p.competency = c.competency
    group by c.competency
  )
  select jsonb_build_object(
    'competencies', (select jsonb_agg(to_jsonb(pc) order by array_position(array['lectura', 'matematica', 'pensamiento', 'lenguaje'], pc.competency)) from per_comp pc),
    'streak_days', v_streak,
    'practice_7d', (select count(*) from plays where kind = 'practice' and played_at >= now() - interval '7 days'),
    'practice_total', (select count(*) from plays where kind = 'practice'),
    'reto_total', (select count(*) from plays where kind = 'reto'),
    'last_practice_at', (select max(played_at) from plays where kind = 'practice'),
    'weakest', (select competency from per_comp where practice_n + reto_n >= 3 order by pct asc, practice_n + reto_n desc limit 1)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_my_progress(integer) to authenticated;

-- ------------------------------------------------------------
-- 7. Progreso de un grupo (docente / coordinador / admin)
-- ------------------------------------------------------------
create or replace function public.get_group_progress(p_school text, p_grade text, p_section text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_since timestamptz;
  v_result jsonb;
begin
  if not public.can_view_group(p_school, p_grade, p_section) then
    raise exception 'No tenés acceso a este grupo';
  end if;
  v_since := now() - make_interval(days => greatest(7, least(coalesce(p_days, 30), 365)));

  with roster as (
    select id, full_name from public.students
    where school_code = p_school and grade = p_grade and section = p_section
      and coalesce(status, 'activo') not in ('baja', 'egresado')
  ),
  plays as (
    -- el doble de ventana para poder comparar contra el período anterior
    select * from public._student_plays((select array_agg(id) from roster), now() - make_interval(days => v_days * 2))
  ),
  cur as (select * from plays where played_at >= v_since),
  prev as (select * from plays where played_at < v_since),
  per_student as (
    select r.id as student_id, r.full_name,
      count(c.*) filter (where c.kind = 'practice') as practice_n,
      count(c.*) filter (where c.kind = 'reto') as reto_n,
      max(c.played_at) as last_activity,
      round(avg(c.ok) * 100) as pct,
      round(avg(c.ok) filter (where c.competency = 'lectura') * 100) as lectura,
      round(avg(c.ok) filter (where c.competency = 'matematica') * 100) as matematica,
      round(avg(c.ok) filter (where c.competency = 'pensamiento') * 100) as pensamiento,
      round(avg(c.ok) filter (where c.competency = 'lenguaje') * 100) as lenguaje,
      (select round(avg(p.ok) * 100) from prev p where p.student_id = r.id) as pct_prev,
      (select max(x.played_at) from plays x where x.student_id = r.id and x.kind = 'practice') as last_practice
    from roster r left join cur c on c.student_id = r.id
    group by r.id, r.full_name
  )
  select jsonb_build_object(
    'days', v_days,
    'class_size', (select count(*) from roster),
    'active_students', (select count(distinct student_id) from cur),
    'practicing_students', (select count(distinct student_id) from cur where kind = 'practice'),
    'practice_n', (select count(*) from cur where kind = 'practice'),
    'reto_n', (select count(*) from cur where kind = 'reto'),
    'competencies', (
      select jsonb_agg(jsonb_build_object(
        'competency', k.competency,
        'plays', (select count(*) from cur where competency = k.competency),
        'pct', (select round(avg(ok) * 100) from cur where competency = k.competency),
        'pct_prev', (select round(avg(ok) * 100) from prev where competency = k.competency),
        'students', (select count(distinct student_id) from cur where competency = k.competency)
      ) order by array_position(array['lectura', 'matematica', 'pensamiento', 'lenguaje'], k.competency))
      from (select unnest(array['lectura', 'matematica', 'pensamiento', 'lenguaje']) as competency) k
    ),
    'students', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.last_activity desc nulls last, s.full_name)
      from per_student s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_group_progress(text, text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 8. Resumen por grupo (coordinador / admin / docente: los que puede ver)
-- ------------------------------------------------------------
create or replace function public.get_groups_progress(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(7, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  with groups as (
    select distinct s.school_code, s.grade, s.section
    from public.students s
    where s.school_code is not null and s.grade is not null and s.section is not null
      and public.can_view_group(s.school_code, s.grade, s.section)
  ),
  roster as (
    select s.id, g.school_code, g.grade, g.section
    from public.students s join groups g
      on g.school_code = s.school_code and g.grade = s.grade and g.section = s.section
    where coalesce(s.status, 'activo') not in ('baja', 'egresado')
  ),
  plays as (
    select p.*, r.school_code, r.grade, r.section
    from public._student_plays((select array_agg(id) from roster), v_since) p
    join roster r on r.id = p.student_id
  ),
  agg as (
    select g.school_code, g.grade, g.section,
      (select count(*) from roster r where r.school_code = g.school_code and r.grade = g.grade and r.section = g.section) as students,
      count(distinct p.student_id) as active,
      count(distinct p.student_id) filter (where p.kind = 'practice') as practicing,
      count(p.*) filter (where p.kind = 'practice') as practice_n,
      count(p.*) filter (where p.kind = 'reto') as reto_n,
      round(avg(p.ok) filter (where p.competency = 'lectura') * 100) as lectura,
      round(avg(p.ok) filter (where p.competency = 'matematica') * 100) as matematica,
      round(avg(p.ok) filter (where p.competency = 'pensamiento') * 100) as pensamiento,
      round(avg(p.ok) filter (where p.competency = 'lenguaje') * 100) as lenguaje
    from groups g
    left join plays p on p.school_code = g.school_code and p.grade = g.grade and p.section = g.section
    group by g.school_code, g.grade, g.section
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'school_code', a.school_code, 'school_name', coalesce(sc.name, a.school_code),
      'grade', a.grade, 'section', a.section, 'students', a.students, 'active', a.active,
      'practicing', a.practicing, 'practice_n', a.practice_n, 'reto_n', a.reto_n,
      'lectura', a.lectura, 'matematica', a.matematica, 'pensamiento', a.pensamiento, 'lenguaje', a.lenguaje
    ) order by coalesce(sc.name, a.school_code), a.grade, a.section), '[]'::jsonb)
  into v_result
  from agg a left join public.schools sc on sc.code = a.school_code;

  return v_result;
end;
$$;

grant execute on function public.get_groups_progress(integer) to authenticated;

notify pgrst, 'reload schema';
