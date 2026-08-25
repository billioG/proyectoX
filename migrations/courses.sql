-- ============================================================
-- Cursos: contenedor de lecciones ordenadas con bloqueo secuencial
-- (estilo Platzi). Cada lección existente pasa a ser un "recurso"
-- dentro de un curso de un solo paso.
-- ============================================================

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  school_code text not null,
  grade text not null,
  section text not null,
  created_by uuid not null references public.teachers(id),
  is_shared boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.courses enable row level security;

drop policy if exists "courses_select_authenticated" on public.courses;
create policy "courses_select_authenticated"
  on public.courses for select
  to authenticated
  using (true);

drop policy if exists "courses_insert_staff" on public.courses;
create policy "courses_insert_staff"
  on public.courses for insert
  with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "courses_update_own_or_admin" on public.courses;
create policy "courses_update_own_or_admin"
  on public.courses for update
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "courses_delete_own_or_admin" on public.courses;
create policy "courses_delete_own_or_admin"
  on public.courses for delete
  using (created_by = auth.uid() or public.is_admin());

-- Cada lección pasa a ser un recurso dentro de un curso.
alter table public.lessons add column if not exists course_id uuid references public.courses(id) on delete cascade;
alter table public.lessons add column if not exists order_index integer not null default 0;

-- Backfill: toda lección existente sin curso se envuelve en un curso
-- de un solo recurso (mismo título/descripción/clase/etiquetas/dueño).
insert into public.courses (id, title, description, school_code, grade, section, created_by, is_shared, tags, created_at)
select gen_random_uuid(), l.title, l.description, l.school_code, l.grade, l.section, l.created_by, l.is_shared, l.tags, l.created_at
from public.lessons l
where l.course_id is null;

-- Vincula cada lección migrada a su nuevo curso (por coincidencia 1:1
-- creada arriba -- usamos una CTE con row_number para emparejar sin
-- ambigüedad cuando hay títulos duplicados).
with to_migrate as (
  select id, title, description, school_code, grade, section, created_by, created_at,
         row_number() over (partition by title, school_code, grade, section, created_by, created_at order by id) as rn
  from public.lessons
  where course_id is null
),
new_courses as (
  select id, title, description, school_code, grade, section, created_by, created_at,
         row_number() over (partition by title, school_code, grade, section, created_by, created_at order by id) as rn
  from public.courses
  where created_at >= (select coalesce(min(created_at), now()) from public.lessons where course_id is null)
)
update public.lessons l
set course_id = nc.id
from to_migrate tm
join new_courses nc
  on nc.title = tm.title and nc.school_code = tm.school_code and nc.grade = tm.grade
 and nc.section = tm.section and nc.created_by = tm.created_by and nc.created_at = tm.created_at and nc.rn = tm.rn
where l.id = tm.id;

notify pgrst, 'reload schema';
