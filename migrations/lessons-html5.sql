-- ============================================================
-- Permite content_type='html5' (y confirma 'quiz', ya en uso pero sin
-- migración que lo documentara) en lessons.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.lessons drop constraint if exists lessons_content_type_check;
alter table public.lessons add constraint lessons_content_type_check
  check (content_type in ('video','pdf','image','scorm','h5p','html5','quiz'));
