// migrations/waivers-unique-por-grupo.sql: una sola exención por (docente, día, establecimiento, grado, sección) mientras no esté rechazada.
// PostgreSQL de verdad; se omite sin binarios (igual que duel-one-open-pair-sql.test.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(ROOT, 'migrations', 'waivers-unique-por-grupo.sql'), 'utf8');
const T1 = '00000000-0000-0000-0000-0000000000a1', T2 = '00000000-0000-0000-0000-0000000000a2';
// La salida de psql en Windows trae \r\n: se normaliza.
const out = (r) => r.stdout.split('\r').join('').trim();

let pg = null;
after(() => pg?.stop());

test('deja la más antigua de los repetidos (marca el resto rechazado, sin borrar), crea el índice y bloquea nuevos repetidos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-waivers-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };

  assert.equal(run(`create table public.attendance_waivers (
      id uuid primary key default gen_random_uuid(), teacher_id uuid not null, date date not null, reason text not null,
      status text default 'pending', admin_comment text, created_at timestamptz not null default now(),
      school_code text, grade text, section text, updated_at timestamptz default now());`).status, 0);

  const ins = (id, t, date, sc, g, s, st, ts) => `insert into public.attendance_waivers (id, teacher_id, date, reason, status, created_at, school_code, grade, section)
    values ('${id}', '${t}', '${date}', 'x', ${st === null ? 'null' : `'${st}'`}, '${ts}', '${sc}', ${g === null ? 'null' : `'${g}'`}, ${s === null ? 'null' : `'${s}'`});`;
  const id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const D = '2026-11-12';
  const seed = [
    // Grupo Primero A: 3 no rechazados (el más antiguo es el 2, aprobado a propósito: se conserva el MÁS ANTIGUO, no el aprobado) + 1 rechazado previo.
    ins(id(1), T1, D, 'E1', 'Primero', 'A', 'pending', '2026-11-12 10:00:05+00'),
    ins(id(2), T1, D, 'E1', 'Primero', 'A', 'approved', '2026-11-12 10:00:00+00'),
    ins(id(3), T1, D, 'E1', 'Primero', 'A', null, '2026-11-12 10:00:09+00'),
    ins(id(4), T1, D, 'E1', 'Primero', 'A', 'rejected', '2026-11-12 09:00:00+00'),
    // Todo el establecimiento (grado y sección NULL): 2 repetidos, NULL cuenta como igual.
    ins(id(5), T1, D, 'E1', null, null, 'pending', '2026-11-12 11:00:00+00'),
    ins(id(6), T1, D, 'E1', null, null, 'pending', '2026-11-12 11:00:30+00'),
    // Lo que NO es repetido: otra sección, otro día, otro docente, otro establecimiento.
    ins(id(7), T1, D, 'E1', 'Primero', 'B', 'pending', '2026-11-12 10:00:00+00'),
    ins(id(8), T1, '2026-11-13', 'E1', 'Primero', 'A', 'pending', '2026-11-13 10:00:00+00'),
    ins(id(9), T2, D, 'E1', 'Primero', 'A', 'pending', '2026-11-12 10:00:00+00'),
    ins(id(10), T1, D, 'E2', 'Primero', 'A', 'pending', '2026-11-12 10:00:00+00'),
  ].join('\n');
  assert.equal(run(seed).status, 0);

  const first = run(migration);
  assert.equal(first.status, 0, first.stderr);

  const rows = out(run(`select right(id::text, 2)::int || '=' || coalesce(status, 'NULL') from public.attendance_waivers order by right(id::text, 2)::int;`)).split('\n').join(' ');
  assert.equal(rows, '1=rejected 2=approved 3=rejected 4=rejected 5=pending 6=rejected 7=pending 8=pending 9=pending 10=pending',
    'queda la más antigua de cada grupo; los repetidos pasan a rejected; lo demás no se toca');
  assert.equal(out(run('select count(*) from public.attendance_waivers;')), '10', 'no se borra ninguna fila');
  assert.match(out(run(`select admin_comment from public.attendance_waivers where id = '${id(1)}';`)), /Duplicada: se conserva la solicitud más antigua/);
  assert.equal(out(run(`select coalesce(admin_comment, 'sin nota') from public.attendance_waivers where id = '${id(2)}';`)), 'sin nota', 'la conservada no cambia');
  assert.equal(out(run("select count(*) from pg_indexes where schemaname = 'public' and indexname = 'attendance_waivers_unique_group_day';")), '1');

  // El candado: repetir un grupo ya enviado (pendiente o aprobado) falla con 23505; NULL cuenta como igual.
  const dup = (n, t, date, sc, g, s) => run(ins(id(n), t, date, sc, g, s, 'pending', '2026-11-12 12:00:00+00'));
  for (const [t, date, sc, g, s] of [[T1, D, 'E1', 'Primero', 'A'], [T1, D, 'E1', 'Primero', 'B'], [T1, D, 'E1', null, null]]) {
    const r = dup(100, t, date, sc, g, s);
    assert.notEqual(r.status, 0, `${g}/${s} debía fallar`);
    assert.match(r.stderr, /duplicate key value violates unique constraint "attendance_waivers_unique_group_day"/);
  }
  // Lo que sí se puede: otra sección, otro día, otro docente, otro establecimiento, y reenviar una que quedó rechazada.
  assert.equal(dup(101, T1, D, 'E1', 'Segundo', 'A').status, 0, 'otro grado');
  assert.equal(dup(102, T1, '2026-11-14', 'E1', 'Primero', 'A').status, 0, 'otro día');
  assert.equal(dup(103, T2, D, 'E1', null, null).status, 0, 'otro docente');
  assert.equal(dup(104, T1, D, 'E3', null, null).status, 0, 'otro establecimiento');
  // Rechazar libera el grupo: se puede reenviar, pero solo una vez más.
  assert.equal(run(`update public.attendance_waivers set status = 'rejected' where id = '${id(10)}';`).status, 0);
  assert.equal(dup(105, T1, D, 'E2', 'Primero', 'A').status, 0, 'reenviar una exención rechazada');
  const again = dup(106, T1, D, 'E2', 'Primero', 'A');
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /attendance_waivers_unique_group_day/);

  // Re-ejecutable: no cambia nada (ya no hay repetidos) y el índice sigue siendo uno solo.
  const before = out(run('select id, status, admin_comment, updated_at from public.attendance_waivers order by id;'));
  const rerun = run(migration);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(out(run('select id, status, admin_comment, updated_at from public.attendance_waivers order by id;')), before);
  assert.equal(out(run("select count(*) from pg_indexes where schemaname = 'public' and indexname = 'attendance_waivers_unique_group_day';")), '1');
});

