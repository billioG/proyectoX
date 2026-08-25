-- ============================================================
-- Contraseña por clase (escuela + grado + sección) estilo Kolibri:
-- una sola contraseña compartida por grupo, con opción de desactivarla
-- por completo para que el alumno entre solo con su usuario.
--
-- También corrige una regresión: la migración anterior
-- (fix-rls-privilege-escalation.sql) restringió el SELECT de
-- `students`/`teachers` a authenticated -- pero el login por USUARIO
-- (no email) necesita resolver username->email ANTES de autenticar
-- (con la anon key, rol `anon`, sin sesión). resolve_login_email()
-- expone SOLO ese lookup puntual vía función segura, sin reabrir el
-- acceso de lectura completo a las tablas para anon.
--
-- Aditivo/no destructivo. Seguro de re-ejecutar.
-- ============================================================

create table if not exists public.class_passwords (
  school_code text not null,
  grade text not null,
  section text not null,
  password text not null,
  requires_password boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid,
  primary key (school_code, grade, section)
);

alter table public.class_passwords enable row level security;

drop policy if exists "class_passwords_staff_only" on public.class_passwords;
create policy "class_passwords_staff_only"
  on public.class_passwords for all
  using (public.is_staff())
  with check (public.is_staff());
-- Nota a propósito: no hay ninguna política para `anon` ni para
-- estudiantes -- la contraseña de clase NUNCA se lee directo desde el
-- cliente. Todo el chequeo pasa por las edge functions (service role).

create or replace function public.resolve_login_email(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  -- Los docentes/admin siempre inician sesión con su email real; solo
  -- los alumnos tienen `username` (los emails que se les genera son
  -- ficticios, @estudiante.edu.gt, no reciben correo real).
  select email from public.students where username = p_username limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.get_class_login_mode(p_school_code text, p_grade text, p_section text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select requires_password from public.class_passwords
     where school_code = p_school_code and grade = p_grade and section = p_section),
    true
  );
$$;

grant execute on function public.get_class_login_mode(text, text, text) to anon, authenticated;
