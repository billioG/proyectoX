-- ============================================================
-- Entrada de los docentes al nodo escolar con la MISMA contraseña de su cuenta (sin PIN aparte).
--
-- La función node-sync (service_role) necesita la huella bcrypt de la contraseña de cada docente de la escuela para mandarla al
-- nodo, que la usa para validar el login sin internet. La huella (no la contraseña) ya vive en auth.users; esta función solo la
-- expone a service_role, y SOLO de usuarios que son docentes (tabla teachers). Nadie más puede ejecutarla: ni anon ni authenticated.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.node_teacher_password_hashes(p_ids uuid[])
returns table (teacher_id uuid, email text, password_hash text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, lower(u.email)::text, u.encrypted_password::text
  from auth.users u
  join public.teachers t on t.id = u.id
  where u.id = any(p_ids)
    and u.deleted_at is null
    and u.email is not null
    and u.encrypted_password like '$2%';
$$;

revoke all on function public.node_teacher_password_hashes(uuid[]) from public, anon, authenticated;
grant execute on function public.node_teacher_password_hashes(uuid[]) to service_role;

notify pgrst, 'reload schema';
