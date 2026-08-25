-- ============================================================
-- Etiquetas de lecciones -- filtrar/agrupar en la biblioteca compartida
-- ============================================================

alter table public.lessons add column if not exists tags text[] not null default '{}';

notify pgrst, 'reload schema';
