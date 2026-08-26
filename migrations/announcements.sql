-- Ítem 5 (parte 1): avisos in-app. Docente -> a su clase asignada.
-- Admin -> a todos los estudiantes, todos los docentes, o ambos.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('docente', 'admin')),
  audience text not null check (audience in ('students', 'teachers', 'all')),
  school_code text,
  grade text,
  section text,
  title text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_announcements_created on public.announcements (created_at desc);

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements for select using (
  is_staff()
  or (
    sender_role = 'admin' and (
      audience = 'all'
      or (audience = 'students' and exists (select 1 from public.students where id = auth.uid()))
      or (audience = 'teachers' and exists (select 1 from public.teachers where id = auth.uid()))
    )
  )
  or (
    sender_role = 'docente' and exists (
      select 1 from public.students s
      where s.id = auth.uid()
        and s.school_code = announcements.school_code
        and s.grade = announcements.grade
        and s.section = announcements.section
    )
  )
);

create policy announcements_insert on public.announcements for insert with check (
  sender_id = auth.uid() and (
    (sender_role = 'admin' and is_staff())
    or (sender_role = 'docente' and exists (select 1 from public.teachers where id = auth.uid()))
  )
);

-- Marcar leído (una fila por usuario/aviso -- también sirve de contador
-- de "no leídos" restando contra el total de avisos relevantes).
create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default timezone('utc', now()),
  unique (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;
create policy announcement_reads_own on public.announcement_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
