// Evaluar proyectos sin internet con la app real: la cola de la app (sync_save_evaluation) le habla al nodo, que la valida
// con las mismas reglas que la nube, la muestra al instante y la sube (por la vía de evaluaciones que la nube ya valida).
// Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { buildPush, applyPull } from '../school-node/sync.js';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-eval-'));
  const db = openDb(dir);
  const layer = createRestLayer(db, { now: () => Date.UTC(2026, 10, 2, 18, 0, 0) });
  const salt = 'ab'.repeat(8);
  const pull = {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }, { class_key: 'ESC1|Segundo|B', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's3', username: 'carla1', full_name: 'Carla', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' },
      ],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't9', full_name: 'Admin', role: 'admin' }],
      teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      projects: [
        { id: 101, user_id: 's2', title: 'Semáforo', score: 0, votes: 0 },
        { id: 102, user_id: 's3', title: 'De Segundo B', score: 0, votes: 0 },
      ],
      evaluations: [],
    },
  };
  applyPull(db, pull);
  cleanups.push(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const teacher = { uid: 't1', role: 'teacher', classKey: null };
  return { db, layer, pull, teacher };
}

const evalArgs = (patch = {}) => ({ p_evaluation: { project_id: 101, teacher_id: 't1', total_score: 100, creativity_score: 18, clarity_score: 17, functionality_score: 16, teamwork_score: 15, social_impact_score: 14, feedback: 'Muy bien', ...patch } });

test('el docente evalúa un proyecto de su clase: el total lo recalcula el nodo, se ve al instante y queda para la nube', () => {
  const { layer, teacher, db } = boot();
  assert.equal(layer.rpcs.sync_save_evaluation(evalArgs({ total_score: 5 }), teacher), null);
  const saved = layer.store.all('evaluations').find((e) => e.project_id === 101);
  assert.deepEqual([saved.teacher_id, saved.total_score, saved.creativity_score, saved.feedback], ['t1', 80, 18, 'Muy bien']);
  assert.equal(layer.store.all('projects').find((p) => p.id === 101).score, 80, 'la nota del proyecto también');

  const sent = buildPush(db).evaluations;
  assert.equal(sent.length, 1);
  assert.match(sent[0].key, /^rest:\d+$/);
  assert.deepEqual([sent[0].teacher_id, sent[0].project_id, sent[0].creativity_score, sent[0].social_impact_score, sent[0].feedback], ['t1', 101, 18, 14, 'Muy bien']);
});

test('evaluar otra vez el mismo proyecto reemplaza lo pendiente (una sola evaluación por proyecto)', () => {
  const { layer, teacher, db } = boot();
  layer.rpcs.sync_save_evaluation(evalArgs(), teacher);
  layer.rpcs.sync_save_evaluation(evalArgs({ creativity_score: 20, feedback: 'Corregido' }), teacher);
  const sent = buildPush(db).evaluations;
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].creativity_score, sent[0].feedback], [20, 'Corregido']);
  assert.equal(layer.store.all('evaluations').filter((e) => e.project_id === 101).length, 1);
});

test('se rechaza como en la nube: estudiante, proyecto de otra clase o inexistente, notas fuera de 0-20, docente falsificado, administrador', () => {
  const { layer, teacher, db } = boot();
  const fails = (a, who = teacher, re = /./) => assert.throws(() => layer.rpcs.sync_save_evaluation(a, who), (e) => e.status === 400 && re.test(e.message));
  fails(evalArgs(), { uid: 's1', role: 'student', classKey: 'ESC1|Primero|A' }, /docentes/);
  fails(evalArgs(), { uid: 't9', role: 'admin', classKey: null }, /docentes/);
  fails(evalArgs({ project_id: 102 }), teacher, /clase/);
  fails(evalArgs({ project_id: 999 }), teacher, /Proyecto/);
  fails(evalArgs({ project_id: 'x' }), teacher, /Proyecto/);
  for (const bad of [21, -1, 1.5, '18', null]) fails(evalArgs({ creativity_score: bad }), teacher, /0 a 20/);
  fails(evalArgs({ feedback: { a: 1 } }), teacher, /texto/);
  fails({ p_evaluation: null }, teacher);
  fails({}, teacher);
  assert.equal(layer.store.pendingCount(), 0);
  assert.equal(buildPush(db).evaluations.length, 0);
  assert.equal(layer.store.all('evaluations').length, 0);
  // Un docente no puede evaluar a nombre de otro: el teacher_id de los datos se ignora.
  layer.rpcs.sync_save_evaluation(evalArgs({ teacher_id: 't9' }), teacher);
  assert.equal(buildPush(db).evaluations[0].teacher_id, 't1');
});

