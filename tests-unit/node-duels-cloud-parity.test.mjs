// Paridad nodo ↔ nube de los retos: tres duelos jugados SIN internet en el nodo (Node 20 + sqlite), lo que el nodo sube se pasa por los validadores reales de node-sync y por
// las funciones SQL reales en un PostgreSQL desechable (con la liquidación de la nube), y cada estudiante tiene que terminar con las mismas gemas y XP que mostró el nodo.
// Corre con Node 22 (importa TypeScript); el nodo se arranca con Node 20 (better-sqlite3) en un proceso aparte. Se omite si falta alguno de los dos o PostgreSQL.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let timed = null, hangman = null, skip = pgSkip;
try {
  timed = await import('../supabase/functions/node-sync/duels.ts');
  hangman = await import('../supabase/functions/node-sync/duels.ts');
} catch { skip = skip || 'esta versión de Node no importa TypeScript (usa Node 22)'; }
let pg = null;
after(() => pg?.stop());

test('lo que el nodo juega sin internet termina igual en la nube: mismas gemas, mismo XP y mismos ganadores', { skip, timeout: 240000 }, async () => {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'node@20', path.join(HERE, 'helpers', 'duel-parity-gen.mjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20_000_000, shell: process.platform === 'win32' });
  const gen = JSON.parse(out.slice(out.indexOf('@@JSON@@') + 8));
  const ids = new Set(gen.base.map((s) => s.id));
  assert.equal(gen.snapshots.length, 3, 'una foto por duelo');
  assert.deepEqual(gen.duels.map((d) => d.status), ['completed', 'completed', 'completed']);

  // Los validadores de la nube aceptan EXACTAMENTE lo que el nodo sube.
  const calls = gen.snapshots.map((s) => {
    const v = s.fn === 'timed_math_duel' ? timed.validateTimedMathEvent(s, { studentIds: ids }) : hangman.validateHangmanEvent(s, { studentIds: ids });
    assert.equal(v.ok, true, `${s.fn}: ${v.error}`);
    return { fn: s.fn === 'timed_math_duel' ? 'apply_node_timed_math_duel' : 'apply_node_hangman_duel', snapshot: v.snapshot };
  });

  // La nube real (SQL) con la misma base de gemas y XP, el banco de palabras y las funciones de liquidación.
  pg = await startTempPostgres();
  const sqlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-sql-'));
  const timedStub = fs.readFileSync(path.join(HERE, 'sql', 'timedmath.stub.sql'), 'utf8');
  const hangStub = fs.readFileSync(path.join(HERE, 'sql', 'hangman.stub.sql'), 'utf8').replace(/^create table public\.students .*$/m, '');
  const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  const script = [
    timedStub, hangStub,
    `\\ir ${path.join(ROOT, 'migrations', 'node-timed-math-duel.sql').replace(/\\/g, '/')}`,
    `\\ir ${path.join(ROOT, 'migrations', 'node-hangman-duel.sql').replace(/\\/g, '/')}`,
    ...gen.base.map((s) => `insert into public.students (id, school_code, gems, xp) values ('${s.id}', 'ESC1', ${s.gems}, ${s.xp});`),
    ...gen.bank.map((w) => `insert into public.hangman_word_bank (category, word, hint, fact) values ('${w.category}', '${w.word}', '${w.hint}', '${w.fact}');`),
    ...calls.map((c) => `select ${c.fn}(${lit(c.snapshot)});`),
    "select 'ESTUDIANTE', id, gems, xp from public.students order by id;",
    "select 'DUELO', id, status, coalesce(winner_id::text, '') from (select id, status, winner_id from public.student_timed_math_duels union all select id, status, winner_id from public.student_hangman_duels) d order by id;",
  ].join('\n');
  const file = path.join(sqlDir, 'parity.sql');
  fs.writeFileSync(file, script);
  const r = pg.psql(file);
  fs.rmSync(sqlDir, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout.slice(-2000)}`);

  const lines = r.stdout.split(/\r?\n/);
  const cloudStudents = lines.filter((l) => l.startsWith('ESTUDIANTE|')).map((l) => { const [, id, gems, xp] = l.split('|'); return { id, gems: Number(gems), xp: Number(xp) }; });
  const cloudDuels = lines.filter((l) => l.startsWith('DUELO|')).map((l) => { const [, id, status, winner] = l.split('|'); return { id, status, winner_id: winner || null }; });
  assert.deepEqual(cloudStudents, [...gen.final].sort((x, y) => x.id.localeCompare(y.id)), 'gemas y XP de la nube = los que mostró el nodo');
  assert.deepEqual(cloudDuels, [...gen.duels].sort((x, y) => x.id.localeCompare(y.id)), 'estado y ganador de cada duelo = los del nodo');
  // Y el escenario de verdad movió cosas: ganó Ana dos veces, Beto una, y el último pago se topó con las gemas de quien perdía.
  assert.ok(gen.final.some((s, i) => s.gems !== gen.base[i].gems));
  assert.equal(gen.final.reduce((n, s) => n + s.gems, 0), gen.base.reduce((n, s) => n + s.gems, 0), 'las gemas solo cambian de mano, no se crean');
});
