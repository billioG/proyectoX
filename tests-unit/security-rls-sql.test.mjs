// Auditoría RLS de noviembre con PostgreSQL de verdad: políticas de escritura abiertas cerradas, lecturas públicas restringidas,
// funciones SECURITY DEFINER cerradas a anon (menos las del ingreso) y auth.uid() envuelto sin cambiar lo que ve cada usuario.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(HERE, 'sql');
const MIG = path.resolve(HERE, '..', 'migrations');

let pg = null;
after(() => pg?.stop());

test('security-rls-audit + function-exposure + rls-auth-uid-initplan: cierran lo abierto, no rompen lo que se usa y se pueden re-ejecutar', { skip: pgSkip, timeout: 240000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'rls.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'rls.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /RLS_SQL_OK/);
  assert.match(result.stderr, /rls-auth-uid-initplan: [1-9]\d* política\(s\) reescritas, 0 saltadas/, 'la primera corrida reescribió políticas y no saltó ninguna');
  assert.match(result.stderr, /rls-auth-uid-initplan: 0 política\(s\) reescritas, 0 saltadas/, 'la segunda corrida no cambia nada');
  assert.match(result.stderr, /security-function-exposure: [1-9]\d* función\(es\) cerradas a anon, 2 se dejaron abiertas/);
});

test('las migraciones de seguridad están protegidas: transacción y comprobación previa, y ningún secreto escrito', () => {
  for (const f of ['security-rls-audit-2026-11.sql', 'security-function-exposure-2026-11.sql', 'security-hardening-2026-10.sql']) {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    assert.match(sql, /^begin;/m, `${f}: debe ir en una transacción`);
    assert.match(sql, /^commit;/m, `${f}: debe cerrar la transacción`);
    assert.match(sql, /lock_timeout/, `${f}: lock_timeout`);
  }
  for (const f of fs.readdirSync(MIG).filter((n) => /^(security-|rls-|student-password|ai-usage)/.test(n))) {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/, `${f}: parece traer un token`);
    assert.doesNotMatch(sql, /(secret|password|key)\s*:?=\s*'[A-Za-z0-9+/=_-]{16,}'/i, `${f}: parece traer un secreto`);
  }
});
