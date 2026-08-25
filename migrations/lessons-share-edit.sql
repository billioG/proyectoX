-- ============================================================
-- Lecciones: compartir en biblioteca global + edición de metadata
-- ============================================================

alter table public.lessons add column if not exists is_shared boolean not null default false;

notify pgrst, 'reload schema';
