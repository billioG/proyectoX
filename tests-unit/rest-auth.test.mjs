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
const fails = (fn, status) => assert.rejects(fn, (e) => e.status === status, `esperaba ${status}`);
const failsSync = (fn, status) => assert.throws(fn, (e) => e.status === status, `esperaba ${status}`);
const enter = async (auth, username = 'ana1', password = 'clase123', ip = '10.0.0.5') => {
  const { token_hash } = await auth.studentLogin({ username, password, ip });
  return auth.verify({ token_hash, type: 'magiclink' });
};

test('entra con usuario y contraseña de la clase, y la sesión identifica al estudiante', async () => {
  const { auth } = setup();
  const session = await enter(auth);
  assert.equal(session.token_type, 'bearer');
  assert.equal(session.user.id, 's1');
  assert.ok(session.refresh_token && session.expires_at);
  assert.deepEqual(auth.userFromAccessToken(session.access_token), { uid: 's1', role: 'student', classKey: CLASS });
});

test('usuario inexistente, contraseña mala y estudiante dado de baja dan EXACTAMENTE el mismo error (no revela quién existe)', async () => {
  const { auth } = setup();
  const msgs = await Promise.all([
    () => auth.studentLogin({ username: 'noexiste', password: 'clase123', ip: 'a' }),
    () => auth.studentLogin({ username: 'ana1', password: 'mala', ip: 'b' }),
    () => auth.studentLogin({ username: 'baja1', password: 'clase123', ip: 'c' }),
    () => auth.studentLogin({ username: 'ana1', password: '', ip: 'd' }),
  ].map((f) => f().then(() => null, (e) => [e.status, e.message])));
  assert.deepEqual(msgs[0], [401, 'Usuario o contraseña incorrectos']);
  for (const m of msgs) assert.deepEqual(m, msgs[0]);
});

test('clase sin contraseña: entra solo con el usuario; modo de login no revela usuarios inexistentes', async () => {
  const { auth } = setup({ requires: false });
  assert.equal((await enter(auth, 'ana1', '')).user.id, 's1');
  assert.equal(auth.loginModeByUsername('ana1'), false);
  assert.equal(auth.loginModeByUsername('noexiste'), true, 'un usuario que no existe se comporta como uno que sí pide contraseña');
  assert.equal(auth.classLoginMode({ school_code: 'ESC1', grade: 'Primero', section: 'A' }), false);
  assert.equal(auth.classLoginMode({ school_code: 'ESC1', grade: 'Segundo', section: 'B' }), true, 'clase sin verificador: pide contraseña');
});

test('una clase sin verificador conocido no deja entrar a nadie (nunca sin contraseña por omisión)', async () => {
  const { auth } = setup();
  await fails(() => auth.studentLogin({ username: 'otra1', password: 'clase123', ip: 'x' }), 401);
  await fails(() => auth.studentLogin({ username: 'otra1', password: '', ip: 'x' }), 401);
});

test('límite de intentos por IP: pasado el tope responde 429 aunque la contraseña ya sea la correcta; la ventana se vacía con el tiempo', async () => {
  const { auth, t } = setup();
  for (let i = 0; i < 10; i++) await fails(() => auth.studentLogin({ username: 'user' + i, password: 'mala', ip: '10.9.9.9' }), 401);
  await fails(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.9.9.9' }), 429);
  await auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.0.0.77' }); // otra IP no se ve afectada
  t.now += 5 * 60_000 + 1;
  await auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.9.9.9' });
});

test('límite de intentos por usuario: probar la contraseña contra un mismo usuario desde muchas IP también se frena', async () => {
  const { auth } = setup();
  for (let i = 0; i < 10; i++) await fails(() => auth.studentLogin({ username: 'ana1', password: 'mala', ip: `10.1.1.${i}` }), 401);
  await fails(() => auth.studentLogin({ username: 'ana1', password: 'clase123', ip: '10.1.1.200' }), 429);
});

test('el token_hash sirve una sola vez y vence', async () => {
  const { auth, t } = setup();
  const { token_hash } = await auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'x' });
  assert.ok(auth.verify({ token_hash, type: 'magiclink' }).access_token);
  failsSync(() => auth.verify({ token_hash, type: 'magiclink' }), 401);
  const second = (await auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'x' })).token_hash;
  t.now += 5 * 60_000;
  failsSync(() => auth.verify({ token_hash: second, type: 'magiclink' }), 401);
  failsSync(() => auth.verify({ token_hash: 'inventado', type: 'magiclink' }), 401);
});

