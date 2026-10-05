-- EXÁMENES CON HOJA DE RESPUESTAS (estilo ZipGrade): el docente crea el examen
-- con su clave, imprime una hoja por alumno (con QR) y la califica escaneándola
-- con la cámara. La nota va aparte de los cursos, con su propio punteo.
--
-- Privacidad/seguridad:
--  * La clave de respuestas (exams.answer_key) NUNCA llega a un alumno: la
--    tabla exams solo es legible por su docente y el admin.
--  * El alumno ve sus propias notas solo vía my_exam_results() (sin clave).
--  * No se guarda ninguna foto, solo las respuestas leídas y la nota.
--
-- ADITIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_code text not null,
  grade text not null,
  section text not null,
  title text not null check (char_length(title) between 1 and 120),
  bimestre integer not null default 1 check (bimestre between 1 and 4),
  question_count integer not null check (question_count between 1 and 100),
  answer_key text not null,
  points numeric(6,2) not null default 10 check (points > 0 and points <= 1000),
  created_at timestamptz not null default now(),
  constraint exams_key_check check (char_length(answer_key) = question_count and answer_key ~ '^[A-E]+$')
);

create index if not exists exams_teacher_idx on public.exams (teacher_id);

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  answers text not null check (answers ~ '^[A-E*-]+$'),   -- una letra por pregunta; '-' en blanco, '*' doble marca
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  blank integer not null check (blank >= 0),
  score numeric(6,2) not null check (score >= 0),
  scanned_by uuid,
  scanned_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index if not exists exam_results_student_idx on public.exam_results (student_id);

alter table public.exams enable row level security;
alter table public.exam_results enable row level security;
revoke all on public.exams, public.exam_results from anon;
-- Permisos explícitos (no depender de los privilegios por defecto del
-- proyecto); lo que realmente se puede hacer lo limita la RLS de abajo.
grant select, insert, update, delete on public.exams, public.exam_results to authenticated;

drop policy if exists exams_manage_own on public.exams;
create policy exams_manage_own on public.exams
  for all
  using (teacher_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      teacher_id = auth.uid()
      and exists (
        select 1 from public.teacher_assignments ta
        where ta.teacher_id = auth.uid()
          and ta.school_code = exams.school_code and ta.grade = exams.grade and ta.section = exams.section
      )
    )
  );

drop policy if exists exam_results_manage_teacher on public.exam_results;
create policy exam_results_manage_teacher on public.exam_results
  for all
  using (
    exists (select 1 from public.exams e where e.id = exam_results.exam_id and (e.teacher_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (
      select 1
      from public.exams e
      join public.students s on s.id = exam_results.student_id
      where e.id = exam_results.exam_id
        and (e.teacher_id = auth.uid() or public.is_admin())
        and s.school_code = e.school_code and s.grade = e.grade and s.section = e.section
        and char_length(exam_results.answers) = e.question_count
    )
  );

drop policy if exists exam_results_select_own on public.exam_results;
create policy exam_results_select_own on public.exam_results
  for select using (student_id = auth.uid());

create or replace function public.my_exam_results()
returns table (
  exam_id uuid, title text, bimestre integer, points numeric,
  score numeric, correct integer, wrong integer, blank integer, question_count integer, scanned_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.bimestre, e.points, r.score, r.correct, r.wrong, r.blank, e.question_count, r.scanned_at
  from public.exam_results r
  join public.exams e on e.id = r.exam_id
  where r.student_id = auth.uid()
  order by r.scanned_at desc;
$$;
grant execute on function public.my_exam_results() to authenticated;

notify pgrst, 'reload schema';
