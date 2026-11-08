-- ============================================================
-- Portal de padres: el enlace personal VENCE y se puede reemplazar.
--
-- Antes el enlace (student_guardians.portal_token) era un token fijo para siempre: si se reenviaba, se perdía o lo veía otra persona,
-- seguía sirviendo indefinidamente. Ahora:
--   * Cada enlace vence a los 180 días (portal_token_expires_at). Los enlaces que ya existen reciben 180 días desde hoy.
--   * El docente (o quien administre al alumno) puede generar un enlace nuevo: regenerate_guardian_portal_token(id). El anterior deja de servir.
--   * La función guardian-portal rechaza enlaces vencidos (y limita los intentos con tokens inválidos por IP).
--
-- ADITIVO. Seguro de re-ejecutar (los enlaces que ya tienen fecha no se tocan). Pegar completo en el SQL Editor de Supabase.
-- Después hay que volver a desplegar la función guardian-portal (cambia index.ts).
-- Requiere guardians.sql (student_guardians y can_manage_student).
-- ============================================================

alter table public.student_guardians add column if not exists portal_token_expires_at timestamptz;

update public.student_guardians set portal_token_expires_at = now() + interval '180 days' where portal_token_expires_at is null;

alter table public.student_guardians alter column portal_token_expires_at set default (now() + interval '180 days');

-- Generar un enlace nuevo: el token anterior deja de funcionar al instante. Devuelve el token nuevo (la app arma el enlace).
create or replace function public.regenerate_guardian_portal_token(p_guardian uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select student_id into v_student from public.student_guardians where id = p_guardian;
  if v_student is null then raise exception 'Padre o encargado no encontrado'; end if;
  if not public.can_manage_student(v_student) then raise exception 'No tienes acceso a este alumno'; end if;
  update public.student_guardians
     set portal_token = v_token, portal_token_expires_at = now() + interval '180 days'
   where id = p_guardian;
  return v_token;
end;
$$;

revoke all on function public.regenerate_guardian_portal_token(uuid) from public, anon;
grant execute on function public.regenerate_guardian_portal_token(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: 1 función, la columna, y 0 enlaces sin fecha de vencimiento.
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'regenerate_guardian_portal_token') as funciones,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'student_guardians' and column_name = 'portal_token_expires_at') as columnas,
       (select count(*) from public.student_guardians where portal_token_expires_at is null) as enlaces_sin_fecha;
