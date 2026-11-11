// migrations/security-audit-log.sql: bitácora de seguridad (solo agregar, sin secretos, solo admin la lee). PostgreSQL de verdad; se omite sin binarios.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(ROOT, 'migrations', 'security-audit-log.sql'), 'utf8');
const ADMIN = '00000000-0000-0000-0000-0000000000aa', DOC = '00000000-0000-0000-0000-0000000000bb';
const S1 = '00000000-0000-0000-0000-000000000001', S2 = '00000000-0000-0000-0000-000000000002', S3 = '00000000-0000-0000-0000-000000000003';
const N1 = '00000000-0000-0000-0000-0000000000d1', G1 = '00000000-0000-0000-0000-0000000000e1', U1 = '00000000-0000-0000-0000-0000000000f1';
// psql en Windows devuelve \r\n: se normaliza.
const out = (r) => r.stdout.split('\r').join('').trim();
const as = (uid) => `set request.jwt.claim.sub = '${uid}';`;

let pg = null;
after(() => pg?.stop());

const STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create extension if not exists pgcrypto;
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text, encrypted_password text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.teachers (id uuid primary key, full_name text, role text default 'docente');
  create table public.profiles (id uuid primary key, role text);
  create table public.students (id uuid primary key, school_code text, grade text, section text, full_name text);
  create table public.schools (id serial primary key, code text unique, name text);
  create table public.school_nodes (id uuid primary key, school_code text, name text, revoked_at timestamptz);
  create table public.student_guardians (id uuid primary key, student_id uuid, portal_token text);
  create table public.class_passwords (school_code text, grade text, section text, password text, requires_password boolean default true, primary key (school_code, grade, section));
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') $$;
  insert into public.teachers (id, full_name, role) values ('${ADMIN}', 'Admin Prueba', 'admin'), ('${DOC}', 'Docente Prueba', 'docente');
  insert into public.profiles (id, role) values ('${ADMIN}', 'admin'), ('${DOC}', 'docente');
  insert into auth.users (id, email, encrypted_password) values ('${U1}', 'a@b.c', 'x');
