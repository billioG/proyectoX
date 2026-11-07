-- ============================================================
-- Gestionar servidores escolares (Raspberry) desde la plataforma: renombrar y eliminar.
-- (Revocar ya existía: revoke_school_node, en school-nodes.sql.)
--
--   * rename_school_node(p_id, p_name)  -- solo administrador; nombre de 1 a 80 caracteres.
--   * delete_school_node(p_id)          -- solo administrador; solo si el nodo está REVOCADO o NUNCA se ha conectado.
--                                          Un nodo en uso hay que revocarlo primero (así nadie borra por error la Raspberry real).
--
-- ADITIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- No cambia la función node-sync.
-- ============================================================

create or replace function public.rename_school_node(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_admin() then raise exception 'Solo un admin puede renombrar nodos'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then raise exception 'El nombre debe tener entre 1 y 80 caracteres'; end if;
  update public.school_nodes set name = v_name where id = p_id;
  if not found then raise exception 'Nodo no encontrado'; end if;
end;
$$;

create or replace function public.delete_school_node(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node public.school_nodes%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo un admin puede eliminar nodos'; end if;
  select * into v_node from public.school_nodes where id = p_id;
  if not found then raise exception 'Nodo no encontrado'; end if;
  if v_node.revoked_at is null and v_node.last_seen_at is not null then
    raise exception 'Revócalo primero: solo se pueden eliminar nodos revocados o que nunca se conectaron';
  end if;
  delete from public.school_nodes where id = p_id;
end;
$$;

revoke all on function public.rename_school_node(uuid, text) from public, anon;
revoke all on function public.delete_school_node(uuid) from public, anon;
grant execute on function public.rename_school_node(uuid, text) to authenticated;
grant execute on function public.delete_school_node(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: debe devolver las 2 funciones.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('rename_school_node', 'delete_school_node') order by 1;
