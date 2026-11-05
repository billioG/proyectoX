-- Aserciones sobre migrations/node-feedback.sql (con el esquema real de la nube). Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/node-feedback.sql
\ir ../../migrations/node-feedback.sql

insert into public.students (id, school_code, grade, section) values
  ('00000000-0000-0000-0000-00000000000a', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-00000000000b', 'ESC1', 'Segundo', 'B');
insert into public.teachers (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
insert into public.teacher_assignments (teacher_id, school_code, grade, section) values
  ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'), ('00000000-0000-0000-0000-0000000000a2', 'ESC1', 'Segundo', 'B');

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

-- 1) Sugerencia: se inserta con el id del nodo y su fecha; reenviarla no la duplica.
do $$ declare r jsonb; begin
  r := apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', '{"id":1500000001,"student_id":"00000000-0000-0000-0000-00000000000a","type":"suggestion","message":"Más tiempo de laboratorio","rating":null,"created_at":"2026-11-04T15:00:00.000Z"}');
  if (r ->> 'inserted')::boolean is not true then raise exception 'INSERTO: %', r; end if;
  r := apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', '{"id":1500000001,"student_id":"00000000-0000-0000-0000-00000000000a","type":"suggestion","message":"Más tiempo de laboratorio","created_at":"2026-11-04T15:00:00.000Z"}');
  if (r ->> 'inserted')::boolean is not false then raise exception 'REINTENTO: %', r; end if;
  if (select count(*) from public.student_suggestions) <> 1 then raise exception 'DUPLICADA'; end if;
  if (select created_at from public.student_suggestions) <> timestamp '2026-11-04 15:00:00' then raise exception 'FECHA'; end if;
  if (select type from public.student_suggestions) <> 'suggestion' then raise exception 'TIPO'; end if;
end $$;

-- 2) Evaluación: solo al docente de su clase; una por docente (el reintento y una segunda no se repiten ni pisan la primera).
do $$ declare r jsonb; begin
  r := apply_node_feedback('rating', '00000000-0000-0000-0000-00000000000a', '{"id":1500000002,"student_id":"00000000-0000-0000-0000-00000000000a","teacher_id":"00000000-0000-0000-0000-0000000000a1","rating":4.2,"message":"La robótica","best_moment":"La robótica","q_interest":4,"q_practice":5,"q_resources":4,"q_respect":4,"q_clarity":4,"created_at":"2026-11-04T15:00:00Z"}');
  if (r ->> 'inserted')::boolean is not true then raise exception 'EVAL: %', r; end if;
  if (select rating from public.teacher_ratings) <> 4.2 or (select q_practice from public.teacher_ratings) <> 5 then raise exception 'CAMPOS'; end if;
  r := apply_node_feedback('rating', '00000000-0000-0000-0000-00000000000a', '{"id":1500000002,"student_id":"00000000-0000-0000-0000-00000000000a","teacher_id":"00000000-0000-0000-0000-0000000000a1","rating":1,"created_at":"2026-11-04T15:00:00Z"}');
  if (r ->> 'inserted')::boolean is not false then raise exception 'REINTENTO_EVAL'; end if;
  r := apply_node_feedback('rating', '00000000-0000-0000-0000-00000000000a', '{"id":1500000003,"student_id":"00000000-0000-0000-0000-00000000000a","teacher_id":"00000000-0000-0000-0000-0000000000a1","rating":2,"created_at":"2026-11-11T15:00:00Z"}');
  if (r ->> 'inserted')::boolean is not false then raise exception 'SEGUNDA_EVAL'; end if;
  if (select count(*) from public.teacher_ratings) <> 1 or (select rating from public.teacher_ratings) <> 4.2 then raise exception 'PISADA'; end if;
  perform pg_temp.fails($q$select apply_node_feedback('rating', '00000000-0000-0000-0000-00000000000a', '{"id":1500000004,"student_id":"00000000-0000-0000-0000-00000000000a","teacher_id":"00000000-0000-0000-0000-0000000000a2","rating":3,"created_at":"2026-11-04T15:00:00Z"}')$q$, 'no es de la clase');
end $$;

-- 3) Validaciones y permisos.
do $$ begin
  perform pg_temp.fails($q$select apply_node_feedback('suggestion', '00000000-0000-0000-0000-0000000000ff', '{"id":1500000005,"student_id":"00000000-0000-0000-0000-0000000000ff","message":"x"}')$q$, 'Estudiante no encontrado');
  perform pg_temp.fails($q$select apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', '{"id":1500000005,"student_id":"00000000-0000-0000-0000-00000000000b","message":"x"}')$q$, 'Mensaje inválido');
  perform pg_temp.fails($q$select apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', '{"id":5,"student_id":"00000000-0000-0000-0000-00000000000a","message":"x"}')$q$, 'Identificador inválido');
  perform pg_temp.fails($q$select apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', '{"id":1500000006,"student_id":"00000000-0000-0000-0000-00000000000a","message":"   "}')$q$, 'Sugerencia inválida');
  perform pg_temp.fails($q$select apply_node_feedback('suggestion', '00000000-0000-0000-0000-00000000000a', jsonb_build_object('id', 1500000006, 'student_id', '00000000-0000-0000-0000-00000000000a', 'message', repeat('x', 2001)))$q$, 'Mensaje inválido');
  perform pg_temp.fails($q$select apply_node_feedback('queja', '00000000-0000-0000-0000-00000000000a', '{"id":1500000007,"student_id":"00000000-0000-0000-0000-00000000000a","message":"x"}')$q$, 'no soportado');
  perform pg_temp.fails($q$select apply_node_feedback('rating', '00000000-0000-0000-0000-00000000000b', '{"id":1500000008,"student_id":"00000000-0000-0000-0000-00000000000b","teacher_id":"00000000-0000-0000-0000-0000000000a2","rating":9}')$q$, 'violates check');
  if has_function_privilege('authenticated', 'public.apply_node_feedback(text, uuid, jsonb)', 'execute') or has_function_privilege('anon', 'public.apply_node_feedback(text, uuid, jsonb)', 'execute') then raise exception 'PERMISOS_APP'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_feedback(text, uuid, jsonb)', 'execute') then raise exception 'PERMISOS_SERVICIO'; end if;
end $$;

select 'FEEDBACK_SQL_OK';
