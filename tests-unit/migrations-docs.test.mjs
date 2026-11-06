// Orden y verificación de migraciones:
//  1. Toda migración de migrations/ está en la tabla de docs/MIGRATIONS.md (no puede volver a quedar una sin documentar).
//  2. migrations/verificar-migraciones.sql (solo lectura) corre en un PostgreSQL de verdad y devuelve una fila por comprobación,
//     con la exposición de seguridad «cerrada» en una base vacía y lo demás en false hasta que la migración se corre.
//  3. Todo archivo que verificar-migraciones.sql menciona existe en migrations/ y en la tabla.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = fs.readFileSync(path.join(ROOT, 'docs', 'MIGRATIONS.md'), 'utf8');
const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
const verify = fs.readFileSync(path.join(ROOT, 'migrations', 'verificar-migraciones.sql'), 'utf8');
// Archivos que no son migraciones de la tabla: el propio verificador y la limpieza de la demo.
const NOT_IN_TABLE = new Set(['verificar-migraciones.sql', 'demo-school-remove.sql']);

test('toda migración de migrations/ aparece en docs/MIGRATIONS.md', () => {
  const missing = files.filter((f) => !NOT_IN_TABLE.has(f) && !docs.includes(`\`${f}\``));
  assert.deepEqual(missing, [], 'agrega estas migraciones a la tabla de docs/MIGRATIONS.md');
});

test('verificar-migraciones.sql solo lee (ni un INSERT, UPDATE, DELETE, DROP, ALTER, CREATE ni GRANT fuera de comentarios)', () => {
  const code = verify.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
});

test('cada migración que verifica existe en migrations/ y está documentada', () => {
  const names = [...new Set([...verify.matchAll(/^\s*\(\d+,\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 30, `se esperaban ≥30 migraciones verificadas, hay ${names.length}`);
  for (const n of names) {
    assert.ok(files.includes(`${n}.sql`), `${n}.sql no existe en migrations/`);
    assert.ok(docs.includes(`\`${n}.sql\``), `${n}.sql no está en docs/MIGRATIONS.md`);
  }
  const orders = [...verify.matchAll(/^\s*\((\d+),/gm)].map((m) => Number(m[1]));
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'el orden de las filas es el orden de aplicación');
  assert.equal(new Set(orders).size, orders.length, 'sin órdenes repetidos');
});

let pg = null;
after(() => pg?.stop());

test('verificar-migraciones.sql corre en PostgreSQL: base vacía = nada aplicado (y sin exposición); con objetos creados = true', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-verify-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };
  const rows = (out) => Object.fromEntries(out.trim().split('\n').map((l) => { const [orden, mig, check, ok] = l.trim().split('|'); return [`${orden}|${mig}|${check}`, ok]; }));

  const empty = run(verify);
  assert.equal(empty.status, 0, empty.stderr);
  const e = rows(empty.stdout);
  const total = Object.keys(e).length;
  assert.ok(total >= 36, `${total} comprobaciones`);
  // En una base vacía no hay funciones expuestas a anon ni la política abierta: esas comprobaciones dan true; el resto, false.
  for (const [k, v] of Object.entries(e)) {
    const closed = /sin_anon|sin_politica|sin_auth_uid/.test(k);
    assert.equal(v, closed ? 't' : 'f', k);
  }

  const created = run(`
    create table public.exams (id int);
    create table public.practice_results (id int);
    create table public.tutor_attendance (id int, client_ref uuid);
    create function public.react_to_project(p int) returns int language sql as $$ select 1 -- excelente $$;
    create function public.toggle_project_like(p_project_id integer) returns int language sql as $$ select 1 $$;
    create function public.is_staff() returns boolean language sql as $$ select 'coordinador' = 'coordinador' $$;
    create role anon;
    create function public.increment_votes() returns int language sql as $$ select 1 $$;
  `);
  assert.equal(created.status, 0, created.stderr);
  const after1 = rows(run(verify).stdout);
  const get = (frag) => Object.entries(after1).find(([k]) => k.includes(frag))?.[1];
  assert.equal(get('|exams|'), 't');
  assert.equal(get('|practice-progress|'), 't');
  assert.equal(get('tutor_attendance.client_ref'), 't');
  assert.equal(get('|project-reactions-ranking-count|'), 't');
  assert.equal(get('toggle_project_like'), 't');
  assert.equal(get('|fix-is-staff-coordinador|'), 't');
  assert.equal(get('|fix-students-rls-recursion|'), 'f', 'lo que no se creó sigue en false');
  // increment_votes existe y anon (por defecto, PUBLIC puede ejecutar) lo puede llamar: la exposición NO está cerrada.
  assert.equal(get('sin_anon: increment_votes'), 'f');
});
