-- ============================================================
-- CONTRASEÑA DE ALUMNOS SIN TEXTO LEGIBLE -- FASE 3 de 3: borrar el texto
--
-- Borra el valor de students.password_generated (la columna se queda, vacía, para no romper nada que aún la nombre).
-- ES LA ÚNICA PARTE IRREVERSIBLE: por eso se niega a correr mientras haya alguna contraseña sin hash o sin cifrado,
-- porque ese texto sería lo único que queda de esa contraseña.
--
-- Antes de correrla (ver docs/SEGURIDAD_2026-11.md):
--   1. student-password-hash.sql corrida y  select public.backfill_student_password_hashes(300);  repetido hasta dar 0.
--   2. Redesplegadas student-login, admin-bulk-import-students y staff-student-passwords, con el secreto PASSWORD_VAULT_KEY.
--   3. Llamado staff-student-passwords con {"action":"backfill"} (como admin) hasta que "pendientes" dé 0.
--   4. Probado: un alumno entra con su contraseña, y el personal ve/imprime una contraseña.
--
-- Seguro de re-ejecutar (la segunda vez no hay nada que borrar).
-- ============================================================

do $$
declare
  v_sin_hash integer;
  v_sin_enc integer;
  v_con_texto integer;
begin
  select count(*) filter (where password_hash is null),
         count(*) filter (where password_enc is null),
         count(*)
    into v_sin_hash, v_sin_enc, v_con_texto
  from public.students
  where password_generated is not null and password_generated <> '';

  if v_sin_hash > 0 or v_sin_enc > 0 then
    raise exception 'NO SE BORRA NADA: % contraseña(s) sin hash y % sin cifrado de % con texto. Completa las fases 1 y 2 (docs/SEGURIDAD_2026-11.md).',
      v_sin_hash, v_sin_enc, v_con_texto;
  end if;

  update public.students set password_generated = null where password_generated is not null;
  raise notice 'Texto legible borrado de % contraseña(s).', v_con_texto;
end $$;

notify pgrst, 'reload schema';

select count(*) filter (where password_generated is not null and password_generated <> '') as con_texto_legible,
       count(*) filter (where password_hash is not null) as con_hash,
       count(*) filter (where password_enc is not null) as con_cifrado
from public.students;
