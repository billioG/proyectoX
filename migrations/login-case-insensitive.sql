-- Los usuarios de alumno se generan siempre en minusculas; si el
-- celular auto-capitalizaba la primera letra, esta comparacion exacta no
-- encontraba al alumno y el login nunca detectaba el modo sin contraseña.
create or replace function public.resolve_login_mode_by_username(p_username text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select cp.requires_password
      from public.students s
      join public.class_passwords cp
        on cp.school_code = s.school_code and cp.grade = s.grade and cp.section = s.section
      where lower(s.username) = lower(p_username)
    ),
    true
  );
$function$;

notify pgrst, 'reload schema';
