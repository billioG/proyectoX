-- Conexión con Tinkercad: (1) link a la Clase de Tinkercad del docente,
-- visible como botón en cada curso del alumno; (2) nuevo tipo de recurso
-- de lección "tinkercad" para embeber un diseño/circuito puntual (iframe).

alter table public.courses add column if not exists tinkercad_class_url text;

alter table public.lessons drop constraint if exists lessons_content_type_check;
alter table public.lessons add constraint lessons_content_type_check
  check (content_type in ('video','pdf','image','scorm','h5p','html5','quiz','tinkercad'));
