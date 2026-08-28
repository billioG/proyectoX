-- ============================================================
-- Fin de ciclo escolar: promover estudiantes de grado sin tener que
-- recrear cuentas. Se agrega "status" para poder marcar como egresados
-- (sin login, sin aparecer en listas activas) a quienes terminan 6to
-- Diversificado, en vez de borrarlos (se conserva historial/certificados).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students add column if not exists status text not null default 'active';
alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check check (status in ('active', 'egresado'));

create index if not exists students_status_idx on public.students (status);
