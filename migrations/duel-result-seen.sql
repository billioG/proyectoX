-- checkDuelResults() (duels.js) lee/escribe result_seen en
-- student_duel_answers para no repetir el modal de resultado, pero la
-- columna nunca se creó -- cada llamada tiraba 400 Bad Request (visible en
-- consola en cada duelo completado) y como el error no se chequeaba, el
-- modal de resultado del duelo nunca se mostraba, en silencio.

alter table public.student_duel_answers add column if not exists result_seen boolean not null default false;

notify pgrst, 'reload schema';
