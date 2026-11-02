// Avisos sin internet con la app real: el docente envía a sus grupos y los estudiantes los ven y los marcan leídos, con las
// mismas reglas que la nube (can_see_announcement / can_send_announcement). Lo escrito en el nodo sube en la sincronización.
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
const salt = 'ab'.repeat(8);

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-ann-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const verifier = (k) => ({ class_key: k, requires_password: true, salt, hash: hashClassPassword('clase123', salt) });
  const pull = {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [verifier('ESC1|Primero|A'), verifier('ESC1|Segundo|B')],
    teacher_logins: [
      { teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
      { teacher_id: 't2', email_hash: emailHash('raul@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    ],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's3', username: 'carla1', full_name: 'Carla', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' },
      ],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [
        { id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' },
        { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' },
      ],
      announcements: [{ id: 'a-admin-all', sender_id: 'admin', sender_role: 'admin', audience: 'all', title: 'Para todos', message: 'Hola', created_at: '2026-11-01T00:00:00Z' },
        { id: 'a-admin-teachers', sender_id: 'admin', sender_role: 'admin', audience: 'teachers', title: 'Solo docentes', message: 'Reunión', created_at: '2026-11-01T00:00:00Z' }],
    },
  };
  applyPull(db, pull);
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const teacher = async (email) => (await (await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password: '654321' } })).json()).access_token;
  const student = async (username) => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  return { db, layer, pull, call, teacher, student };
}

const REP = { prefer: 'return=representation' };
const own = (patch = {}) => ({ sender_id: 't1', sender_role: 'docente', audience: 'students', school_code: 'ESC1', grade: 'Primero', section: 'A', title: 'Tarea', message: 'Traer el robot', ...patch });
const groups = (...g) => ({ sender_id: 't1', sender_role: 'docente', audience: 'students', title: 'Tarea', message: 'Hola', target_groups: g.map(([grade, section]) => ({ school_code: 'ESC1', grade, section })) });

test('el docente envía a su clase: lo ven sus estudiantes y él, no otra clase ni otro docente', async () => {
  const { call, teacher, student } = await boot();
  const t1 = await teacher('marta@escuela.com');
  const sent = await call('POST', '/rest/v1/announcements?select=*', { token: t1, headers: REP, body: own() });
  assert.equal(sent.status, 201);
  const [row] = await sent.json();
  assert.match(row.id, /^[0-9a-f-]{36}$/);
  assert.ok(row.created_at);
  const ids = async (token) => (await (await call('GET', '/rest/v1/announcements?select=id,title&order=created_at.desc', { token })).json()).map((a) => a.id);
  assert.ok((await ids(await student('ana1'))).includes(row.id));
  assert.ok(!(await ids(await student('carla1'))).includes(row.id), 'otra clase no');
  assert.ok((await ids(t1)).includes(row.id));
  assert.ok(!(await ids(await teacher('raul@escuela.com'))).includes(row.id), 'otro docente no');
});

test('las reglas de quién ve: avisos del administrador para todos o solo docentes', async () => {
  const { call, teacher, student } = await boot();
  const ids = async (token) => (await (await call('GET', '/rest/v1/announcements?select=id', { token })).json()).map((a) => a.id).sort();
  assert.deepEqual(await ids(await student('ana1')), ['a-admin-all']);
  assert.deepEqual(await ids(await teacher('marta@escuela.com')), ['a-admin-all', 'a-admin-teachers']);
});

test('a varios grupos suyos sí; a un grupo que no es suyo, a docentes, a todos, por escuela, en nombre de otro o como administrador no', async () => {
  const { call, teacher, layer } = await boot();
  const t1 = await teacher('marta@escuela.com');
  const post = (body) => call('POST', '/rest/v1/announcements', { token: t1, body });
  assert.equal((await post(groups(['Primero', 'A']))).status, 201);
  for (const bad of [
    groups(['Primero', 'A'], ['Segundo', 'B']), own({ grade: 'Segundo', section: 'B' }), own({ audience: 'teachers' }), own({ audience: 'all' }),
    own({ target_schools: ['ESC1'] }), own({ sender_id: 't2' }), own({ sender_role: 'admin' }), { ...own(), target_groups: [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }] },
    { ...groups(), target_groups: [] }, own({ title: '' }), own({ message: '   ' }), own({ title: 'x'.repeat(151) }), own({ message: 'x'.repeat(2001) }), own({ id: 'mio' }), own({ created_at: '2020-01-01' }),
    own({ title: { a: 1 } }), { ...groups(['Primero', 'A']), target_groups: 'texto' },
  ]) assert.equal((await post(bad)).status, 403, JSON.stringify(bad).slice(0, 90));
  assert.equal(layer.store.all('announcements').filter((a) => a.sender_id === 't1').length, 1);
});

