-- Aserciones: security-hardening-2026-10.sql (revisado) y student-password-hash.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

insert into public.teachers values ('00000000-0000-0000-0000-0000000000a1', 'docente'), ('00000000-0000-0000-0000-0000000000a2', 'docente'), ('00000000-0000-0000-0000-0000000000ad', 'admin');
insert into public.teacher_assignments (teacher_id, school_code, grade, section) values ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-0000000000a2', 'ESC2', 'Primero', 'A');
insert into public.students (id, username, full_name, school_code, grade, section, cui, password_generated) values
  ('00000000-0000-0000-0000-0000000000b1', 'ana', 'Ana', 'ESC1', 'Primero', 'A', '1234567890101', 'clave-ana'),
  ('00000000-0000-0000-0000-0000000000b2', 'beto', 'Beto', 'ESC1', 'Primero', 'A', '1234567890102', 'clave-beto'),
  ('00000000-0000-0000-0000-0000000000b3', 'carla', 'Carla', 'ESC2', 'Primero', 'A', '1234567890103', 'clave-carla');

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;
grant execute on function pg_temp.fails(text, text) to public;

\ir ../../migrations/security-hardening-2026-10.sql
\ir ../../migrations/security-hardening-2026-10.sql

-- 1) Endurecimiento: la app ve nombre pero no contraseña ni CUI; staff_student_secrets entrega CUI sin texto de contraseña, solo a quien administra al alumno.
do $$ begin
  if not has_column_privilege('authenticated', 'public.students', 'full_name', 'SELECT') then raise exception 'APP_NO_VE_NOMBRE'; end if;
  if has_column_privilege('authenticated', 'public.students', 'password_generated', 'SELECT') then raise exception 'APP_VE_PASSWORD'; end if;
  if has_column_privilege('authenticated', 'public.students', 'cui', 'SELECT') then raise exception 'APP_VE_CUI'; end if;
  if has_table_privilege('anon', 'public.students', 'SELECT') then raise exception 'ANON_VE_TABLA'; end if;
end $$;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare n int; r record; begin
  select count(*) into n from public.staff_student_secrets(array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b3']::uuid[]);
  if n <> 1 then raise exception 'SECRETS_SOLO_SU_CLASE: %', n; end if;
  select * into r from public.staff_student_secrets(array['00000000-0000-0000-0000-0000000000b1']::uuid[]);
  if r.password_generated is not null then raise exception 'SECRETS_ENTREGA_TEXTO'; end if;
  if r.cui <> '1234567890101' then raise exception 'SECRETS_CUI'; end if;
end $$;
select pg_temp.fails($q$select password_generated from public.students$q$, 'permission denied');
reset role;

-- 2) Contraseñas: la fase 1 deja hash para lo que ya existía.
\ir ../../migrations/student-password-hash.sql
\ir ../../migrations/student-password-hash.sql
do $$ declare n int; begin
  select count(*) into n from public.students where password_hash is null; if n <> 0 then raise exception 'BACKFILL_INCOMPLETO: %', n; end if;
  if (select password_hash from public.students where id = '00000000-0000-0000-0000-0000000000b1') = 'clave-ana' then raise exception 'HASH_ES_TEXTO'; end if;
  if (select password_hash from public.students where id = '00000000-0000-0000-0000-0000000000b1') not like '$2%' then raise exception 'HASH_NO_BCRYPT'; end if;
  -- Dos alumnos con la misma contraseña tienen hashes distintos (sal propia).
  update public.students set password_generated = 'igual', password_hash = null where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
  perform public.backfill_student_password_hashes(100);
  if (select count(distinct password_hash) from public.students where password_generated = 'igual') <> 2 then raise exception 'SAL_REPETIDA'; end if;
  update public.students set password_generated = 'clave-ana' where id = '00000000-0000-0000-0000-0000000000b1';
  update public.students set password_hash = extensions.crypt('clave-ana', extensions.gen_salt('bf', 10)) where id = '00000000-0000-0000-0000-0000000000b1';
end $$;

-- 3) Comparar: bien con la correcta, mal con otra, vacía o nula; sin hash cae al texto antiguo; con hash ya no sirve el texto.
do $$ begin
  if not public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'clave-ana') then raise exception 'OK_CORRECTA'; end if;
  if public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'CLAVE-ANA') then raise exception 'OK_MAYUSCULAS'; end if;
  if public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'otra') then raise exception 'OK_OTRA'; end if;
  if public.student_password_ok('00000000-0000-0000-0000-0000000000b1', '') then raise exception 'OK_VACIA'; end if;
  if public.student_password_ok('00000000-0000-0000-0000-0000000000b1', null) then raise exception 'OK_NULA'; end if;
  if public.student_password_ok('00000000-0000-0000-0000-0000000000ff', 'clave-ana') then raise exception 'OK_NO_EXISTE'; end if;
  if public.student_password_ok(null, 'x') then raise exception 'OK_ID_NULO'; end if;
  -- Alumno nuevo todavía sin hash (importado antes de la fase 2): entra con el texto.
  insert into public.students (id, username, school_code, grade, section, password_generated) values ('00000000-0000-0000-0000-0000000000b4', 'dani', 'ESC1', 'Primero', 'A', 'clave-dani');
  if not public.student_password_ok('00000000-0000-0000-0000-0000000000b4', 'clave-dani') then raise exception 'OK_FALLBACK_TEXTO'; end if;
  -- Con hash, el texto viejo ya no cuenta: el hash manda aunque el texto siga ahí.
  update public.students set password_hash = extensions.crypt('nueva', extensions.gen_salt('bf', 10)) where id = '00000000-0000-0000-0000-0000000000b4';
  if public.student_password_ok('00000000-0000-0000-0000-0000000000b4', 'clave-dani') then raise exception 'HASH_MANDA'; end if;
  if not public.student_password_ok('00000000-0000-0000-0000-0000000000b4', 'nueva') then raise exception 'HASH_NUEVA'; end if;
