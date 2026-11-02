// El docente crea y edita sus cursos y recursos sin internet con la app real: mismas reglas que la nube y lo escrito queda en la
// bandeja para subir al sincronizar. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { applyPull } from '../school-node/sync.js';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);
const L1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const L2 = '4a2b8c1e-5d4a-4e7b-9a10-123456789abc';
const STORAGE = 'http://192.168.26.6/storage/v1/object/public/course-content';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-content-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const verifier = (k) => ({ class_key: k, requires_password: true, salt, hash: hashClassPassword('clase123', salt) });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [verifier('ESC1|Primero|A')],
    teacher_logins: [
      { teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
      { teacher_id: 't2', email_hash: emailHash('raul@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    ],
    tables: {
      students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [
        { id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' },
        { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' },
      ],
      courses: [{ id: 'c-de-raul', title: 'Del otro docente', school_code: 'ESC1', grade: 'Segundo', section: 'B', created_by: 't2', is_shared: false }],
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const teacher = async (email) => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password: '654321' } })).json()).access_token;
  const student = async () => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: 'ana1', password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  return { db, layer, call, teacher, student };
}

const REP = { prefer: 'return=representation' };
const course = (patch = {}) => ({ title: 'Robótica', description: 'Primeros pasos', tags: ['robots'], bimestre: 1, weight: 40, cnb_area: 'Tecnología', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', ...patch });
const lesson = (courseId, patch = {}) => ({ id: L1, title: 'Guía', content_type: 'pdf', content_url: `${STORAGE}/lessons/${L1}/guia.pdf`, content_path: `lessons/${L1}`, quiz_data: null,
  course_id: courseId, order_index: 0, audience: 'estudiante', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', ...patch });

async function newCourse(h, t1, patch) {
  const r = await h.call('POST', '/rest/v1/courses?select=*', { token: t1, headers: REP, body: course(patch) });
  assert.equal(r.status, 201);
  return (await r.json())[0];
}

test('el docente crea un curso de su clase: se le pone id y fecha, y queda en la bandeja; en otra clase, a nombre de otro o con datos raros no', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const c = await newCourse(h, t1);
  assert.match(c.id, /^[0-9a-f-]{36}$/);
  assert.ok(c.created_at);
  assert.equal(c.is_shared, false);
  assert.deepEqual(h.layer.store.pending().filter((e) => e.table === 'courses').map((e) => [e.op, e.pk]), [['insert', c.id]]);
  const post = (body) => h.call('POST', '/rest/v1/courses', { token: t1, body });
  for (const bad of [course({ grade: 'Segundo', section: 'B' }), course({ created_by: 't2' }), course({ title: '  ' }), course({ title: 'x'.repeat(201) }), course({ weight: 101 }), course({ weight: -1 }),
    course({ bimestre: 5 }), course({ tags: 'a' }), course({ tinkercad_class_url: 'javascript:alert(1)' }), course({ is_shared: 'si' }), course({ id: 'mio' }), course({ weights_approved_at: '2026-01-01' })]) {
    assert.equal((await post(bad)).status, 403, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal((await h.call('POST', '/rest/v1/courses', { token: await h.student(), body: course({ created_by: 's1' }) })).status, 403, 'un estudiante no crea cursos');
});

test('el docente agrega recursos a SU curso: archivo propio, enlace https y quiz; no a un curso ajeno ni con tipos, rutas o enlaces raros', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const c = await newCourse(h, t1);
  const post = (body) => h.call('POST', '/rest/v1/lessons?select=*', { token: t1, headers: REP, body });
  assert.equal((await post(lesson(c.id))).status, 201);
  assert.equal((await post(lesson(c.id, { id: L2, content_type: 'video', content_url: 'https://www.youtube.com/watch?v=abc', content_path: null, order_index: 1 }))).status, 201);
  const quiz = [{ question: '¿2+2?', options: ['3', '4'], correct: 1 }];
  assert.equal((await post(lesson(c.id, { id: '5a2b8c1e-5d4a-4e7b-9a10-123456789abc', content_type: 'quiz', content_url: null, content_path: null, quiz_data: quiz, order_index: 2 }))).status, 201);
  assert.equal(h.layer.store.pending().filter((e) => e.table === 'lessons').length, 3);

  const bad = [
    lesson('c-de-raul', { id: '6a2b8c1e-5d4a-4e7b-9a10-123456789abc', school_code: 'ESC1', grade: 'Segundo', section: 'B' }),  // curso de otro docente
    lesson(c.id, { id: '7a2b8c1e-5d4a-4e7b-9a10-123456789abc', content_type: 'exe' }),
    lesson(c.id, { id: 'no-uuid' }),
    lesson(c.id, { id: '8a2b8c1e-5d4a-4e7b-9a10-123456789abc', content_url: `${STORAGE}/lessons/${L1}/guia.pdf` }), // la ruta no es de esta lección
    lesson(c.id, { id: '9a2b8c1e-5d4a-4e7b-9a10-123456789abc', content_url: 'javascript:alert(1)', content_path: null }),
    lesson(c.id, { id: 'aa2b8c1e-5d4a-4e7b-9a10-123456789abc', content_url: 'http://sitio-inseguro.com/x', content_path: null }),
    lesson(c.id, { id: 'ba2b8c1e-5d4a-4e7b-9a10-123456789abc', audience: 'todos' }),
    lesson(c.id, { id: 'ca2b8c1e-5d4a-4e7b-9a10-123456789abc', title: '' }),
    lesson(c.id, { id: 'da2b8c1e-5d4a-4e7b-9a10-123456789abc', grade: 'Segundo' }),
    lesson(c.id, { id: 'ea2b8c1e-5d4a-4e7b-9a10-123456789abc', content_type: 'quiz', content_url: null, quiz_data: [] }),
    lesson(c.id, { id: 'fa2b8c1e-5d4a-4e7b-9a10-123456789abc', created_by: 't2' }),
  ];
  for (const b of bad) assert.equal((await post(b)).status, 403, JSON.stringify(b).slice(0, 90));
  const other = await h.teacher('raul@escuela.com');
  assert.equal((await h.call('POST', '/rest/v1/lessons', { token: other, body: lesson(c.id, { id: '0b2b8c1e-5d4a-4e7b-9a10-123456789abc', created_by: 't2' }) })).status, 403, 'otro docente no agrega a mi curso');
});

test('insert(...).select().single() de supabase-js devuelve UN objeto (no una lista); si no es una sola fila, 406 y no se escribe nada', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const single = { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' };
  const r = await h.call('POST', '/rest/v1/courses?select=*', { token: t1, headers: single, body: course() });
  assert.equal(r.status, 201);
  const c = await r.json();
  assert.equal(Array.isArray(c), false);
  assert.match(c.id, /^[0-9a-f-]{36}$/);
  const two = await h.call('POST', '/rest/v1/courses?select=*', { token: t1, headers: single, body: [course({ title: 'A' }), course({ title: 'B' })] });
  assert.equal(two.status, 406);
  assert.equal(h.layer.store.all('courses').filter((x) => x.created_by === 't1').length, 1, 'se deshizo todo');
  const none = await h.call('PATCH', '/rest/v1/courses?id=eq.no-existe&select=*', { token: t1, headers: single, body: { title: 'X' } });
  assert.equal(none.status, 406);
});

test('los estudiantes de la clase ven el recurso nuevo al momento; el de audiencia docente no', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const c = await newCourse(h, t1);
  await h.call('POST', '/rest/v1/lessons', { token: t1, body: lesson(c.id) });
  await h.call('POST', '/rest/v1/lessons', { token: t1, body: lesson(c.id, { id: L2, audience: 'docente', content_url: `${STORAGE}/lessons/${L2}/solo-docente.pdf`, content_path: `lessons/${L2}` }) });
  const s = await h.student();
  const seen = (await (await h.call('GET', '/rest/v1/lessons?select=id,title&order=order_index.asc', { token: s })).json()).map((l) => l.id);
  assert.ok(seen.includes(L1));
  assert.ok(!seen.includes(L2));
  const row = (await (await h.call('GET', `/rest/v1/lessons?select=content_url&id=eq.${L1}`, { token: s })).json())[0];
  assert.equal(row.content_url, `/content/lessons/${L1}/guia.pdf`, 'la dirección sirve desde cualquier nombre o IP del nodo');
});

test('editar: solo lo propio, sin cambiar de dueño ni de curso; compartir al catálogo es un interruptor más', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const t2 = await h.teacher('raul@escuela.com');
  const c = await newCourse(h, t1);
  await h.call('POST', '/rest/v1/lessons', { token: t1, body: lesson(c.id) });
  const patch = (token, table, id, body) => h.call('PATCH', `/rest/v1/${table}?id=eq.${id}&select=*`, { token, headers: REP, body });
  assert.equal((await (await patch(t1, 'lessons', L1, { title: 'Guía v2', order_index: 3 })).json())[0].title, 'Guía v2');
  assert.deepEqual(await (await patch(t2, 'lessons', L1, { title: 'Robado' })).json(), [], 'otro docente no edita lo ajeno');
  assert.equal(h.layer.store.all('lessons').find((l) => l.id === L1).title, 'Guía v2');
  assert.deepEqual(await (await patch(t1, 'lessons', L1, { created_by: 't2' })).json(), [], 'no se cambia de dueño');
  assert.deepEqual(await (await patch(t1, 'lessons', L1, { course_id: 'c-de-raul' })).json(), [], 'ni de curso');
  assert.equal(h.layer.store.all('lessons').find((l) => l.id === L1).created_by, 't1');
  assert.equal(h.layer.store.all('lessons').find((l) => l.id === L1).course_id, c.id);
  assert.equal((await (await patch(t1, 'courses', c.id, { is_shared: true })).json())[0].is_shared, true, 'compartir al catálogo general');
  assert.deepEqual(await (await patch(t2, 'courses', c.id, { title: 'Robado' })).json(), []);
  assert.equal((await patch(t1, 'courses', c.id, { weights_approved_at: '2026-01-01' })).status, 403);
});

test('borrar: un recurso propio sí; un curso propio no compartido sí (y se lleva sus recursos); uno compartido o ajeno no', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const t2 = await h.teacher('raul@escuela.com');
  const c = await newCourse(h, t1);
  await h.call('POST', '/rest/v1/lessons', { token: t1, body: lesson(c.id) });
  await h.call('POST', '/rest/v1/lessons', { token: t1, body: lesson(c.id, { id: L2, content_url: `${STORAGE}/lessons/${L2}/b.pdf`, content_path: `lessons/${L2}`, order_index: 1 }) });
  const del = (token, table, id) => h.call('DELETE', `/rest/v1/${table}?id=eq.${id}&select=id`, { token, headers: REP });
  assert.deepEqual(await (await del(t2, 'lessons', L1)).json(), [], 'otro docente no borra');
  assert.deepEqual((await (await del(t1, 'lessons', L2)).json()).map((r) => r.id), [L2]);
  await h.call('PATCH', `/rest/v1/courses?id=eq.${c.id}`, { token: t1, body: { is_shared: true } });
  assert.deepEqual(await (await del(t1, 'courses', c.id)).json(), [], 'compartido: se borra en línea');
  await h.call('PATCH', `/rest/v1/courses?id=eq.${c.id}`, { token: t1, body: { is_shared: false } });
  assert.deepEqual((await (await del(t1, 'courses', c.id)).json()).map((r) => r.id), [c.id]);
  assert.equal(h.layer.store.all('lessons').some((l) => l.course_id === c.id), false, 'sus recursos se van con el curso');
  assert.deepEqual(await (await del(t1, 'courses', 'c-de-raul')).json(), [], 'curso ajeno no');
});
