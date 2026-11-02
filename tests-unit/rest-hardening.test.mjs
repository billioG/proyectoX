// Endurecimiento de la capa local tras la revisión independiente: avance de lecciones validado (nada de lecciones
// inventadas ni XP falso), comodines sin bloqueo del servidor, tiempo de login parejo, memoria acotada, topes de
// tamaño, nombres heredados de Object.prototype y cuándo se activa la capa. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { buildPush, applyPull } from '../school-node/sync.js';
import { createAuth, hashClassPassword } from '../school-node/rest/auth.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const UPSERT = { prefer: 'resolution=merge-duplicates' };
const REF = (n) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;

function boot({ extraStudents = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-hard-'));
  const db = openDb(dir);
  const clock = { now: Date.UTC(2026, 10, 2, 18, 0, 0) };
  const layer = createRestLayer(db, { now: () => clock.now, random: () => 0 });
  const salt = 'ab'.repeat(8);
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 100, gems: 10 },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 50 },
        ...extraStudents,
      ],
      lessons: [{ id: 'l1', audience: 'estudiante' }, { id: 'l2', audience: 'estudiante' }, { id: 'ld', audience: 'docente' }],
    },
  });
  cleanups.push(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const ctx = { uid: 's1', role: 'student', classKey: 'ESC1|Primero|A' };
  return { db, layer, clock, ctx, me: () => layer.store.all('students').find((s) => s.id === 's1') };
}

async function serve(layer) {
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: 'ana1', password: 'clase123' } })).json();
  const session = await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json();
  return { call, token: session.access_token };
}

