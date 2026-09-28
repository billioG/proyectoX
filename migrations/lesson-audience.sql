-- ============================================================
-- RECURSOS SOLO PARA DOCENTES (guías del profesor, rúbricas, material
-- de apoyo) -- los alumnos no deben verlos ni descargarlos.
--
-- lessons.audience: 'estudiante' (default, como hasta ahora) o
-- 'docente'. Se elige al subir el recurso (js/lessons.js).
--
-- La restricción es a nivel de base de datos (RLS), no solo ocultar en
-- pantalla: un alumno no puede leer la fila ni con una consulta directa.
-- Es una política RESTRICTIVA -- se agrega a lo que ya existe, nunca
-- amplía a quién ya podía leer `lessons`, solo puede achicarlo.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar.
-- ============================================================

alter table public.lessons add column if not exists audience text not null default 'estudiante'
  check (audience in ('estudiante', 'docente'));

alter table public.lessons enable row level security;

drop policy if exists "lessons_select_restrict_teacher_only" on public.lessons;
create policy "lessons_select_restrict_teacher_only"
  on public.lessons as restrictive for select
  using (
    audience = 'estudiante'
    or exists (select 1 from public.teachers where id = auth.uid())
  );

notify pgrst, 'reload schema';
