// Rutas HTTP de la capa local (/rest/v1, /auth/v1, /functions/v1/student-login) con peticiones reales en el mismo
// formato que manda supabase-js. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { SCHEMA } from '../school-node/rest/schema.js';
import { createStore } from '../school-node/rest/store.js';
import { createAuth, hashClassPassword, emailHash } from '../school-node/rest/auth.js';
import { createRestRoutes } from '../school-node/rest/routes.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-routes-'));
  const db = openDb(dir);
  const store = createStore({ db, schema: SCHEMA });
  const salt = 'ab'.repeat(8);
  store.setClassVerifiers([{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }]);
  store.put('schools', { id: 1, code: 'ESC1', name: 'Escuela Uno' });
  for (const id of ['l1', 'l2']) store.put('lessons', { id, audience: 'estudiante' });
  store.put('students', { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, pin_hash: 'SECRETO' });
  store.put('students', { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 20 });
  store.put('students', { id: 's3', username: 'carla1', full_name: 'Carla', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo', xp: 30 });
  store.put('teachers', { id: 't1', full_name: 'Marta Gómez', role: 'docente', email: 'marta@escuela.com' });
  store.setTeacherLogins([{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }]);
  const auth = createAuth({ store });
  const changed = [];
  const routes = createRestRoutes({ store, auth, onChange: () => changed.push(1) });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://node');
    if (!(await routes.handle(req, res, url))) { res.writeHead(404); res.end('otro'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, {
    method, headers: { apikey: 'anon', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const login = async (username = 'ana1', password = 'clase123') => {
    const r = await call('POST', '/functions/v1/student-login', { body: { username, password } });
    const { token_hash } = await r.json();
    const v = await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } });
    return v.json();
  };
  return { call, login, store, changed };
}

test('flujo de entrada como la app: student-login, verifyOtp y consulta con la sesión', async () => {
  const { call, login } = await boot();
  const session = await login();
  assert.equal(session.user.id, 's1');
  const r = await call('GET', '/rest/v1/students?select=id,full_name&id=eq.s1', { token: session.access_token });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), [{ id: 's1', full_name: 'Ana' }]);
  const me = await call('GET', '/auth/v1/user', { token: session.access_token });
  assert.equal((await me.json()).id, 's1');
});

test('login mal da 401 con el mensaje genérico; no hay forma de listar usuarios', async () => {
  const { call } = await boot();
  const bad = await call('POST', '/functions/v1/student-login', { body: { username: 'ana1', password: 'mala' } });
  assert.equal(bad.status, 401);
  assert.deepEqual(await bad.json(), { error: 'Usuario o contraseña incorrectos' });
  const none = await call('POST', '/functions/v1/student-login', { body: { username: 'nadie', password: 'x' } });
  assert.deepEqual(await none.json(), { error: 'Usuario o contraseña incorrectos' });
  const list = await call('GET', '/rest/v1/students?select=username', { token: 'anon' });
  assert.equal(list.status, 401, 'con la llave anónima no se lee ninguna tabla');
  assert.equal((await call('GET', '/rest/v1/students?select=username')).status, 401);
});

test('sin sesión válida: 401 en tablas; las dos consultas públicas del login sí responden', async () => {
  const { call } = await boot();
  assert.equal((await call('GET', '/rest/v1/schools?select=*', { token: 'inventado' })).status, 401);
  const mode = await call('POST', '/rest/v1/rpc/resolve_login_mode_by_username', { body: { p_username: 'ana1' } });
  assert.deepEqual([mode.status, await mode.json()], [200, true]);
  const unknown = await call('POST', '/rest/v1/rpc/resolve_login_mode_by_username', { body: { p_username: 'nadie' } });
  assert.deepEqual(await unknown.json(), true);
  const cls = await call('POST', '/rest/v1/rpc/get_class_login_mode', { body: { p_school_code: 'ESC1', p_grade: 'Primero', p_section: 'A' } });
  assert.deepEqual(await cls.json(), true);
  assert.equal((await call('POST', '/rest/v1/rpc/no_existe', { body: {} })).status, 401, 'sin sesión no se enumeran funciones');
});

test('lee solo lo que le toca y nunca columnas sensibles; errores con el formato de PostgREST', async () => {
  const { call, login } = await boot();
  const { access_token: token } = await login();
  const rows = await (await call('GET', '/rest/v1/students?select=id&order=id.asc', { token })).json();
  assert.deepEqual(rows.map((r) => r.id), ['s1', 's2'], 'su salón, no el de Segundo B');
  const bad = await call('GET', '/rest/v1/students?select=pin_hash', { token });
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.code, '42703');
  assert.doesNotMatch(JSON.stringify(body), /SECRETO/);
  const missing = await call('GET', '/rest/v1/xp_events?select=*', { token });
  assert.deepEqual([missing.status, (await missing.json()).code], [404, '42P01']);
});

