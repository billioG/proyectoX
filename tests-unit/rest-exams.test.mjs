// Exámenes con hoja de respuestas sin internet con la app real: el docente crea el examen con su clave, califica escaneando y consulta; el
// estudiante solo ve SU nota (nunca la clave). Mismas reglas que la nube (migrations/exams.sql); lo escrito sube al sincronizar. Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { applyPull, buildPush } from '../school-node/sync.js';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-exams-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const login = (id, email) => ({ teacher_id: id, email_hash: emailHash(email), pin_hash: hashClassPassword('654321', salt), pin_salt: salt });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    teacher_logins: [login('t1', 'marta@escuela.com'), login('t2', 'raul@escuela.com')],
    tables: {
      students: [['s1', 'ana1', 'Primero', 'A'], ['s2', 'beto1', 'Primero', 'A'], ['s3', 'carla1', 'Segundo', 'B']].map(([id, u, g, s]) => ({ id, username: u, full_name: u, school_code: 'ESC1', grade: g, section: s, status: 'activo' })),
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' }],
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const teacher = async (email) => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password: '654321' } })).json()).access_token;
  const student = async (user = 'ana1') => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: user, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  return { db, layer, call, teacher, student };
}
const REP = { prefer: 'return=representation' };
const exam = (patch = {}) => ({ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', title: 'Examen de Mate', bimestre: 2, question_count: 5, answer_key: 'ABCDE', points: 20, ...patch });
const result = (examId, patch = {}) => ({ exam_id: examId, student_id: 's1', answers: 'ABCD-', correct: 4, wrong: 0, blank: 1, score: 16, scanned_by: 't1', ...patch });
const makeExam = async (h, t1, patch) => {
  const r = await h.call('POST', '/rest/v1/exams?select=*', { token: t1, headers: { ...REP, accept: 'application/vnd.pgrst.object+json' }, body: exam(patch) });
  assert.equal(r.status, 201);
  return r.json();
};

test('el docente crea un examen de SU clase con su clave; id y fecha automáticos; reglas de la nube; el estudiante nunca ve la clave', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const e = await makeExam(h, t1);
  assert.match(e.id, /^[0-9a-f-]{36}$/);
  assert.ok(e.created_at);
  assert.equal(e.answer_key, 'ABCDE');
  const post = (body, token = t1) => h.call('POST', '/rest/v1/exams', { token, body });
  for (const bad of [exam({ answer_key: 'ABC' }), exam({ answer_key: 'ABCDF' }), exam({ answer_key: 'abcde' }), exam({ question_count: 0, answer_key: '' }), exam({ question_count: 101, answer_key: 'A'.repeat(101) }),
    exam({ title: '' }), exam({ title: 'x'.repeat(121) }), exam({ bimestre: 5 }), exam({ points: 0 }), exam({ points: 1001 }), exam({ grade: 'Segundo', section: 'B' }), exam({ teacher_id: 't2' }), exam({ school_code: 'ESC2' }), exam({ id: 'mio' })]) {
    assert.equal((await post(bad)).status, 403, JSON.stringify(bad).slice(0, 80));
  }
  const s1 = await h.student();
  assert.equal((await post(exam({ teacher_id: 's1' }), s1)).status, 403);
  assert.deepEqual(await (await h.call('GET', '/rest/v1/exams?select=id,answer_key', { token: s1 })).json(), [], 'la clave nunca llega a un estudiante');
  const t2 = await h.teacher('raul@escuela.com');
  assert.deepEqual(await (await h.call('GET', '/rest/v1/exams?select=id', { token: t2 })).json(), [], 'otro docente no ve el examen');
  const push = buildPush(h.db, { cloudUrl: 'https://x.supabase.co' });
  assert.deepEqual(push.content.map((o) => [o.tbl, o.op]), [['exams', 'insert']]);
});

test('calificar: upsert por examen y estudiante, la lista del examen con su conteo, y solo con respuestas del tamaño de la clave', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const e = await makeExam(h, t1);
  const up = (body, token = t1) => h.call('POST', '/rest/v1/exam_results?on_conflict=exam_id,student_id', { token, headers: { prefer: 'resolution=merge-duplicates' }, body });
  assert.equal((await up(result(e.id))).status, 201);
  assert.equal((await up(result(e.id, { answers: 'ABCDE', correct: 5, blank: 0, score: 20 }))).status, 201, 'volver a escanear reemplaza');
  assert.equal(h.layer.store.all('exam_results').filter((r) => r.exam_id === e.id).length, 1);
  assert.equal(h.layer.store.all('exam_results')[0].score, 20);
  await up(result(e.id, { student_id: 's2', answers: '*BCDE' }));
  for (const bad of [result(e.id, { answers: 'ABC' }), result(e.id, { answers: 'ABCDX' }), result(e.id, { student_id: 's3' }), result(e.id, { correct: -1 }), result(e.id, { score: -2 }),
    result('no-existe'), result(e.id, { scanned_by: 't2' })]) {
    assert.equal((await up(bad)).status, 403, JSON.stringify(bad).slice(0, 70));
  }
  const t2 = await h.teacher('raul@escuela.com');
  assert.equal((await up(result(e.id), t2)).status, 403, 'otro docente no califica mi examen');
  const list = await (await h.call('GET', '/rest/v1/exams?select=*,exam_results(count)&order=created_at.desc', { token: t1 })).json();
  assert.deepEqual(list.map((x) => x.exam_results), [[{ count: 2 }]]);
  const all = await (await h.call('GET', `/rest/v1/exam_results?select=*&exam_id=eq.${e.id}`, { token: t1 })).json();
  assert.equal(all.length, 2);
  const del = await h.call('DELETE', `/rest/v1/exam_results?exam_id=eq.${e.id}&student_id=eq.s2&select=student_id`, { token: t1, headers: REP });
  assert.deepEqual((await del.json()).map((r) => r.student_id), ['s2']);
});

