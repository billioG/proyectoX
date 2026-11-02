// Evaluar proyectos en el nodo, de extremo a extremo: login con PIN personal del docente, lista de proyectos de sus
// clases, evaluar, ver el video guardado en el nodo, y lo que ve el estudiante. Arranca school-node/server.js de verdad.
// Se omite si better-sqlite3 no está compilado para esta versión de Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNode, sqliteAvailable, stopAllNodes, TEACHER_CODE } from './helpers/start-node.mjs';

after(() => stopAllNodes());

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const STUDENTS = [
  { id: 's1', full_name: 'Ana', grade: 'Primero', section: 'A' },
  { id: 's2', full_name: 'Beto', grade: 'Primero', section: 'A' },
  { id: 's3', full_name: 'Carla', grade: 'Segundo', section: 'B' },
];
const TEACHERS = [
  { id: 't1', full_name: 'Marta', assignments: [{ grade: 'Primero', section: 'A' }] },
  { id: 't2', full_name: 'Raúl', assignments: [{ grade: 'Segundo', section: 'B' }] },
];
const CLOUD = [
  { id: '27', user_id: 's1', author_name: 'Ana', title: 'Robot de Ana', score: 0, created_at: '2026-10-30T10:00:00Z' },
  { id: '29', user_id: 's3', author_name: 'Carla', title: 'De Segundo B', grade: 'Segundo', section: 'B', score: 0, created_at: '2026-10-29T10:00:00Z' },
];
const SCORES = { creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5, feedback: 'Muy bien' };

async function boot() {
  const node = await startNode({ students: STUDENTS, teachers: TEACHERS, cloudProjects: CLOUD });
  return { node, ana: await node.login('s1'), beto: await node.login('s2') };
}
const pinLogin = (node, teacher_id, pin = '123456', code = TEACHER_CODE) =>
  node.api('/api/teacher/pin-login', { method: 'POST', body: { teacher_id, pin, code } });
const teacherToken = async (node, id) => (await pinLogin(node, id)).data.token;
const evaluate = (node, token, key, patch = {}) => node.api('/api/teacher/evaluate', { method: 'POST', token, body: { key, ...SCORES, ...patch } });

test('la lista de docentes es pública, sin datos sensibles', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    const r = await node.api('/api/teachers');
    assert.deepEqual(r.data.teachers, [{ id: 't1', full_name: 'Marta', has_pin: false }, { id: 't2', full_name: 'Raúl', has_pin: false }]);
  } finally { await node.stop(); }
});

test('PIN personal: se crea con el código del nodo, después basta el PIN, un PIN malo es 401', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    assert.equal((await pinLogin(node, 't1', '123456', 'mal-codigo')).status, 403);
    const created = await pinLogin(node, 't1');
    assert.equal(created.status, 200);
    assert.deepEqual([created.data.created, created.data.teacher.id, created.data.teacher.assignments], [true, 't1', [{ grade: 'Primero', section: 'A' }]]);
    assert.ok(created.data.token);
    assert.doesNotMatch(JSON.stringify(created.data), /pin_hash|pin_salt/);
    const again = await pinLogin(node, 't1', '123456', undefined);
    assert.deepEqual([again.status, again.data.created], [200, false]);
    assert.equal((await pinLogin(node, 't1', '000000', undefined)).status, 401);
    assert.equal((await node.api('/api/teachers')).data.teachers[0].has_pin, true);
  } finally { await node.stop(); }
});

test('las rutas de evaluar piden la sesión PERSONAL: ni sin sesión, ni de estudiante, ni con la del código compartido', { skip, timeout: 60000 }, async () => {
  const { node, ana } = await boot();
  try {
    const shared = await node.teacherLogin();
    for (const token of [undefined, ana, shared]) {
      assert.equal((await node.api('/api/teacher/evaluations', { token })).status, 401);
      assert.equal((await evaluate(node, token, 'c:27')).status, 401);
    }
  } finally { await node.stop(); }
});

test('el docente ve solo los proyectos de sus clases', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    const t1 = await teacherToken(node, 't1');
    const t2 = await teacherToken(node, 't2');
    assert.deepEqual((await node.api('/api/teacher/evaluations', { token: t1 })).data.projects.map(p => p.key), ['c:27']);
    assert.deepEqual((await node.api('/api/teacher/evaluations', { token: t2 })).data.projects.map(p => p.key), ['c:29']);
  } finally { await node.stop(); }
});

test('evaluar: guarda con el total recalculado, queda evaluado; otra clase 403, notas inválidas 400, inexistente 404', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    const t1 = await teacherToken(node, 't1');
    const ok = await evaluate(node, t1, 'c:27', { total_score: 999 });
    assert.deepEqual([ok.status, ok.data.total_score], [200, 50]);
    const list = (await node.api('/api/teacher/evaluations', { token: t1 })).data.projects;
    assert.deepEqual([list[0].evaluated, list[0].score], [true, 50]);
    const detail = await node.api(`/api/teacher/evaluations/${encodeURIComponent('c:27')}`, { token: t1 });
    assert.deepEqual([detail.status, detail.data.evaluation.feedback, detail.data.evaluation.creativity_score], [200, 'Muy bien', 15]);
    assert.equal((await evaluate(node, t1, 'c:29')).status, 403);
    assert.equal((await evaluate(node, t1, 'c:27', { creativity_score: 21 })).status, 400);
    assert.equal((await evaluate(node, t1, 'c:999')).status, 404);
    assert.equal((await evaluate(node, t1, 'cualquier-cosa')).status, 404);
    assert.equal((await node.api(`/api/teacher/evaluations/${encodeURIComponent('c:29')}`, { token: t1 })).status, 403);
  } finally { await node.stop(); }
});