test('single object, conteo y cabecera Content-Range', async () => {
  const { call, login } = await boot();
  const { access_token: token } = await login();
  const one = await call('GET', '/rest/v1/students?select=id&id=eq.s1', { token, headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.deepEqual([one.status, await one.json()], [200, { id: 's1' }]);
  const none = await call('GET', '/rest/v1/students?select=id&id=eq.s3', { token, headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.deepEqual([none.status, (await none.json()).code], [406, 'PGRST116']);
  const counted = await call('GET', '/rest/v1/students?select=id', { token, headers: { prefer: 'count=exact' } });
  assert.match(counted.headers.get('content-range'), /^0-1\/2$/);
  const head = await call('HEAD', '/rest/v1/students?select=id', { token, headers: { prefer: 'count=exact' } });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-range'), /\/2$/);
});

test('escribe su avance: queda en la réplica y en la bandeja; lo ajeno se rechaza y no deja nada', async () => {
  const { call, login, store, changed } = await boot();
  const { access_token: token } = await login();
  const ok = await call('POST', '/rest/v1/lesson_completions', { token, headers: { prefer: 'return=representation' }, body: { lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' } });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json())[0].score, 90);
  assert.equal(store.pending().length, 1);
  assert.equal(changed.length, 1, 'avisa para que la sincronización se entere');

  const minimal = await call('POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', { token, headers: { prefer: 'resolution=merge-duplicates' }, body: { lesson_id: 'l1', student_id: 's1', score: 100, status: 'completed' } });
  assert.equal(minimal.status, 201);
  assert.equal(await minimal.text(), '');
  assert.equal(store.all('lesson_completions')[0].score, 100);

  const before = store.pending().length;
  const foreign = await call('POST', '/rest/v1/lesson_completions', { token, body: { lesson_id: 'l2', student_id: 's2', status: 'completed' } });
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, '42501');
  assert.equal(store.pending().length, before);
  assert.equal(store.all('lesson_completions').length, 1);

  const patch = await call('PATCH', '/rest/v1/students?id=eq.s1', { token, body: { xp: 99999 } });
  assert.equal(patch.status, 403);
  assert.equal(store.all('students').find((s) => s.id === 's1').xp, 10);

  const del = await call('DELETE', '/rest/v1/lesson_completions?lesson_id=eq.l1', { token });
  assert.equal(del.status, 204);
  assert.equal(store.all('lesson_completions').length, 0);
});

test('renovar la sesión y cerrar sesión, como supabase-js', async () => {
  const { call, login } = await boot();
  const s = await login();
  const r = await call('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
  const s2 = await r.json();
  assert.equal(r.status, 200);
  assert.equal(s2.user.id, 's1');
  assert.equal((await call('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })).status, 401, 'el token viejo ya no sirve');
  assert.equal((await call('POST', '/auth/v1/logout', { token: s2.access_token, body: {} })).status, 204);
  assert.equal((await call('POST', '/auth/v1/token?grant_type=password', { body: { email: 'a@b.c', password: 'x' } })).status, 400, 'docentes: todavía no');
});

test('el límite de intentos llega como 429', async () => {
  const { call } = await boot();
  let last;
  for (let i = 0; i < 12; i++) last = await call('POST', '/functions/v1/student-login', { body: { username: 'u' + i, password: 'x' } });
  assert.equal(last.status, 429);
  assert.match((await last.json()).error, /Demasiados intentos/);
});

test('peticiones mal formadas no tumban el servidor: JSON roto, método raro, ruta desconocida, cuerpo enorme', async () => {
  const { call, login } = await boot();
  const { access_token: token } = await login();
  assert.equal((await call('POST', '/rest/v1/lesson_completions', { token, body: '{roto' })).status, 400);
  assert.equal((await call('PUT', '/rest/v1/students?id=eq.s1', { token, body: {} })).status, 405);
  assert.equal((await call('GET', '/auth/v1/nada')).status, 404);
  const huge = await call('POST', '/functions/v1/student-login', { body: JSON.stringify({ username: 'x'.repeat(2_000_000) }) }).catch(() => ({ status: 413 }));
  assert.ok([400, 413].includes(huge.status));
  assert.equal((await call('GET', '/rest/v1/students?select=id', { token })).status, 200, 'sigue vivo');
});

test('docente por HTTP: signInWithPassword con correo y PIN entra; lo malo da 400 con el mensaje de GoTrue; sus datos son los suyos', async () => {
  const { call } = await boot();
  const ok = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: 'Marta@Escuela.com', password: '654321' } });
  assert.equal(ok.status, 200);
  const session = await ok.json();
  assert.equal(session.user.id, 't1');
  const me = await call('GET', '/rest/v1/teachers?select=id,full_name,email&id=eq.t1', { token: session.access_token });
  assert.deepEqual(await me.json(), [{ id: 't1', full_name: 'Marta Gómez', email: null }]);
  const students = await (await call('GET', '/rest/v1/students?select=id&order=id.asc', { token: session.access_token })).json();
  assert.deepEqual(students.map((s) => s.id), ['s1', 's2', 's3'], 'el docente ve a los estudiantes de la escuela');
  const bad = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: 'marta@escuela.com', password: '000000' } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).msg, /Invalid login credentials/);
  assert.equal((await call('POST', '/auth/v1/token?grant_type=otro', { body: {} })).status, 400);
});

test('una función que el nodo no tiene responde en español claro, con el código de la nube', async () => {
  const { call, login } = await boot();
  const { access_token: token } = await login();
  const r = await call('POST', '/rest/v1/rpc/react_to_project', { token, body: { p_project_id: 1 } });
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.code, 'PGRST202');
  assert.match(body.message, /sin internet/i);
});