test('un estudiante no envía avisos; nadie borra ni edita los de otro', async () => {
  const { call, teacher, student, layer } = await boot();
  const s1 = await student('ana1');
  assert.equal((await call('POST', '/rest/v1/announcements', { token: s1, body: own({ sender_id: 's1', sender_role: 'docente' }) })).status, 403);
  const t1 = await teacher('marta@escuela.com');
  const [row] = await (await call('POST', '/rest/v1/announcements?select=id', { token: t1, headers: REP, body: own() })).json();
  await call('DELETE', `/rest/v1/announcements?id=eq.${row.id}`, { token: t1 });
  assert.ok(layer.store.all('announcements').some((a) => a.id === row.id), 'borrar sin internet no está disponible');
  assert.equal((await call('PATCH', `/rest/v1/announcements?id=eq.${row.id}`, { token: t1, body: { title: 'Otro' } })).status, 403);
});

test('el estudiante marca leído un aviso que ve; no uno que no ve, ni a nombre de otro; marcarlo dos veces no duplica', async () => {
  const { call, student, layer } = await boot();
  const s1 = await student('ana1');
  const read = (body) => call('POST', '/rest/v1/announcement_reads?on_conflict=announcement_id,user_id', { token: s1, headers: { prefer: 'resolution=merge-duplicates' }, body });
  assert.equal((await read({ announcement_id: 'a-admin-all', user_id: 's1' })).status, 201);
  assert.equal((await read({ announcement_id: 'a-admin-all', user_id: 's1' })).status, 201);
  assert.equal(layer.store.all('announcement_reads').length, 1);
  assert.equal((await read({ announcement_id: 'a-admin-teachers', user_id: 's1' })).status, 403, 'no ve ese aviso');
  assert.equal((await read({ announcement_id: 'no-existe', user_id: 's1' })).status, 403);
  assert.equal((await read({ announcement_id: 'a-admin-all', user_id: 's3' })).status, 403, 'a nombre de otro');
  const mine = await (await call('GET', '/rest/v1/announcement_reads?select=announcement_id&user_id=eq.s1', { token: s1 })).json();
  assert.deepEqual(mine, [{ announcement_id: 'a-admin-all' }]);
});

test('lo escrito sube en la sincronización y solo sale de la bandeja cuando la nube lo confirma o lo rechaza para siempre', async () => {
  const { call, teacher, student, db, layer, pull } = await boot();
  const t1 = await teacher('marta@escuela.com');
  const [row] = await (await call('POST', '/rest/v1/announcements?select=*', { token: t1, headers: REP, body: own() })).json();
  const s1 = await student('ana1');
  await call('POST', '/rest/v1/announcement_reads', { token: s1, body: { announcement_id: row.id, user_id: 's1' } });

  const push = buildPush(db);
  assert.deepEqual(push.announcements.map((a) => [a.id, a.sender_id, a.audience, a.title, a.grade]), [[row.id, 't1', 'students', 'Tarea', 'Primero']]);
  assert.deepEqual(push.announcement_reads.map((r) => [r.announcement_id, r.user_id]), [[row.id, 's1']]);

  applyPull(db, pull, push); // nube anterior: no confirma nada
  assert.equal(layer.store.pendingCount(), 2);
  assert.ok(layer.store.all('announcements').some((a) => a.id === row.id), 'la bajada no pisa el aviso local pendiente');

  // La nube aplicó lo subido, pero la bajada de esa misma respuesta todavía no lo trae: no debe desaparecer del nodo.
  applyPull(db, { ...pull, applied: { announcements: [row.id], announcement_reads: [`${row.id}|s1`] } }, push);
  assert.equal(layer.store.pendingCount(), 0);
  assert.ok(layer.store.all('announcements').some((a) => a.id === row.id), 'el aviso sigue visible tras confirmarse');
  assert.equal(layer.store.all('announcement_reads').filter((r) => r.announcement_id === row.id).length, 1, 'y sigue leído');
  // En la bajada siguiente la nube ya lo trae: se reemplaza por su versión.
  applyPull(db, { ...pull, tables: { ...pull.tables, announcements: [...pull.tables.announcements, row] } });
  assert.ok(layer.store.all('announcements').some((a) => a.id === row.id));

  // Rechazo definitivo: sale de la bandeja y el aviso desaparece del nodo con la siguiente bajada.
  const [bad] = await (await call('POST', '/rest/v1/announcements?select=id', { token: t1, headers: REP, body: own({ title: 'Otro' }) })).json();
  const push2 = buildPush(db);
  applyPull(db, { ...pull, announcement_errors: [{ id: bad.id, error: 'no autorizado', permanent: true }] }, push2);
  assert.equal(layer.store.pendingCount(), 0);
  assert.ok(!layer.store.all('announcements').some((a) => a.id === bad.id));
});

test('un título o mensaje que queda vacío al limpiar caracteres de control se rechaza (la nube lo rechazaría y el aviso se perdería sin avisar)', async () => {
  const { call, teacher, layer } = await boot();
  const t1 = await teacher('marta@escuela.com');
  const post = (patch) => call('POST', '/rest/v1/announcements', { token: t1, body: own(patch) });
  assert.equal((await post({ title: String.fromCharCode(7) })).status, 403);
  assert.equal((await post({ message: ' ' + String.fromCharCode(0, 1, 2) + ' ' })).status, 403);
  assert.equal((await post({ title: 'Hola' + String.fromCharCode(7) + ' mundo' })).status, 201);
  assert.equal(layer.store.all('announcements').filter((a) => a.sender_id === 't1').length, 1);
});
