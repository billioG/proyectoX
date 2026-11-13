-- ============================================================
-- Exenciones de asistencia (attendance_waivers): una sola por docente, día y grupo.
--
-- Problema: submitWaiver() (js/attendance.js) hacía un insert() plano, sin ninguna
-- clave que detectara repetidos. Con un doble clic, o enviando otra vez el mismo
-- día para el mismo establecimiento/grado/sección, se creaban varias solicitudes
-- idénticas y el administrador las veía repetidas en el panel y en el historial.
--
-- Qué hace (en este orden):
--   1. Limpieza: por cada (teacher_id, date, school_code, grade, section) con varias
--      solicitudes NO rechazadas, deja la MÁS ANTIGUA tal como está y marca las demás
--      como 'rejected' con una nota en admin_comment. NO borra ninguna fila.
--      grade/section/school_code NULL cuentan como iguales entre sí (exención de
--      «todo el establecimiento»).
--   2. Candado: índice único parcial (donde status no sea 'rejected'). Una solicitud
--      rechazada NO bloquea: el docente puede volver a enviarla. Se usa coalesce()
--      en vez de «nulls not distinct» para que funcione también en PostgreSQL < 15.
--      El cliente captura el error 23505 y muestra un mensaje claro.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar (la segunda vez no encuentra
-- repetidos y el índice ya existe). Pegar completo en el SQL Editor de Supabase.
-- ============================================================

with ranked as (
  select id,
         row_number() over (
           partition by teacher_id, date, coalesce(school_code, ''), coalesce(grade, ''), coalesce(section, '')
           order by created_at asc, id asc
         ) as rn
  from public.attendance_waivers
  where status is distinct from 'rejected'
)
update public.attendance_waivers w
   set status = 'rejected',
       admin_comment = concat_ws(' | ', nullif(w.admin_comment, ''),
                                 'Duplicada: se conserva la solicitud más antigua del mismo día y grupo (waivers-unique-por-grupo)'),
       updated_at = now()
  from ranked r
 where r.id = w.id
   and r.rn > 1;

create unique index if not exists attendance_waivers_unique_group_day
  on public.attendance_waivers (teacher_id, date, coalesce(school_code, ''), coalesce(grade, ''), coalesce(section, ''))
  where status is distinct from 'rejected';

notify pgrst, 'reload schema';