test('la migración solo marca como rechazadas (no borra) y el índice es parcial con NULL tratados como iguales', () => {
  const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bdrop\b/i);
  assert.match(code, /set status = 'rejected'/);
  assert.match(code, /where status is distinct from 'rejected'/, 'solo cuenta lo no rechazado (y el predicado cubre status NULL)');
  assert.match(code, /create unique index if not exists attendance_waivers_unique_group_day/);
  assert.match(code, /coalesce\(grade, ''\), coalesce\(section, ''\)/, 'grade/section NULL cuentan como iguales');
  assert.match(code, /order by created_at asc/, 'se conserva la más antigua');
});

test('la migración está registrada: orden del CI (rls-auth-uid-initplan sigue al final), verificador y docs', () => {
  const orden = fs.readFileSync(path.join(ROOT, 'scripts', 'ci', 'migraciones-orden.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(orden.includes('waivers-unique-por-grupo'));
  assert.equal(orden.at(-1), 'rls-auth-uid-initplan');
  assert.match(fs.readFileSync(path.join(ROOT, 'migrations', 'verificar-migraciones.sql'), 'utf8'), /'waivers-unique-por-grupo',\s+'indice',\s+'attendance_waivers_unique_group_day'/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs', 'MIGRATIONS.md'), 'utf8').includes('`waivers-unique-por-grupo.sql`'));
});
