-- Aserciones sobre migrations/node-profile-photo.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/node-profile-photo.sql
\ir ../../migrations/node-profile-photo.sql

insert into public.students (id, xp, gems) values ('00000000-0000-0000-0000-00000000000a', 10, 5), ('00000000-0000-0000-0000-00000000000b', 10, 5);
insert into public.teachers (id, xp, gems) values ('00000000-0000-0000-0000-0000000000a1', 0, 0);

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

-- 1) La primera foto de un estudiante: se guarda y da +100 XP y +25 gemas, una sola vez.
do $$ declare r jsonb; begin
  r := apply_node_profile_photo('00000000-0000-0000-0000-00000000000a', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-00000000000a_1762000000000.png');
  if (r ->> 'rewarded')::boolean is not true or (r ->> 'xp')::int <> 100 or (r ->> 'gems')::int <> 25 then raise exception 'PREMIO: %', r; end if;
  if (select xp from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 110 or (select gems from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 30 then raise exception 'XP_GEMAS'; end if;
  if (select profile_photo_url from public.students where id = '00000000-0000-0000-0000-00000000000a') not like '%_1762000000000.png' then raise exception 'URL1'; end if;
end $$;

-- 2) Cambiarla otra vez, o repetir la misma llamada (un reintento): la foto cambia, sin premio nuevo.
do $$ declare r jsonb; begin
  r := apply_node_profile_photo('00000000-0000-0000-0000-00000000000a', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-00000000000a_1762000099999.jpg');
  if (r ->> 'rewarded')::boolean is not false then raise exception 'SIN_PREMIO: %', r; end if;
  perform apply_node_profile_photo('00000000-0000-0000-0000-00000000000a', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-00000000000a_1762000099999.jpg');
  if (select xp from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 110 or (select gems from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 30 then raise exception 'DOBLE_PREMIO'; end if;
  if (select profile_photo_url from public.students where id = '00000000-0000-0000-0000-00000000000a') not like '%_1762000099999.jpg' then raise exception 'URL2'; end if;
end $$;

-- 3) Un docente también.
do $$ begin
  perform apply_node_profile_photo('00000000-0000-0000-0000-0000000000a1', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-0000000000a1_1762000000000.webp');
  if (select xp from public.teachers) <> 100 or (select gems from public.teachers) <> 25 then raise exception 'DOCENTE'; end if;
end $$;

-- 4) Validaciones: la imagen tiene que ser de ESE usuario y de su carpeta; usuario inexistente; permisos.
do $$ begin
  perform pg_temp.fails($q$select apply_node_profile_photo('00000000-0000-0000-0000-00000000000b', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-00000000000a_1762000000000.png')$q$, 'Foto no válida');
  perform pg_temp.fails($q$select apply_node_profile_photo('00000000-0000-0000-0000-00000000000b', 'https://x.supabase.co/storage/v1/object/public/otro-deposito/00000000-0000-0000-0000-00000000000b_1762000000000.png')$q$, 'Foto no válida');
  perform pg_temp.fails($q$select apply_node_profile_photo('00000000-0000-0000-0000-00000000000b', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-00000000000b_1762000000000.svg')$q$, 'Foto no válida');
  perform pg_temp.fails($q$select apply_node_profile_photo('00000000-0000-0000-0000-00000000000b', null)$q$, 'Foto no válida');
  perform pg_temp.fails($q$select apply_node_profile_photo('00000000-0000-0000-0000-0000000000ff', 'https://x.supabase.co/storage/v1/object/public/profile-photos/00000000-0000-0000-0000-0000000000ff_1762000000000.png')$q$, 'Usuario no encontrado');
  if (select profile_photo_url from public.students where id = '00000000-0000-0000-0000-00000000000b') is not null then raise exception 'NO_DEBIO_CAMBIAR'; end if;
  if has_function_privilege('authenticated', 'public.apply_node_profile_photo(uuid, text)', 'execute') or has_function_privilege('anon', 'public.apply_node_profile_photo(uuid, text)', 'execute') then raise exception 'PERMISOS_APP'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_profile_photo(uuid, text)', 'execute') then raise exception 'PERMISOS_SERVICIO'; end if;
end $$;

select 'PROFILEPHOTO_SQL_OK';
