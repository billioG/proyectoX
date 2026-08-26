-- ============================================================
-- EVENTOS SORPRESA NOCTURNOS -- quiz relámpago con notificación push
-- real. Un cron nocturno decide al azar si hay evento esta noche y a
-- qué hora (dentro de una franja horaria); otro cron dispara la
-- notificación push a todos los estudiantes suscritos cuando llega la
-- hora, y un tercero liquida el reparto de gemas cuando se acaba el
-- tiempo.
-- ============================================================

-- Suscripciones Web Push (una fila por dispositivo/navegador suscrito).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);
create policy push_subscriptions_select_staff on public.push_subscriptions
  for select using (is_staff());

-- Los eventos en sí.
create table if not exists public.random_events (
  id uuid primary key default gen_random_uuid(),
  scheduled_for timestamptz not null,
  duration_minutes integer not null default 15,
  topic text not null,
  question_count integer not null default 8,
  gem_pool integer not null default 100,
  questions jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed')),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.random_events enable row level security;
-- Antes de 'active' nadie más que staff puede ver las preguntas
-- (se filtran en el edge function que las entrega al alumno de todas
-- formas, pero column-level select restringe correctIndex).
revoke select on public.random_events from authenticated, anon;
grant select (id, scheduled_for, duration_minutes, topic, question_count, gem_pool, status, created_at)
  on public.random_events to authenticated;
create policy random_events_select_staff on public.random_events
  for select using (is_staff());

-- Quién entró al evento y con qué resultado.
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.random_events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz,
  score integer,
  time_taken_ms integer,
  gems_awarded integer not null default 0,
  rank integer,
  unique (event_id, student_id)
);
alter table public.event_participants enable row level security;
create policy event_participants_select_participant on public.event_participants
  for select using (auth.uid() = student_id or is_staff());
create policy event_participants_insert_own on public.event_participants
  for insert with check (auth.uid() = student_id);

notify pgrst, 'reload schema';