`;

test('registra acciones sensibles sin secretos ni datos de menores, solo agrega y solo el admin la lee', { skip: pgSkip, timeout: 180000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-audit-'));
  let n = 0;
  const run = (sql) => { const f = path.join(dir, `q${n++}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };
  const q = (sql) => out(run(sql));

  assert.equal(run(STUB).status, 0);
  const m = run(migration);
  assert.equal(m.status, 0, m.stderr);
  assert.equal(run(migration).status, 0, 'se puede volver a correr');
  assert.equal(q("select count(*) from pg_trigger where not tgisinternal and tgname like 'trg\\_audit\\_%';"), '6');

  // 1. Acciones con sesión de administrador: cada una deja UNA fila con quién fue.
  const ops = `${as(ADMIN)}
    insert into public.teachers (id, full_name, role) values ('${DOC.replace('bb', 'cc')}', 'Otro Docente', 'docente');
    update public.teachers set role = 'coordinador' where id = '${DOC.replace('bb', 'cc')}';
    delete from public.teachers where id = '${DOC.replace('bb', 'cc')}';
    insert into public.students (id, school_code, grade, section, full_name) values
      ('${S1}', 'ESC1', 'Primero', 'A', 'Ana Menor'), ('${S2}', 'ESC1', 'Primero', 'A', 'Beto Menor'), ('${S3}', 'ESC2', 'Segundo', 'B', 'Carla Menor');
    delete from public.students;
    insert into public.schools (code, name) values ('ESC9', 'Escuela Nueve');
    delete from public.schools where code = 'ESC9';
    insert into public.school_nodes (id, school_code, name) values ('${N1}', 'ESC1', 'Nodo A');
    update public.school_nodes set revoked_at = now() where id = '${N1}';
    delete from public.school_nodes where id = '${N1}';
    insert into public.student_guardians (id, student_id, portal_token) values ('${G1}', '${S1}', 'TOKEN-SECRETO-VIEJO');
    update public.student_guardians set portal_token = 'TOKEN-SECRETO-NUEVO' where id = '${G1}';
    insert into public.class_passwords (school_code, grade, section, password, requires_password) values ('ESC1', 'Primero', 'A', 'CLAVE-SECRETA', true);
    update public.class_passwords set password = 'OTRA-CLAVE-SECRETA' where school_code = 'ESC1';
  `;
  assert.equal(run(ops).status, 0);
  const actions = q("select action || ':' || coalesce(actor_role, '-') from public.security_audit_log order by id;").split('\n');
  assert.deepEqual(actions, [
    'teacher_created:admin', 'teacher_role_changed:admin', 'teacher_deleted:admin', 'students_deleted:admin', 'school_deleted:admin',
    'school_node_registered:admin', 'school_node_revoked:admin', 'school_node_deleted:admin', 'guardian_portal_link_regenerated:admin',
    'class_password_changed:admin', 'class_password_changed:admin',
  ]);
  assert.equal(q("select details::text from public.security_audit_log where action = 'teacher_role_changed';"), '{"to": "coordinador", "from": "docente"}');
  assert.equal(q("select (details->>'count') || '/' || (details->'schools')::text from public.security_audit_log where action = 'students_deleted';"), '3/["ESC1", "ESC2"]', 'una fila por sentencia: cuántos y de qué colegios');
  const everything = q('select string_agg(details::text || target_id, \' \') from public.security_audit_log;');
  for (const secret of ['TOKEN-SECRETO', 'CLAVE-SECRETA', 'Ana Menor', 'Beto Menor', 'Carla Menor']) assert.ok(!everything.includes(secret), `la bitácora no debe contener «${secret}»`);

  // 2. Sin sesión (service_role, cron, SQL Editor) los triggers NO registran: lo hacen las Edge Functions con quién lo pidió.
  const before = q('select count(*) from public.security_audit_log;');
  assert.equal(run("insert into public.students (id, school_code) values ('00000000-0000-0000-0000-0000000000a9', 'X'); delete from public.students;").status, 0);
  assert.equal(q('select count(*) from public.security_audit_log;'), before);

  // 3. Solo agregar: ni UPDATE, ni DELETE, ni TRUNCATE (ni siquiera el dueño).
  for (const sql of ["update public.security_audit_log set action = 'otra';", 'delete from public.security_audit_log;', 'truncate public.security_audit_log;']) {
    const r = run(sql);
    assert.notEqual(r.status, 0, sql);
    assert.match(r.stderr, /solo se puede agregar/);
  }

  // 4. log_security_event: solo service_role, quita secretos, recorta lo enorme y valida la acción.
  assert.notEqual(run("set role authenticated; select public.log_security_event(null, 'prueba_x', null, null, null, '{}', 'x');").status, 0, 'authenticated no puede escribir');
  assert.notEqual(run("set role anon; select public.log_security_event(null, 'prueba_x', null, null, null, '{}', 'x');").status, 0, 'anon tampoco');
  assert.notEqual(run("set role authenticated; insert into public.security_audit_log (action) values ('hack_directo');").status, 0, 'ni insertar directo');
  assert.equal(run(`set role service_role; select public.log_security_event('${ADMIN}', 'student_passwords_revealed', 'student', null, 'ESC1',
    '{"password":"x","token":"t","api_key":"k","cui_alumno":"1","count":4}'::jsonb, 'edge:prueba');`).status, 0, 'service_role sí');
  assert.equal(q("select details::text || '|' || source from public.security_audit_log where action = 'student_passwords_revealed';"), '{"count": 4}|edge:prueba', 'solo queda lo que no parece secreto');
  assert.equal(run(`set role service_role; select public.log_security_event(null, 'grande', null, null, null, jsonb_build_object('x', repeat('a', 9000)), 'edge:prueba');`).status, 0);
  assert.equal(q("select details::text from public.security_audit_log where action = 'grande';"), '{"recortado": true}');
  assert.notEqual(run("set role service_role; select public.log_security_event(null, 'x', null, null, null, '{}', 'x');").status, 0, 'acción de menos de 3 caracteres');

  // 5. Lectura: solo el administrador (por la tabla y por la función).
  assert.equal(q(`${as(DOC)} set role authenticated; select count(*) from public.security_audit_log;`), '0', 'un docente no ve filas');
  assert.ok(Number(q(`${as(ADMIN)} set role authenticated; select count(*) from public.security_audit_log;`)) >= 13, 'el admin ve todo');
  const denied = run(`${as(DOC)} set role authenticated; select * from public.get_security_audit_log(10);`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Solo un administrador puede ver la bitácora/);
  assert.notEqual(run(`set role anon; select * from public.get_security_audit_log(10);`).status, 0, 'anon no ejecuta la lectura');
  const page = q(`${as(ADMIN)} set role authenticated; select action || ':' || coalesce(actor_name, '-') from public.get_security_audit_log(2);`).split('\n');
  assert.equal(page.length, 2, 'respeta el límite');
  assert.equal(q(`${as(ADMIN)} set role authenticated; select count(*) from public.get_security_audit_log(100, 'class_password_changed');`), '2', 'filtra por acción');
  assert.equal(q(`${as(ADMIN)} set role authenticated; select actor_name from public.get_security_audit_log(1, 'school_deleted');`), 'Admin Prueba', 'trae el nombre de quien lo hizo');
  assert.equal(q(`${as(ADMIN)} set role authenticated; select count(*) from public.get_security_audit_log(100, null, now() - interval '1 day');`), '0', 'paginación por fecha');

  // 6. Los reinicios de contraseña que ya existían registran y conservan sus permisos (solo admin / docente con sesión).
  assert.equal(run(`${as(ADMIN)} select public.admin_reset_user_password('${U1}', 'nueva-clave-123');`).status, 0);
  assert.equal(run(`${as(ADMIN)} select public.reset_password_via_admin('a@b.c', 'otra-clave-456');`).status, 0);
  assert.equal(q("select count(*) from public.security_audit_log where action = 'user_password_reset';"), '2');
  assert.equal(q("select string_agg(details::text, ' ') from public.security_audit_log where action = 'user_password_reset';"), '{} {}', 'sin la contraseña');
  const noAdmin = run(`${as(DOC)} select public.admin_reset_user_password('${U1}', 'x');`);
  assert.notEqual(noAdmin.status, 0, 'un docente no puede reiniciar con la función de admin');
});

test('la migración no borra datos y la bitácora no guarda secretos por diseño', () => {
  const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\bdrop table\b|\btruncate table\b|\bdelete from public\.(?!security_audit_log)/i);
  assert.match(code, /!~\* '\(pass\|clave\|token\|secret\|hash\|enc\|cui\|key\|codigo\)'/, 'filtra llaves que parezcan secretos');
});
