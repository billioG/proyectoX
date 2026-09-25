-- ============================================================
-- Suscripciones push vía RPC:
--   1. Tablets compartidas: un navegador tiene UN endpoint. Si el alumno A
--      activó push y después entra B en la misma tablet, el upsert directo
--      del cliente sobre la fila de A lo bloqueaba RLS (o la dejaba a
--      nombre de A) -- B no recibía nada y A recibía en una tablet ajena.
--      El RPC reasigna el endpoint al usuario que llama.
--   2. El rol lo mandaba el cliente (window.userRole): un alumno podía
--      registrarse como 'admin' y recibir los push de admin. Ahora lo
--      deduce el servidor.
--   3. Al cerrar sesión se desvincula el endpoint de ese usuario.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción inválida';
  end if;

  if exists (select 1 from public.students where id = v_uid) then
    v_role := 'estudiante';
  else
    select case when role in ('admin', 'coordinador') then role else 'docente' end into v_role
      from public.teachers where id = v_uid;
  end if;
  if v_role is null then
    raise exception 'Usuario no encontrado';
  end if;

  insert into public.push_subscriptions (user_id, role, endpoint, p256dh, auth)
    values (v_uid, v_role, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint)
    do update set user_id = excluded.user_id, role = excluded.role, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

grant execute on function public.register_push_subscription(text, text, text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- Escrituras solo por los RPCs de arriba (las edge functions usan
-- service_role y no se ven afectadas). SELECT queda como estaba.
revoke insert, update, delete on public.push_subscriptions from authenticated, anon;

-- Filas viejas registradas con un rol que no corresponde (ej. un alumno
-- como 'admin') se corrigen al rol real.
update public.push_subscriptions ps set role = 'estudiante'
  where exists (select 1 from public.students s where s.id = ps.user_id) and ps.role <> 'estudiante';

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR (consola, logueado) -- debe fallar con "permission denied":
--   await window._supabase.from('push_subscriptions').update({ role: 'admin' }).eq('user_id', window.currentUser.id)
-- ============================================================
