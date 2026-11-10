// migrations/rate-limits.sql: contador de frecuencia por usuario y clave (funciones notify-*). PostgreSQL de verdad; se omite sin binarios.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(ROOT, 'migrations', 'rate-limits.sql'), 'utf8');
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
// psql en Windows devuelve \r\n: se normaliza.
const out = (r) => r.stdout.split('\r').join('').trim();

let pg = null;
after(() => pg?.stop());

test('rate_limit_take: tope por ventana, independiente por usuario y clave, se libera al vencer, permisos y concurrencia', { skip: pgSkip, timeout: 180000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-rate-'));
  let n = 0;
  const file = (sql) => { const f = path.join(dir, `q${n++}.sql`); fs.writeFileSync(f, sql); return f; };
  const run = (sql) => pg.psql(file(sql));
  const take = (u, k, limit, secs) => out(run(`select allowed, calls, remaining, retry_after from public.rate_limit_take('${u}', '${k}', ${limit}, ${secs});`));

  assert.equal(run(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;`).status, 0);
  const m = run(migration);
  assert.equal(m.status, 0, m.stderr);
  assert.equal(run(migration).status, 0, 'se puede volver a correr');

  // Tope 3 en la ventana: 3 pasan (quedan 2, 1, 0) y la cuarta no, sin sumar.
  assert.equal(take(U1, 'notify-duel', 3, 60), 't|1|2|0');
  assert.equal(take(U1, 'notify-duel', 3, 60), 't|2|1|0');
  assert.equal(take(U1, 'notify-duel', 3, 60), 't|3|0|0');
  const blocked = take(U1, 'notify-duel', 3, 60).split('|');
  assert.equal(blocked[0], 'f');
  assert.equal(blocked[1], '3', 'una llamada rechazada no suma');
  assert.equal(blocked[2], '0');
  assert.ok(Number(blocked[3]) >= 1 && Number(blocked[3]) <= 60, `retry_after en la ventana: ${blocked[3]}`);

  // Otro usuario y otra clave tienen su propio contador.
  assert.equal(take(U2, 'notify-duel', 3, 60), 't|1|2|0');
  assert.equal(take(U1, 'notify-duel:reto-1:challenge', 3, 60), 't|1|2|0');

  // Al vencer la ventana vuelve a empezar de cero.
  assert.equal(run(`update public.rate_limits set window_start = now() - interval '61 seconds' where user_id = '${U1}' and key = 'notify-duel';`).status, 0);
  assert.equal(take(U1, 'notify-duel', 3, 60), 't|1|2|0');

  // Parámetros inválidos y permisos.
  for (const bad of [`null, 'k', 5, 60`, `'${U1}', '', 5, 60`, `'${U1}', 'k', 0, 60`, `'${U1}', 'k', 5, 0`, `'${U1}', 'k', 5, 90000`, `'${U1}', 'k', 100001, 60`]) {
    const r = run(`select * from public.rate_limit_take(${bad.startsWith("'") || bad.startsWith('null') ? bad : bad});`);
    assert.notEqual(r.status, 0, `debe rechazar: ${bad}`);
  }
  assert.equal(run(`set role anon; select * from public.rate_limit_take('${U1}', 'k', 5, 60);`).status !== 0, true, 'anon no puede ejecutarla');
  assert.equal(run(`set role authenticated; select * from public.rate_limit_take('${U1}', 'k', 5, 60);`).status !== 0, true, 'authenticated tampoco');
  assert.equal(run(`set role authenticated; select * from public.rate_limits;`).status !== 0, true, 'la tabla no se lee desde la app');
  assert.equal(run(`set role service_role; select * from public.rate_limit_take('${U1}', 'permiso', 5, 60);`).status, 0, 'service_role sí');

  // Concurrencia: 24 sesiones a la vez con tope 10 -> exactamente 10 permitidas.
  const calls = Array.from({ length: 24 }, () => pg.psqlAsync(file(`select allowed from public.rate_limit_take('${U2}', 'concurrente', 10, 60);`)));
  const results = await Promise.all(calls);
  assert.ok(results.every((r) => r.status === 0), results.map((r) => r.stderr).join('\n'));
  const allowed = results.filter((r) => r.stdout.split('\r').join('').trim() === 't').length;
  assert.equal(allowed, 10, `exactamente 10 permitidas de 24 simultáneas (hubo ${allowed})`);
  assert.equal(out(run(`select calls from public.rate_limits where user_id = '${U2}' and key = 'concurrente';`)), '10');
});

test('la migración no borra datos de otros ni toca otras tablas', () => {
  const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\bdrop\b|\btruncate\b/i);
  assert.match(code, /delete from public\.rate_limits d where d\.window_start < v_now - interval '2 days'/, 'solo limpia filas viejas de su propia tabla');
});
