// Comentarios de equipo, «me gusta» y notas privadas de los recursos, sin internet, con las mismas reglas que la nube
// (migrations/resource-notes-comments.sql y resource-comments-likes-replies.sql). Lo escrito queda en la bandeja para subir. Corre con Node 20.
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
import { containsProfanity } from '../school-node/rest/profanity.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);
const LESSON = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-social-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const verifier = (k) => ({ class_key: k, requires_password: true, salt, hash: hashClassPassword('clase123', salt) });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [verifier('ESC1|Primero|A')],
    teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
    tables: {
      students: ['ana1', 'beto1', 'carla1'].map((u, i) => ({ id: `s${i + 1}`, username: u, full_name: u.toUpperCase(), school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' })),
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }],
      teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      groups: [{ id: 7, name: 'Sol', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 8, name: 'Luna', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 7, student_id: 's2' }, { id: 3, group_id: 8, student_id: 's3' }],
      courses: [{ id: 'c1', title: 'Robótica', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
      lessons: [{ id: LESSON, course_id: 'c1', title: 'Guía', content_type: 'pdf', audience: 'estudiante', order_index: 0, school_code: 'ESC1', grade: 'Primero', section: 'A' }],
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const student = async (username) => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  const teacher = async () => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email: 'marta@escuela.com', password: '654321' } })).json()).access_token;
  return { db, layer, call, student, teacher };
}
const REP = { prefer: 'return=representation' };
const comment = (patch = {}) => ({ lesson_id: LESSON, group_id: 7, parent_id: null, author_id: 's1', author_name: 'Ana', author_role: 'estudiante', content: 'Muy buena guía', ...patch });
const ids = async (h, token, table, q = '') => (await (await h.call('GET', `/rest/v1/${table}?select=id${q}`, { token })).json()).map((r) => r.id);

test('el filtro de malas palabras es el de la nube: con tilde, límites de palabra y mayúsculas', () => {
  for (const bad of ['eres un IDIOTA', 'qué estúpido', 'ESTÚPIDA!', 'hijo de puta', 'vaya imbécil', 'un cabrón', 'weon']) assert.equal(containsProfanity(bad), true, bad);
  for (const ok of ['Buena clase', 'computadora', 'disputa', 'perrito', 'La puta', 'hola'.repeat(3)].filter((x) => x !== 'La puta')) assert.equal(containsProfanity(ok), false, ok);
  assert.equal(containsProfanity('La puta madre'), true);
});

test('un estudiante comenta en SU equipo: lo ven sus compañeros y el docente, no otro equipo; en otro equipo, a nombre de otro, con groserías o adjuntos no', async () => {
  const h = await boot();
  const s1 = await h.student('ana1');
  const r = await h.call('POST', '/rest/v1/resource_comments?select=*', { token: s1, headers: REP, body: comment() });
  assert.equal(r.status, 201);
  const [row] = await r.json();
  assert.match(row.id, /^[0-9a-f-]{36}$/);
  assert.ok(row.created_at);
  assert.deepEqual(await ids(h, await h.student('beto1'), 'resource_comments'), [row.id]);
  assert.deepEqual(await ids(h, await h.teacher(), 'resource_comments'), [row.id]);
  assert.deepEqual(await ids(h, await h.student('carla1'), 'resource_comments'), [], 'otro equipo no lo ve');

  const post = (body, token = s1) => h.call('POST', '/rest/v1/resource_comments', { token, body });
  assert.equal((await post(comment({ group_id: 8 }))).status, 403, 'no es de ese equipo');
  assert.equal((await post(comment({ author_id: 's2' }))).status, 403, 'a nombre de otro');
  assert.equal((await post(comment({ content: '   ' }))).status, 403);
  assert.equal((await post(comment({ content: 'x'.repeat(2001) }))).status, 403);
  assert.equal((await post(comment({ lesson_id: 'no-existe' }))).status, 403);
  assert.equal((await post(comment({ attachment_url: 'http://x/y.png' }))).status, 403, 'los adjuntos necesitan internet');
  assert.equal((await post(comment({ author_role: 'docente' }))).status, 403, 'un estudiante no se hace pasar por docente');
  const bad = await post(comment({ content: 'eres un idiota' }));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /CONTENIDO_INAPROPIADO/, 'la app muestra «lenguaje no permitido» con este texto');
  const t = await h.teacher();
  assert.equal((await post(comment({ author_id: 't1', author_name: 'Marta', author_role: 'docente', group_id: 8 }), t)).status, 201, 'el docente comenta en cualquier equipo');
});

test('respuestas: solo al comentario de la misma lección y equipo; sin editar; borrar solo el autor o el docente', async () => {
  const h = await boot();
  const s1 = await h.student('ana1'), s2 = await h.student('beto1'), s3 = await h.student('carla1');
  const [c] = await (await h.call('POST', '/rest/v1/resource_comments?select=*', { token: s1, headers: REP, body: comment() })).json();
  assert.equal((await h.call('POST', '/rest/v1/resource_comments', { token: s2, body: comment({ author_id: 's2', author_name: 'Beto', parent_id: c.id }) })).status, 201);
  assert.equal((await h.call('POST', '/rest/v1/resource_comments', { token: s3, body: comment({ author_id: 's3', group_id: 8, parent_id: c.id }) })).status, 403, 'respuesta a un comentario de otro equipo');
  assert.equal((await h.call('POST', '/rest/v1/resource_comments', { token: s2, body: comment({ author_id: 's2', parent_id: 'no-existe' }) })).status, 403);
  assert.equal((await h.call('PATCH', `/rest/v1/resource_comments?id=eq.${c.id}`, { token: s1, body: { content: 'otro' } })).status, 403, 'la nube no deja editar');
  const del = (token, id) => h.call('DELETE', `/rest/v1/resource_comments?id=eq.${id}&select=id`, { token, headers: REP });
  assert.deepEqual(await (await del(s2, c.id)).json(), [], 'un compañero no borra el de otro');
  assert.deepEqual((await (await del(await h.teacher(), c.id)).json()).map((r) => r.id), [c.id], 'el docente sí');
  assert.equal(h.layer.store.all('resource_comments').some((x) => x.parent_id === c.id), false, 'sus respuestas se van con él');
});

