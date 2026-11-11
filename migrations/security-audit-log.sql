-- ============================================================
-- BITÁCORA DE SEGURIDAD: quién hizo qué en las acciones sensibles
--
-- Hasta hoy, si alguien eliminaba alumnos, cambiaba la contraseña de una clase, creaba un docente o cambiaba un rol, no quedaba rastro en
-- ningún lugar que se pudiera consultar (solo los registros efímeros de las Edge Functions). Esta migración crea:
--
--   * security_audit_log: tabla de SOLO AGREGAR. Nadie puede modificar ni borrar una fila (un trigger lo impide, también al service_role),
--     y nadie desde la app puede insertar: solo la función de abajo. Solo un administrador la puede leer.
--   * log_security_event(...): la única forma de escribir. Solo service_role (las Edge Functions) y otras funciones de la base. Quita de
--     «details» cualquier llave que parezca secreto (password, token, clave, hash, cui...) y recorta lo muy grande.
--   * Triggers que registran, con quién fue (auth.uid()) y SIN datos personales de menores ni secretos:
--       teachers  -> teacher_created, teacher_deleted, teacher_role_changed
--       students  -> students_deleted (una fila por sentencia: cuántos, de qué colegios y una muestra de ids)
--       schools   -> school_deleted
--       school_nodes -> school_node_registered, school_node_revoked, school_node_deleted
--       student_guardians -> guardian_portal_link_regenerated (no guarda el enlace)
--       class_passwords   -> class_password_changed (no guarda la contraseña)
--     Los triggers NO registran cuando no hay sesión (auth.uid() null: service_role, cron o el SQL Editor): esas acciones las registran las
--     Edge Functions con quién las pidió (admin-*, staff-student-passwords) y así no se duplican.
--   * admin_reset_user_password y reset_password_via_admin (ya existentes) ahora registran user_password_reset.
--   * get_security_audit_log(limite, acción, antes_de): lectura paginada para administradores (la usará la pantalla «Bitácora»).
--
-- ADITIVO. Seguro de re-ejecutar. No guarda contraseñas, tokens ni nombres de menores. Pegar completo en el SQL Editor de Supabase.
-- ORDEN: correrla ANTES de redesplegar las Edge Functions que registran (si falta, esas funciones siguen funcionando y lo avisan en sus registros).
-- ============================================================

create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null check (char_length(action) between 3 and 60),
  target_type text,
  target_id text,
  school_code text,
  details jsonb not null default '{}'::jsonb,
  source text not null default 'db' check (char_length(source) <= 80)
);

create index if not exists idx_security_audit_created on public.security_audit_log (created_at desc, id desc);
create index if not exists idx_security_audit_action on public.security_audit_log (action, created_at desc);
create index if not exists idx_security_audit_actor on public.security_audit_log (actor_id, created_at desc);

alter table public.security_audit_log enable row level security;
revoke all on public.security_audit_log from public, anon, authenticated;
grant select on public.security_audit_log to authenticated;

drop policy if exists "security_audit_select_admin" on public.security_audit_log;
create policy "security_audit_select_admin" on public.security_audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- Solo agregar: ni UPDATE, ni DELETE, ni TRUNCATE (tampoco para service_role, que se salta RLS).
create or replace function public.security_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La bitácora de seguridad solo se puede agregar: no se modifica ni se borra';
end;
$$;

drop trigger if exists trg_security_audit_no_change on public.security_audit_log;
create trigger trg_security_audit_no_change before update or delete on public.security_audit_log
  for each row execute function public.security_audit_immutable();

drop trigger if exists trg_security_audit_no_truncate on public.security_audit_log;
create trigger trg_security_audit_no_truncate before truncate on public.security_audit_log
  for each statement execute function public.security_audit_immutable();

