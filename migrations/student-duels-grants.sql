-- "permission denied for table student_duels" es un error de GRANT a nivel
-- de tabla (previo a que RLS ni siquiera entre a evaluar las políticas) --
-- distinto de que una política deniegue una fila puntual. Las políticas de
-- student-duels.sql ya estaban bien, pero al rol `authenticated` le faltaba
-- (o le revocaron en algún momento) el permiso base para insertar/leer.
grant select, insert, update on public.student_duels to authenticated;
grant select, insert on public.student_duel_answers to authenticated;

notify pgrst, 'reload schema';
