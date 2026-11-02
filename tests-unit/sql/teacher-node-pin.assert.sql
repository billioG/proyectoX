-- Aserciones sobre migrations/teacher-node-pin.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

insert into public.teachers (id, full_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Marta'),
  ('00000000-0000-0000-0000-00000000000b', 'Raúl');
insert into public.students (id) values ('00000000-0000-0000-0000-00000000000c');

\ir ../../migrations/teacher-node-pin.sql
-- Idempotente: la segunda vez no falla.
\ir ../../migrations/teacher-node-pin.sql

-- 1) Un docente fija su PIN; volver a fijarlo lo reemplaza (una sola fila).
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  perform public.set_teacher_node_pin(repeat('a', 64), repeat('b', 32));
  perform public.set_teacher_node_pin(repeat('c', 64), repeat('d', 32));
  if (select count(*) from public.teacher_node_pins) <> 1 then raise exception 'UNA_FILA'; end if;
  if (select pin_hash from public.teacher_node_pins) <> repeat('c', 64) then raise exception 'REEMPLAZA'; end if;
end $$;

-- 2) has_teacher_node_pin: verdadero para quien lo fijó, falso para otro docente.
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  if not public.has_teacher_node_pin() then raise exception 'HAS_SI'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  if public.has_teacher_node_pin() then raise exception 'HAS_NO'; end if;
end $$;

-- 3) Un estudiante, o nadie, no puede fijarlo; ni un hash o una sal que no sean hexadecimales del largo correcto.
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  begin perform public.set_teacher_node_pin(repeat('a', 64), repeat('b', 32)); raise exception 'ESTUDIANTE_ENTRO';
  exception when others then if sqlerrm = 'ESTUDIANTE_ENTRO' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', '', false);
  begin perform public.set_teacher_node_pin(repeat('a', 64), repeat('b', 32)); raise exception 'ANONIMO_ENTRO';
  exception when others then if sqlerrm = 'ANONIMO_ENTRO' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  begin perform public.set_teacher_node_pin('corto', repeat('b', 32)); raise exception 'HASH_CORTO';
  exception when others then if sqlerrm = 'HASH_CORTO' then raise; end if; end;
  begin perform public.set_teacher_node_pin(repeat('g', 64), repeat('b', 32)); raise exception 'HASH_NO_HEX';
  exception when others then if sqlerrm = 'HASH_NO_HEX' then raise; end if; end;
  begin perform public.set_teacher_node_pin(repeat('a', 64), 'sal'); raise exception 'SAL_CORTA';
  exception when others then if sqlerrm = 'SAL_CORTA' then raise; end if; end;
  begin perform public.set_teacher_node_pin(null, null); raise exception 'NULOS';
  exception when others then if sqlerrm = 'NULOS' then raise; end if; end;
  if (select count(*) from public.teacher_node_pins) <> 1 then raise exception 'NADA_EXTRA'; end if;
end $$;

-- 4) Quitar el PIN: solo borra el propio.
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.clear_teacher_node_pin();
  if (select count(*) from public.teacher_node_pins) <> 1 then raise exception 'NO_BORRA_AJENO'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  perform public.clear_teacher_node_pin();
  if (select count(*) from public.teacher_node_pins) <> 0 then raise exception 'BORRA_PROPIO'; end if;
end $$;

-- 5) La tabla solo la lee service_role (node-sync): la app no puede leerla ni escribirla, y anon no ejecuta las funciones.
do $$ begin
  if has_table_privilege('authenticated', 'public.teacher_node_pins', 'select') then raise exception 'AUTH_LEE'; end if;
  if has_table_privilege('authenticated', 'public.teacher_node_pins', 'insert') then raise exception 'AUTH_ESCRIBE'; end if;
  if has_table_privilege('anon', 'public.teacher_node_pins', 'select') then raise exception 'ANON_LEE'; end if;
  if not has_table_privilege('service_role', 'public.teacher_node_pins', 'select') then raise exception 'SERVICE_NO_LEE'; end if;
  if has_function_privilege('anon', 'public.set_teacher_node_pin(text, text)', 'execute') then raise exception 'ANON_EJECUTA'; end if;
  if not has_function_privilege('authenticated', 'public.set_teacher_node_pin(text, text)', 'execute') then raise exception 'AUTH_NO_EJECUTA'; end if;
end $$;

select 'TEACHER_PIN_SQL_OK';
