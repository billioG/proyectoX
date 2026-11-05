-- Aserciones sobre migrations/node-remote-sync.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/node-remote-sync.sql
\ir ../../migrations/node-remote-sync.sql

insert into public.teachers (id, role) values ('00000000-0000-0000-0000-0000000000a1', 'docente'), ('00000000-0000-0000-0000-0000000000a2', 'docente'), ('00000000-0000-0000-0000-0000000000ad', 'admin');
insert into public.schools values ('ESC1', 'Escuela Uno'), ('ESC2', 'Escuela Dos');
insert into public.teacher_assignments (teacher_id, school_code, grade, section) values ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-0000000000a2', 'ESC2', 'Primero', 'A');
insert into public.school_nodes (id, school_code, name, token_hash) values
  ('00000000-0000-0000-0000-0000000000f1', 'ESC1', 'Raspberry sala', 'h1'), ('00000000-0000-0000-0000-0000000000f2', 'ESC1', 'Raspberry vieja', 'h2'), ('00000000-0000-0000-0000-0000000000f3', 'ESC2', 'Raspberry otra', 'h3');
update public.school_nodes set revoked_at = now() where id = '00000000-0000-0000-0000-0000000000f2';

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

-- 1) El servidor avisa: la nube guarda cuándo lo vio y su estado; todavía nadie pidió sincronizar.
do $$ declare r timestamptz; begin
  r := node_heartbeat('00000000-0000-0000-0000-0000000000f1', '{"pending_changes":3,"syncing":false,"version":"v1.0.223"}');
  if r is not null then raise exception 'SIN_PETICION: %', r; end if;
  if (select last_seen_at from public.school_nodes where id = '00000000-0000-0000-0000-0000000000f1') is null then raise exception 'VISTO'; end if;
  if (select node_status ->> 'pending_changes' from public.school_nodes where id = '00000000-0000-0000-0000-0000000000f1') <> '3' then raise exception 'ESTADO'; end if;
end $$;

-- 2) El docente de la escuela ve SUS servidores (sin el revocado, sin los de otra escuela) y sin datos sensibles; la de otra escuela no puede.
do $$ declare r jsonb; begin
  set local test.uid = '00000000-0000-0000-0000-0000000000a1';
  r := get_school_nodes('ESC1');
  if jsonb_array_length(r) <> 1 or r -> 0 ->> 'name' <> 'Raspberry sala' or r -> 0 ->> 'school_name' <> 'Escuela Uno' then raise exception 'LISTA: %', r; end if;
  if r::text like '%token%' or r::text like '%h1%' then raise exception 'FILTRA_TOKEN'; end if;
  if r -> 0 -> 'status' ->> 'version' <> 'v1.0.223' then raise exception 'ESTADO_EN_LISTA'; end if;
  perform pg_temp.fails($q$select get_school_nodes('ESC2')$q$, 'No tienes acceso');
  perform pg_temp.fails($q$select get_school_nodes(null)$q$, 'Indica la escuela');
end $$;

-- 3) Sincronizar ahora: anota la petición; el servidor la recibe en su siguiente aviso; repetirla enseguida no la repite; otra escuela no puede.
do $$ declare n integer; r timestamptz; begin
  set local test.uid = '00000000-0000-0000-0000-0000000000a1';
  n := request_node_sync('ESC1');
  if n <> 1 then raise exception 'PIDE_1: %', n; end if;
  if request_node_sync('ESC1') <> 0 then raise exception 'NO_MARTILLA'; end if;
  perform pg_temp.fails($q$select request_node_sync('ESC2')$q$, 'No tienes acceso');
  r := node_heartbeat('00000000-0000-0000-0000-0000000000f1', '{}');
  if r is null then raise exception 'RECIBE_PETICION'; end if;
  if (select sync_requested_at from public.school_nodes where id = '00000000-0000-0000-0000-0000000000f3') is not null or (select sync_requested_at from public.school_nodes where id = '00000000-0000-0000-0000-0000000000f2') is not null then raise exception 'SOLO_SUS_ACTIVOS'; end if;
end $$;

-- 4) Administrador: ve los de todas las escuelas; sin sesión no; permisos de las funciones.
do $$ begin
  set local test.uid = '00000000-0000-0000-0000-0000000000ad';
  if jsonb_array_length(get_school_nodes(null)) <> 2 then raise exception 'ADMIN_TODAS'; end if;
  if request_node_sync('ESC2') <> 1 then raise exception 'ADMIN_PIDE'; end if;
  set local test.uid = '';
  perform pg_temp.fails($q$select get_school_nodes('ESC1')$q$, 'No autenticado');
  perform pg_temp.fails($q$select request_node_sync('ESC1')$q$, 'No autenticado');
  if has_function_privilege('anon', 'public.get_school_nodes(text)', 'execute') or has_function_privilege('authenticated', 'public.node_heartbeat(uuid, jsonb)', 'execute') or has_function_privilege('anon', 'public.request_node_sync(text)', 'execute') then raise exception 'PERMISOS_APP'; end if;
  if not has_function_privilege('authenticated', 'public.get_school_nodes(text)', 'execute') or not has_function_privilege('service_role', 'public.node_heartbeat(uuid, jsonb)', 'execute') then raise exception 'PERMISOS_USO'; end if;
end $$;

select 'REMOTESYNC_SQL_OK';
