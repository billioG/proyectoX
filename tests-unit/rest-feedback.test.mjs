// Buzón sin internet con la app real: sugerencias del estudiante (student_suggestions) y evaluación semanal de su docente (teacher_ratings). Mismas reglas que la nube (cada quien lo suyo;
// una evaluación por docente) y más estrictas donde conviene (solo al docente de su clase, notas válidas). Cada una queda en la bandeja como `submit_feedback` y la bajada no la pisa. Node 20.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-feedback-'));
  const db = openDb(dir);
  const layer = createRestLayer(db, {});
  const base = {
    server_time: '2026-11-04T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    teacher_logins: [
      { teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
      { teacher_id: 't2', email_hash: emailHash('raul@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    ],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
      ],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' }],
      student_suggestions: [{ id: 7, student_id: 's2', type: 'suggestion', message: 'Más computadoras', rating: null, created_at: '2026-10-30T10:00:00' }],
    },
  };
  applyPull(db, base);
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(url + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const student = async (user) => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: user, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  const teacher = async (email) => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password: '654321' } })).json()).access_token;
  const insert = async (token, table, body) => { const r = await call('POST', `/rest/v1/${table}?select=id`, { token, headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, body }); return { status: r.status, data: await r.json().catch(() => null) }; };
  const list = async (token, q) => (await call('GET', `/rest/v1/${q}`, { token })).json();
  return { db, layer, call, student, teacher, insert, list, applyBase: (extra) => applyPull(db, { ...base, ...extra, tables: { ...base.tables, ...(extra?.tables || {}) } }) };
}
const rating = (over = {}) => ({ student_id: 's1', teacher_id: 't1', rating: 4.2, message: 'La robótica', best_moment: 'La robótica', q_interest: 4, q_practice: 5, q_resources: 4, q_respect: 4, q_clarity: 4, ...over });

test('la sugerencia: la escribe el estudiante, la ve él y el docente, no otro estudiante, y queda en la bandeja para la nube', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1'), t1 = await h.teacher('marta@escuela.com');
  const r = await h.insert(a, 'student_suggestions', { student_id: 's1', type: 'suggestion', message: '  Más tiempo de laboratorio  ' });
  assert.equal(r.status, 201);
  assert.ok(r.data.id >= 1_500_000_000 && r.data.id <= 2_099_999_999, 'id del rango reservado');
  assert.deepEqual((await h.list(a, 'student_suggestions?select=message,type,rating&order=id.desc')).map((x) => x.message), ['  Más tiempo de laboratorio  ']);
  assert.deepEqual(await h.list(b, 'student_suggestions?select=message'), [{ message: 'Más computadoras' }], 'cada estudiante ve solo lo suyo');
  assert.deepEqual(await h.list(t1, 'student_suggestions?select=id'), [], 'el docente NO lee la tabla directo (vería quién escribió): lo lee por el buzón, anónimo');
  const pending = buildPush(h.db, { cloudUrl: 'x' }).rpc.filter((x) => x.fn === 'submit_feedback');
  assert.deepEqual(pending.map((x) => [x.student_id, x.args.kind, x.args.row.id, x.args.row.message]), [['s1', 'suggestion', r.data.id, '  Más tiempo de laboratorio  ']]);
  // La bajada no la pisa mientras sigue pendiente; al confirmarla la nube manda.
  h.applyBase({ tables: { student_suggestions: [] } });
  assert.equal((await h.list(a, 'student_suggestions?select=id')).length, 1);
  applyPull(h.db, { server_time: '2026-11-04T01:00:00Z', applied: { rpc: [pending[0].seq] }, rpc_errors: [], students: [], courses: [], completions: [], files: [], tables: { student_suggestions: [{ id: 99, student_id: 's1', type: 'suggestion', message: 'Más tiempo de laboratorio', rating: null, created_at: '2026-11-04T10:00:00' }] } }, { rpc: pending });
  assert.deepEqual((await h.list(a, 'student_suggestions?select=id')).map((x) => x.id), [99]);
  assert.equal(buildPush(h.db, { cloudUrl: 'x' }).rpc.filter((x) => x.fn === 'submit_feedback').length, 0);
});

test('sugerencias inválidas o de otro: vacías, enormes, a nombre de otro, tipo raro, nota fuera de 1 a 5, un docente o sin sesión', async () => {
  const h = await boot();
  const a = await h.student('ana1'), t1 = await h.teacher('marta@escuela.com');
  for (const body of [{ student_id: 's1', type: 'suggestion', message: '   ' }, { student_id: 's1', type: 'suggestion', message: 'x'.repeat(2001) }, { student_id: 's2', type: 'suggestion', message: 'hola' },
    { student_id: 's1', type: 'rating', message: 'hola' }, { student_id: 's1', type: 'suggestion', message: 'hola', rating: 9 }, { student_id: 's1', type: 'suggestion' }]) {
    assert.equal((await h.insert(a, 'student_suggestions', body)).status, 403, JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await h.insert(t1, 'student_suggestions', { student_id: 's1', type: 'suggestion', message: 'hola' })).status, 403);
  assert.equal((await h.insert(undefined, 'student_suggestions', { student_id: 's1', type: 'suggestion', message: 'hola' })).status, 401);
  assert.deepEqual(await (await h.call('PATCH', '/rest/v1/student_suggestions?id=eq.7&select=id', { token: a, headers: { prefer: 'return=representation' }, body: { message: 'x' } })).json(), [], 'no se editan sin internet');
});

