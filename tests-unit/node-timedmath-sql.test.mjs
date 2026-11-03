// migrations/node-timed-math-duel.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs): el puntaje se recalcula con las respuestas,
// el disparador de la nube liquida una sola vez, y el duelo nunca retrocede ni se paga dos veces.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-timed-math-duel.sql: puntaje recalculado, liquidación única, tope de la apuesta, empate, reintentos y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'timedmath.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'timedmath.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /TIMEDMATH_SQL_OK/);
});
