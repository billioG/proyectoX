// La verificación de migraciones del CI (scripts/ci/verificar-migraciones.sh) aplica las de scripts/ci/migraciones-orden.txt sobre supabase/schema.sql.
// Esta prueba evita que una migración nueva quede fuera sin que nadie lo decida, y que el orden contradiga a docs/MIGRATIONS.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const orden = lines('scripts/ci/migraciones-orden.txt');
const omitidas = lines('scripts/ci/migraciones-en-volcado.txt');
const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, -4));
const docs = fs.readFileSync(path.join(ROOT, 'docs', 'MIGRATIONS.md'), 'utf8');

test('toda migración está en el orden del CI o anotada como ya incluida en el volcado (nada queda sin decidir)', () => {
  const known = new Set([...orden, ...omitidas, 'verificar-migraciones']);
  assert.deepEqual(files.filter((f) => !known.has(f)), [], 'agrégala a scripts/ci/migraciones-orden.txt (se aplica en el CI) o a migraciones-en-volcado.txt');
  assert.deepEqual([...known].filter((f) => !files.includes(f)), [], 'listas con archivos que ya no existen en migrations/');
  assert.deepEqual(orden.filter((f) => omitidas.includes(f)), [], 'una migración no puede estar en las dos listas');
});

test('el orden del CI respeta las dependencias de docs/MIGRATIONS.md y no repite nombres sueltos', () => {
  const idx = (n) => orden.indexOf(n);
  const antes = [
    ['fix-password-reset-rpc-exposure', 'fix-students-and-notifications-rls'], ['fix-students-and-notifications-rls', 'fix-students-rls-recursion'],
    ['fix-students-rls-recursion', 'fix-votes-and-evaluations-exposure'], ['project-reactions', 'project-reactions-ranking-count'],
    ['duel-per-player-content', 'practice-progress'], ['security-hardening-2026-10', 'student-password-hash'],
    ['student-password-hash', 'student-password-drop-plaintext'], ['security-rls-audit-2026-11', 'security-function-exposure-2026-11'],
    ['security-function-exposure-2026-11', 'performance-2026-11'], ['storage-hardening', 'push-sub-role-staff'],
  ];
  for (const [a, b] of antes) { assert.ok(idx(a) >= 0 && idx(b) >= 0, `${a} / ${b} deben estar en el orden`); assert.ok(idx(a) < idx(b), `${a} va antes que ${b}`); }
  assert.equal(orden.at(-1), 'rls-auth-uid-initplan', 'rls-auth-uid-initplan va al final: envuelve auth.uid() también en las políticas de las migraciones anteriores');
  assert.equal(new Set(orden).size, orden.length, 'sin migraciones repetidas');
  for (const n of orden) assert.ok(docs.includes(`\`${n}.sql\``), `${n}.sql debe estar en docs/MIGRATIONS.md`);
});

test('el script solo corre contra una base desechable y no toca producción', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'scripts', 'ci', 'verificar-migraciones.sh'), 'utf8');
  assert.match(sh, /localhost\|127\.0\.0\.1/, 'rechaza hosts que no sean locales');
  assert.match(sh, /supabase/i);
  assert.doesNotMatch(sh, /supabase\.co/, 'ninguna dirección de Supabase');
});
