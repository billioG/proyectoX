// migrations/node-hangman-duel.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs): palabras solo del banco, acierto y errores
// recalculados con las letras, liquidación única, tope de la apuesta, empate, reintentos y permisos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-hangman-duel.sql: palabras del banco, resultado recalculado, liquidación única, tope, empate, reintentos y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'hangman.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'hangman.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /HANGMAN_SQL_OK/);
});
