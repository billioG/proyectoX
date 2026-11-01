-- Aserciones sobre migrations/xp-events.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on

create temp table _ids (name text primary key, id uuid);

-- Datos: dos estudiantes de la misma clase, uno de otra escuela; lecciones de su clase y de otras.
insert into public.students (id, xp, gems, school_code, grade, section) values
  ('00000000-0000-0000-0000-00000000000a', 0, 0, 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 0, 0, 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-00000000000c', 0, 0, 'ESC2', 'Primero', 'A');
insert into public.courses (id, school_code, grade, section) values
  ('00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-0000000000a2', 'ESC1', 'Segundo', 'B');
-- Lección de la clase (su curso es de la clase), lección de OTRA clase y lección antigua sin curso (usa sus propias columnas).
insert into public.lessons (id, course_id, school_code, grade, section) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'ESC1', 'Segundo', 'B'),
  ('00000000-0000-0000-0000-0000000000e3', null, 'ESC1', 'Primero', 'A'),
  ('00000000-0000-0000-0000-0000000000e4', null, 'ESC9', 'Primero', 'A');
-- 40 lecciones más de la clase para probar el tope diario.
insert into public.lessons (course_id, school_code, grade, section)
  select '00000000-0000-0000-0000-0000000000a1', 'ESC1', 'Primero', 'A' from generate_series(1, 40);

\ir ../../migrations/xp-events.sql
-- Idempotente: la segunda vez no falla.
\ir ../../migrations/xp-events.sql

-- 1) Una lección de su clase paga 10 XP una sola vez (insertar, actualizar y reinsertar).
do $$ declare v int; n int; begin
  insert into public.lesson_completions (lesson_id, student_id, status) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'completed');
  update public.lesson_completions set score = 90, status = 'completed' where lesson_id = '00000000-0000-0000-0000-0000000000e1';
  update public.lesson_completions set status = 'in_progress' where lesson_id = '00000000-0000-0000-0000-0000000000e1';
  update public.lesson_completions set status = 'completed' where lesson_id = '00000000-0000-0000-0000-0000000000e1';
  select xp into v from public.students where id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into n from public.xp_events where student_id = '00000000-0000-0000-0000-00000000000a' and kind = 'lesson';
  if v <> 10 or n <> 1 then raise exception 'UNA_VEZ: xp=% eventos=%', v, n; end if;
end $$;

-- 2) Una lección pasa de en progreso a completada: paga al completarse, no antes.
do $$ declare v int; begin
  insert into public.lesson_completions (lesson_id, student_id, status) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000b', 'in_progress');
  select xp into v from public.students where id = '00000000-0000-0000-0000-00000000000b';
  if v <> 0 then raise exception 'EN_PROGRESO_NO_PAGA: xp=%', v; end if;
  update public.lesson_completions set status = 'completed' where lesson_id = '00000000-0000-0000-0000-0000000000e3' and student_id = '00000000-0000-0000-0000-00000000000b';
  select xp into v from public.students where id = '00000000-0000-0000-0000-00000000000b';
  if v <> 10 then raise exception 'COMPLETADA_PAGA: xp=%', v; end if;
end $$;

-- 3) Lecciones de OTRA clase o de otra escuela no pagan (C1: no se puede farmear con ids ajenos).
do $$ declare v int; begin
  insert into public.lesson_completions (lesson_id, student_id, status) values
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000b', 'completed'),   -- otra clase (por curso)
    ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-00000000000b', 'completed');   -- otra escuela (lección antigua)
  select xp into v from public.students where id = '00000000-0000-0000-0000-00000000000b';
  if v <> 10 then raise exception 'LECCION_AJENA_NO_PAGA: xp=%', v; end if;
end $$;

-- 4) Tope diario: aunque complete 40 lecciones de su clase, se pagan como máximo 30 al día (incluye la anterior).
do $$ declare v int; n int; begin
  insert into public.lesson_completions (lesson_id, student_id, status)
    select id, '00000000-0000-0000-0000-00000000000a', 'completed' from public.lessons where course_id = '00000000-0000-0000-0000-0000000000a1'
    on conflict (lesson_id, student_id) do nothing;
  select xp into v from public.students where id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into n from public.xp_events where student_id = '00000000-0000-0000-0000-00000000000a' and kind = 'lesson';
  if n <> 30 or v <> 300 then raise exception 'TOPE_DIARIO: eventos=% xp=%', n, v; end if;
