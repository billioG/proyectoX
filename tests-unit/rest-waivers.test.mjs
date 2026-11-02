// Permisos de asistencia sin internet con la app real: el docente los pide (pendientes hasta que un administrador los apruebe en línea) y ve solo los suyos.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-waivers-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  const login = (id, email) => ({ teacher_id: id, email_hash: emailHash(email), pin_hash: hashClassPassword('654321', salt), pin_salt: salt });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    teacher_logins: [login('t1', 'marta@escuela.com'), login('t2', 'raul@escuela.com')],
    tables: {
      students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
      teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }],
      teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 2, teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' }],
      attendance_waivers: [{ id: '9f2b8c1e-5d4a-4e7b-9a10-123456789abc', teacher_id: 't1', date: '2026-10-30', reason: 'Antiguo', status: 'approved', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
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
const waiver = (patch = {}) => ({ teacher_id: 't1', reason: 'Reunión con padres', date: today(), status: 'pending', school_code: 'ESC1', grade: 'Primero', section: 'A', ...patch });

test('el docente pide un permiso de su clase o de toda su escuela (como submitWaiver): queda pendiente y en la bandeja; con la clase de otro, a nombre de otro o ya aprobado no', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com');
  const post = (body, token = t1) => h.call('POST', '/rest/v1/attendance_waivers', { token, body });
  assert.equal((await post(waiver())).status, 201);
  assert.equal((await post(waiver({ grade: null, section: null }))).status, 201, 'de toda la escuela');
  const rows = h.layer.store.all('attendance_waivers').filter((x) => x.teacher_id === 't1' && x.reason === 'Reunión con padres');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((x) => x.status === 'pending' && /^[0-9a-f-]{36}$/.test(x.id)));
  for (const bad of [waiver({ grade: 'Segundo', section: 'B' }), waiver({ teacher_id: 't2' }), waiver({ status: 'approved' }), waiver({ reason: ' ' }), waiver({ date: '2020-01-01' }), waiver({ school_code: 'ESC2', grade: null, section: null }), waiver({ admin_comment: 'ok' })]) {
    assert.equal((await post(bad)).status, 403, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal((await post(waiver({ teacher_id: 's1' }), await h.student())).status, 403);
  assert.deepEqual(buildPush(h.db, { cloudUrl: 'https://x.supabase.co' }).content.map((o) => o.tbl), ['attendance_waivers', 'attendance_waivers']);
});

test('cada docente ve solo sus permisos (con su estado); no se editan ni se borran sin internet', async () => {
  const h = await boot();
  const t1 = await h.teacher('marta@escuela.com'), t2 = await h.teacher('raul@escuela.com');
  const mine = await (await h.call('GET', '/rest/v1/attendance_waivers?select=reason,status&teacher_id=eq.t1', { token: t1 })).json();
  assert.deepEqual(mine, [{ reason: 'Antiguo', status: 'approved' }]);
  assert.deepEqual(await (await h.call('GET', '/rest/v1/attendance_waivers?select=id', { token: t2 })).json(), []);
  const count = await h.call('GET', `/rest/v1/attendance_waivers?select=*&teacher_id=eq.t1`, { token: t1, headers: { prefer: 'count=exact' } });
  assert.match(count.headers.get('content-range'), /\/1$/);
  assert.equal((await h.call('PATCH', '/rest/v1/attendance_waivers?teacher_id=eq.t1', { token: t1, body: { status: 'approved' } })).status, 403);
  const del = await h.call('DELETE', '/rest/v1/attendance_waivers?teacher_id=eq.t1&select=id', { token: t1, headers: { prefer: 'return=representation' } });
  assert.deepEqual(await del.json(), []);
});