test('el acceso vence, se renueva con el token de renovación (que rota) y cerrar sesión lo invalida', async () => {
  const { auth, t } = setup();
  const s1 = await enter(auth);
  t.now += 3_600_000 + 1_000;
  assert.equal(auth.userFromAccessToken(s1.access_token), null, 'vencido');
  const s2 = auth.refresh(s1.refresh_token);
  assert.equal(auth.userFromAccessToken(s2.access_token).uid, 's1');
  failsSync(() => auth.refresh(s1.refresh_token), 401);
  auth.logout(s2.refresh_token);
  failsSync(() => auth.refresh(s2.refresh_token), 401);
});

test('tokens falsificados no valen: firma de otro secreto, carga alterada, alg none, basura', async () => {
  const { auth } = setup();
  const good = (await enter(auth)).access_token;
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

test('el secreto de firma sobrevive a reiniciar el nodo (las sesiones siguen valiendo) y no es el de la nube', async () => {
  const a = setup();
  const session = await enter(a.auth);
  const store2 = createStore({ db: newDb(a.dir).db, schema: SCHEMA });
  const auth2 = createAuth({ store: store2, now: () => a.t.now });
  assert.equal(auth2.userFromAccessToken(session.access_token).uid, 's1');
  assert.equal(auth2.refresh(session.refresh_token).user.id, 's1');
});

test('un estudiante que se da de baja deja de poder usar su sesión y renovarla', async () => {
  const { auth, store } = setup();
  const s = await enter(auth);
  store.put('students', { ...store.all('students').find((r) => r.id === 's1'), status: 'baja' });
  assert.equal(auth.userFromAccessToken(s.access_token), null);
  failsSync(() => auth.refresh(s.refresh_token), 401);
});

// ---- Docentes: correo + PIN que fijaron EN LÍNEA ----
import { emailHash } from '../school-node/rest/auth.js';

function setupTeacher() {
  const base = setup();
  const salt = 'cd'.repeat(8);
  base.store.put('teachers', { id: 't1', full_name: 'Marta Gómez', role: 'docente' });
  base.store.put('teachers', { id: 't2', full_name: 'Sin PIN', role: 'docente' });
  base.store.put('teachers', { id: 't3', full_name: 'Admin', role: 'admin' });
  base.store.setTeacherLogins([
    { teacher_id: 't1', email_hash: emailHash('Marta@Escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    { teacher_id: 't3', email_hash: emailHash('admin@escuela.com'), pin_hash: hashClassPassword('111111', salt), pin_salt: salt },
  ]);
  return base;
}
const teacherIn = (auth, email = 'marta@escuela.com', pin = '654321', ip = '10.0.0.9') => auth.teacherLogin({ email, password: pin, ip });

test('docente: entra con su correo (sin importar mayúsculas) y el PIN que fijó en línea; la sesión lo identifica como docente', async () => {
  const { auth } = setupTeacher();
  const s = await teacherIn(auth, '  MARTA@escuela.com ');
  assert.equal(s.user.id, 't1');
  assert.deepEqual(auth.userFromAccessToken(s.access_token), { uid: 't1', role: 'teacher', classKey: null });
  const admin = await teacherIn(auth, 'admin@escuela.com', '111111');
  assert.equal(auth.userFromAccessToken(admin.access_token).role, 'admin');
  assert.equal(auth.refresh(s.refresh_token).user.id, 't1');
});

test('docente: correo inexistente, PIN malo y docente que nunca fijó PIN dan el mismo error genérico, y no hay forma de entrar sin PIN', async () => {
  const { auth } = setupTeacher();
  const errs = await Promise.all([
    () => teacherIn(auth, 'nadie@x.com'), () => teacherIn(auth, 'marta@escuela.com', '000000', '1.1.1.1'),
    () => teacherIn(auth, 'sinpin@escuela.com', '654321', '2.2.2.2'), () => teacherIn(auth, 'marta@escuela.com', '', '3.3.3.3'), () => teacherIn(auth, '', '654321', '4.4.4.4'),
  ].map((f) => f().then(() => null, (e) => [e.status, e.message])));
  assert.equal(errs[0][0], 400);
  for (const e of errs) assert.deepEqual(e, errs[0]);
  assert.match(errs[0][1], /Invalid login credentials/);
});

test('docente: límite de intentos por IP y por correo, compartido con el de estudiantes', async () => {
  const { auth } = setupTeacher();
  for (let i = 0; i < 10; i++) await assert.rejects(() => teacherIn(auth, 'marta@escuela.com', '00000' + (i % 10), `5.5.5.${i}`), (e) => e.status === 400);
  await assert.rejects(() => teacherIn(auth, 'marta@escuela.com', '654321', '5.5.5.99'), (e) => e.status === 429);
  const ipSpam = setupTeacher().auth;
  for (let i = 0; i < 10; i++) await assert.rejects(() => teacherIn(ipSpam, `x${i}@x.com`, '1', '6.6.6.6'), (e) => e.status === 400);
  await assert.rejects(() => ipSpam.studentLogin({ username: 'ana1', password: 'clase123', ip: '6.6.6.6' }), (e) => e.status === 429);
});

test('docente: si lo quitan de la escuela deja de valer su sesión; un docente no entra por el login de estudiantes ni al revés', async () => {
  const { auth, store } = setupTeacher();
  const s = await teacherIn(auth);
  store.remove('teachers', 't1');
  assert.equal(auth.userFromAccessToken(s.access_token), null);
  failsSync(() => auth.refresh(s.refresh_token), 401);
  await assert.rejects(() => auth.studentLogin({ username: 'marta@escuela.com', password: '654321', ip: 'q' }), (e) => e.status === 401);
});

// ---- Docentes: correo + la MISMA contraseña de su cuenta (bcrypt que baja la sincronización) ----
import bcrypt from '../school-node/node_modules/bcryptjs/index.js';

function setupTeacherPassword() {
  const base = setup();
  base.store.put('teachers', { id: 't1', full_name: 'Marta Gómez', role: 'docente' });
  base.store.put('teachers', { id: 't2', full_name: 'Otra', role: 'docente' });
  base.store.setTeacherLogins([
    { teacher_id: 't1', email_hash: emailHash('Marta@Escuela.com'), bcrypt: bcrypt.hashSync('MiClave-Segura9', 4) },
    { teacher_id: 't2', email_hash: emailHash('otra@escuela.com'), bcrypt: 'esto-no-es-un-hash' },
  ]);
  return base;
}

test('docente: entra con su correo y la contraseña normal de su cuenta, sin PIN', async () => {
  const { auth } = setupTeacherPassword();
  const s = await teacherIn(auth, '  MARTA@escuela.com ', 'MiClave-Segura9');
  assert.equal(s.user.id, 't1');
  assert.deepEqual(auth.userFromAccessToken(s.access_token), { uid: 't1', role: 'teacher', classKey: null });
});

test('docente con contraseña: la contraseña mala, el correo inexistente y un hash dañado dan el mismo error genérico', async () => {
  const { auth } = setupTeacherPassword();
  const errs = await Promise.all([
    () => teacherIn(auth, 'marta@escuela.com', 'otra-clave', '1.1.1.1'),
    () => teacherIn(auth, 'nadie@x.com', 'MiClave-Segura9', '2.2.2.2'),
    () => teacherIn(auth, 'otra@escuela.com', 'esto-no-es-un-hash', '3.3.3.3'),
    () => teacherIn(auth, 'marta@escuela.com', '', '4.4.4.4'),
  ].map((f) => f().then(() => null, (e) => [e.status, e.message])));
  for (const e of errs) assert.deepEqual(e, [400, 'Invalid login credentials']);
});

// ---- Hashes en vuelo: tope por IP y global, y el cupo se libera siempre ----
// `hash` inyectado que espera una promesa que el test controla (así se sabe cuántos hashes hay "en curso").
function setupGated(limits) {
  const base = setup();
  base.store.setClassVerifiers([{ class_key: CLASS, requires_password: true, salt: 'aa', hash: 'h:clase123' }]);
  const gate = { calls: 0, release: null, fail: false };
  const opened = new Promise((r) => { gate.release = r; });
  const hash = async (pw) => { gate.calls++; await opened; if (gate.fail) throw new Error('hash roto'); return `h:${pw}`; };
  const auth = createAuth({ store: base.store, now: () => base.t.now, hash, limits });
  return { ...base, auth, gate };
}
const flush = () => new Promise((r) => setImmediate(r));
const login = (auth, ip, password = 'clase123') => auth.studentLogin({ username: 'ana1', password, ip });

test('hashes en vuelo: pasado el tope por IP responde 429 SIN hashear; otra IP sigue entrando; el cupo se libera al terminar', async () => {
  const { auth, gate } = setupGated({ maxInflightPerIp: 2, maxInflightGlobal: 10 });
  const p1 = login(auth, '9.9.9.1'), p2 = login(auth, '9.9.9.1');
  await flush();
  assert.equal(gate.calls, 2);
  await assert.rejects(() => login(auth, '9.9.9.1'), (e) => e.status === 429 && /Demasiados intentos/.test(e.message));
  assert.equal(gate.calls, 2, 'el intento rechazado no hizo el hash');
  const other = login(auth, '9.9.9.2');
  await flush();
  assert.equal(gate.calls, 3, 'otra IP no se ve afectada');
  assert.deepEqual([auth.stats().inflight, auth.stats().inflightIps], [3, 2]);
  gate.release();
  for (const r of await Promise.all([p1, p2, other])) assert.equal(r.ok, true);
  assert.deepEqual([auth.stats().inflight, auth.stats().inflightIps], [0, 0], 'sin cupos ni entradas colgadas');
  assert.equal((await login(auth, '9.9.9.1')).ok, true, 'ya hay cupo otra vez');
  assert.equal(auth.stats().attempts, 0, 'el 429 por hashes en vuelo no cuenta como intento fallido');
});

test('hashes en vuelo: tope global bajo entre todas las IP', async () => {
  const { auth, gate } = setupGated({ maxInflightPerIp: 3, maxInflightGlobal: 4 });
  const ps = [1, 2, 3, 4].map((i) => login(auth, `8.8.8.${i}`));
  await flush();
  assert.equal(gate.calls, 4);
  await assert.rejects(() => login(auth, '8.8.8.99'), (e) => e.status === 429);
  await assert.rejects(() => auth.teacherLogin({ email: 'marta@escuela.com', password: 'x', ip: '8.8.8.98' }), (e) => e.status === 429);
  assert.equal(gate.calls, 4);
  gate.release();
  await Promise.all(ps);
  assert.equal(auth.stats().inflight, 0);
  assert.equal((await login(auth, '8.8.8.99')).ok, true);
});

test('hashes en vuelo: el cupo se libera también cuando el login falla (401) o el hash revienta', async () => {
  const { auth, gate } = setupGated({ maxInflightPerIp: 1, maxInflightGlobal: 2 });
  gate.release();
  for (let i = 0; i < 3; i++) await assert.rejects(() => login(auth, '7.7.7.7', 'mala'), (e) => e.status === 401);
  assert.deepEqual([auth.stats().inflight, auth.stats().inflightIps], [0, 0]);
  gate.fail = true;
  for (let i = 0; i < 3; i++) await assert.rejects(() => login(auth, '7.7.7.8'), /hash roto/);
  assert.deepEqual([auth.stats().inflight, auth.stats().inflightIps], [0, 0]);
  gate.fail = false;
  assert.equal((await login(auth, '7.7.7.8')).ok, true);
});

test('hashes en vuelo: el login de docentes comparte el tope por IP y libera el cupo', async () => {
  const base = setupTeacherPassword();
  const gate = { calls: 0 };
  let open; const opened = new Promise((r) => { open = r; });
  const compare = async (given) => { gate.calls++; await opened; return given === 'MiClave-Segura9'; };
  const auth = createAuth({ store: base.store, now: () => base.t.now, compare, limits: { maxInflightPerIp: 1, maxInflightGlobal: 5 } });
  const p = teacherIn(auth, 'marta@escuela.com', 'MiClave-Segura9', '4.4.4.4');
  await flush();
  await assert.rejects(() => teacherIn(auth, 'marta@escuela.com', 'MiClave-Segura9', '4.4.4.4'), (e) => e.status === 429);
  assert.equal(gate.calls, 1);
  open();
  assert.equal((await p).user.id, 't1');
  assert.equal(auth.stats().inflight, 0);
  await assert.rejects(() => teacherIn(auth, 'marta@escuela.com', 'mala', '4.4.4.4'), (e) => e.status === 400);
  assert.equal(auth.stats().inflight, 0);
});
