// migrations/duel-one-open-pair.sql: un solo reto abierto (pending/active) por pareja y por juego. PostgreSQL de verdad; se omite sin binarios.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(ROOT, 'migrations', 'duel-one-open-pair.sql'), 'utf8');
const TABLES = ['student_duels', 'student_hangman_duels', 'student_timed_math_duels', 'student_debug_duels', 'student_spelling_duels'];
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d';
// La salida de psql en Windows trae \r\n: se normaliza.
const out = (r) => r.stdout.split('\r').join('').trim();

let pg = null;
after(() => pg?.stop());

test('limpia los repetidos pending, deja pasar lo demás y bloquea nuevos repetidos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-duelpair-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };

  const setup = TABLES.map((t) => `create table public.${t} (
      id uuid primary key default gen_random_uuid(), challenger_id uuid not null, opponent_id uuid not null,
      status text not null default 'pending' check (status in ('pending','rejected','cancelled','active','completed')),
      created_at timestamptz not null default now(), check (challenger_id <> opponent_id));`).join('\n');
  assert.equal(run(setup).status, 0);

  // Hangman: 3 pending A->B (uno más viejo), 1 pending B->A (sentido contrario), 1 completed A->B, 1 active C->D.
  const ins = (t, ch, op, st, ts) => `insert into public.${t} (id, challenger_id, opponent_id, status, created_at) values (gen_random_uuid(), '${ch}', '${op}', '${st}', '${ts}');`;
  const h = 'student_hangman_duels';
  const seed = [
    ins(h, A, B, 'pending', '2026-11-09 10:00:00+00'), ins(h, A, B, 'pending', '2026-11-09 10:00:05+00'), ins(h, A, B, 'pending', '2026-11-09 10:00:09+00'),
    ins(h, B, A, 'pending', '2026-11-09 10:00:20+00'), ins(h, A, B, 'completed', '2026-11-08 09:00:00+00'), ins(h, C, D, 'active', '2026-11-09 11:00:00+00'),
    // student_duels: dos ACTIVOS entre la misma pareja (no se pueden resolver solos): no debe fallar ni crear ese índice.
    ins('student_duels', A, B, 'active', '2026-11-09 08:00:00+00'), ins('student_duels', B, A, 'active', '2026-11-09 08:30:00+00'),
  ].join('\n');
  assert.equal(run(seed).status, 0);

  const first = run(migration);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stderr, /student_duels tiene 1 pareja\(s\) con varios retos ACTIVOS/, 'avisa y sigue');

  const states = out(run(`select status || '=' || count(*) from public.${h} group by status order by status;`)).split('\n').join(' ');
  assert.equal(states, 'active=1 cancelled=3 completed=1 pending=1', 'queda 1 pending (el más antiguo); los otros 3 repetidos (incluido el de sentido contrario) se cancelan');
  assert.match(out(run(`select created_at at time zone 'utc' from public.${h} where status = 'pending';`)), /2026-11-09 10:00:00/, 'se conserva el MÁS ANTIGUO');
  const idx = out(run("select tablename from pg_indexes where schemaname = 'public' and indexname like '%_one_open_pair' order by 1;")).split('\n');
  assert.deepEqual(idx, TABLES.filter((t) => t !== 'student_duels').sort(), 'índice en 4 tablas; student_duels sigue sin él por sus 2 activos');

  // El candado: otro pending entre A y B (en cualquier sentido) falla; un completed o un reto con otra persona, no.
  for (const [ch, op] of [[A, B], [B, A]]) {
    const dup = run(ins(h, ch, op, 'pending', '2026-11-10 08:00:00+00'));
    assert.notEqual(dup.status, 0);
    assert.match(dup.stderr, /duplicate key value violates unique constraint "student_hangman_duels_one_open_pair"/);
  }
  assert.equal(run(ins(h, A, B, 'completed', '2026-11-10 08:00:00+00')).status, 0, 'un reto TERMINADO no cuenta');
  assert.equal(run(ins(h, A, C, 'pending', '2026-11-10 08:00:00+00')).status, 0, 'con otro compañero sí');
  // Cancelar el abierto libera la pareja (revancha o reto nuevo después).
  assert.equal(run(`update public.${h} set status = 'cancelled' where status = 'pending' and challenger_id = '${A}' and opponent_id = '${B}';`).status, 0);
  assert.equal(run(ins(h, A, B, 'pending', '2026-11-10 09:00:00+00')).status, 0);

  // Re-ejecutable.
  const again = run(migration);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(out(run("select count(*) from pg_indexes where schemaname = 'public' and indexname like '%_one_open_pair';")), '4');
});

test('la migración solo cancela (no borra) y no toca los retos activos', () => {
  const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bdrop\b/i);
  assert.match(code, /set status = 'cancelled'/);
  assert.match(code, /d\.status = 'pending'/, 'solo cancela los pending');
});
