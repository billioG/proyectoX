-- ============================================================
-- Almacenamiento de fotos, videos y evidencias de estudiantes y docentes: cerrar el listado público y limitar los tipos de archivo.
--
-- Buckets: profile-photos, project-videos, comment-attachments, teacher-evidence.
--
-- Problema: hasta hoy cualquiera con la clave pública (que va en el HTML), SIN iniciar sesión, podía LISTAR todos los archivos de esos buckets
-- (hay políticas de lectura sin rol, p. ej. comment_attachments_public_read), y cualquier tipo de archivo (HTML, SVG con scripts) podía subirse a ellos.
--
-- Qué hace (PASO 1 de 2; las direcciones que la app ya guardó siguen funcionando igual mientras los buckets sigan públicos):
--   1. Quita las políticas de LECTURA (select) de esos buckets que no pidan sesión, y deja UNA sola: solo `authenticated` (con sesión iniciada).
--      Las direcciones públicas de los archivos siguen abriéndose (un bucket público no consulta esta política); lo que desaparece es listar sin sesión.
--   2. Limita los tipos de archivo que acepta cada bucket (imágenes, videos, audio, PDF, ofimática, zip y binarios de modelos 3D). HTML, SVG y scripts quedan fuera.
--   3. NO toca políticas de escritura ni de borrado. Si hay una política ALL (que mezcla lectura y escritura) sobre esos buckets, solo la AVISA.
--
-- El PASO 2 (hacerlos privados de verdad) es storage-private-buckets.sql: aplicarlo después de probar la app con la versión que firma las direcciones (v1.0.246+).
--
-- Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase (como postgres, dueño de storage.objects).
-- ============================================================

do $$
declare
  v_buckets constant text[] := array['profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence'];
  r record;
  v_dropped integer := 0;
begin
  -- 1a. Políticas de lectura de esos buckets que no exigen sesión (rol public/anon o sin rol): se eliminan.
  for r in
    select policyname, cmd, roles, coalesce(qual, '') as qual
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname <> 'private_media_select_authenticated'
      and exists (select 1 from unnest(v_buckets) b where coalesce(qual, '') like '%' || b || '%')
  loop
    if r.cmd = 'SELECT' and (r.roles::text ~* '(public|anon)') then
      execute format('drop policy %I on storage.objects', r.policyname);
      v_dropped := v_dropped + 1;
      raise notice 'Eliminada la política de lectura sin sesión: %', r.policyname;
    elsif r.cmd = 'ALL' then
      raise notice 'REVISAR A MANO: la política «%» (ALL, roles %) mezcla lectura y escritura sobre estos buckets; no se tocó.', r.policyname, r.roles;
    end if;
  end loop;
  raise notice 'storage-hardening: % política(s) de lectura sin sesión eliminadas.', v_dropped;
end $$;

-- 1b. La única lectura que queda: con sesión iniciada (necesaria para firmar direcciones y para listar o borrar desde la app).
drop policy if exists "private_media_select_authenticated" on storage.objects;
create policy "private_media_select_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence'));

-- 2. Tipos de archivo permitidos.
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
 where id = 'profile-photos';

update storage.buckets
   set allowed_mime_types = array[
     'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
     'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-matroska',
     'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav',
     'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'text/plain',
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
   ]
 where id in ('project-videos', 'comment-attachments', 'teacher-evidence');

notify pgrst, 'reload schema';

-- ---------- Verificación ----------
-- (a) Lecturas de esos buckets: debe quedar UNA, solo para authenticated, y ninguna para public/anon.
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, '') ~ '(profile-photos|project-videos|comment-attachments|teacher-evidence)'
order by cmd, policyname;

-- (b) Tipos permitidos por bucket.
select id, public, allowed_mime_types is not null as tipos_limitados
from storage.buckets
where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence')
order by id;

-- ---------- Deshacer ----------
-- update storage.buckets set allowed_mime_types = null where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence');
-- drop policy "private_media_select_authenticated" on storage.objects;
-- create policy "comment_attachments_public_read" on storage.objects for select using (bucket_id = 'comment-attachments');
-- (y recrear las demás lecturas públicas que hubiera, según las que se hayan eliminado arriba)