-- Escribir en la bitácora. Quita llaves que parezcan secretos y recorta detalles enormes.
create or replace function public.log_security_event(
  p_actor uuid,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_school text default null,
  p_details jsonb default '{}'::jsonb,
  p_source text default 'db'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if p_action is null or char_length(p_action) not between 3 and 60 then
    raise exception 'log_security_event: acción inválida';
  end if;

  if p_actor is not null then
    select t.role into v_role from public.teachers t where t.id = p_actor;
    if v_role is null and exists (select 1 from public.students s where s.id = p_actor) then v_role := 'estudiante'; end if;
  end if;

  if jsonb_typeof(v_details) = 'object' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_details
    from jsonb_each(v_details) e
    where e.key !~* '(pass|clave|token|secret|hash|enc|cui|key|codigo)';
  else
    v_details := jsonb_build_object('valor', v_details);
  end if;
  if pg_column_size(v_details) > 8000 then
    v_details := jsonb_build_object('recortado', true);
  end if;

  insert into public.security_audit_log (actor_id, actor_role, action, target_type, target_id, school_code, details, source)
  values (p_actor, v_role, p_action, left(p_target_type, 60), left(p_target_id, 200), left(p_school, 40), v_details, left(coalesce(p_source, 'db'), 80));
end;
$$;

revoke all on function public.log_security_event(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.log_security_event(uuid, text, text, text, text, jsonb, text) to service_role;

-- ---------- Triggers ----------
-- (security definer: quien dispara el trigger no puede insertar en la bitácora; la función sí. Sin sesión no se registra.)

create or replace function public.audit_teachers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_security_event(auth.uid(), 'teacher_created', 'teacher', new.id::text, null, jsonb_build_object('role', new.role), 'db:teachers');
  elsif tg_op = 'DELETE' then
    perform public.log_security_event(auth.uid(), 'teacher_deleted', 'teacher', old.id::text, null, jsonb_build_object('role', old.role), 'db:teachers');
  elsif old.role is distinct from new.role then
    perform public.log_security_event(auth.uid(), 'teacher_role_changed', 'teacher', new.id::text, null, jsonb_build_object('from', old.role, 'to', new.role), 'db:teachers');
  end if;
  return null;
end;
$$;

create or replace function public.audit_students_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer; v_schools text[]; v_ids text[];
begin
  if auth.uid() is null then return null; end if;
  select count(*), array_agg(distinct school_code), (array_agg(id::text))[1:20] into v_count, v_schools, v_ids from old_rows;
  if coalesce(v_count, 0) = 0 then return null; end if;
  perform public.log_security_event(auth.uid(), 'students_deleted', 'student', null,
    case when array_length(v_schools, 1) = 1 then v_schools[1] else null end,
    jsonb_build_object('count', v_count, 'schools', to_jsonb(v_schools), 'sample_ids', to_jsonb(v_ids)), 'db:students');
  return null;
end;
$$;

create or replace function public.audit_schools_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform public.log_security_event(auth.uid(), 'school_deleted', 'school', old.code, old.code, jsonb_build_object('name', old.name), 'db:schools');
  return null;
end;
$$;

create or replace function public.audit_school_nodes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_security_event(auth.uid(), 'school_node_registered', 'school_node', new.id::text, new.school_code, jsonb_build_object('name', new.name), 'db:school_nodes');
  elsif tg_op = 'DELETE' then
    perform public.log_security_event(auth.uid(), 'school_node_deleted', 'school_node', old.id::text, old.school_code, jsonb_build_object('name', old.name), 'db:school_nodes');
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform public.log_security_event(auth.uid(), 'school_node_revoked', 'school_node', new.id::text, new.school_code, jsonb_build_object('name', new.name), 'db:school_nodes');
  end if;
  return null;
end;
$$;

create or replace function public.audit_guardian_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if old.portal_token is distinct from new.portal_token then
    perform public.log_security_event(auth.uid(), 'guardian_portal_link_regenerated', 'guardian', new.id::text, null, jsonb_build_object('student_id', new.student_id), 'db:student_guardians');
  end if;
  return null;
end;
$$;

create or replace function public.audit_class_password()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' or old.password is distinct from new.password or old.requires_password is distinct from new.requires_password then
    perform public.log_security_event(auth.uid(), 'class_password_changed', 'class', new.school_code || '|' || new.grade || '|' || new.section, new.school_code,
      jsonb_build_object('grade', new.grade, 'section', new.section, 'protegida', new.requires_password), 'db:class_passwords');
  end if;
  return null;
end;
$$;

-- Solo se crean si la tabla existe (la migración también corre en una base parcial).
do $$
begin
  if to_regclass('public.teachers') is not null then
    drop trigger if exists trg_audit_teachers on public.teachers;
    create trigger trg_audit_teachers after insert or delete or update of role on public.teachers
      for each row execute function public.audit_teachers();
  end if;
  if to_regclass('public.students') is not null then
    drop trigger if exists trg_audit_students_deleted on public.students;
    create trigger trg_audit_students_deleted after delete on public.students
      referencing old table as old_rows for each statement execute function public.audit_students_deleted();
  end if;
  if to_regclass('public.schools') is not null then
    drop trigger if exists trg_audit_schools_deleted on public.schools;
    create trigger trg_audit_schools_deleted after delete on public.schools
      for each row execute function public.audit_schools_deleted();
  end if;
  if to_regclass('public.school_nodes') is not null then
    drop trigger if exists trg_audit_school_nodes on public.school_nodes;
    create trigger trg_audit_school_nodes after insert or delete or update of revoked_at on public.school_nodes
      for each row execute function public.audit_school_nodes();
  end if;
  if to_regclass('public.student_guardians') is not null then
    drop trigger if exists trg_audit_guardian_link on public.student_guardians;
    create trigger trg_audit_guardian_link after update of portal_token on public.student_guardians
      for each row execute function public.audit_guardian_link();
  end if;
  if to_regclass('public.class_passwords') is not null then
    drop trigger if exists trg_audit_class_password on public.class_passwords;
    create trigger trg_audit_class_password after insert or update on public.class_passwords
      for each row execute function public.audit_class_password();
  end if;
end $$;

-- ---------- Los dos reinicios de contraseña que ya existían: ahora dejan rastro (mismo comportamiento y permisos de antes) ----------
create or replace function public.admin_reset_user_password(user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede resetear contraseñas';
  end if;
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = user_id;
  perform public.log_security_event(auth.uid(), 'user_password_reset', 'user', user_id::text, null, '{}'::jsonb, 'sql:admin_reset_user_password');
end;
$$;

create or replace function public.reset_password_via_admin(target_email text, new_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select role into requester_role from public.profiles where id = auth.uid();

  if requester_role is null or requester_role not in ('admin', 'docente') then
    raise exception 'Solo docentes pueden cambiar claves.';
  end if;

  select u.id into v_target from auth.users u where u.email = target_email;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where email = target_email;

  perform public.log_security_event(auth.uid(), 'user_password_reset', 'user', v_target::text, null, '{}'::jsonb, 'sql:reset_password_via_admin');
  return 'OK';
end;
$$;

-- ---------- Lectura para administradores ----------
create or replace function public.get_security_audit_log(
  p_limit integer default 100,
  p_action text default null,
  p_before timestamptz default null
)
returns table (
  id bigint, created_at timestamptz, actor_id uuid, actor_name text, actor_role text,
  action text, target_type text, target_id text, school_code text, details jsonb, source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver la bitácora';
  end if;
  return query
    select l.id, l.created_at, l.actor_id, t.full_name, l.actor_role, l.action, l.target_type, l.target_id, l.school_code, l.details, l.source
    from public.security_audit_log l
    left join public.teachers t on t.id = l.actor_id
    where (p_action is null or l.action = p_action)
      and (p_before is null or l.created_at < p_before)
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.get_security_audit_log(integer, text, timestamptz) from public, anon;
grant execute on function public.get_security_audit_log(integer, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tabla, función y triggers (deben salir 6 triggers de auditoría + 1 de solo agregar + 1 de truncate).
select count(*) filter (where tgname like 'trg\_audit\_%') as triggers_auditoria,
       count(*) filter (where tgname like 'trg\_security\_audit\_%') as triggers_solo_agregar
from pg_trigger where not tgisinternal and tgname like 'trg\_%audit\_%';
