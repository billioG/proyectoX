// Contraseñas de alumnos sin texto legible + endurecimiento de students, con PostgreSQL de verdad (pgcrypto):
//   migrations/security-hardening-2026-10.sql (revisado: transacción, comprobaciones previas, columnas nuevas fuera del alcance de la app),
//   migrations/student-password-hash.sql (fase 1) y migrations/student-password-drop-plaintext.sql (fase 3).
// Y el cifrado AES-GCM de las Edge Functions (_shared/vault.ts, Node 22).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(HERE, 'sql');
const MIG = path.resolve(HERE, '..', 'migrations');

let vault = null;
let skipTs = false;
try { vault = await import('../supabase/functions/_shared/vault.ts'); } catch (e) {
  if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  skipTs = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const KEY = Buffer.alloc(32, 7).toString('base64');
const ID_A = '00000000-0000-0000-0000-0000000000b1';
const ID_B = '00000000-0000-0000-0000-0000000000b2';

test('vault: cifra y descifra; cada cifrado es distinto; atado al alumno; con otra llave o dañado no devuelve nada', { skip: skipTs }, async () => {
  const key = await vault.importKey(KEY);
  const a = await vault.encryptPassword('Sol-Maya-42', key, ID_A);
  const b = await vault.encryptPassword('Sol-Maya-42', key, ID_A);
  assert.match(a, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b, 'IV aleatorio: mismo texto, distinto cifrado');
  assert.ok(!a.includes('Sol-Maya'));
  assert.equal(await vault.decryptPassword(a, key, ID_A), 'Sol-Maya-42');
  assert.equal(await vault.decryptPassword(await vault.encryptPassword('ñandú Ünï 日本', key, ID_B), key, ID_B), 'ñandú Ünï 日本');
  // Copiado a la fila de OTRO alumno: se rechaza.
  await assert.rejects(vault.decryptPassword(a, key, ID_B), /No se pudo descifrar/);
  // Otra llave.
  await assert.rejects(vault.decryptPassword(a, await vault.importKey(Buffer.alloc(32, 9).toString('base64')), ID_A), /No se pudo descifrar/);
  // Manipulado (GCM autentica).
  const parts = a.split('.');
  const flipped = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}${parts[2].endsWith('A') ? 'B' : 'A'}A`;
  await assert.rejects(vault.decryptPassword(flipped, key, ID_A), vault.VaultError);
  for (const bad of ['', 'v2.a.b', 'v1.solo', 'v1..', 'texto plano', 'v1.AAAA.AAAA', null, undefined]) {
    await assert.rejects(vault.decryptPassword(bad, key, ID_A), vault.VaultError, JSON.stringify(bad));
  }
  await assert.rejects(vault.encryptPassword('', key, ID_A), /vacía/);
  await assert.rejects(vault.encryptPassword('x', key, ''), /id del alumno/);
});

test('vault: la llave debe ser de EXACTAMENTE 32 bytes y existir (un descuido de configuración no cifra con algo débil)', { skip: skipTs }, async () => {
  for (const bad of [undefined, null, '', '   ']) await assert.rejects(vault.importKey(bad), /Falta el secreto PASSWORD_VAULT_KEY/);
  for (const bad of [Buffer.alloc(16).toString('base64'), Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), Buffer.alloc(64).toString('base64')]) {
    await assert.rejects(vault.importKey(bad), /de 32 bytes/);
  }
  await assert.rejects(vault.importKey('***no es base64***'), vault.VaultError);
  assert.ok(await vault.importKey(` ${KEY}\n`), 'se tolera un espacio o salto de línea al pegar el secreto');
  assert.ok(await vault.importKey(KEY.replace(/\+/g, '-').replace(/\//g, '_')), 'base64url también');
});

let pg = null;
after(() => pg?.stop());

test('hardening revisado + fase 1 y 3 de contraseñas, en PostgreSQL con pgcrypto', { skip: pgSkip, timeout: 240000 }, async (t) => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-pwd-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };

  const stub = pg.psql(path.join(SQL, 'pwd.stub.sql'));
  if (stub.status !== 0 && /pgcrypto|control file/i.test(stub.stderr)) return t.skip('este PostgreSQL no trae pgcrypto');
  assert.equal(stub.status, 0, stub.stderr);

  // Sin can_manage_student el endurecimiento se niega a correr y NO deja nada a medias (la app sigue pudiendo leer students).
  const refused = pg.psql(path.join(MIG, 'security-hardening-2026-10.sql'));
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /NO se aplicó nada\. Falta: .*can_manage_student/);
  const intact = run(`select has_table_privilege('authenticated', 'public.students', 'SELECT') and has_table_privilege('anon', 'public.students', 'SELECT') and not exists (select 1 from pg_trigger where tgname = 'trg_guard_student_self_update');`);
  assert.match(intact.stdout.trim(), /^t$/, 'el rechazo no cambió ningún permiso ni creó el trigger');

  assert.equal(pg.psql(path.join(SQL, 'pwd.stub2.sql')).status, 0);
  const result = pg.psql(path.join(SQL, 'pwd.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PWD_SQL_OK/);

  // Fase 3: se niega mientras haya texto sin cifrado; cuando todo tiene cifrado, borra el texto y deja hash y cifrado.
  const before = run(`select count(*) from public.students where password_generated is not null and password_enc is null;`);
  assert.ok(Number(before.stdout.trim()) > 0, 'la prueba necesita contraseñas con texto y sin cifrar');
  const blocked = pg.psql(path.join(MIG, 'student-password-drop-plaintext.sql'));
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /NO SE BORRA NADA: \d+ contraseña\(s\) sin hash y \d+ sin cifrado/);
  const still = run(`select count(*) from public.students where password_generated is not null;`);
  assert.ok(Number(still.stdout.trim()) > 0, 'rechazada: el texto sigue ahí');

  assert.equal(run(`update public.students set password_enc = 'v1.x.y' where password_generated is not null and password_enc is null;`).status, 0);
  const dropped = pg.psql(path.join(MIG, 'student-password-drop-plaintext.sql'));
  assert.equal(dropped.status, 0, dropped.stderr);
  const after1 = run(`select count(*) filter (where password_generated is not null), count(*) filter (where password_hash is not null), count(*) filter (where password_enc is not null) from public.students;`);
  const [legible, hashes, cifrados] = after1.stdout.trim().split('|').map(Number);
  assert.equal(legible, 0, 'sin texto legible');
  assert.ok(hashes >= 3 && cifrados >= 3, `hash ${hashes}, cifrado ${cifrados}`);
  // Y el inicio de sesión sigue funcionando solo con el hash.
  assert.match(run(`select public.student_password_ok('${ID_A}', 'clave-ana');`).stdout.trim(), /^t$/);
  assert.equal(pg.psql(path.join(MIG, 'student-password-drop-plaintext.sql')).status, 0, 'segura de re-ejecutar');
});
