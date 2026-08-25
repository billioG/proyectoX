-- ============================================================
-- Permite que la pantalla de login (sin sesión, rol anon) sepa si un
-- alumno necesita escribir contraseña o no, ANTES de que intente
-- entrar -- sin exponer nada más que ese booleano.
-- ============================================================

create or replace function public.resolve_login_mode_by_username(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select cp.requires_password
      from public.students s
      join public.class_passwords cp
        on cp.school_code = s.school_code and cp.grade = s.grade and cp.section = s.section
      where s.username = p_username
    ),
    true
  );
$$;

grant execute on function public.resolve_login_mode_by_username(text) to anon, authenticated;