test('el estudiante ve solo su nota, con el examen pero sin la clave; my_exam_results la trae ordenada', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const e = await makeExam(h, t1);
  await h.call('POST', '/rest/v1/exam_results', { token: t1, body: result(e.id) });
  await h.call('POST', '/rest/v1/exam_results', { token: t1, body: result(e.id, { student_id: 's2', score: 8, correct: 2, wrong: 3, blank: 0, answers: 'AAAAA' }) });
  const s1 = await h.student();
  const mine = await (await h.call('GET', '/rest/v1/exam_results?select=student_id,score', { token: s1 })).json();
  assert.deepEqual(mine, [{ student_id: 's1', score: 16 }], 'solo la suya');
  const r = await (await h.call('POST', '/rest/v1/rpc/my_exam_results', { token: s1, body: {} })).json();
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].exam_id, r[0].title, r[0].bimestre, r[0].points, r[0].score, r[0].correct, r[0].wrong, r[0].blank, r[0].question_count], [e.id, 'Examen de Mate', 2, 20, 16, 4, 0, 1, 5]);
  assert.equal('answer_key' in r[0], false);
  assert.equal((await h.call('POST', '/rest/v1/rpc/my_exam_results', { token: await h.teacher('marta@escuela.com'), body: {} })).status, 200, 'un docente recibe lista vacía, no error');
});

test('editar y borrar solo el examen propio; borrar el examen se lleva sus notas; lo ajeno no se toca', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com'), t2 = await h.teacher('raul@escuela.com');
  const e = await makeExam(h, t1);
  await h.call('POST', '/rest/v1/exam_results', { token: t1, body: result(e.id) });
  const patch = (token, body) => h.call('PATCH', `/rest/v1/exams?id=eq.${e.id}&select=*`, { token, headers: REP, body });
  assert.equal((await (await patch(t1, { title: 'Nuevo título', points: 25 })).json())[0].title, 'Nuevo título');
  assert.deepEqual(await (await patch(t2, { title: 'Robado' })).json(), []);
  assert.deepEqual(await (await patch(t1, { answer_key: 'AB' })).json(), [], 'la clave debe seguir midiendo lo mismo que las preguntas');
  assert.deepEqual(await (await patch(t1, { teacher_id: 't2' })).json(), [], 'no se cambia de dueño');
  const del = (token) => h.call('DELETE', `/rest/v1/exams?id=eq.${e.id}&select=id`, { token, headers: REP });
  assert.deepEqual(await (await del(t2)).json(), []);
  assert.deepEqual((await (await del(t1)).json()).map((x) => x.id), [e.id]);
  assert.equal(h.layer.store.all('exam_results').length, 0);
});
