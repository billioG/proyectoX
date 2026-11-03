// Cambiar la foto de perfil sin internet con el servidor de verdad, con los mismos pedidos que hace la app (supabase-js): subir al depósito profile-photos, pedir la dirección pública y
// llamar claim_first_profile_photo_reward. Se ve al instante (con el premio de la primera foto), queda en la bandeja y viaja a la nube cuando la imagen ya llegó. Corre con Node 20.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable, startNode, stopAllNodes, openSqlite } from './helpers/start-node.mjs';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';
import { createProfilePhotoStore, uploadProfilePhotos, looksLikeImage, validPhotoName } from '../school-node/profile-photos.js';
import { buildPush } from '../school-node/sync.js';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const salt = 'ab'.repeat(8);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
  storage_base: 'https://proyecto.supabase.co/storage/v1/object/public/course-content/',
  tables: {
    students: [
      { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, profile_photo_url: null },
      { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10, gems: 5, profile_photo_url: 'https://proyecto.supabase.co/storage/v1/object/public/profile-photos/s2_1700000000000.png' },
    ],
    teachers: [{ id: 't1', full_name: 'Marta', role: 'docente', xp: 0, gems: 0, profile_photo_url: null }],
    teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
  },
};
async function login(node, user) {
  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: user, password: 'clase123' } });
  return (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
}
const teacherToken = async (node) => (await node.api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'marta@escuela.com', password: '654321' } })).data.access_token;
// Igual que supabase-js: FormData con cacheControl y el archivo.
const upload = (node, token, name, bytes, { method = 'POST' } = {}) => {
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([bytes], name));
  return fetch(`${node.base}/storage/v1/object/profile-photos/${name}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-upsert': 'true' }, body: fd });
};
const claim = async (node, token, name) => { const r = await fetch(`${node.base}/rest/v1/rpc/claim_first_profile_photo_reward`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_photo_url: `${node.base}/storage/v1/object/public/profile-photos/${name}` }) }); return { status: r.status, data: await r.json().catch(() => null) }; };
const me = async (node, token) => (await (await fetch(`${node.base}/rest/v1/students?select=id,xp,gems,profile_photo_url&id=eq.s1`, { headers: { Authorization: `Bearer ${token}` } })).json())[0];

test('la estudiante cambia su foto: se guarda, se ve en la dirección pública, gana el premio de la primera foto y queda en la bandeja', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  const name = 's1_1762000000000.png';
  const up = await upload(node, s1, name, PNG);
  assert.equal(up.status, 200);
  assert.equal((await up.json()).Key, `profile-photos/${name}`);
  const view = await fetch(`${node.base}/storage/v1/object/public/profile-photos/${name}`);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await view.arrayBuffer()), PNG);

  assert.deepEqual((await claim(node, s1, name)).data, { rewarded: true, xp: 100, gems: 25 });
  assert.deepEqual(await me(node, s1), { id: 's1', xp: 110, gems: 30, profile_photo_url: `/storage/v1/object/public/profile-photos/${name}` });

  // Cambiarla otra vez: sin premio nuevo, y el premio ya anotado se conserva (una sola vez).
  const name2 = 's1_1762000099999.png';
  assert.equal((await upload(node, s1, name2, PNG)).status, 200);
  assert.deepEqual((await claim(node, s1, name2)).data, { rewarded: false });
  assert.deepEqual(await me(node, s1), { id: 's1', xp: 110, gems: 30, profile_photo_url: `/storage/v1/object/public/profile-photos/${name2}` });

  const db = openSqlite(path.join(node.dataDir, 'node.db'));
  try {
    const out = db.prepare("SELECT op, pk, row FROM rest_outbox WHERE tbl = '_rpc' AND op = 'claim_first_profile_photo_reward'").all();
    assert.equal(out.length, 1, 'un solo cambio por usuario: el último gana');
    assert.deepEqual(JSON.parse(out[0].row).args, { p_name: name2, rewarded: true });
    // Mientras la imagen no llegue a la nube, el cambio no viaja; cuando llega, sí.
    assert.equal(buildPush(db, { cloudUrl: 'x' }).rpc.filter((r) => r.fn === 'claim_first_profile_photo_reward').length, 0);
    db.prepare("UPDATE profile_photo_files SET status = 'uploaded' WHERE name = ?").run(name2);
    const sent = buildPush(db, { cloudUrl: 'x' }).rpc.filter((r) => r.fn === 'claim_first_profile_photo_reward');
    assert.deepEqual(sent.map((r) => [r.student_id, r.args]), [['s1', { p_name: name2, rewarded: true }]]);
    // Si la nube rechaza la imagen para siempre, el cambio se descarta (no queda trabado).
    db.prepare("UPDATE profile_photo_files SET status = 'rejected' WHERE name = ?").run(name2);
    const push = buildPush(db, { cloudUrl: 'x' });
    assert.equal(push.rpc.filter((r) => r.fn === 'claim_first_profile_photo_reward').length, 0);
    assert.ok(push.rest_seqs.length >= 1);
  } finally { db.close(); }
  assert.ok((await (await fetch(`${node.base}/api/node/status`)).json()).pending.uploads >= 1);
});

test('el docente también cambia su foto; las demás reglas: solo la propia, solo imágenes de verdad, máximo 5 MB, y con sesión', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  const t1 = await teacherToken(node);
  assert.equal((await upload(node, t1, 't1_1762000000000.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]))).status, 200);
  assert.deepEqual((await claim(node, t1, 't1_1762000000000.jpg')).data, { rewarded: true, xp: 100, gems: 25 });
  const t = (await (await fetch(`${node.base}/rest/v1/teachers?select=xp,gems,profile_photo_url&id=eq.t1`, { headers: { Authorization: `Bearer ${t1}` } })).json())[0];
  assert.deepEqual(t, { xp: 100, gems: 25, profile_photo_url: '/storage/v1/object/public/profile-photos/t1_1762000000000.jpg' });

  assert.equal((await upload(node, undefined, 's1_1762000000001.png', PNG)).status, 401, 'sin sesión no');
  assert.equal((await upload(node, s1, 's2_1762000000001.png', PNG)).status, 400, 'la foto de otro no');
  assert.equal((await upload(node, s1, 'foto.png', PNG)).status, 400, 'nombres que no arma la app no');
  assert.equal((await upload(node, s1, 's1_1762000000002.png', Buffer.from('<script>alert(1)</script>'))).status, 400, 'un archivo que no es imagen no');
  assert.equal((await upload(node, s1, 's1_1762000000003.png', Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]))).status, 413, 'más de 5 MB no');
  assert.equal((await fetch(`${node.base}/storage/v1/object/public/profile-photos/s1_1762000000002.png`)).status, 404, 'lo rechazado no queda guardado');
  // Pedir el premio por una foto que no se subió aquí, o por la de otro usuario, se rechaza.
  assert.equal((await claim(node, s1, 's1_1762999999999.png')).status, 400);
  assert.equal((await upload(node, s1, 's1_1762000000004.png', PNG)).status, 200);
  assert.equal((await claim(node, t1, 's1_1762000000004.png')).status, 400, 'la foto de otro usuario no');
  assert.equal((await fetch(`${node.base}/rest/v1/rpc/claim_first_profile_photo_reward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('al sincronizar la imagen sube a la nube con la URL firmada que da node-sync; si la nube la rechaza queda marcada y no se reintenta', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-sync-'));
  const db = openSqlite(path.join(dir, 'n.db'));
  const store = createProfilePhotoStore({ db, dir: path.join(dir, 'p') });
  store.save('s1', 's1_1762000000000.png', PNG);
  store.save('s1', 's1_1762000000001.png', PNG);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([url, opts.method, opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body).name : null]);
    if (String(url).endsWith('/functions/v1/node-sync')) {
      const body = JSON.parse(opts.body);
      assert.equal(body.action, 'profile_photo_upload_url');
      assert.equal(body.user_id, 's1');
      if (body.name.endsWith('001.png')) return { status: 400, ok: false, json: async () => ({ error: 'La foto no es válida' }) };
      return { status: 200, ok: true, json: async () => ({ signed_url: 'https://cloud/upload/xyz' }) };
    }
    if (url === 'https://cloud/upload/xyz') { await new Promise((r) => opts.body.pipeTo(new WritableStream({ write() {}, close: r }))); return { ok: true, status: 200 }; }
    throw new Error('sin internet');
  };
  const r = await uploadProfilePhotos(db, { cloudUrl: 'https://cloud', nodeToken: 'tok', dataDir: dir }, { store, fetchImpl });
  assert.deepEqual(r, { uploaded: 1, failed: 0, rejected: 1 });
  assert.equal(store.isUploaded('s1_1762000000000.png'), true);
  assert.equal(store.isRejected('s1_1762000000001.png'), true);
  assert.equal(store.pendingCount(), 0);
  // Sin internet: queda pendiente y se reintenta después.
  store.save('s1', 's1_1762000000002.png', PNG);
  const off = await uploadProfilePhotos(db, { cloudUrl: 'https://cloud', nodeToken: 'tok', dataDir: dir }, { store, fetchImpl: async () => { throw new Error('sin internet'); } });
  assert.deepEqual(off, { uploaded: 0, failed: 1, rejected: 0 });
  assert.equal(store.pendingCount(), 1);
  db.close();
});

test('nombres e imágenes: solo el nombre que arma la app y solo imágenes de verdad', () => {
  assert.equal(validPhotoName('s1_1762000000000.png', 's1'), true);
  assert.equal(validPhotoName('s1_1762000000000.PNG', 's1'), true);
  for (const bad of ['s1_17.png', 's2_1762000000000.png', 's1_1762000000000.svg', 's1_1762000000000.png.exe', '../s1_1762000000000.png', 's1.1_1762000000000.png']) assert.equal(validPhotoName(bad, 's1'), false, bad);
  assert.equal(looksLikeImage(PNG, 'a.png'), true);
  assert.equal(looksLikeImage(PNG, 'a.jpg'), false);
  assert.equal(looksLikeImage(Buffer.from('GIF89a......'), 'a.gif'), true);
  assert.equal(looksLikeImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]), 'a.webp'), true);
});