test('la evaluación del docente: solo al docente de su clase, una por docente, notas válidas; la ve él y quien la escribió, no otro docente', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1'), t1 = await h.teacher('marta@escuela.com'), t2 = await h.teacher('raul@escuela.com');
  const r = await h.insert(a, 'teacher_ratings', rating());
  assert.equal(r.status, 201);
  // La pantalla pregunta si ya evaluó esta semana: la consulta de la app funciona.
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString();
  assert.equal((await h.list(a, `teacher_ratings?select=id&student_id=eq.s1&teacher_id=eq.t1&created_at=gte.${encodeURIComponent(weekStart)}`)).length, 1);
  assert.equal((await h.insert(a, 'teacher_ratings', rating())).status, 409, 'una evaluación por docente (UNIQUE de la nube)');
  assert.equal((await h.insert(a, 'teacher_ratings', rating({ teacher_id: 't2' }))).status, 403, 'solo el docente de su clase');
  for (const over of [{ rating: 0 }, { rating: 5.5 }, { rating: '4' }, { q_interest: 6 }, { q_clarity: -1 }, { q_practice: 2.5 }, { message: 'x'.repeat(2001) }, { student_id: 's1' }]) {
    assert.equal((await h.insert(b, 'teacher_ratings', rating({ student_id: over.student_id ?? 's2', ...over }))).status, 403, JSON.stringify(over));
  }
  assert.equal((await h.insert(b, 'teacher_ratings', rating({ student_id: 's2', q_interest: undefined }))).status, 201, 'los criterios omitidos valen 0, como en la nube');
  // Quién ve qué: el docente evaluado NO lee la tabla directo (vería quién fue); sus notas salen por get_my_ratings (solo la nota) y el buzón.
  assert.deepEqual(await h.list(t1, 'teacher_ratings?select=student_id,rating&teacher_id=eq.t1'), []);
  assert.deepEqual((await h.call('POST', '/rest/v1/rpc/get_my_ratings', { token: t1, body: {} }).then((r) => r.json())).map((x) => x.rating).sort(), [4.2, 4.2]);
  assert.deepEqual(await h.list(t2, 'teacher_ratings?select=id'), []);
  assert.deepEqual((await h.list(b, 'teacher_ratings?select=student_id')).map((x) => x.student_id), ['s2']);
  const rpcs = buildPush(h.db, { cloudUrl: 'x' }).rpc.filter((x) => x.fn === 'submit_feedback');
  assert.deepEqual(rpcs.map((x) => [x.student_id, x.args.kind]).sort(), [['s1', 'rating'], ['s2', 'rating']]);
  assert.equal(rpcs.find((x) => x.student_id === 's1').args.row.teacher_id, 't1');
  await h.call('DELETE', `/rest/v1/teacher_ratings?id=eq.${r.data.id}`, { token: a });
  assert.equal((await h.list(a, `teacher_ratings?select=id&id=eq.${r.data.id}`)).length, 1, 'no se borran sin internet');
});

test('el buzón del docente: sus evaluaciones y las sugerencias de SUS clases, anónimas; el administrador ve nombres; el estudiante nada; filtros y límites', async () => {
  const h = await boot();
  h.applyBase({ tables: { teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }, { id: 'ad', full_name: 'Admin', role: 'admin' }] } });
  const a = await h.student('ana1'), b = await h.student('beto1'), t1 = await h.teacher('marta@escuela.com'), t2 = await h.teacher('raul@escuela.com');
  await h.insert(a, 'student_suggestions', { student_id: 's1', type: 'suggestion', message: 'Más tiempo de laboratorio' });
  await h.insert(a, 'teacher_ratings', rating({ message: 'La robótica', best_moment: 'La robótica' }));
  await h.insert(b, 'teacher_ratings', rating({ student_id: 's2', message: 'Muy rápido', best_moment: null, rating: 3 }));
  const inbox = async (token, args = {}) => (await h.call('POST', '/rest/v1/rpc/get_feedback_inbox', { token, body: args })).json();
  const m = await inbox(t1);
  assert.equal(m.role, 'teacher');
  assert.deepEqual(m.ratings.map((r) => r.message).sort(), ['La robótica', 'Muy rápido']);
  assert.deepEqual(m.suggestions.map((s) => s.message).sort(), ['Más computadoras', 'Más tiempo de laboratorio']);
  assert.ok(m.ratings.every((r) => r.grade === 'Primero' && r.section === 'A'));
  const text = JSON.stringify(m);
  for (const secret of ['Ana', 'Beto', 'student_id', 'student_name', '"s1"', '"s2"']) assert.ok(!text.includes(secret), `el docente no debe ver ${secret}`);
  // Otro docente (su clase es otra): nada.
  const other = await inbox(t2);
  assert.deepEqual([other.ratings.length, other.suggestions.length], [0, 0]);
  // El estudiante no usa el buzón; el administrador necesita sesión propia (no hay admin sembrado): se prueba el módulo directo.
  assert.deepEqual(await inbox(a), { role: 'teacher', suggestions: [], ratings: [] });
  const { createInbox } = await import('../school-node/rest/inbox.js');
  const full = createInbox({ store: h.layer.store }).inbox({ p_school: 'ESC1' }, { uid: 'ad', role: 'admin' });
  assert.equal(full.role, 'admin');
  assert.deepEqual(full.ratings.map((r) => [r.student_name, r.teacher_name]).sort(), [['Ana', 'Marta'], ['Beto', 'Marta']]);
  assert.deepEqual(full.suggestions.map((s) => s.student_name).sort(), ['Ana', 'Beto']);
  assert.deepEqual(createInbox({ store: h.layer.store }).inbox({ p_school: 'OTRA' }, { uid: 'ad', role: 'admin' }).ratings, []);
  assert.deepEqual(createInbox({ store: h.layer.store }).inbox({ p_days: 1 }, { uid: 'ad', role: 'admin' }).suggestions.map((x) => x.student_name), ['Ana'], 'la sugerencia vieja (2026-10-30) queda fuera de 1 día');
});
