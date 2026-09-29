-- ============================================================
-- CRÍTICO: admin_reset_user_password y reset_password_via_admin estaban
-- otorgadas a "anon" (cualquiera, sin sesión) -- toma de cuenta sin login.
--
-- 1. admin_reset_user_password(user_id, new_password): no tenía NINGÚN
--    chequeo de permiso. Cualquiera con la clave pública (anon key, que
--    está en el HTML de la app) podía llamar
--    supabase.rpc('admin_reset_user_password', {user_id, new_password})
--    y cambiar la contraseña de CUALQUIER cuenta, sin sesión.
--
-- 2. reset_password_via_admin(target_email, new_password): tenía un
--    chequeo de rol, pero roto -- sin sesión, auth.uid() es NULL, la
--    consulta del rol no encuentra fila, y en Postgres
--    "NULL NOT IN (...)" no es verdadero (es "desconocido"), así que el
--    IF nunca disparaba la excepción y seguía de largo hasta cambiar la
--    contraseña de cualquier cuenta por email, sin login.
--
-- Ninguna de las dos la usa el código actual de la app (js/ ni
-- supabase/functions/) -- quedaron expuestas por el permiso "GRANT ALL"
-- por defecto de Supabase al crearlas, sin que nada las necesite. Se les
-- saca el acceso a anon y se les agrega un chequeo real de is_admin(),
-- más search_path fijo (buena práctica en SECURITY DEFINER).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase YA (es explotable en producción tal como está).
-- ============================================================

revoke all on function public.admin_reset_user_password(uuid, text) from anon, authenticated, public;
revoke all on function public.reset_password_via_admin(text, text) from anon, authenticated, public;

create or replace function public.admin_reset_user_password(user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede resetear contraseñas';
  end if;
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = user_id;
end;
$$;

create or replace function public.reset_password_via_admin(target_email text, new_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select role into requester_role from public.profiles where id = auth.uid();

  if requester_role is null or requester_role not in ('admin', 'docente') then
    raise exception 'Solo docentes pueden cambiar claves.';
  end if;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where email = target_email;

  return 'OK';
end;
$$;

grant execute on function public.admin_reset_user_password(uuid, text) to authenticated;
grant execute on function public.reset_password_via_admin(text, text) to authenticated;

notify pgrst, 'reload schema';
