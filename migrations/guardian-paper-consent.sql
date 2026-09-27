-- ============================================================
-- CONSENTIMIENTO EN PAPEL (inscripción del colegio)
--
-- Muchos padres ya firman una autorización en papel al inscribir a su
-- hijo/a en el colegio, y no están acostumbrados a "aceptar" de nuevo
-- desde un enlace de celular -- eso dejaba el consentimiento pendiente
-- para siempre (sin bloquear los avisos, pero sin quedar registrado).
--
-- Esta migración deja que el DOCENTE o el ADMIN registren "ya lo firmó
-- en papel en la inscripción" desde la ficha de padres del alumno
-- (Estudiantes -> Padres), sin que el padre tenga que tocar nada en su
-- teléfono. Queda igual de trazable: consent_method distingue si lo
-- registró el padre desde el portal o el colegio desde el papel, y
-- consent_recorded_by/at dicen quién y cuándo.
--
-- El portal de padres (padres.html) sigue funcionando igual para quien
-- SÍ prefiera aceptar desde su celular.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Requiere
-- guardian-consent.sql corrida antes.
-- ============================================================

alter table public.student_guardians add column if not exists consent_method text
  check (consent_method is null or consent_method in ('portal', 'paper'));
alter table public.student_guardians add column if not exists consent_recorded_by uuid references public.teachers(id);

create or replace function public.record_guardian_paper_consent(p_guardian uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.student_guardians where id = p_guardian;
  if v_student is null then raise exception 'Ese padre/encargado no existe'; end if;
  if not public.can_manage_student(v_student) then raise exception 'No autorizado'; end if;

  update public.student_guardians set
    consent_status = 'accepted',
    consent_version = 1,
    consent_at = now(),
    consent_method = 'paper',
    consent_recorded_by = auth.uid()
  where id = p_guardian;
end;
$$;
grant execute on function public.record_guardian_paper_consent(uuid) to authenticated;

notify pgrst, 'reload schema';
