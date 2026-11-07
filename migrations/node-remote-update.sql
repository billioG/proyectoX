-- ============================================================
-- Actualizar los servidores escolares (Raspberry) DESDE LA PLATAFORMA EN LÍNEA, sin entrar por SSH.
-- Funciona igual que «Sincronizar ahora» (node-remote-sync.sql): el administrador toca «Actualizar servidores», la nube anota la hora
-- (aquí) y el servidor la ve en su siguiente aviso (node_ping, cada ~30 s) y se actualiza solo (git pull + reinicio).
--
--   * request_node_update(p_school) -- SOLO el administrador (actualizar es ejecutar el código nuevo del proyecto en el servidor).
--                                      Una petición por escuela cada 60 s como máximo. Devuelve a cuántos servidores avisó.
--   * El servidor lee la petición con la función node-sync (columna update_requested_at, vía service_role): NO hace falta otra función SQL.
--
-- Los servidores con una versión vieja (sin esta función) hay que actualizarlos UNA vez a mano: bash ~/quetzal/school-node/install.sh --update
-- Requiere node-remote-sync.sql. ADITIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- Después hay que volver a desplegar la función node-sync (cambian index.ts y validators.ts).
-- ============================================================

alter table public.school_nodes add column if not exists update_requested_at timestamptz;

create or replace function public.request_node_update(p_school text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then raise exception 'Solo un admin puede actualizar servidores'; end if;
  if p_school is null or btrim(p_school) = '' then raise exception 'Indica la escuela'; end if;
  update public.school_nodes set update_requested_at = now()
    where school_code = p_school and revoked_at is null
      and (update_requested_at is null or update_requested_at < now() - interval '60 seconds');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.request_node_update(text) from public, anon;
grant execute on function public.request_node_update(text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: 1 función y 1 columna.
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'request_node_update') as funciones,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'school_nodes' and column_name = 'update_requested_at') as columnas;
