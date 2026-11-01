-- Aserciones sobre migrations/node-reactions.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

insert into public.students (id, school_code) values
  ('00000000-0000-0000-0000-00000000000a', 'ESC1'),
  ('00000000-0000-0000-0000-00000000000b', 'ESC1'),
  ('00000000-0000-0000-0000-00000000000c', 'ESC2'),
  ('00000000-0000-0000-0000-00000000000d', 'ESC1');
insert into public.projects (id, user_id) values
  (1, '00000000-0000-0000-0000-00000000000a'),   -- proyecto de ESC1
  (2, '00000000-0000-0000-0000-00000000000c');   -- proyecto de ESC2

-- El disparador REAL de avisos de reacciones (avisa al dueño y al equipo cuando cambia project_likes).
\ir ../../migrations/project-reaction-notifications.sql
\ir ../../migrations/node-reactions.sql
-- Idempotente: la segunda vez no falla.
\ir ../../migrations/node-reactions.sql

-- 1) Reaccionar con "me gusta" cuenta un voto; reenviar el mismo estado no suma dos veces.
do $$ declare r jsonb; v int; begin
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'like');
  if r->>'mine' <> 'like' or (r->>'votes')::int <> 1 then raise exception 'LIKE_CUENTA: %', r; end if;
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'like');
  select votes into v from public.projects where id = 1;
  if v <> 1 or (select count(*) from public.project_likes where project_id = 1) <> 1 then raise exception 'IDEMPOTENTE: votos=%', v; end if;
end $$;

-- 2) Cambiar a una reacción que no cuenta (wow) baja el voto; "excelente" sí cuenta.
do $$ declare r jsonb; begin
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'wow');
  if r->>'mine' <> 'wow' or (r->>'votes')::int <> 0 then raise exception 'WOW_NO_CUENTA: %', r; end if;
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'excelente');
  if (r->>'votes')::int <> 1 then raise exception 'EXCELENTE_CUENTA: %', r; end if;
  if (select reaction from public.project_likes where project_id = 1 and user_id = '00000000-0000-0000-0000-00000000000b') <> 'excelente' then raise exception 'REEMPLAZA'; end if;
end $$;

-- 3) Quitar la reacción (null) borra la fila y baja el voto; quitar otra vez no falla.
do $$ declare r jsonb; begin
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, null);
  if r->>'mine' is not null or (r->>'votes')::int <> 0 then raise exception 'QUITAR: %', r; end if;
  if (select count(*) from public.project_likes where project_id = 1) <> 0 then raise exception 'QUITAR_BORRA'; end if;
  perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, null);
end $$;

-- 4) Dos estudiantes suman dos votos (también el dueño: igual que con internet).
do $$ declare r jsonb; begin
  perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'like');
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000d', 1, 'like');
  if (r->>'votes')::int <> 2 then raise exception 'DOS_VOTOS: %', r; end if;
  r := apply_node_reaction('00000000-0000-0000-0000-00000000000a', 1, 'animo');
  if (r->>'votes')::int <> 2 then raise exception 'ANIMO_NO_CUENTA: %', r; end if;
end $$;

-- 5) Datos inválidos: proyecto de otra escuela, reacción inventada, proyecto o estudiante inexistente.
do $$ begin
  begin perform apply_node_reaction('00000000-0000-0000-0000-00000000000c', 1, 'like'); raise exception 'FALLO: reaccionó a un proyecto de otra escuela';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 2, 'like'); raise exception 'FALLO: reaccionó a un proyecto de otra escuela (2)';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'love'); raise exception 'FALLO: reacción inventada';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 999, 'like'); raise exception 'FALLO: proyecto inexistente';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_reaction('00000000-0000-0000-0000-0000000000ff', 1, 'like'); raise exception 'FALLO: estudiante inexistente';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  if (select votes from public.projects where id = 2) <> 0 then raise exception 'SIN_EFECTO_EN_OTRA_ESCUELA'; end if;
end $$;

-- 6) Reenviar la MISMA reacción no vuelve a avisar al dueño (un menor); cambiarla sí.
do $$ declare r boolean; c timestamptz; c2 timestamptz; begin
  perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'like');
  update public.project_reaction_notifications set read = true;
  select created_at into c from public.project_reaction_notifications where actor_id = '00000000-0000-0000-0000-00000000000b' and project_id = 1;
  perform pg_sleep(0.05);
  perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'like');
  select read, created_at into r, c2 from public.project_reaction_notifications where actor_id = '00000000-0000-0000-0000-00000000000b' and project_id = 1;
  if r is not true or c2 <> c then raise exception 'REENVIO_NO_AVISA_DE_NUEVO: read=% created_at cambió=%', r, c2 <> c; end if;
  perform apply_node_reaction('00000000-0000-0000-0000-00000000000b', 1, 'wow');
  select read into r from public.project_reaction_notifications where actor_id = '00000000-0000-0000-0000-00000000000b' and project_id = 1;
  if r is not false then raise exception 'CAMBIAR_SI_AVISA: read=%', r; end if;
end $$;

-- 7) Permisos: solo service_role ejecuta la función.
do $$ begin
  if has_function_privilege('authenticated', 'public.apply_node_reaction(uuid,integer,text)', 'execute')
     or has_function_privilege('anon', 'public.apply_node_reaction(uuid,integer,text)', 'execute') then raise exception 'PERMISOS_CLIENTES'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_reaction(uuid,integer,text)', 'execute') then raise exception 'PERMISOS_SERVICE_ROLE'; end if;
end $$;

select 'REACTIONS_SQL_OK';
