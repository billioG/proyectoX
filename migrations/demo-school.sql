-- ============================================================
-- Plantel de DEMOSTRACIÓN con datos inventados (para demos
-- comerciales). Nunca demostrar con un plantel que tenga menores
-- reales registrados.
--
-- Crea: "Colegio Demostración Quetzal" (código DEMO-QUETZAL),
-- 1ro Básico A y 2do Básico B, 12 alumnos ficticios, equipos,
-- 6 proyectos con score y votos, y 10 días de asistencia.
--
-- ANTES DE CORRER:
--   1. Crear el docente de demo desde la app (admin → Docentes →
--      nuevo docente): "Docente Demostración", correo
--      colegios@yoaprendo.online (ya está puesto abajo).
--   2. Poner la contraseña de clase que usarán los alumnos demo
--      en v_class_password (no la escribas en ningún material).
--
-- Ese docente y este plantel quedan fuera de los reportes del admin
-- y del tablero de Impacto (js/test-accounts-filter.js e
-- is_test_school_code en migrations/impact-metrics.sql).
--
-- Es seguro correrlo de nuevo: lo que ya existe no se duplica.
-- Para quitar todo: migrations/demo-school-remove.sql
-- ============================================================
do $$
declare
  v_teacher_email  text := 'colegios@yoaprendo.online';
  v_class_password text := 'CAMBIAR_CLAVE_DEMO';

  v_school   text := 'DEMO-QUETZAL';
  v_teacher  uuid;
  v_uid      uuid;
  r          record;
  d          date;
  i          int;
  -- nombre, usuario, grado, sección, equipo (1-4)
  v_students text[][] := array[
    ['María José López García',        'mlopezdemo',     '1ro Básico', 'A', '1'],
    ['Carlos Andrés Pérez Morales',     'cperezdemo',     '1ro Básico', 'A', '1'],
    ['Ana Lucía Hernández Cifuentes',   'ahernandezdemo', '1ro Básico', 'A', '1'],
    ['José Daniel Méndez Chávez',       'jmendezdemo',    '1ro Básico', 'A', '2'],
    ['Sofía Isabel Ramírez Toj',        'sramirezdemo',   '1ro Básico', 'A', '2'],
    ['Diego Alejandro Castillo Ajú',    'dcastillodemo',  '1ro Básico', 'A', '2'],
    ['Valeria Fernanda Juárez Coy',     'vjuarezdemo',    '2do Básico', 'B', '3'],
    ['Luis Fernando Ixcot Barrios',     'lixcotdemo',     '2do Básico', 'B', '3'],
    ['Camila Andrea Tzul Ortiz',        'ctzuldemo',      '2do Básico', 'B', '3'],
    ['Kevin Josué Sic Monterroso',      'ksicdemo',       '2do Básico', 'B', '4'],
    ['Gabriela Nohemí Xicay Estrada',   'gxicaydemo',     '2do Básico', 'B', '4'],
    ['Mateo Sebastián Batz Quiñónez',   'mbatzdemo',      '2do Básico', 'B', '4']
  ];
  v_groups text[][] := array[
    ['1', 'Los Inventores',      '1ro Básico', 'A'],
    ['2', 'Robots del Lago',     '1ro Básico', 'A'],
    ['3', 'Equipo Ceiba',        '2do Básico', 'B'],
    ['4', 'Chispas Creativas',   '2do Básico', 'B']
  ];
  -- equipo, título, descripción, bimestre, score, votos, días atrás
  v_projects text[][] := array[
    ['1', 'Huerto escolar con riego por goteo',
     'Diseñamos un sistema de riego con botellas recicladas y mangueras para el huerto del colegio. Medimos cuánta agua ahorra comparado con regar a mano.', '3', '92', '14', '20'],
    ['2', 'Semáforo inteligente con Arduino',
     'Un semáforo a escala que cambia más rápido cuando detecta peatones con un sensor ultrasónico.', '3', '88', '17', '16'],
    ['3', 'Estación meteorológica escolar',
     'Sensor de temperatura y humedad que registra datos cada hora; comparamos las mediciones con las del INSIVUMEH.', '3', '95', '11', '12'],
    ['4', 'Filtro de agua con materiales reciclados',
     'Filtro de arena, carbón y grava. Probamos la turbidez del agua antes y después con una linterna y una escala de colores.', '3', '84', '9', '9'],
    ['1', 'Juego de preguntas del CNB en Scratch',
     'Juego de trivia sobre Ciencias Naturales de 1ro Básico con puntajes y niveles, hecho en Scratch.', '4', '79', '6', '5'],
    ['3', 'Alarma sísmica con sensor de vibración',
     'Prototipo que enciende una luz y un zumbador al detectar vibración fuerte, pensado para simulacros de evacuación.', '4', '90', '8', '2']
  ];
