-- ============================================================
-- CONTRASEÑA DE ALUMNOS SIN TEXTO LEGIBLE -- FASE 1 de 3
--
-- Problema: students.password_generated guarda la contraseña REAL en texto. Basta una lectura de esa columna (un error de
-- permisos, una copia de seguridad, un volcado) para tener todas las contraseñas. Y hay que seguir pudiendo MOSTRARLA o
-- IMPRIMIRLA cuando el personal la necesita (una carta de credenciales), así que un hash solo no alcanza: un hash no se puede revertir.
--
-- Solución (dos columnas con dos funciones distintas):
--   * password_hash  -- bcrypt (pgcrypto). Es lo que COMPARA el inicio de sesión (student_password_ok). No se puede revertir.
--   * password_enc   -- la contraseña CIFRADA con AES-256-GCM por una Edge Function, con una llave que vive SOLO en los secretos
--                       de las Edge Functions (PASSWORD_VAULT_KEY) y nunca en la base. Solo la función staff-student-passwords la
--                       descifra, y solo para el admin o el docente asignado a esa clase. Quien lea la base (o una copia) ve texto cifrado inútil.
--
-- Las tres fases (cada una segura de re-ejecutar; ver docs/SEGURIDAD_2026-11.md):
--   FASE 1 (este archivo): agrega las columnas y funciones; llena password_hash con lo que hay (por lotes). NO borra nada.
--   FASE 2 (Edge Functions): redesplegar student-login, admin-bulk-import-students y la NUEVA staff-student-passwords con el secreto
--           PASSWORD_VAULT_KEY; luego, como admin, llamar a staff-student-passwords con {"action":"backfill"} para cifrar las
--           contraseñas que ya existen.
--   FASE 3 (student-password-drop-plaintext.sql): solo cuando TODAS tengan hash y cifrado, borra el texto de password_generated.
--
-- ADITIVO / NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- Requiere: security-hardening-2026-10.sql ya corrida (can_manage_student y permisos por columna de students).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.students add column if not exists password_hash text;
alter table public.students add column if not exists password_enc text;

-- Ninguna de las dos se lee desde la app (solo funciones del servidor). Si la tabla aún tiene un permiso de tabla completo para
-- la app, se quita el de estas columnas; con security-hardening-2026-10.sql ya aplicada, el permiso es por columna y estas no están.
do $$ begin
  begin
    revoke select (password_hash, password_enc) on public.students from anon, authenticated;
  exception when others then
    raise notice 'no se pudo revocar el permiso por columna (%): revisa security-hardening-2026-10.sql', sqlerrm;
  end;
end $$;

-- ---------- comparar contraseña (inicio de sesión) ----------
-- Solo service_role (la Edge Function student-login). Mientras un alumno no tenga hash, cae al texto antiguo para no dejar a nadie fuera.
create or replace function public.student_password_ok(p_student uuid, p_password text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  s record;
begin
  if p_student is null or p_password is null or p_password = '' then return false; end if;
  select st.password_hash, st.password_generated into s from public.students st where st.id = p_student;
  if not found then return false; end if;
  if s.password_hash is not null then
    return s.password_hash = extensions.crypt(p_password, s.password_hash);
  end if;
  return s.password_generated is not null and s.password_generated = p_password;
end;
$$;
revoke all on function public.student_password_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.student_password_ok(uuid, text) to service_role;

-- ---------- guardar contraseña (alta y cambios) ----------
-- Solo service_role. Guarda el hash y el cifrado (que calcula la Edge Function) y NO deja texto legible.
create or replace function public.set_student_password(p_student uuid, p_password text, p_enc text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_student is null or p_password is null or length(p_password) < 1 then
    raise exception 'set_student_password: parámetros inválidos';
  end if;
  update public.students
     set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         password_enc = coalesce(p_enc, password_enc),
         password_generated = null
   where id = p_student;
  if not found then raise exception 'set_student_password: el estudiante no existe'; end if;
end;
$$;
revoke all on function public.set_student_password(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_student_password(uuid, text, text) to service_role;

-- ---------- ver / imprimir (personal) ----------
-- Devuelve solo el CIFRADO de los alumnos que quien llama puede administrar (admin o docente asignado). La llave no está en la base:
-- el texto lo recupera la Edge Function staff-student-passwords.
create or replace function public.staff_student_password_blobs(p_ids uuid[])
returns table (id uuid, password_enc text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.password_enc
  from public.students s
  where s.id = any(p_ids)
    and s.password_enc is not null
    and public.can_manage_student(s.id);
$$;
revoke all on function public.staff_student_password_blobs(uuid[]) from public, anon;
grant execute on function public.staff_student_password_blobs(uuid[]) to authenticated, service_role;

-- ---------- llenar password_hash de lo que ya existe, por lotes ----------
-- bcrypt es lento a propósito (unas décimas de segundo por contraseña): se hace por lotes para no pasarse del tiempo del SQL Editor.
-- Devuelve cuántas quedaron en ESTE lote; repetir  select public.backfill_student_password_hashes(300);  hasta que dé 0.
create or replace function public.backfill_student_password_hashes(p_batch integer default 300)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_n integer;
begin
  with todo as (
    select id, password_generated from public.students
    where password_hash is null and password_generated is not null and password_generated <> ''
    order by id
    limit greatest(1, least(coalesce(p_batch, 300), 2000))
  ), done as (
    update public.students s
       set password_hash = extensions.crypt(todo.password_generated, extensions.gen_salt('bf', 10))
      from todo
     where s.id = todo.id
    returning 1
  )
  select count(*) into v_n from done;
  return v_n;
end;
$$;
revoke all on function public.backfill_student_password_hashes(integer) from public, anon, authenticated;
grant execute on function public.backfill_student_password_hashes(integer) to service_role;

-- Un primer lote ahora (el SQL Editor corre como postgres).
select public.backfill_student_password_hashes(300) as hashes_en_este_lote;

notify pgrst, 'reload schema';

-- ---------- Estado (repetir hasta que 'sin_hash' dé 0) ----------
select
  count(*) filter (where password_generated is not null and password_generated <> '') as con_texto_legible,
  count(*) filter (where password_hash is not null) as con_hash,
  count(*) filter (where password_enc is not null) as con_cifrado,
  count(*) filter (where password_hash is null and password_generated is not null and password_generated <> '') as sin_hash
from public.students;