test('el estudiante ve la nota y la observación al instante; un proyecto evaluado se vuelve visible para la clase', { skip, timeout: 60000 }, async () => {
  const { node, ana, beto } = await boot();
  try {
    const feed = async (t) => (await node.api('/api/feed', { token: t })).data.projects;
    assert.deepEqual((await feed(ana)).map(p => p.id), ['27'], 'antes: solo su dueña lo ve (sin nota)');
    assert.deepEqual(await feed(beto), []);
    const t1 = await teacherToken(node, 't1');
    await evaluate(node, t1, 'c:27');
    const mine = (await feed(ana))[0];
    assert.deepEqual([mine.score, mine.feedback], [50, 'Muy bien']);
    const other = (await feed(beto))[0];
    assert.deepEqual([other?.id, other?.score, other?.feedback], ['27', 50, null], 'la clase lo ve con nota, sin la observación');
  } finally { await node.stop(); }
});

test('un proyecto que el estudiante guardó en el nodo también se puede evaluar', { skip, timeout: 60000 }, async () => {
  const { node, ana } = await boot();
  try {
    const buf = Buffer.alloc(2000, 7);
    const { id } = (await node.api('/api/projects', { method: 'POST', token: ana, body: { title: 'Mi robot guardado', description: DESC, bimestre: 1, filename: 'v.mp4', size: buf.length } })).data;
    assert.equal((await fetch(`${node.base}/api/projects/${id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${ana}` }, body: buf })).status, 200);
    const t1 = await teacherToken(node, 't1');
    const list = (await node.api('/api/teacher/evaluations', { token: t1 })).data.projects;
    assert.deepEqual(list.map(p => p.key).sort(), ['c:27', `l:${id}`].sort());
    const ok = await evaluate(node, t1, `l:${id}`, { feedback: 'Se ve bien' });
    assert.equal(ok.status, 200);
    const mine = (await node.api('/api/feed', { token: ana })).data.projects.find(p => p.id === id);
    assert.deepEqual([mine.score, mine.feedback, mine.state], [50, 'Se ve bien', 'pending']);
  } finally { await node.stop(); }
});

// GET con cabeceras propias (fetch no deja leer 206 con el cuerpo parcial de forma uniforme en todas las versiones).
function rawGet(node, pathname, headers = {}) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: node.port, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

test('el docente ve el video guardado en el nodo (con Range); otra clase, sin sesión o con sesión de estudiante no', { skip, timeout: 60000 }, async () => {
  const { node, ana } = await boot();
  try {
    const buf = Buffer.from(Array.from({ length: 3000 }, (_, i) => i % 251));
    const { id } = (await node.api('/api/projects', { method: 'POST', token: ana, body: { title: 'Mi robot guardado', description: DESC, bimestre: 1, filename: 'v.mp4', size: buf.length } })).data;
    await fetch(`${node.base}/api/projects/${id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${ana}` }, body: buf });
    const t1 = await teacherToken(node, 't1');
    const t2 = await teacherToken(node, 't2');
    const url = (t) => `/api/teacher/project-file/${id}?t=${t}`;

    const full = await rawGet(node, url(t1));
    assert.deepEqual([full.status, full.headers['content-type'], full.headers['accept-ranges']], [200, 'video/mp4', 'bytes']);
    assert.ok(full.body.equals(buf));
    const part = await rawGet(node, url(t1), { Range: 'bytes=100-199' });
    assert.deepEqual([part.status, part.headers['content-range'], part.body.length], [206, 'bytes 100-199/3000', 100]);
    assert.ok(part.body.equals(buf.subarray(100, 200)));
    assert.equal((await rawGet(node, url(t1), { Range: 'bytes=5000-6000' })).status, 416);

    assert.equal((await rawGet(node, url(t2))).status, 403, 'docente de otra clase');
    assert.equal((await rawGet(node, `/api/teacher/project-file/${id}`)).status, 401, 'sin sesión');
    assert.equal((await rawGet(node, url(ana))).status, 401, 'sesión de estudiante');
    assert.equal((await rawGet(node, `/api/teacher/project-file/00000000-0000-4000-8000-000000000000?t=${t1}`)).status, 404);
    assert.equal((await rawGet(node, `/api/teacher/project-file/..%2F..%2Fconfig.json?t=${t1}`)).status, 404, 'nada de rutas');
  } finally { await node.stop(); }
});

test('quien administra el nodo (código compartido) puede restablecer el PIN de un docente; un docente no', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    const t1 = await teacherToken(node, 't1');
    const reset = (token) => node.api('/api/teacher/reset-teacher-pin', { method: 'POST', token, body: { teacher_id: 't1' } });
    assert.equal((await reset(t1)).status, 401, 'la sesión personal no sirve');
    assert.equal((await reset(await node.teacherLogin())).status, 200);
    assert.equal((await node.api('/api/teachers')).data.teachers[0].has_pin, false);
    assert.equal((await pinLogin(node, 't1', '654321')).data.created, true);
  } finally { await node.stop(); }
});
