-- ============================================================
-- "Dar de baja" a un estudiante (se retiró a mitad de año, distinto de
-- egresar) -- pedido de un docente: la única edición que veían era
-- restablecer contraseña, sin forma de marcar que un alumno ya no está.
-- Reusa la misma columna "status" de Promover Ciclo Escolar, solo se
-- amplía el check para admitir este tercer valor.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check check (status in ('active', 'egresado', 'baja'));
