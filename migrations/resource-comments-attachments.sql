-- ============================================================
-- Permite adjuntar una imagen/archivo a un comentario de recurso --
-- pedido para que los alumnos puedan mandar evidencia (capturas,
-- fotos) cuando se les pide trabajar algo fuera de clase (ej. clase
-- invertida, suspensión de clases).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.resource_comments add column if not exists attachment_url text;

insert into storage.buckets (id, name, public)
values ('comment-attachments', 'comment-attachments', true)
on conflict (id) do nothing;

drop policy if exists "comment_attachments_public_read" on storage.objects;
create policy "comment_attachments_public_read" on storage.objects
  for select using (bucket_id = 'comment-attachments');

drop policy if exists "comment_attachments_authenticated_write" on storage.objects;
create policy "comment_attachments_authenticated_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comment-attachments');
