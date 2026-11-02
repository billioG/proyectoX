// Asistencia del docente sin internet con la app real: pasar lista (upsert por estudiante y día, como hace la cola de la app), ver lo que
// pasó, exportar con el nombre del alumno. Mismas reglas que la nube (INSERT y SELECT solo del propio docente). Corre con Node 20.
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
const today = () => new Date().toISOString().slice(0, 10);

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-att-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const login = (id, email) => ({ teacher_id: id, email_hash: emailHash(email), pin_hash: hashClassPassword('654321', salt), pin_salt: salt });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    teacher_logins: [login('t1', 'marta@escuela.com'), login('t2', 'raul@escuela.com')],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's2', username: 'beto1', full_name: 'Beto Ruiz', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
        { id: 's3', username: 'carla1', full_name: 'Carla Paz', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' },
      ],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [
        { id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' },
        { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' },
      ],
      attendance: [{ id: 41, student_id: 's1', teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', date: '2026-10-30', time: '08:01:00', status: 'present', created_at: '2026-10-30T14:01:00' }],
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
// Lo que manda supabase-js .upsert(data, { onConflict: 'student_id,date' }) (la cola de la app, js/sync-manager.js).
const UPSERT = { prefer: 'resolution=merge-duplicates,return=representation' };
const mark = (patch = {}) => ({ student_id: 's2', teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', date: today(), status: 'present', ...patch });
const upsert = (h, token, body) => h.call('POST', '/rest/v1/attendance?on_conflict=student_id,date&select=*', { token, headers: UPSERT, body });

test('el docente pasa lista de su clase: se le pone hora e id, vuelve a marcar el mismo día sin duplicar, y queda en la bandeja', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const r = await upsert(h, t1, mark());
  assert.equal(r.status, 201);
  const [row] = await r.json();
  assert.match(row.time, /^\d\d:\d\d:\d\d$/);
  assert.ok(row.id);
  assert.equal(row.status, 'present');
  const again = await upsert(h, t1, mark({ status: 'late' }));
  assert.equal(again.status, 201);
  assert.equal(h.layer.store.all('attendance').filter((a) => a.student_id === 's2' && a.date === today()).length, 1, 'un registro por estudiante y día');
  assert.equal(h.layer.store.all('attendance').find((a) => a.student_id === 's2' && a.date === today()).status, 'late');
  const push = buildPush(h.db, { cloudUrl: 'https://x.supabase.co' });
  assert.deepEqual(push.content.filter((o) => o.tbl === 'attendance').map((o) => o.op), ['insert', 'update']);
});

test('no se pasa lista de otra clase, a nombre de otro docente, con estados raros, de estudiantes inexistentes ni por un estudiante', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  for (const bad of [mark({ student_id: 's3', grade: 'Segundo', section: 'B' }), mark({ teacher_id: 't2' }), mark({ status: 'volando' }), mark({ student_id: 'nadie' }), mark({ grade: 'Segundo' }),
    mark({ date: 'ayer' }), mark({ date: '2020-01-01' }), mark({ date: '2099-01-01' }), mark({ time: 'tarde' }), mark({ school_code: 'ESC2' })]) {
    assert.equal((await upsert(h, t1, bad)).status, 403, JSON.stringify(bad));
  }
  assert.equal((await upsert(h, await h.student(), mark({ teacher_id: 's1' }))).status, 403);
  assert.equal(h.layer.store.all('attendance').filter((a) => a.date === today()).length, 0);
});

test('cada docente ve solo su lista; el nombre del alumno sale en el reporte; nadie borra asistencia', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com'), t2 = await h.teacher('raul@escuela.com');
  await upsert(h, t1, mark());
  const mine = await (await h.call('GET', `/rest/v1/attendance?select=*,students(full_name)&school_code=eq.ESC1&grade=eq.Primero&section=eq.A&order=date.asc`, { token: t1 })).json();
  assert.deepEqual(mine.map((a) => [a.date, a.students.full_name]), [['2026-10-30', 'Ana López'], [today(), 'Beto Ruiz']]);
  assert.deepEqual(await (await h.call('GET', '/rest/v1/attendance?select=id', { token: t2 })).json(), [], 'otro docente no ve la lista ajena');
  assert.deepEqual(await (await h.call('GET', '/rest/v1/attendance?select=id', { token: await h.student() })).json(), []);
  const del = await h.call('DELETE', '/rest/v1/attendance?student_id=eq.s2&select=id', { token: t1, headers: { prefer: 'return=representation' } });
  assert.deepEqual(await del.json(), []);
  assert.equal(h.layer.store.all('attendance').some((a) => a.student_id === 's2'), true);
});
