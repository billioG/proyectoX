-- ============================================================
-- PIN de docente para entrar al nodo escolar sin internet.
--
-- El docente lo fija EN LÍNEA, en su perfil de la app: no hay código compartido para crearlo ni se crea en el nodo.
-- El navegador calcula el hash (PBKDF2-SHA256, 150000 vueltas, el mismo esquema que el PIN de estudiantes y la
-- contraseña de clase) y manda SOLO el hash y la sal: el servidor nunca ve el PIN. La función node-sync (service_role)
-- los baja al nodo de cada escuela donde el docente está asignado, junto con la huella de su correo.
--
-- La tabla no se puede leer ni escribir desde la app (RLS sin políticas y sin permisos): solo estas funciones
-- y service_role. ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.teacher_node_pins (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  pin_hash text not null check (pin_hash ~ '^[0-9a-f]{64}$'),
  pin_salt text not null check (pin_salt ~ '^[0-9a-f]{32}$'),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.teacher_node_pins enable row level security;
revoke all on public.teacher_node_pins from anon, authenticated;
grant select on public.teacher_node_pins to service_role;

create or replace function public.set_teacher_node_pin(p_hash text, p_salt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from public.teachers where id = auth.uid()) then
    raise exception 'Solo docentes pueden fijar este PIN';
  end if;
  if p_hash is null or p_salt is null or p_hash !~ '^[0-9a-f]{64}$' or p_salt !~ '^[0-9a-f]{32}$' then
    raise exception 'PIN inválido';
  end if;

  insert into public.teacher_node_pins (teacher_id, pin_hash, pin_salt, updated_at)
  values (auth.uid(), p_hash, p_salt, timezone('utc', now()))
  on conflict (teacher_id) do update
    set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.has_teacher_node_pin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.teacher_node_pins where teacher_id = auth.uid());
$$;

create or replace function public.clear_teacher_node_pin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  delete from public.teacher_node_pins where teacher_id = auth.uid();
end;
$$;

revoke all on function public.set_teacher_node_pin(text, text) from public, anon;
revoke all on function public.has_teacher_node_pin() from public, anon;
revoke all on function public.clear_teacher_node_pin() from public, anon;
grant execute on function public.set_teacher_node_pin(text, text) to authenticated;
grant execute on function public.has_teacher_node_pin() to authenticated;
grant execute on function public.clear_teacher_node_pin() to authenticated;

notify pgrst, 'reload schema';
