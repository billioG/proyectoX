// migrations/performance-2026-11.sql con PostgreSQL de verdad: índices (los que faltaban, saltando lo ausente), el Ranking los usa, y el latido liviano conserva sus reglas.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('performance-2026-11.sql: índices creados o saltados sin error, el Ranking usa su índice y el latido cuenta +30 s como mucho cada 25 s', { skip: pgSkip, timeout: 180000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'perf.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'perf.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PERF_SQL_OK/);
  assert.match(result.stderr, /performance-2026-11: \d+ índice\(s\) listos .* saltadas: .*push_subscriptions/, 'avisa qué tablas saltó');
});

test('random-event-settle-atomic.sql: puestos y premios como siempre, SUMA gemas sin pisar, no paga dos veces, estudiantes y docentes, solo service_role', { skip: pgSkip, timeout: 180000 }, async () => {
  pg?.stop(); // el servidor de la prueba anterior
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'settle.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'settle.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /SETTLE_SQL_OK/);
});