test('«me gusta»: un compañero del equipo, una vez por comentario; quitarlo es borrar el suyo; no en comentarios que no ve', async () => {
  const h = await boot();
  const s1 = await h.student('ana1'), s2 = await h.student('beto1'), s3 = await h.student('carla1');
  const [c] = await (await h.call('POST', '/rest/v1/resource_comments?select=*', { token: s1, headers: REP, body: comment() })).json();
  const like = (token, userId, id = c.id) => h.call('POST', '/rest/v1/resource_comment_likes', { token, body: { comment_id: id, user_id: userId } });
  assert.equal((await like(s2, 's2')).status, 201);
  assert.equal((await like(s2, 's2')).status, 409, 'una sola vez');
  assert.equal((await like(s3, 's3')).status, 403, 'otro equipo no ve el comentario');
  assert.equal((await like(s2, 's1')).status, 403, 'a nombre de otro');
  assert.equal((await like(s2, 's2', 'no-existe')).status, 403);
  const likes = async (token) => (await (await h.call('GET', `/rest/v1/resource_comment_likes?select=comment_id,user_id&comment_id=in.(${c.id})`, { token })).json());
  assert.deepEqual(await likes(s1), [{ comment_id: c.id, user_id: 's2' }]);
  assert.deepEqual(await likes(s3), []);
  assert.deepEqual(await (await h.call('DELETE', `/rest/v1/resource_comment_likes?comment_id=eq.${c.id}&user_id=eq.s2&select=user_id`, { token: s1, headers: REP })).json(), [], 'no quita el de otro');
  assert.equal((await (await h.call('DELETE', `/rest/v1/resource_comment_likes?comment_id=eq.${c.id}&user_id=eq.s2&select=user_id`, { token: s2, headers: REP })).json()).length, 1);
  assert.equal((await like(s2, 's2')).status, 201, 'se puede volver a dar');
});

test('notas privadas: solo el estudiante las ve, escribe y borra; también con filtro de groserías', async () => {
  const h = await boot();
  const s1 = await h.student('ana1'), s2 = await h.student('beto1');
  const note = (patch = {}) => ({ lesson_id: LESSON, student_id: 's1', content: 'Repasar el capítulo 2', ...patch });
  assert.equal((await h.call('POST', '/rest/v1/resource_notes', { token: s1, body: note() })).status, 201);
  assert.equal((await h.call('POST', '/rest/v1/resource_notes', { token: s1, body: note({ content: 'otra nota' }) })).status, 201, 'las notas son una lista');
  assert.equal((await h.call('POST', '/rest/v1/resource_notes', { token: s1, body: note({ student_id: 's2' }) })).status, 403);
  assert.equal((await h.call('POST', '/rest/v1/resource_notes', { token: s1, body: note({ content: 'qué idiota' }) })).status, 400);
  assert.equal((await ids(h, s1, 'resource_notes')).length, 2);
  assert.deepEqual(await ids(h, s2, 'resource_notes'), []);
  assert.deepEqual(await ids(h, await h.teacher(), 'resource_notes'), [], 'ni el docente');
  const [first] = await ids(h, s1, 'resource_notes');
  assert.deepEqual(await (await h.call('DELETE', `/rest/v1/resource_notes?id=eq.${first}&select=id`, { token: s2, headers: REP })).json(), []);
  assert.equal((await (await h.call('DELETE', `/rest/v1/resource_notes?id=eq.${first}&select=id`, { token: s1, headers: REP })).json()).length, 1);
});

test('todo queda en la bandeja y viaja en push.content, en orden; el comentario de un recurso que aún no subió espera', async () => {
  const h = await boot();
  const s1 = await h.student('ana1'), s2 = await h.student('beto1');
  const [c] = await (await h.call('POST', '/rest/v1/resource_comments?select=*', { token: s1, headers: REP, body: comment() })).json();
  await h.call('POST', '/rest/v1/resource_comment_likes', { token: s2, body: { comment_id: c.id, user_id: 's2' } });
  await h.call('POST', '/rest/v1/resource_notes', { token: s1, body: { lesson_id: LESSON, student_id: 's1', content: 'nota' } });
  const push = buildPush(h.db, { cloudUrl: 'https://x.supabase.co' });
  assert.deepEqual(push.content.map((o) => [o.tbl, o.op]), [['resource_comments', 'insert'], ['resource_comment_likes', 'insert'], ['resource_notes', 'insert']]);
  assert.equal(push.rest_seqs.some((s) => push.content.some((o) => o.seq === s)), false);
  assert.equal(push.content[1].pk, `${c.id}:s2`);
  assert.equal(push.content[0].row.content, 'Muy buena guía');
});
