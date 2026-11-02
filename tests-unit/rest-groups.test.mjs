// Equipos del docente sin internet con la app real: crear, renombrar, borrar y armar sus miembros (roles incluidos). Mismas reglas que la
// nube (solo personal, y aquí además solo de sus clases) y lo escrito queda en la bandeja en orden. Corre con Node 20.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-groups-'));
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
      groups: [{ id: 7, name: 'Sol', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 8, name: 'Luna', school_code: 'ESC1', grade: 'Segundo', section: 'B' }],
      group_members: [{ id: 1, group_id: 7, student_id: 's1', role: 'planner' }],
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
const REP = { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' };

test('el docente crea un equipo de SU clase (como .insert().select().single()) y le agrega miembros; el id es un número entero que no choca con los de la nube', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const r = await h.call('POST', '/rest/v1/groups?select=*', { token: t1, headers: REP, body: { name: 'Estrellas', school_code: 'ESC1', grade: 'Primero', section: 'A' } });
  assert.equal(r.status, 201);
  const g = await r.json();
  assert.ok(Number.isInteger(g.id) && g.id >= 1_500_000_000 && g.id < 2_100_000_000, `id ${g.id}`);
  assert.equal(g.name, 'Estrellas');
  const m = await h.call('POST', '/rest/v1/group_members', { token: t1, body: [{ group_id: g.id, student_id: 's1', role: 'planner' }, { group_id: g.id, student_id: 's2', role: 'builder' }] });
  assert.equal(m.status, 201);
  assert.equal(h.layer.store.all('group_members').filter((x) => x.group_id === g.id).length, 2);
  const push = buildPush(h.db, { cloudUrl: 'https://x.supabase.co' });
  assert.deepEqual(push.content.map((o) => o.tbl), ['groups', 'group_members', 'group_members'], 'el equipo viaja antes que sus miembros');
});

test('no se crean equipos de otra clase ni con datos raros; un estudiante no crea equipos; miembros solo de la misma clase', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const post = (body, token = t1) => h.call('POST', '/rest/v1/groups', { token, body });
  for (const bad of [{ name: 'X', school_code: 'ESC1', grade: 'Segundo', section: 'B' }, { name: '  ', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { name: 'x'.repeat(81), school_code: 'ESC1', grade: 'Primero', section: 'A' },
    { name: 'X', school_code: 'ESC2', grade: 'Primero', section: 'A' }, { name: 'X', school_code: 'ESC1', grade: 'Primero', section: 'A', id: 5 }, { name: 'X', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't2' }]) {
    assert.equal((await post(bad)).status, 403, JSON.stringify(bad));
  }
  assert.equal((await post({ name: 'X', school_code: 'ESC1', grade: 'Primero', section: 'A' }, await h.student())).status, 403);
  const member = (body) => h.call('POST', '/rest/v1/group_members', { token: t1, body });
  assert.equal((await member({ group_id: 7, student_id: 's3', role: 'x' })).status, 403, 'estudiante de otra clase');
  assert.equal((await member({ group_id: 8, student_id: 's3', role: 'x' })).status, 403, 'equipo de otra clase');
  assert.equal((await member({ group_id: 7, student_id: 's1', role: 'x' })).status, 409, 'ya es miembro');
  assert.equal((await member({ group_id: 7, student_id: 's2', role: 'x'.repeat(31) })).status, 403);
  assert.equal((await member({ group_id: 7, student_id: 's2', role: 'builder' })).status, 201);
});

test('renombrar, cambiar roles (incluido el truco del rol temporal) y quitar miembros; borrar el equipo se lleva a sus miembros; lo ajeno no se toca', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const patch = (table, q, body) => h.call('PATCH', `/rest/v1/${table}?${q}&select=*`, { token: t1, headers: { prefer: 'return=representation' }, body });
  assert.equal((await (await patch('groups', 'id=eq.7', { name: 'Sol y Luna' })).json())[0].name, 'Sol y Luna');
  assert.deepEqual(await (await patch('groups', 'id=eq.8', { name: 'Robado' })).json(), [], 'equipo de otra clase');
  assert.equal((await (await patch('group_members', 'id=eq.1', { role: 'temp' })).json())[0].role, 'temp');
  assert.equal((await (await patch('group_members', 'id=eq.1', { role: 'builder' })).json())[0].role, 'builder');
  assert.deepEqual(await (await patch('group_members', 'id=eq.1', { group_id: 8 })).json(), [], 'un miembro no pasa a un equipo de otra clase');
  await h.call('POST', '/rest/v1/group_members', { token: t1, body: { group_id: 7, student_id: 's2', role: 'tester' } });
  const del = await h.call('DELETE', '/rest/v1/group_members?group_id=eq.7&student_id=eq.s2&select=id', { token: t1, headers: { prefer: 'return=representation' } });
  assert.equal((await del.json()).length, 1);
  const delG = await h.call('DELETE', '/rest/v1/groups?id=eq.7&select=id', { token: t1, headers: { prefer: 'return=representation' } });
  assert.deepEqual((await delG.json()).map((g) => g.id), [7]);
  assert.equal(h.layer.store.all('group_members').some((m) => m.group_id === 7), false);
  assert.deepEqual(await (await h.call('DELETE', '/rest/v1/groups?id=eq.8&select=id', { token: t1, headers: { prefer: 'return=representation' } })).json(), [], 'equipo ajeno no');
});
