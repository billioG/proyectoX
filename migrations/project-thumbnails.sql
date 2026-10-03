-- Miniatura de los proyectos con modelo 3D (STL/OBJ/GLB). Se genera en el
-- navegador al subir y se guarda como data URL JPEG chica (~10-20 KB) en la
-- propia fila, así el feed muestra una vista previa sin bajar el modelo.
-- El CHECK deja guardar SOLO un JPEG en base64 y limita el tamaño: la columna
-- no puede usarse para meter otra cosa ni filas gigantes.
--
-- ADITIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.

alter table public.projects add column if not exists thumbnail_url text;

alter table public.projects drop constraint if exists projects_thumbnail_url_check;
alter table public.projects add constraint projects_thumbnail_url_check
  check (thumbnail_url is null or (thumbnail_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' and length(thumbnail_url) < 150000));

notify pgrst, 'reload schema';
