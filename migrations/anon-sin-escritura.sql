-- ============================================================
-- El rol «anon» (cualquiera con la clave pública, que está en el HTML) no escribe en ninguna tabla.
--
-- Problema: Supabase da por defecto INSERT, UPDATE, DELETE y TRUNCATE sobre todas las tablas del esquema public a «anon» y «authenticated»,
-- y la seguridad descansa SOLO en las políticas de filas (RLS). Hoy ninguna política deja escribir a «anon» (se comprobó: toda política de
-- escritura exige sesión, personal o administrador), así que no es explotable por la API, pero es una sola política mal escrita de distancia:
-- una política nueva con `using (true)` le abriría la tabla a cualquiera. Además TRUNCATE no pasa por RLS en absoluto.
--
-- Qué hace:
--   1. Quita TRUNCATE a anon y authenticated en todas las tablas de public (PostgREST nunca lo usa: costo cero).
--   2. Quita INSERT, UPDATE y DELETE a anon en todas las tablas de public. La app solo escribe con sesión (rol authenticated) o desde
--      funciones del servidor (service_role), que no se tocan. SELECT de anon NO se toca (la pantalla de ingreso lee lo que sus políticas permiten).
--   3. Las tablas y secuencias que se creen de aquí en adelante tampoco le dan esos permisos a anon.
--
-- NO toca authenticated (salvo TRUNCATE) ni service_role. ADITIVO/NO DESTRUCTIVO y seguro de re-ejecutar. Para deshacerlo:
--   grant insert, update, delete on all tables in schema public to anon;
-- Pegar completo en el SQL Editor de Supabase. Al final muestra una fila por comprobación; todas deben dar 0.
-- ============================================================

revoke truncate on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- Comprobación (todo debe dar 0):
select
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as anon_escritura,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'TRUNCATE') as authenticated_truncate;
