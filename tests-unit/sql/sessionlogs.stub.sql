-- Mínimo para probar migrations/session-logs-idempotency.sql: las tablas de school-nodes.sql que intervienen (sin RLS ni políticas).
create table public.school_nodes (id uuid primary key default gen_random_uuid());
create table public.students (id uuid primary key default gen_random_uuid());
create table public.node_session_logs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references public.school_nodes(id) on delete set null,
  student_id uuid references public.students(id) on delete cascade,
  device text,
  entered_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now())
);
