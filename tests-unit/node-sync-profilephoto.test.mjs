// Foto de perfil que sube un nodo (supabase/functions/node-sync/validators.ts): la función SQL real se prueba aparte (node-profilephoto-sql.test.mjs); aquí, la forma de lo que llega.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/validators.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /validators\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const NAME = `${U}_1762000000000.png`;

test('el nombre de la foto es el que arma la app y del propio usuario', { skip }, () => {
  for (const ok of [NAME, `${U}_1762000000000.JPG`, `${U}_1762000000000.jpeg`, `${U}_1762000000000.webp`, `${U}_1762000000000.gif`]) assert.equal(mod.validProfilePhotoName(ok, U), true, ok);
  for (const bad of [`${V}_1762000000000.png`, `${U}_17.png`, `${U}_1762000000000.svg`, `${U}_1762000000000.png.exe`, `../${U}_1762000000000.png`, `${U}_1762000000000.png/../x`, 'foto.png', null, 5]) assert.equal(mod.validProfilePhotoName(bad, U), false, String(bad));
  assert.equal(mod.validProfilePhotoName(NAME, 's1'), false, 'el id tiene que ser un UUID');
});

test('pedir la URL de subida: solo de la escuela del nodo, con tamaño razonable', { skip }, () => {
  assert.deepEqual(mod.validateProfilePhotoRequest({ name: NAME, user_id: U, size: 1000 }, { member: true }), { ok: true, path: NAME });
  for (const [body, member] of [[{ name: NAME, user_id: U, size: 1000 }, false], [{ name: NAME, user_id: V, size: 1000 }, true], [{ name: NAME, user_id: U, size: 0 }, true], [{ name: NAME, user_id: U, size: 6 * 1024 * 1024 }, true],
    [{ name: NAME, user_id: U, size: 1.5 }, true], [{ name: NAME, user_id: U }, true], [null, true]]) {
    assert.equal(mod.validateProfilePhotoRequest(body, { member }).ok, false, JSON.stringify(body));
  }
});

test('la función del premio: solo con el nombre de la imagen (la dirección la arma la nube) y de alguien de la escuela', { skip }, () => {
  const ev = (over = {}) => ({ seq: 1, fn: 'claim_first_profile_photo_reward', student_id: U, args: { p_name: NAME, rewarded: true }, ...over });
  assert.deepEqual(mod.validateProfilePhotoEvent(ev(), { member: true }), { ok: true, call: { p_user: U, p_name: NAME } });
  assert.equal(mod.isProfilePhotoFn('claim_first_profile_photo_reward'), true);
  assert.equal(mod.isProfilePhotoFn('choose_companion'), false);
  for (const [raw, member] of [[ev(), false], [ev({ student_id: V }), true], [ev({ args: { p_name: 'foto.png' } }), true], [ev({ args: { p_name: 'https://evil/x.png' } }), true], [ev({ args: {} }), true], [ev({ fn: 'drop_table' }), true], [null, true]]) {
    assert.equal(mod.validateProfilePhotoEvent(raw, { member }).ok, false, JSON.stringify(raw));
  }
});