begin
  if v_class_password = 'CAMBIAR_CLAVE_DEMO' then
    raise exception 'Editá v_class_password al inicio del script antes de correrlo.';
  end if;

  select id into v_teacher from public.teachers where lower(email) = lower(v_teacher_email);
  if v_teacher is null then
    raise exception 'No existe un docente con el correo %. Crealo primero desde la app (admin → Docentes).', v_teacher_email;
  end if;

  -- 1. Establecimiento
  insert into public.schools (code, name, department, municipality)
  select v_school, 'Colegio Demostración Quetzal', 'Guatemala', 'Guatemala'
  where not exists (select 1 from public.schools where code = v_school);

  -- 2. Clases: contraseña de clase y asignación del docente
  insert into public.class_passwords (school_code, grade, section, password, requires_password)
  values (v_school, '1ro Básico', 'A', v_class_password, true),
         (v_school, '2do Básico', 'B', v_class_password, true)
  on conflict (school_code, grade, section) do update set password = excluded.password, requires_password = true;

  insert into public.teacher_assignments (teacher_id, school_code, grade, section)
  select v_teacher, v_school, g, s
  from (values ('1ro Básico', 'A'), ('2do Básico', 'B')) as c(g, s)
  where not exists (select 1 from public.teacher_assignments ta
                    where ta.teacher_id = v_teacher and ta.school_code = v_school and ta.grade = c.g and ta.section = c.s);

  -- 3. Alumnos ficticios. Entran con usuario + contraseña de clase
  --    (student-login usa enlace mágico: la clave de auth no se usa).
  for i in 1 .. array_length(v_students, 1) loop
    if exists (select 1 from public.students where username = v_students[i][2]) then continue; end if;
    v_uid := gen_random_uuid();

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
            v_students[i][2] || '@estudiante.edu.gt',
            extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', v_students[i][1]), now(), now(), '', '', '', '');

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, 'email',
            jsonb_build_object('sub', v_uid::text, 'email', v_students[i][2] || '@estudiante.edu.gt', 'email_verified', true),
            now(), now(), now());

    insert into public.students (id, full_name, username, email, school_code, grade, section)
    values (v_uid, v_students[i][1], v_students[i][2], v_students[i][2] || '@estudiante.edu.gt',
            v_school, v_students[i][3], v_students[i][4]);
  end loop;

  -- 4. Equipos (se buscan por nombre dentro del plantel demo)
  for i in 1 .. array_length(v_groups, 1) loop
    insert into public.groups (name, school_code, grade, section)
    select v_groups[i][2], v_school, v_groups[i][3], v_groups[i][4]
    where not exists (select 1 from public.groups g where g.school_code = v_school and g.name = v_groups[i][2]);
  end loop;

  for i in 1 .. array_length(v_students, 1) loop
    insert into public.group_members (group_id, student_id, role)
    select g.id, s.id, (array['planner', 'maker', 'speaker'])[((i - 1) % 3) + 1]
      from public.students s
      join public.groups g on g.school_code = v_school and g.name = v_groups[v_students[i][5]::int][2]
     where s.username = v_students[i][2]
       and not exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.student_id = s.id);
  end loop;

  -- 5. Proyectos (el autor es el planner del equipo)
  for i in 1 .. array_length(v_projects, 1) loop
    insert into public.projects (user_id, group_id, title, description, bimestre, score, votes, created_at)
    select gm.student_id, g.id, v_projects[i][2], v_projects[i][3],
           v_projects[i][4]::int, v_projects[i][5]::int, v_projects[i][6]::int,
           now() - (v_projects[i][7] || ' days')::interval
      from public.groups g
      join public.group_members gm on gm.group_id = g.id and gm.role = 'planner'
     where g.school_code = v_school and g.name = v_groups[v_projects[i][1]::int][2]
       and not exists (select 1 from public.projects p where p.group_id = g.id and p.title = v_projects[i][2])
     limit 1;
  end loop;

  -- 6. Asistencia de los últimos 10 días hábiles. La app registra solo
  --    presentes: una ausencia es un día sin registro (~1 de cada 9).
  for r in select s.id, s.grade, s.section, row_number() over (order by s.username) as n
             from public.students s where s.school_code = v_school loop
    i := 0;
    d := current_date - 1;
    while i < 10 loop
      if extract(isodow from d) < 6 then
        i := i + 1;
        if (r.n + i) % 9 <> 0 then
          insert into public.attendance (student_id, teacher_id, school_code, grade, section, date, status)
          values (r.id, v_teacher, v_school, r.grade, r.section, d, 'present')
          on conflict (student_id, date) do nothing;
        end if;
      end if;
      d := d - 1;
    end loop;
  end loop;

  raise notice 'Plantel de demostración listo: % alumnos en DEMO-QUETZAL.',
    (select count(*) from public.students where school_code = v_school);
end $$;
