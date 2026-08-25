-- ============================================================
-- Fase 2: soporte SCORM / H5P para Lecciones
-- ============================================================

-- Bucket público para servir los paquetes SCORM/H5P descomprimidos
-- (HTML/JS/CSS/assets estáticos -- necesitan ser accesibles por URL
-- directa para que el runtime SCORM/H5P los cargue en el iframe).
insert into storage.buckets (id, name, public)
values ('course-content', 'course-content', true)
on conflict (id) do nothing;

drop policy if exists "course_content_public_read" on storage.objects;
create policy "course_content_public_read"
  on storage.objects for select
  using (bucket_id = 'course-content');

drop policy if exists "course_content_staff_write" on storage.objects;
create policy "course_content_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'course-content' and public.is_staff());

drop policy if exists "course_content_staff_delete" on storage.objects;
create policy "course_content_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'course-content' and public.is_staff());

-- Ampliar lessons: nuevos tipos de contenido + carpeta de origen (para
-- poder borrar todos los archivos del bucket cuando se borra la lección).
alter table public.lessons drop constraint if exists lessons_content_type_check;
alter table public.lessons add constraint lessons_content_type_check
  check (content_type in ('video','pdf','image','scorm','h5p'));
alter table public.lessons add column if not exists content_path text;

-- lesson_completions: agregar nota y datos crudos del intento (SCORM/H5P)
alter table public.lesson_completions add column if not exists score numeric;
alter table public.lesson_completions add column if not exists status text;
alter table public.lesson_completions add column if not exists raw_data jsonb;

-- Los alumnos ahora también actualizan su propio registro al reintentar
-- (SCORM permite reabrir y mejorar la nota) -- antes solo podían insertar.
drop policy if exists "lesson_completions_update_own" on public.lesson_completions;
create policy "lesson_completions_update_own"
  on public.lesson_completions for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());
