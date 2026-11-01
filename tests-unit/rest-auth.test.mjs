// Acceso de la capa local: login de estudiantes con el mismo contrato que la nube (student-login -> token_hash ->
// verifyOtp), sesión propia del nodo (JWT firmado con un secreto que solo vive en este nodo), renovación y límites
// de intentos. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { SCHEMA } from '../school-node/rest/schema.js';
import { createStore } from '../school-node/rest/store.js';
import { createAuth, hashClassPassword } from '../school-node/rest/auth.js';

const dirs = [], dbs = [];
const newDb = (dir) => { const d = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'rest-auth-')); if (!dir) dirs.push(d); const db = openDb(d); dbs.push(db); return { db, dir: d }; };
test.after(() => { for (const db of dbs) try { db.close(); } catch {} for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

const CLASS = 'ESC1|Primero|A';
const verifier = (password) => { const salt = crypto.randomBytes(8).toString('hex'); return { class_key: CLASS, requires_password: true, salt, hash: hashClassPassword(password, salt) }; };

function setup({ requires = true, clock } = {}) {
  const { db, dir } = newDb();
  const store = createStore({ db, schema: SCHEMA });
  store.put('students', { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' });
  store.put('students', { id: 's2', username: 'baja1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'baja' });
  store.put('students', { id: 's3', username: 'otra1', full_name: 'Carla', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' });
  store.setClassVerifiers([requires ? verifier('clase123') : { class_key: CLASS, requires_password: false, salt: '', hash: '' }]);
  const t = { now: 1_000_000 };
  const auth = createAuth({ store, now: clock || (() => t.now) });
  return { store, auth, t, db, dir };
}
const fails = (fn, status) => assert.throws(fn, (e) => e.status === status, `esperaba ${status}`);
const enter = (auth, username = 'ana1', password = 'clase123', ip = '10.0.0.5') => {
  const { token_hash } = auth.studentLogin({ username, password, ip });
  return auth.verify({ token_hash, type: 'magiclink' });
};

test('entra con usuario y contraseña de la clase, y la sesión identifica al estudiante', () => {
  const { auth } = setup();
  const session = enter(auth);
  assert.equal(session.token_type, 'bearer');
  assert.equal(session.user.id, 's1');
  assert.ok(session.refresh_token && session.expires_at);
  assert.deepEqual(auth.userFromAccessToken(session.access_token), { uid: 's1', role: 'student', classKey: CLASS });
});

test('usuario inexistente, contraseña mala y estudiante dado de baja dan EXACTAMENTE el mismo error (no revela quién existe)', () => {
  const { auth } = setup();
  const msgs = [
    () => auth.studentLogin({ username: 'noexiste', password: 'clase123', ip: 'a' }),
    () => auth.studentLogin({ username: 'ana1', password: 'mala', ip: 'b' }),
    () => auth.studentLogin({ username: 'baja1', password: 'clase123', ip: 'c' }),
    () => auth.studentLogin({ username: 'ana1', password: '', ip: 'd' }),
  ].map((f) => { try { f(); return null; } catch (e) { return [e.status, e.message]; } });
  assert.deepEqual(msgs[0], [401, 'Usuario o contraseña incorrectos']);
  for (const m of msgs) assert.deepEqual(m, msgs[0]);
});

test('clase sin contraseña: entra solo con el usuario; modo de login no revela usuarios inexistentes', () => {
  const { auth } = setup({ requires: false });
  assert.equal(enter(auth, 'ana1', '').user.id, 's1');
  assert.equal(auth.loginModeByUsername('ana1'), false);
  assert.equal(auth.loginModeByUsername('noexiste'), true, 'un usuario que no existe se comporta como uno que sí pide contraseña');
  assert.equal(auth.classLoginMode({ school_code: 'ESC1', grade: 'Primero', section: 'A' }), false);
  assert.equal(auth.classLoginMode({ school_code: 'ESC1', grade: 'Segundo', section: 'B' }), true, 'clase sin verificador: pide contraseña');
});

test('una clase sin verificador conocido no deja entrar a nadie (nunca sin contraseña por omisión)', () => {
  const { auth } = setup();
  fails(() => auth.studentLogin({ username: 'otra1', password: 'clase123', ip: 'x' }), 401);
  fails(() => auth.studentLogin({ username: 'otra1', password: '', ip: 'x' }), 401);
});

test('límite de intentos por IP: pasado el tope responde 429 aunque la contraseña ya sea la correcta; la ventana se vacía con el tiempo', () => {
  const { auth, t } = setup();
  for (let i = 0; i < 10; i++) fails(() => auth.studentLogin({ username: 'user' + i, password: 'mala', ip: '10.9.9.9' }), 401);
  fails(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.9.9.9' }), 429);
  assert.doesNotThrow(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.0.0.77' }), 'otra IP no se ve afectada');
  t.now += 5 * 60_000 + 1;
  assert.doesNotThrow(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.9.9.9' }));
});

test('límite de intentos por usuario: probar la contraseña contra un mismo usuario desde muchas IP también se frena', () => {
  const { auth } = setup();
  for (let i = 0; i < 10; i++) fails(() => auth.studentLogin({ username: 'ana1', password: 'mala', ip: `10.1.1.${i}` }), 401);
  fails(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.1.1.200' }), 429);
});

test('el token_hash sirve una sola vez y vence', () => {
  const { auth, t } = setup();
  const { token_hash } = auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'x' });
  assert.ok(auth.verify({ token_hash, type: 'magiclink' }).access_token);
  fails(() => auth.verify({ token_hash, type: 'magiclink' }), 401);
  const second = auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'x' }).token_hash;
  t.now += 5 * 60_000;
  fails(() => auth.verify({ token_hash: second, type: 'magiclink' }), 401);
  fails(() => auth.verify({ token_hash: 'inventado', type: 'magiclink' }), 401);
});

test('el acceso vence, se renueva con el token de renovación (que rota) y cerrar sesión lo invalida', () => {
  const { auth, t } = setup();
  const s1 = enter(auth);
  t.now += 3_600_000 + 1_000;
  assert.equal(auth.userFromAccessToken(s1.access_token), null, 'vencido');
  const s2 = auth.refresh(s1.refresh_token);
  assert.equal(auth.userFromAccessToken(s2.access_token).uid, 's1');
  fails(() => auth.refresh(s1.refresh_token), 401);
  auth.logout(s2.refresh_token);
  fails(() => auth.refresh(s2.refresh_token), 401);
});

test('tokens falsificados no valen: firma de otro secreto, carga alterada, alg none, basura', () => {
  const { auth } = setup();
  const good = enter(auth).access_token;
  const [h, p, sig] = good.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = (claims, secret) => { const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`; return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`; };
  assert.equal(auth.userFromAccessToken(forged({ ...payload, sub: 's3' }, 'otro-secreto')), null);
  assert.equal(auth.userFromAccessToken(`${h}.${b64({ ...payload, sub: 's3' })}.${sig}`), null);
  assert.equal(auth.userFromAccessToken(`${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`), null);
  assert.equal(auth.userFromAccessToken('basura'), null);
  assert.equal(auth.userFromAccessToken(''), null);
  assert.equal(auth.userFromAccessToken(undefined), null);
});

test('el secreto de firma sobrevive a reiniciar el nodo (las sesiones siguen valiendo) y no es el de la nube', () => {
  const a = setup();
  const session = enter(a.auth);
  const store2 = createStore({ db: newDb(a.dir).db, schema: SCHEMA });
  const auth2 = createAuth({ store: store2, now: () => a.t.now });
  assert.equal(auth2.userFromAccessToken(session.access_token).uid, 's1');
  assert.equal(auth2.refresh(session.refresh_token).user.id, 's1');
});

test('un estudiante que se da de baja deja de poder usar su sesión y renovarla', () => {
  const { auth, store } = setup();
  const s = enter(auth);
  store.put('students', { ...store.all('students').find((r) => r.id === 's1'), status: 'baja' });
  assert.equal(auth.userFromAccessToken(s.access_token), null);
  fails(() => auth.refresh(s.refresh_token), 401);
});
