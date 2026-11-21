// Proyectos aislados por escuela en los dos sentidos (migrations/proyectos-escuela-aislada.sql): si MI escuela tiene
// schools.public_projects apagado, solo veo proyectos de mis escuelas; el admin lo ve todo.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const out = (r) => r.stdout.split('\r').join('').trim();

test('la migración define viewer_school_codes y project_author_visible', () => {
  const sql = read('migrations/proyectos-escuela-aislada.sql');
  assert.match(sql, /create or replace function public\.viewer_school_codes\(\)/);
  assert.match(sql, /create or replace function public\.project_author_visible\(p_author uuid\)/);
  assert.match(sql, /grant execute on function public\.viewer_school_codes\(\) to authenticated/);
  assert.match(sql, /revoke all on function public\.viewer_school_codes\(\) from anon/);
  assert.match(sql, /projects_select_restrict_private_school/);
});

let pg = null;
after(() => pg?.stop());

// uids de prueba
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ALU_A = U(1), ALU_B = U(2), ALU_C = U(3);        // alumnos de A (privada), B (pública), C (pública)
const DOC_A = U(11), DOC_AB = U(12);                    // docente de A; docente de A y B
const COORD_A = U(21);                                  // coordinador del docente de A
const ADMIN = U(31), SIN_ESCUELA = U(41);

test('visibilidad de autores en PostgreSQL de verdad: aislamiento en los dos sentidos, admin ve todo y la migración es re-ejecutable', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-aislada-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };
  const q = (sql) => { const r = run(sql); assert.equal(r.status, 0, r.stderr); return out(r); };
  const migration = read('migrations/proyectos-escuela-aislada.sql');

  const setup = run(`
    do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
    create schema if not exists auth;
    grant usage on schema auth to authenticated, anon;
    create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public to authenticated, anon;
    create table public.schools (code text primary key, public_projects boolean not null default true);
    create table public.students (id uuid primary key, school_code text);
    create table public.teacher_assignments (teacher_id uuid, school_code text);
    create table public.coordinator_assignments (coordinator_id uuid, teacher_id uuid);
    create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
    insert into public.schools values ('A', false), ('B', true), ('C', true);
    insert into public.students values ('${ALU_A}', 'A'), ('${ALU_B}', 'B'), ('${ALU_C}', 'C');
    insert into public.teacher_assignments values ('${DOC_A}', 'A'), ('${DOC_AB}', 'A'), ('${DOC_AB}', 'B');
    insert into public.coordinator_assignments values ('${COORD_A}', '${DOC_A}');
  `);
  assert.equal(setup.status, 0, setup.stderr);

  for (const pass of [1, 2]) { const m = run(migration); assert.equal(m.status, 0, `migración, pasada ${pass}: ${m.stderr}`); }
  assert.equal(q(`select position('viewer_school_codes' in pg_get_functiondef('public.project_author_visible(uuid)'::regprocedure)) > 0;`), 't');

  // ¿el viewer puede ver al autor? (ejecutado como `authenticated`, como en Supabase)
  const ve = (viewer, author, admin = false) =>
    q(`set role authenticated; set test.uid = '${viewer}'; set test.admin = '${admin ? 'on' : 'off'}'; select public.project_author_visible('${author}');`) === 't';
  const codes = (viewer) =>
    q(`set role authenticated; set test.uid = '${viewer}'; select array_to_string(public.viewer_school_codes(), ',');`);

  // viewer_school_codes: propias, sin duplicados, vacío si no hay
  assert.equal(codes(ALU_A), 'A');
  assert.equal(codes(DOC_AB), 'A,B');
  assert.equal(codes(COORD_A), 'A');
  assert.equal(codes(SIN_ESCUELA), '');
  assert.equal(q(`set role authenticated; set test.uid = '${SIN_ESCUELA}'; select public.viewer_school_codes() = array[]::text[];`), 't', 'sin escuelas devuelve array vacío, no nulo');

  // (i) escuela A privada: su alumno ve A y NO ve B pública
  assert.equal(ve(ALU_A, ALU_A), true);
  assert.equal(ve(ALU_A, ALU_B), false, 'alumno de A (privada) no ve a B');
  assert.equal(ve(ALU_A, ALU_C), false);
  // (ii) alumno de B (pública) ve B y NO ve A privada
  assert.equal(ve(ALU_B, ALU_B), true);
  assert.equal(ve(ALU_B, ALU_A), false, 'A privada sigue oculta a las demás');
  // (iii) alumno de C pública ve B y C
  assert.equal(ve(ALU_C, ALU_B), true);
  assert.equal(ve(ALU_C, ALU_C), true);
  assert.equal(ve(ALU_C, ALU_A), false);
  // (iv) docente de A (privada): ve A, no B; docente de A y B ve ambas (y no C: A, una de sus escuelas, es privada)
  assert.equal(ve(DOC_A, ALU_A), true);
  assert.equal(ve(DOC_A, ALU_B), false);
  assert.equal(ve(DOC_AB, ALU_A), true);
  assert.equal(ve(DOC_AB, ALU_B), true);
  assert.equal(ve(DOC_AB, ALU_C), false, 'tiene una escuela privada, así que no ve otras públicas');
  // (v) coordinador de un docente de A (privada): no ve B
  assert.equal(ve(COORD_A, ALU_A), true);
  assert.equal(ve(COORD_A, ALU_B), false);
  // (vi) admin ve todo
  for (const a of [ALU_A, ALU_B, ALU_C]) assert.equal(ve(ADMIN, a, true), true, `admin ve ${a}`);
  // (vii) viewer sin escuela: solo las públicas
  assert.equal(ve(SIN_ESCUELA, ALU_B), true);
  assert.equal(ve(SIN_ESCUELA, ALU_C), true);
  assert.equal(ve(SIN_ESCUELA, ALU_A), false);

  // Si la escuela A pasa a pública, el aislamiento desaparece (el interruptor manda).
  q(`update public.schools set public_projects = true where code = 'A';`);
  assert.equal(ve(ALU_A, ALU_B), true);
  assert.equal(ve(ALU_B, ALU_A), true);
  q(`update public.schools set public_projects = false where code = 'A';`);

  // Permisos: anon no puede ejecutar viewer_school_codes; authenticated sí.
  const anon = run(`set role anon; select public.viewer_school_codes();`);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  // (viii) re-ejecutar una tercera vez no falla y el resultado sigue igual
  const again = run(migration);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(ve(ALU_A, ALU_B), false);
});
