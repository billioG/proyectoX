// Subir proyecto y reaccionar con la app REAL sobre el nodo (sin el «modo anterior»): el archivo llega por el Storage emulado, la fila entra al
// almacén de proyectos (que sube a la nube) y las reacciones usan el almacén de reacciones. Con el servidor de verdad. Corre con Node 20.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sqliteAvailable, startNode, stopAllNodes, openSqlite } from './helpers/start-node.mjs';
import { hashClassPassword } from '../school-node/rest/auth.js';
import { buildPush } from '../school-node/sync.js';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const salt = 'ab'.repeat(8);
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  tables: {
    students: [
      { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
      { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
    ],
    teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }],
    groups: [{ id: 7, name: 'Sol', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { id: 8, name: 'Luna', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
    group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 8, student_id: 's2' }],
    projects: [{ id: 101, user_id: 's2', group_id: 8, title: 'Semáforo con Arduino', description: 'Un semáforo', score: 85, votes: 3, bimestre: 2, created_at: '2026-10-30T10:00:00Z' }],
    project_likes: [{ id: 1, project_id: 101, user_id: 's2', reaction: 'wow' }],
  },
};
const DESC = 'Un robot que sigue una línea negra usando dos sensores y una placa Arduino, con una caja hecha de cartón.';
const login = async (node, username) => {
  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username, password: 'clase123' } });
  return (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
};
// Igual que supabase-js: FormData (cacheControl + archivo con su tipo), POST /storage/v1/object/project-videos/<nombre>.
const upload = (node, token, name, bytes, type = 'video/mp4') => fetch(`${node.base}/storage/v1/object/project-videos/${name}`, {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: (() => { const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([bytes], 'blob', { type })); return fd; })(),
});
let seq = 0;
const newName = (ext = '') => `${1762000000000 + (seq++)}_abc${seq}x${ext}`;
const project = (name, node, patch = {}) => ({ user_id: 's1', group_id: 7, title: 'Mi robot seguidor', description: DESC, bimestre: 2, video_url: `${node.base}/storage/v1/object/public/project-videos/${name}`, ...patch });
const post = async (node, token, body) => {
  const r = await fetch(`${node.base}/rest/v1/projects?select=*`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const pendingRows = (node) => { const d = openSqlite(path.join(node.dataDir, 'node.db')); try { return d.prepare("SELECT title, kind, ext, status, group_id FROM projects").all(); } finally { d.close(); } };

test('el estudiante sube el video como lo hace la app y se sirve con su tipo y por rangos; docentes, tipos raros y nombres malos no', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  const bytes = Buffer.alloc(200_000, 5);
  const name = newName();
  assert.equal((await upload(node, s1, name, bytes)).status, 200);
  const got = await fetch(`${node.base}/storage/v1/object/public/project-videos/${name}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'video/mp4');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Buffer.from(await got.arrayBuffer()).equals(bytes), true);
  const part = await fetch(`${node.base}/storage/v1/object/public/project-videos/${name}`, { headers: { Range: 'bytes=10-19' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  assert.equal((await upload(node, s1, name, bytes)).status, 409, 'el mismo nombre no se repite');
  assert.equal((await upload(node, s1, newName(), bytes, 'text/html')).status, 400, 'un html disfrazado de video no');
  assert.equal((await upload(node, s1, 'malo.mp4', bytes)).status, 400);
  assert.equal((await upload(node, s1, '../x', bytes)).status >= 400, true);
  assert.equal((await upload(node, null, newName(), bytes)).status, 401);
  const teacher = await node.api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'x@y.com', password: 'z' } });
  assert.notEqual(teacher.status, 200);
  assert.equal((await upload(node, s1, newName('.stl'), bytes, 'application/octet-stream')).status, 200, 'modelo 3D con su extensión');
});

test('la fila del proyecto entra al almacén de proyectos como «pendiente» con el archivo ya subido; reglas de la app y una sola vez por archivo', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  const name = newName();
  await upload(node, s1, name, Buffer.alloc(5000, 1));
  const ok = await post(node, s1, { ...project(name, node), upload_ip: '10.0.0.5', thumbnail_url: 'data:image/png;base64,AAAA' });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const row = ok.data[0];
  assert.ok(row.id >= 1_500_000_000);
  assert.equal(row.votes, 0);
  assert.deepEqual(pendingRows(node), [{ title: 'Mi robot seguidor', kind: 'video', ext: 'mp4', status: 'pending', group_id: 7 }]);
  assert.equal((await node.api('/rest/v1/projects?select=id,title&title=eq.Mi%20robot%20seguidor', { token: s1 })).data.length, 1, 'ya aparece en sus proyectos');

  assert.equal((await post(node, s1, project(name, node))).status, 400, 'el mismo archivo no se usa dos veces');
  const fresh = async () => { const n = newName(); await upload(node, s1, n, Buffer.alloc(100, 2)); return n; };
  for (const [patch, status] of [[{ title: 'abc' }, 400], [{ description: 'corta' }, 400], [{ bimestre: 9 }, 400], [{ group_id: 8 }, 400], [{ user_id: 's2' }, 403], [{ video_url: 'https://evil.com/x.mp4' }, 400], [{ score: 100 }, 403]]) {
    const n = await fresh();
    assert.equal((await post(node, s1, project(n, node, patch))).status, status, JSON.stringify(patch));
  }
  const s2 = await login(node, 'beto1');
  const mine = await fresh();
  assert.equal((await post(node, s2, project(mine, node, { user_id: 's2', group_id: 8 }))).status, 400, 'archivo de otro estudiante');
  assert.equal(pendingRows(node).length, 1, 'nada más se registró');
});

test('máximo 5 proyectos esperando para subirse, como en el nodo de siempre', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  for (let i = 0; i < 5; i++) {
    const n = newName();
    assert.equal((await upload(node, s1, n, Buffer.alloc(50, i + 1))).status, 200);
    assert.equal((await post(node, s1, project(n, node, { title: `Proyecto número ${i + 1}` }))).status, 201);
  }
  const n = newName();
  await upload(node, s1, n, Buffer.alloc(50, 9));
  const sixth = await post(node, s1, project(n, node, { title: 'Proyecto sexto' }));
  assert.equal(sixth.status, 409);
  assert.match(sixth.data.message, /esperando/);
});

test('reaccionar con la app: la misma reacción la quita, otra la cambia; votos y conteos al instante; docentes y proyectos sin publicar no', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s1 = await login(node, 'ana1');
  const react = (r, id = 101) => node.api('/rest/v1/rpc/react_to_project', { method: 'POST', token: s1, body: { p_project_id: id, p_reaction: r } });
  assert.deepEqual((await react('like')).data, { mine: 'like', votes: 4 }, 'like cuenta como voto');
  assert.deepEqual((await react('wow')).data, { mine: 'wow', votes: 3 }, 'wow no cuenta como voto');
  assert.deepEqual((await react('wow')).data, { mine: null, votes: 3 }, 'tocar la misma la quita');
  assert.deepEqual((await react('excelente')).data, { mine: 'excelente', votes: 4 });
  const counts = (await node.api('/rest/v1/rpc/get_project_reactions', { method: 'POST', token: s1, body: { p_project_id: 101 } })).data;
  assert.deepEqual(counts, { counts: { like: 0, excelente: 1, wow: 1, destacar: 0, animo: 0 }, mine: 'excelente' }, 'la de Beto (wow) más la mía');
  const likes = (await node.api('/rest/v1/project_likes?select=project_id,reaction&user_id=eq.s1', { token: s1 })).data;
  assert.deepEqual(likes, [{ project_id: 101, reaction: 'excelente' }], 'el icono de mi reacción');
  assert.equal((await node.api('/rest/v1/projects?select=votes&id=eq.101', { token: s1 })).data[0].votes, 4, 'el voto se ve en la ficha');
  assert.equal((await react('no-existe')).status, 400);
  assert.equal((await react('like', 999)).status, 400);
  const push = buildPush(openSqlite(path.join(node.dataDir, 'node.db')));
  assert.deepEqual(push.reactions.map((r) => [r.student_id, r.project_id, r.reaction]), [['s1', 101, 'excelente']], 'solo la reacción FINAL viaja');
  const n = newName();
  await upload(node, s1, n, Buffer.alloc(50, 3));
  const mineP = (await post(node, s1, project(n, node))).data[0];
  assert.equal((await react('like', mineP.id)).status, 400, 'un proyecto que aún no se publica no recibe reacciones');
});