test('la observación se acota a 1000 caracteres y se limpia de caracteres de control (el HTML no se toca)', () => {
  const { layer, teacher, db } = boot();
  layer.rpcs.sync_save_evaluation(evalArgs({ feedback: `Hola\u0000\u0007 <b>mundo</b>${'x'.repeat(2000)}` }), teacher);
  const fb = buildPush(db).evaluations[0].feedback;
  assert.equal(fb.length, 1000);
  assert.match(fb, /^Hola <b>mundo<\/b>/);
});

test('solo se confirma lo que la nube aplicó o rechazó para siempre; mientras tanto la bajada no pisa la evaluación local', () => {
  const { layer, teacher, db, pull } = boot();
  layer.rpcs.sync_save_evaluation(evalArgs(), teacher);
  const push = buildPush(db);
  const key = push.evaluations[0].key;
  // Nube anterior o error pasajero: sigue pendiente y la evaluación local sobrevive a la bajada.
  applyPull(db, pull, push);
  assert.equal(layer.store.pendingCount(), 1);
  assert.equal(layer.store.all('evaluations').length, 1);
  applyPull(db, { ...pull, evaluation_errors: [{ key, error: 'timeout', permanent: false }] }, push);
  assert.equal(layer.store.pendingCount(), 1);
  // La nube la aplicó: sale de la bandeja y la base nueva trae su versión.
  applyPull(db, { ...pull, applied: { evaluations: [key] }, tables: { ...pull.tables, evaluations: [{ id: 55, project_id: 101, teacher_id: 't1', total_score: 80, feedback: 'Muy bien' }] } }, push);
  assert.equal(layer.store.pendingCount(), 0);
  assert.deepEqual(layer.store.all('evaluations').map((e) => e.id), [55]);
});

test('una evaluación rechazada para siempre sale de la bandeja y desaparece del nodo en la siguiente bajada', () => {
  const { layer, teacher, db, pull } = boot();
  layer.rpcs.sync_save_evaluation(evalArgs(), teacher);
  const push = buildPush(db);
  applyPull(db, { ...pull, evaluation_errors: [{ key: push.evaluations[0].key, error: 'El docente no está asignado', permanent: true }] }, push);
  assert.equal(layer.store.pendingCount(), 0);
  assert.equal(layer.store.all('evaluations').length, 0);
});

async function serveAs(layer) {
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (email, password) => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } })).json()).access_token;
  return { call, login };
}

test('por HTTP, como lo hace la cola de la app: el docente guarda y el dueño del proyecto ve su nota; otro estudiante de otra clase no', async () => {
  const { layer } = boot();
  const { call, login } = await serveAs(layer);
  const t = await login('marta@escuela.com', '654321');
  const r = await call('POST', '/rest/v1/rpc/sync_save_evaluation', { token: t, body: evalArgs() });
  assert.equal(r.status, 200);
  const salt = 'ab'.repeat(8);
  void salt;
  const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: 'beto1', password: 'clase123' } })).json();
  const beto = (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  const mine = await (await call('GET', '/rest/v1/projects?select=id,evaluations(total_score,feedback)&id=eq.101', { token: beto })).json();
  assert.deepEqual(mine[0].evaluations, { total_score: 80, feedback: 'Muy bien' });
  const bad = await call('POST', '/rest/v1/rpc/sync_save_evaluation', { token: beto, body: evalArgs() });
  assert.equal(bad.status, 400);
});