// ---- C2 / C3: avance de lecciones válido ----
test('un avance con lección inexistente, de otra audiencia o con datos absurdos se rechaza: no queda en la bandeja ni paga XP', async () => {
  const { layer, me, db } = boot();
  const { call, token } = await serve(layer);
  const post = (row) => call('POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', { token, headers: UPSERT, body: row });
  const ok = { lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' };
  for (const bad of [
    { ...ok, lesson_id: 'no-existe' }, { ...ok, lesson_id: { x: 1 } }, { ...ok, lesson_id: 'ld' }, { ...ok, lesson_id: null },
    { ...ok, score: 500 }, { ...ok, score: -1 }, { ...ok, score: 'mucho' }, { ...ok, status: 'x'.repeat(50) }, { ...ok, status: { a: 1 } },
    { ...ok, raw_data: { blob: 'x'.repeat(30000) } }, { ...ok, completed_at: 'no es fecha' },
  ]) assert.equal((await post(bad)).status, 403, JSON.stringify(bad).slice(0, 80));
  assert.equal(layer.store.pendingCount(), 0);
  assert.equal(me().xp, 100);
  assert.equal(buildPush(db).completions.length, 0);

  assert.equal((await post(ok)).status, 201);
  assert.equal(me().xp, 110);
  assert.equal((await post({ lesson_id: 'l2', student_id: 's1', score: null, status: null })).status, 201, 'vista sin nota (como markLessonSeen) sí vale');
  assert.equal((await post({ lesson_id: 'l2', student_id: 's1', score: 80, status: 'incomplete', raw_data: { scorm: { a: 1 } } })).status, 201);
});

test('una sola petición no puede traer cientos de filas (cada fila cuesta caro y sube a la nube)', async () => {
  const { layer, me } = boot();
  const { call, token } = await serve(layer);
  const rows = Array.from({ length: 101 }, (_, i) => ({ lesson_id: 'l1', student_id: 's1', score: i % 100, status: 'completed' }));
  const r = await call('POST', '/rest/v1/lesson_completions', { token, body: rows });
  assert.equal(r.status, 400);
  assert.equal(layer.store.all('lesson_completions').length, 0);
  assert.equal(me().xp, 100);
});

test('el cuerpo de una petición está acotado (200 KB): uno enorme responde 413 y el servidor sigue vivo', async () => {
  const { layer } = boot();
  const { call, token } = await serve(layer);
  const r = await call('POST', '/rest/v1/lesson_completions', { token, body: { lesson_id: 'l1', student_id: 's1', raw_data: 'x'.repeat(300_000) } });
  assert.equal(r.status, 413);
  assert.equal((await call('GET', '/rest/v1/students?select=id', { token })).status, 200);
});

// ---- C4: comodines ----
test('like/ilike con muchos comodines no bloquea el servidor y sigue dando la respuesta correcta', async () => {
  const { layer } = boot();
  layer.store.put('students', { id: 's3', username: 'x', full_name: 'a'.repeat(60), school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' });
  const { call, token } = await serve(layer);
  const names = async (q) => (await (await call('GET', `/rest/v1/students?select=full_name&full_name=${q}&order=full_name.asc`, { token })).json()).map((r) => r.full_name);
  const t0 = Date.now();
  assert.deepEqual(await names('ilike.******************zzz'), []);
  assert.deepEqual(await names('like.*a*a*a*a*a*a*a*a*a*a*a*a*b'), []);
  assert.ok(Date.now() - t0 < 1500, `tardó ${Date.now() - t0} ms`);
  assert.deepEqual(await names('ilike.*ANA*'), ['Ana']);
  assert.deepEqual(await names('like.An_'), ['Ana']);
  assert.deepEqual(await names('like.B*'), ['Beto']);
  assert.deepEqual(await names('like.*to'), ['Beto']);
  assert.deepEqual(await names('ilike.*a*a*'), ['a'.repeat(60), 'Ana']);
  assert.deepEqual(await names('like.ana'), []);
  assert.deepEqual(await names('like.%25et%25'), ['Beto'], 'el % también funciona');
});

// ---- I1 / I2: login ----
test('un usuario que no existe tarda lo mismo que uno que sí existe con la contraseña mala (no se puede enumerar usuarios por el tiempo)', () => {
  const { layer } = boot();
  const time = (u, i) => { const t = process.hrtime.bigint(); try { layer.auth.studentLogin({ username: u, password: 'mala', ip: `10.0.0.${i}` }); } catch { /* 401 */ } return Number(process.hrtime.bigint() - t) / 1e6; };
  const median = (u, base) => [time(u, base), time(u, base + 1), time(u, base + 2)].sort((a, b) => a - b)[1];
  const known = median('ana1', 10);
  const unknown = median('nadie', 20);
  assert.ok(unknown > known * 0.5, `usuario inexistente ${unknown.toFixed(1)} ms vs existente ${known.toFixed(1)} ms`);
});

test('la memoria del login está acotada: intentos, enlaces sin usar y tokens de renovación viejos', () => {
  const { layer, clock } = boot();
  // Hash de mentira y tope chico: se prueba la estructura, no la velocidad de PBKDF2.
  layer.store.setClassVerifiers([{ class_key: 'ESC1|Primero|A', requires_password: true, salt: 'aa', hash: 'h:clase123' }]);
  const auth = createAuth({ store: layer.store, now: () => clock.now, hash: (pw) => `h:${pw}`, maxTracked: 50 });
  for (let i = 0; i < 400; i++) { try { auth.studentLogin({ username: `u${i}`, password: 'x', ip: `ip${i}` }); } catch { /* 401 */ } }
  assert.ok(auth.stats().attempts <= 50, `intentos: ${auth.stats().attempts}`);
  for (let i = 0; i < 300; i++) { clock.now += 1; auth.studentLogin({ username: 'ana1', password: 'clase123', ip: `v${i}` }); }
  assert.ok(auth.stats().loginTokens <= 50, `enlaces: ${auth.stats().loginTokens}`);

  const { token_hash } = auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'zz' });
  auth.verify({ token_hash, type: 'magiclink' });
  assert.ok(layer.store.refreshCount() >= 1);
  clock.now += 31 * 24 * 3600_000;
  const t2 = auth.studentLogin({ username: 'ana1', password: 'clase123', ip: 'yy' }).token_hash;
  auth.verify({ token_hash: t2, type: 'magiclink' });
  assert.equal(layer.store.refreshCount(), 1, 'los de hace más de 30 días se borran');
});

test('un usuario larguísimo no llena la memoria: el límite usa una versión acotada del nombre', () => {
  const { layer } = boot();
  const long = 'u'.repeat(5000);
  try { layer.auth.studentLogin({ username: long, password: 'x', ip: 'a' }); } catch { /* 401 */ }
  assert.ok(layer.auth.stats().maxKeyLength <= 100);
});

// ---- Práctica: tamaño ----
test('log_practice guarda solo los campos conocidos y acota el texto; por estudiante hay un tope de pendientes', () => {
  const { layer, ctx, db } = boot();
  layer.rpcs.log_practice({ p_game: 'quiz', p_topic: 'x'.repeat(5000), p_correct: 1, p_total: 2, p_duration_ms: 10, p_source: 'bank', p_client_ref: REF(1), p_played_at: '2026-11-02T10:00:00Z', basura: 'y'.repeat(100000) }, ctx);
  const args = buildPush(db).rpc[0].args;
  assert.deepEqual(Object.keys(args).sort(), ['p_client_ref', 'p_correct', 'p_duration_ms', 'p_game', 'p_played_at', 'p_source', 'p_topic', 'p_total']);
  assert.equal(args.p_topic.length, 200);
  for (let i = 2; i < 700; i++) layer.rpcs.log_practice({ p_game: 'quiz', p_topic: null, p_correct: 1, p_total: 2, p_duration_ms: 10, p_source: 'bank', p_client_ref: REF(i), p_played_at: '2026-11-02T10:00:00Z' }, ctx);
  assert.equal(buildPush(db).rpc.length, 500, 'tope de 500 pendientes por estudiante');
});

// ---- M1: nombres heredados ----
test('nombres como constructor o __proto__ no son tablas, funciones ni relaciones', async () => {
  const { layer } = boot();
  const { call, token } = await serve(layer);
  assert.equal((await call('POST', '/rest/v1/rpc/constructor', { body: {} })).status, 401);
  assert.equal((await call('POST', '/rest/v1/rpc/toString', { body: {} })).status, 401);
  assert.equal((await call('POST', '/rest/v1/rpc/constructor', { token, body: {} })).status, 404);
  assert.equal((await call('POST', '/rest/v1/rpc/toString', { token, body: {} })).status, 404);
  for (const t of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal((await call('GET', `/rest/v1/${t}?select=*`, { token })).status, 404, t);
  const rel = await call('GET', '/rest/v1/students?select=id,constructor(*)', { token });
  assert.equal(rel.status, 400);
});

// ---- I4: cuándo se activa la capa ----
test('la capa solo se activa si TODAS las clases con estudiantes activos tienen contraseña conocida', () => {
  const { layer } = boot();
  assert.equal(layer.ready(), true);
  layer.store.put('students', { id: 's9', username: 'zoe9', full_name: 'Zoe', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' });
  assert.equal(layer.ready(), false, 'una clase sin verificador deja a esos estudiantes fuera: mejor el modo anterior');
  layer.store.put('students', { id: 's9', username: 'zoe9', full_name: 'Zoe', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'baja' });
  assert.equal(layer.ready(), true, 'los dados de baja no cuentan');
});

test('missingClasses dice qué clases dejarían sin acceso a sus estudiantes (y no cuenta a los dados de baja)', () => {
  const { layer } = boot();
  assert.deepEqual(layer.missingClasses(), []);
  layer.store.put('students', { id: 's8', username: 'x8', full_name: 'X', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' });
  layer.store.put('students', { id: 's9', username: 'x9', full_name: 'Y', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' });
  layer.store.put('students', { id: 's7', username: 'x7', full_name: 'Z', school_code: 'ESC1', grade: 'Tercero', section: 'C', status: 'baja' });
  assert.deepEqual(layer.missingClasses(), ['Segundo B']);
});
