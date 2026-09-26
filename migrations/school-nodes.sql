-- ============================================================
-- Nodos escolares (Raspberry Pi) para escuelas sin internet.
-- Cada nodo sirve la app en la red local de la escuela y se sincroniza
-- con la nube cuando consigue señal (o por USB) vía la edge function
-- node-sync, autenticado con un token propio que SOLO da acceso a su
-- escuela. La llave maestra de Supabase nunca va a la Raspberry.
--
-- Incluye el PIN personal del alumno (se crea en el nodo la primera vez
-- que entra y se sincroniza) y el registro de sesiones en el nodo.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.school_nodes (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  name text not null,
  token_hash text not null unique,
  created_by uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  last_sync_at timestamptz,
  last_sync_info jsonb,
  revoked_at timestamptz
);

alter table public.school_nodes enable row level security;
revoke all on public.school_nodes from anon, authenticated;
grant select (id, school_code, name, created_at, last_sync_at, last_sync_info, revoked_at) on public.school_nodes to authenticated;
drop policy if exists "school_nodes_select_admin" on public.school_nodes;
create policy "school_nodes_select_admin" on public.school_nodes for select using (public.is_admin());

-- PIN personal (hash PBKDF2 hecho en el nodo; la nube solo lo guarda).
alter table public.students add column if not exists pin_hash text;
alter table public.students add column if not exists pin_salt text;
alter table public.students add column if not exists pin_updated_at timestamptz;

create table if not exists public.node_session_logs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references public.school_nodes(id) on delete set null,
  student_id uuid references public.students(id) on delete cascade,
  device text,
  entered_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now())
);
alter table public.node_session_logs enable row level security;
revoke all on public.node_session_logs from anon, authenticated;
grant select on public.node_session_logs to authenticated;
drop policy if exists "node_session_logs_select_staff" on public.node_session_logs;
create policy "node_session_logs_select_staff" on public.node_session_logs for select using (public.is_staff());

-- Registrar un nodo: devuelve el token UNA sola vez (se guarda su hash).
create or replace function public.register_school_node(p_school text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo un admin puede registrar nodos'; end if;
  if not exists (select 1 from public.schools where code = p_school) then raise exception 'Establecimiento no encontrado'; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.school_nodes (school_code, name, token_hash, created_by)
    values (p_school, left(coalesce(nullif(trim(p_name), ''), 'Nodo'), 80), encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.revoke_school_node(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Solo un admin puede revocar nodos'; end if;
  update public.school_nodes set revoked_at = timezone('utc', now()) where id = p_id and revoked_at is null;
end;
$$;

grant execute on function public.register_school_node(text, text) to authenticated;
grant execute on function public.revoke_school_node(uuid) to authenticated;

notify pgrst, 'reload schema';
