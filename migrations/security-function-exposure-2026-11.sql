-- ============================================================
-- FUNCIONES SECURITY DEFINER EXPUESTAS A "anon" -- NOVIEMBRE 2026
--
-- Problema: en Supabase toda función nueva queda ejecutable por "anon" (cualquiera con la clave pública, que está en el HTML de
-- la app, SIN iniciar sesión) por el permiso EXECUTE que da PUBLIC y por los permisos por defecto del esquema. En el volcado de producción
-- (supabase/schema.sql) 86 de 90 funciones SECURITY DEFINER eran ejecutables por anon. Una función DEFINER corre con los permisos de su
-- dueño: si le falta un chequeo de auth.uid() es una puerta abierta (así pasó con admin_reset_user_password, ver
-- fix-password-reset-rpc-exposure.sql). Las funciones con chequeo siguen seguras, pero depender de que CADA UNA lo tenga es frágil.
--
-- Qué hace (defensa en profundidad):
--   1. A toda función SECURITY DEFINER del esquema public le quita EXECUTE a PUBLIC y a anon, excepto las que la app llama ANTES de
--      iniciar sesión (lista de abajo: solo las 2 de la pantalla de ingreso).
--   2. Conserva lo que tenían authenticated y service_role (si podían ejecutarla, siguen pudiendo): la app con sesión no cambia.
--   3. Deja de dar EXECUTE a anon por defecto a las funciones que se creen de aquí en adelante.
--
-- Lo que NO afecta: Edge Functions (usan service_role), nodo escolar, la app con sesión iniciada, el Portal de padres (usa una Edge Function).
-- Si algo de la pantalla de ingreso dejara de funcionar: ver la sección "Deshacer" al final.
--
-- Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase (como postgres, dueño de las funciones).
-- ============================================================

begin;
set local lock_timeout = '10s';

do $$
declare
  -- Funciones que anon SÍ necesita (pantalla de ingreso, antes de tener sesión). Agregar aquí cualquier otra que se descubra.
  v_anon_allowed constant text[] := array['resolve_login_mode_by_username', 'get_class_login_mode'];
  r record;
  v_auth boolean;
  v_service boolean;
  v_revoked integer := 0;
  v_kept integer := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
  loop
    if r.proname = any (v_anon_allowed) then
      v_kept := v_kept + 1;
      continue;
    end if;

    -- Se anota lo que tenían ANTES (PUBLIC cuenta para todos los roles).
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', r.oid, 'EXECUTE');

    execute format('revoke all on function %s from public, anon', r.sig);

    if v_auth then execute format('grant execute on function %s to authenticated', r.sig); end if;
    if v_service then execute format('grant execute on function %s to service_role', r.sig); end if;
    v_revoked := v_revoked + 1;
  end loop;
  raise notice 'security-function-exposure: % función(es) cerradas a anon, % se dejaron abiertas (pantalla de ingreso).', v_revoked, v_kept;
end $$;

-- Las funciones que se creen de aquí en adelante tampoco quedan abiertas a anon (el dueño que corre esto es postgres).
-- (authenticated y service_role siguen recibiendo EXECUTE por los permisos por defecto de Supabase; PUBLIC es el permiso implícito de Postgres.)
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

notify pgrst, 'reload schema';

commit;

-- ---------- Verificación: funciones DEFINER que anon todavía puede ejecutar (deben ser solo las 2 de ingreso) ----------
select p.proname as funcion_abierta_a_anon
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

-- ---------- Deshacer (SOLO si algo de la pantalla de ingreso dejó de funcionar; reabre la puerta) ----------
-- grant execute on function public.NOMBRE(argumentos) to anon;      -- una sola función, la que haga falta
-- (y avísalo: esa función debe sumarse a la lista v_anon_allowed de este archivo, tras revisar que tenga su chequeo de auth.uid())
