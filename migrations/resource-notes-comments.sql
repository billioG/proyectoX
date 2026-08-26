-- Notas personales (privadas) y comentarios de equipo por recurso (lesson).
-- Notas: solo el propio estudiante las ve/edita.
-- Comentarios: solo compañeros del mismo grupo/equipo + docentes/admin (is_staff()).
-- Ambos pasan por un filtro de malas palabras server-side antes de guardarse.

create table if not exists public.resource_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table if not exists public.resource_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  author_role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists resource_comments_lesson_group_idx on public.resource_comments (lesson_id, group_id);

alter table public.resource_notes enable row level security;
alter table public.resource_comments enable row level security;

drop policy if exists resource_notes_select_own on public.resource_notes;
create policy resource_notes_select_own on public.resource_notes
  for select using (auth.uid() = student_id);

drop policy if exists resource_notes_insert_own on public.resource_notes;
create policy resource_notes_insert_own on public.resource_notes
  for insert with check (auth.uid() = student_id);

drop policy if exists resource_notes_update_own on public.resource_notes;
create policy resource_notes_update_own on public.resource_notes
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

drop policy if exists resource_notes_delete_own on public.resource_notes;
create policy resource_notes_delete_own on public.resource_notes
  for delete using (auth.uid() = student_id);

drop policy if exists resource_comments_select on public.resource_comments;
create policy resource_comments_select on public.resource_comments
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = resource_comments.group_id and gm.student_id = auth.uid()
    )
  );

drop policy if exists resource_comments_insert on public.resource_comments;
create policy resource_comments_insert on public.resource_comments
  for insert with check (
    auth.uid() = author_id
    and (
      public.is_staff()
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = resource_comments.group_id and gm.student_id = auth.uid()
      )
    )
  );

drop policy if exists resource_comments_delete on public.resource_comments;
create policy resource_comments_delete on public.resource_comments
  for delete using (auth.uid() = author_id or public.is_staff());

-- Filtro de malas palabras (servidor -- no confiar solo en el cliente).
create or replace function public.contains_profanity(txt text)
returns boolean
language sql
immutable
as $$
  select txt ~* '\y(mierda|pendej[oa]|idiota|est[uú]pid[oa]|imb[eé]cil|put[oa]|maric[oó]n|cabr[oó]n|verga|culer[oa]|gilipollas|joder|hijueputa|hijo de puta|malparid[oa]|carajo|zorra|perra|weon|hue[oó]n)\y'
$$;

create or replace function public.enforce_no_profanity()
returns trigger
language plpgsql
as $$
begin
  if public.contains_profanity(new.content) then
    raise exception 'CONTENIDO_INAPROPIADO: el texto contiene lenguaje no permitido';
  end if;
  return new;
end;
$$;

drop trigger if exists resource_notes_profanity on public.resource_notes;
create trigger resource_notes_profanity before insert or update on public.resource_notes
  for each row execute function public.enforce_no_profanity();

drop trigger if exists resource_comments_profanity on public.resource_comments;
create trigger resource_comments_profanity before insert or update on public.resource_comments
  for each row execute function public.enforce_no_profanity();

notify pgrst, 'reload schema';
