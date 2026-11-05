-- ============================================================
-- Sincronizar la Raspberry DESDE LA PLATAFORMA EN LÍNEA. El docente (o el administrador) entra a Quetzal desde su computadora con internet, ve el estado de los servidores de su escuela y toca
-- «Sincronizar ahora»; no necesita saber la dirección IP de la Raspberry. Cómo funciona:
--   * cada servidor escolar avisa a la nube cada ~30 s (acción node_ping de node-sync, con su token): la nube guarda cuándo lo vio y su estado (cambios por subir, si está sincronizando, paso...).
--   * «Sincronizar ahora» solo anota la hora de la petición (request_node_sync); el servidor la ve en su siguiente aviso y sincroniza.
--   * la pantalla lee el estado con get_school_nodes (solo del personal asignado a esa escuela, o el administrador). Nunca se exponen tokens ni hashes.
--
-- Requiere school-nodes.sql. ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

alter table public.school_nodes add column if not exists last_seen_at timestamptz;
alter table public.school_nodes add column if not exists sync_requested_at timestamptz;
alter table public.school_nodes add column if not exists node_status jsonb;

-- ¿Puede esta persona ver y pedir sincronizar los servidores de esa escuela? Administrador, o docente asignado a la escuela.
create or replace function public.can_manage_school_nodes(p_school text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (select 1 from public.teacher_assignments ta where ta.teacher_id = auth.uid() and ta.school_code = p_school);
$$;

revoke all on function public.can_manage_school_nodes(text) from public, anon;
grant execute on function public.can_manage_school_nodes(text) to authenticated;

-- Estado de los servidores de la escuela (o de todas, para el administrador, si p_school es null). Sin token ni datos sensibles.
create or replace function public.get_school_nodes(p_school text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_school is null and not public.is_admin() then raise exception 'Indica la escuela'; end if;
  if p_school is not null and not public.can_manage_school_nodes(p_school) then raise exception 'No tienes acceso a esa escuela'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'name', n.name, 'school_code', n.school_code, 'school_name', coalesce(s.name, n.school_code),
      'last_seen_at', n.last_seen_at, 'last_sync_at', n.last_sync_at, 'sync_requested_at', n.sync_requested_at, 'status', coalesce(n.node_status, '{}'::jsonb)
    ) order by coalesce(s.name, n.school_code), n.name)
    from public.school_nodes n left join public.schools s on s.code = n.school_code
    where n.revoked_at is null and (p_school is null or n.school_code = p_school)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_school_nodes(text) from public, anon;
grant execute on function public.get_school_nodes(text) to authenticated;

-- «Sincronizar ahora»: anota la petición para los servidores de la escuela (devuelve a cuántos). Una cada 10 s como máximo por escuela.
create or replace function public.request_node_sync(p_school text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_school is null or not public.can_manage_school_nodes(p_school) then raise exception 'No tienes acceso a esa escuela'; end if;
  update public.school_nodes set sync_requested_at = now()
    where school_code = p_school and revoked_at is null
      and (sync_requested_at is null or sync_requested_at < now() - interval '10 seconds');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.request_node_sync(text) from public, anon;
grant execute on function public.request_node_sync(text) to authenticated;

-- Lo usa node-sync (service_role) cuando el servidor avisa: guarda cuándo lo vio y su estado, y devuelve la última petición de sincronizar.
create or replace function public.node_heartbeat(p_node uuid, p_status jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested timestamptz;
begin
  update public.school_nodes set last_seen_at = now(), node_status = coalesce(p_status, '{}'::jsonb)
    where id = p_node and revoked_at is null
    returning sync_requested_at into v_requested;
  return v_requested;
end;
$$;

revoke all on function public.node_heartbeat(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.node_heartbeat(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