end $$;

-- 5) Cofre del nodo: premios válidos suman una vez; repetir el mismo día no suma.
do $$ declare r boolean; x int; g int; d date := (now() at time zone 'America/Guatemala')::date; begin
  select apply_node_chest('00000000-0000-0000-0000-00000000000c', d, 20, 5) into r;
  if r is not true then raise exception 'COFRE_VALIDO: %', r; end if;
  select apply_node_chest('00000000-0000-0000-0000-00000000000c', d, 20, 5) into r;
  if r is not false then raise exception 'COFRE_REPETIDO: %', r; end if;
  select apply_node_chest('00000000-0000-0000-0000-00000000000c', d, 100, 50) into r;
  if r is not false then raise exception 'COFRE_MISMO_DIA_OTRO_PREMIO: %', r; end if;
  select xp, gems into x, g from public.students where id = '00000000-0000-0000-0000-00000000000c';
  if x <> 20 or g <> 5 then raise exception 'COFRE_SUMA_UNA_VEZ: xp=% gems=%', x, g; end if;
end $$;

-- 6) Un cofre de un día anterior sin reclamar SÍ se acepta (USB semanal) y no retrocede la fecha del último cofre.
do $$ declare r boolean; last date; d date := (now() at time zone 'America/Guatemala')::date; x int; begin
  select apply_node_chest('00000000-0000-0000-0000-00000000000c', d - 5, 50, 15) into r;
  if r is not true then raise exception 'COFRE_ANTERIOR_SE_ACEPTA: %', r; end if;
  select daily_chest_last_claimed, xp into last, x from public.students where id = '00000000-0000-0000-0000-00000000000c';
  if last <> d or x <> 70 then raise exception 'COFRE_NO_RETROCEDE_FECHA: last=% xp=%', last, x; end if;
  -- hasta 14 días atrás; 15 no.
  select apply_node_chest('00000000-0000-0000-0000-00000000000c', d - 14, 20, 5) into r;
  if r is not true then raise exception 'COFRE_14_DIAS: %', r; end if;
end $$;

-- 7) Datos inválidos lanzan error: premio inventado, fecha futura, fecha vieja, estudiante inexistente.
do $$ declare d date := (now() at time zone 'America/Guatemala')::date; begin
  begin perform apply_node_chest('00000000-0000-0000-0000-00000000000c', d - 1, 999, 5); raise exception 'FALLO: premio inventado aceptado';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_chest('00000000-0000-0000-0000-00000000000c', d + 1, 20, 5); raise exception 'FALLO: fecha futura aceptada';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_chest('00000000-0000-0000-0000-00000000000c', d - 15, 20, 5); raise exception 'FALLO: fecha vieja aceptada';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  begin perform apply_node_chest('00000000-0000-0000-0000-0000000000ff', d, 20, 5); raise exception 'FALLO: estudiante inexistente aceptado';
  exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
end $$;

-- 8) Permisos: los clientes no leen ni escriben xp_events ni ejecutan apply_node_chest; service_role sí ejecuta.
do $$ begin
  if has_table_privilege('authenticated', 'public.xp_events', 'select') or has_table_privilege('anon', 'public.xp_events', 'select')
     or has_table_privilege('authenticated', 'public.xp_events', 'insert') then raise exception 'PERMISOS_TABLA'; end if;
  if has_function_privilege('authenticated', 'public.apply_node_chest(uuid,date,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.apply_node_chest(uuid,date,integer,integer)', 'execute') then raise exception 'PERMISOS_FUNCION_CLIENTES'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_chest(uuid,date,integer,integer)', 'execute') then raise exception 'PERMISOS_SERVICE_ROLE'; end if;
end $$;

select 'XP_EVENTS_SQL_OK';
