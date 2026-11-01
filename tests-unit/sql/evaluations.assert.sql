-- Aserciones sobre migrations/node-evaluations.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

insert into public.teachers (id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Marta'),    -- asignada a Primero A de ESC1
  ('00000000-0000-0000-0000-0000000000a2', 'Raúl'),     -- asignado a Segundo B de ESC1
  ('00000000-0000-0000-0000-0000000000a3', 'Eva');      -- asignada a Primero A de ESC1 y de ESC2
insert into public.teacher_assignments (teacher_id, school_code, grade, section) values
  ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-0000000000a2', 'ESC1', 'Segundo', 'B'),
  ('00000000-0000-0000-0000-0000000000a3', 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-0000000000a3', 'ESC2', 'Primero', 'A');
insert into public.students (id, school_code, grade, section) values
  ('00000000-0000-0000-0000-00000000000b', 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-00000000000c', 'ESC2', 'Primero', 'A');
insert into public.projects (id, user_id, client_metadata) values
  (1, '00000000-0000-0000-0000-00000000000b', null),
  (2, '00000000-0000-0000-0000-00000000000b', '{"source":"nodo","node_ref":"3f2b8c1e-1d4a-4c52-9a3e-0b6d7c8e9f10"}'),
  (3, '00000000-0000-0000-0000-00000000000c', null);   -- de ESC2

\ir ../../migrations/node-evaluations.sql
-- Idempotente: la segunda vez no falla.
\ir ../../migrations/node-evaluations.sql

-- 1) Evaluar por project_id guarda la evaluación, RECALCULA el total y deja la nota en el proyecto.
do $$ declare p int; t int; s int; n int; begin
  p := apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 1, null,
    '{"creativity_score":15,"clarity_score":10,"functionality_score":20,"teamwork_score":0,"social_impact_score":5,"total_score":999,"feedback":"Muy bien"}'::jsonb);
  select total_score into t from public.evaluations where project_id = 1;
  select score into s from public.projects where id = 1;
  select count(*) into n from public.evaluations;
  if p <> 1 or t <> 50 or s <> 50 or n <> 1 then raise exception 'EVALUA_Y_RECALCULA: p=% total=% score=% filas=%', p, t, s, n; end if;
end $$;

-- 2) Reenviar lo mismo no duplica; cambiar notas actualiza (gana la última).
do $$ declare t int; n int; f text; begin
  perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 1, null,
    '{"creativity_score":15,"clarity_score":10,"functionality_score":20,"teamwork_score":0,"social_impact_score":5,"feedback":"Muy bien"}'::jsonb);
  perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a3', 'ESC1', 1, null,
    '{"creativity_score":20,"clarity_score":20,"functionality_score":20,"teamwork_score":20,"social_impact_score":20,"feedback":"Perfecto"}'::jsonb);
  select count(*), max(total_score), max(feedback) into n, t, f from public.evaluations where project_id = 1;
  if n <> 1 or t <> 100 or f <> 'Perfecto' then raise exception 'IDEMPOTENTE_Y_ULTIMA_GANA: n=% t=% f=%', n, t, f; end if;
  if (select teacher_id from public.evaluations where project_id = 1) <> '00000000-0000-0000-0000-0000000000a3' then raise exception 'GUARDA_QUIEN_EVALUO'; end if;
  if (select score from public.projects where id = 1) <> 100 then raise exception 'SCORE_PROYECTO_ACTUALIZA'; end if;
end $$;

-- 3) Un proyecto que el nodo aún no había publicado se encuentra por node_ref; uno desconocido es "aún no publicado".
do $$ declare p int; begin
  p := apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', null, '3f2b8c1e-1d4a-4c52-9a3e-0b6d7c8e9f10',
    '{"creativity_score":10,"clarity_score":10,"functionality_score":10,"teamwork_score":10,"social_impact_score":10}'::jsonb);
  if p <> 2 or (select total_score from public.evaluations where project_id = 2) <> 50 then raise exception 'NODE_REF_RESUELVE: p=%', p; end if;
  begin
    perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', null, '11111111-1111-4111-8111-111111111111',
      '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: node_ref desconocido aceptado';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%aún no publicado%' then raise exception 'MENSAJE_NODE_REF: %', sqlerrm; end if;
  end;
end $$;

-- 4) Solo el docente ASIGNADO a la clase del proyecto, y en la escuela del nodo.
do $$ begin
  begin perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a2', 'ESC1', 1, null, '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: docente de otra clase evaluó';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  -- Eva está asignada también en ESC2, pero el nodo es de ESC1: no puede evaluar el proyecto de ESC2 (3) desde ese nodo.
  begin perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a3', 'ESC1', 3, null, '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: evaluó un proyecto de otra escuela desde el nodo';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_evaluation('00000000-0000-0000-0000-0000000000ff', 'ESC1', 1, null, '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: docente inexistente aceptado';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 999, null, '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: proyecto inexistente aceptado';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', null, null, '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
    raise exception 'FALLO: sin proyecto aceptado';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  if (select count(*) from public.evaluations where project_id = 3) <> 0 then raise exception 'SIN_EFECTO_EN_OTRA_ESCUELA'; end if;
end $$;

-- 5) Notas fuera de rango, no enteras o faltantes se rechazan.
do $$ declare e text; begin
  foreach e in array array[
    '{"creativity_score":21,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}',
    '{"creativity_score":-1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}',
    '{"creativity_score":"x","clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}',
    '{"creativity_score":1.5,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}',
    '{"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'
  ] loop
    begin
      perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 1, null, e::jsonb);
      raise exception 'FALLO: nota inválida aceptada: %', e;
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end loop;
  if (select total_score from public.evaluations where project_id = 1) <> 100 then raise exception 'NOTAS_INVALIDAS_NO_CAMBIAN_NADA'; end if;
end $$;

-- 6) La observación se corta a 1000 caracteres; sin observación queda null.
do $$ declare f text; begin
  perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 1, null,
    ('{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1,"feedback":"' || repeat('x', 1500) || '"}')::jsonb);
  select feedback into f from public.evaluations where project_id = 1;
  if length(f) <> 1000 then raise exception 'FEEDBACK_1000: %', length(f); end if;
  perform apply_node_evaluation('00000000-0000-0000-0000-0000000000a1', 'ESC1', 1, null,
    '{"creativity_score":1,"clarity_score":1,"functionality_score":1,"teamwork_score":1,"social_impact_score":1}'::jsonb);
  if (select feedback from public.evaluations where project_id = 1) is not null then raise exception 'FEEDBACK_NULL'; end if;
end $$;

-- 7) Permisos: solo service_role ejecuta la función.
do $$ begin
  if has_function_privilege('authenticated', 'public.apply_node_evaluation(uuid,text,integer,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.apply_node_evaluation(uuid,text,integer,text,jsonb)', 'execute') then raise exception 'PERMISOS_CLIENTES'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_evaluation(uuid,text,integer,text,jsonb)', 'execute') then raise exception 'PERMISOS_SERVICE_ROLE'; end if;
end $$;

select 'EVALUATIONS_SQL_OK';