end $$;

-- 4) Guardar: deja hash + cifrado y NINGÚN texto legible; un alumno que no existe o parámetros malos fallan.
do $$ begin
  perform public.set_student_password('00000000-0000-0000-0000-0000000000b2', 'cambiada-123', 'v1.iv.cifrado-de-prueba');
  if (select password_generated from public.students where id = '00000000-0000-0000-0000-0000000000b2') is not null then raise exception 'SET_DEJA_TEXTO'; end if;
  if (select password_enc from public.students where id = '00000000-0000-0000-0000-0000000000b2') <> 'v1.iv.cifrado-de-prueba' then raise exception 'SET_ENC'; end if;
  if not public.student_password_ok('00000000-0000-0000-0000-0000000000b2', 'cambiada-123') then raise exception 'SET_HASH'; end if;
  -- Sin cifrado nuevo, se conserva el anterior.
  perform public.set_student_password('00000000-0000-0000-0000-0000000000b2', 'otra-456');
  if (select password_enc from public.students where id = '00000000-0000-0000-0000-0000000000b2') <> 'v1.iv.cifrado-de-prueba' then raise exception 'SET_CONSERVA_ENC'; end if;
end $$;
select pg_temp.fails($q$select public.set_student_password('00000000-0000-0000-0000-0000000000ff', 'x')$q$, 'no existe');
select pg_temp.fails($q$select public.set_student_password(null, 'x')$q$, 'parámetros inválidos');
select pg_temp.fails($q$select public.set_student_password('00000000-0000-0000-0000-0000000000b2', null)$q$, 'parámetros inválidos');

-- 5) Ver/imprimir: cada docente recibe el cifrado SOLO de su clase; el administrador de todos; un estudiante o anon, de nadie.
update public.students set password_enc = 'v1.x.' || username where username in ('ana', 'carla');
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare n int; begin
  select count(*) into n from public.staff_student_password_blobs(array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3']::uuid[]);
  if n <> 2 then raise exception 'BLOBS_DOCENTE: % (esperaba 2: ana y beto de su clase con cifrado)', n; end if;
  if exists (select 1 from public.staff_student_password_blobs(array['00000000-0000-0000-0000-0000000000b3']::uuid[])) then raise exception 'BLOBS_OTRA_CLASE'; end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
do $$ declare n int; begin
  select count(*) into n from public.staff_student_password_blobs(array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b3']::uuid[]);
  if n <> 2 then raise exception 'BLOBS_ADMIN: %', n; end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false); -- un estudiante (no es docente ni admin)
do $$ begin
  if exists (select 1 from public.staff_student_password_blobs(array['00000000-0000-0000-0000-0000000000b1']::uuid[])) then raise exception 'BLOBS_ESTUDIANTE'; end if;
end $$;
select pg_temp.fails($q$select password_hash from public.students$q$, 'permission denied');
select pg_temp.fails($q$select password_enc from public.students$q$, 'permission denied');
-- Ni la app ni anon ejecutan las funciones del servidor.
select pg_temp.fails($q$select public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'clave-ana')$q$, 'permission denied');
select pg_temp.fails($q$select public.set_student_password('00000000-0000-0000-0000-0000000000b1', 'x')$q$, 'permission denied');
select pg_temp.fails($q$select public.backfill_student_password_hashes(10)$q$, 'permission denied');
reset role;
set role anon;
select pg_temp.fails($q$select * from public.staff_student_password_blobs(array['00000000-0000-0000-0000-0000000000b1']::uuid[])$q$, 'permission denied');
select pg_temp.fails($q$select public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'clave-ana')$q$, 'permission denied');
reset role;
set role service_role;
do $$ begin if not public.student_password_ok('00000000-0000-0000-0000-0000000000b1', 'clave-ana') then raise exception 'SERVICE_ROLE_OK'; end if; end $$;
reset role;

-- 6) Un re-ejecutado del endurecimiento NO le da a la app las columnas nuevas.
\ir ../../migrations/security-hardening-2026-10.sql
do $$ begin
  if has_column_privilege('authenticated', 'public.students', 'password_hash', 'SELECT') then raise exception 'REEJECUTAR_EXPONE_HASH'; end if;
  if has_column_privilege('authenticated', 'public.students', 'password_enc', 'SELECT') then raise exception 'REEJECUTAR_EXPONE_ENC'; end if;
end $$;

select 'PWD_SQL_OK';
