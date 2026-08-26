-- Las notas privadas eran un único registro que se sobreescribía (upsert).
-- Pasan a ser una lista tipo comentarios, pero privada (solo el autor la ve).
alter table public.resource_notes drop constraint if exists resource_notes_lesson_id_student_id_key;
alter table public.resource_notes add column if not exists created_at timestamptz not null default now();

notify pgrst, 'reload schema';
