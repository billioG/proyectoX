-- is_staff() solo reconocía 'admin' y 'docente'. Al asignar a un docente el rol
-- 'coordinador' (teachers.role), dejaba de contar como personal: todas las
-- policies RLS basadas en is_staff() le devolvían vacío/null (alumnos de sus
-- equipos en null -> crash en Equipos, 0 alumnos, "sin establecimientos").
-- En la app un coordinador sigue dando clases como cualquier docente
-- (ver auth.js), así que tiene el mismo acceso base que un docente.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teachers
    where teachers.id = auth.uid() and teachers.role in ('admin','docente','coordinador')
  );
$$;

notify pgrst, 'reload schema';
