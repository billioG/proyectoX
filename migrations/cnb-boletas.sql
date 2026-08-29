-- Primer paso para poder generar el Cuadro de Resultados Finales / Certificado
-- de Estudios que exige el MINEDUC: cada curso necesita su área curricular
-- OFICIAL del CNB (el docente antes ponía cualquier nombre libre, ej.
-- "mBlock", que no corresponde a ningún área del currículo nacional).
-- gender y codigo_personal en students YA existen (course-grading.sql /
-- admin-bulk-import-students) -- no hace falta migración para esos.

alter table public.courses add column if not exists cnb_area text;

notify pgrst, 'reload schema';
