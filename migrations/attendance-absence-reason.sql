-- ============================================================
-- Motivo de la inasistencia (attendance.absence_reason).
--
-- La inasistencia es automática: quien no tiene registro un día de clase cuenta como falta con motivo «Sin aviso». Cuando el docente
-- sabe por qué no llegó, elige el motivo en la lista y se guarda una fila 'absent' con esta columna. Sin motivo guardado = sin aviso.
--
-- Qué hace:
--   1. Columna nullable attendance.absence_reason con los valores permitidos: sin_aviso, enfermedad, permiso, otro.
--   2. Política para que el docente pueda ACTUALIZAR sus propias filas de asistencia (teacher_id = auth.uid()). Hasta hoy solo podía insertar:
--      cambiar «ausente» a «presente» (o al revés) con un upsert sobre una fila que ya existía fallaba por seguridad de filas (RLS).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase ANTES de usar la app v1.0.282 o más nueva
-- y antes de redesplegar la función node-sync.
-- ============================================================

alter table public.attendance add column if not exists absence_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_absence_reason_check' and conrelid = 'public.attendance'::regclass) then
    alter table public.attendance
      add constraint attendance_absence_reason_check
      check (absence_reason is null or absence_reason in ('sin_aviso', 'enfermedad', 'permiso', 'otro'));
  end if;
end $$;

drop policy if exists "Teachers can update own attendance" on public.attendance;
create policy "Teachers can update own attendance" on public.attendance
  for update
  using ((select auth.uid()) = teacher_id)
  with check ((select auth.uid()) = teacher_id);

-- Comprobación (debe dar columna = true y politica = true):
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attendance' and column_name = 'absence_reason') as columna,
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'attendance' and policyname = 'Teachers can update own attendance') as politica;
