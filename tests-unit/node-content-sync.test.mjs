// Subida a la nube de los cursos y recursos que el docente creó en el nodo: primero los archivos (URL firmada, directo a Storage),
// después las filas, y solo cuando los archivos de un recurso ya llegaron. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { restStoreFor } from '../school-node/rest/store.js';
import { SCHEMA } from '../school-node/rest/schema.js';
import { createContentStore } from '../school-node/content-upload.js';
import { uploadContentFiles, toCloudUrl } from '../school-node/content-sync.js';
import { buildPush, applyPull } from '../school-node/sync.js';

const L1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const L2 = '4a2b8c1e-5d4a-4e7b-9a10-123456789abc';
const C1 = '1f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const CLOUD = 'https://proy.supabase.co';
const BASE = `${CLOUD}/storage/v1/object/public/course-content/`;

const dirs = [], dbs = [];
test.after(() => { for (const d of dbs) try { d.close(); } catch {} for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-sync-')); dirs.push(dir);
  const db = openDb(dir); dbs.push(db);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('storage_base', ?)").run(BASE);
  const content = createContentStore({ db, dir: path.join(dir, 'content') });
  const rest = restStoreFor(db, SCHEMA);
  const put = (rel, bytes, owner = 't1') => {
    const tmp = content.tmpPath(rel);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, bytes);
    content.commit(rel, tmp, owner, bytes.length);
  };
  return { db, dir, content, rest, put };
}

// Nube de mentira: da URL firmada y recibe el PUT del archivo.
function fakeCloud({ rejectPaths = [], failPut = false, offline = false } = {}) {
  const calls = [], uploaded = new Map();
  const fetchImpl = async (url, opts = {}) => {
    if (offline) throw new TypeError('fetch failed');
    if (String(url).endsWith('/functions/v1/node-sync')) {
      const body = JSON.parse(opts.body);
      calls.push(body.action);
      if (rejectPaths.includes(body.path)) return { ok: false, status: 400, json: async () => ({ error: 'Ruta o tipo de archivo no permitido.' }) };
      return { ok: true, status: 200, json: async () => ({ path: body.path, signed_url: `https://signed.example/${body.path}` }) };
    }
    if (String(url).startsWith('https://signed.example/')) {
      if (failPut) return { ok: false, status: 500, json: async () => ({}) };
      const chunks = []; for await (const c of opts.body) chunks.push(Buffer.from(c));
      uploaded.set(String(url).slice('https://signed.example/'.length), Buffer.concat(chunks));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error('url inesperada ' + url);
  };
  return { fetchImpl, calls, uploaded };
}
const config = { cloudUrl: CLOUD, nodeToken: 'x'.repeat(40) };

test('sube los archivos pendientes con URL firmada y los marca; un corte de internet los deja pendientes', async () => {
  const { db, content, put } = setup();
  put(`lessons/${L1}/guia.pdf`, Buffer.from('PDF-1'));
  put(`lessons/${L1}/web/index.html`, Buffer.from('<p>hola</p>'));
  const off = await uploadContentFiles(db, config, { content, fetchImpl: fakeCloud({ offline: true }).fetchImpl });
  assert.deepEqual([off.uploaded, off.failed], [0, 2]);
  assert.equal(content.pendingCount(), 2);
  const cloud = fakeCloud();
  const ok = await uploadContentFiles(db, config, { content, fetchImpl: cloud.fetchImpl });
  assert.deepEqual([ok.uploaded, ok.failed], [2, 0]);
  assert.equal(content.pendingCount(), 0);
  assert.equal(cloud.uploaded.get(`lessons/${L1}/guia.pdf`).toString(), 'PDF-1');
  assert.deepEqual((await uploadContentFiles(db, config, { content, fetchImpl: cloud.fetchImpl })), { uploaded: 0, failed: 0, rejected: 0 }, 'no repite');
});

test('si la nube rechaza un archivo para siempre queda marcado con su motivo y no se reintenta; un error del PUT se reintenta', async () => {
  const { db, content, put } = setup();
  put(`lessons/${L1}/a.pdf`, Buffer.from('a'));
  put(`lessons/${L1}/b.pdf`, Buffer.from('b'));
  const r = await uploadContentFiles(db, config, { content, fetchImpl: fakeCloud({ rejectPaths: [`lessons/${L1}/a.pdf`], failPut: true }).fetchImpl });
  assert.deepEqual([r.rejected, r.failed], [1, 1]);
  assert.match(content.record(`lessons/${L1}/a.pdf`).error, /no permitido/i);
  assert.equal(content.record(`lessons/${L1}/b.pdf`).uploaded, 0, 'el error del PUT se reintenta');
  const again = fakeCloud();
  const r2 = await uploadContentFiles(db, config, { content, fetchImpl: again.fetchImpl });
  assert.deepEqual([r2.uploaded, r2.rejected], [1, 0]);
  assert.ok(!again.uploaded.has(`lessons/${L1}/a.pdf`), 'el rechazado no vuelve a intentar');
});

test('la dirección de un recurso subido en el nodo se convierte a la de la nube al enviarla', () => {
  const o = { storageBase: BASE, cloudUrl: CLOUD };
  assert.equal(toCloudUrl(`http://192.168.26.6/storage/v1/object/public/course-content/lessons/${L1}/a%20b.pdf`, o), `${BASE}lessons/${L1}/a%20b.pdf`);
  assert.equal(toCloudUrl(`/content/lessons/${L1}/a.pdf`, o), `${BASE}lessons/${L1}/a.pdf`);
  assert.equal(toCloudUrl(`http://quetzal.local/functions/v1/serve-scorm-entry?path=lessons/${L1}/index.html`, o), `${CLOUD}/functions/v1/serve-scorm-entry?path=lessons/${L1}/index.html`);
  assert.equal(toCloudUrl('https://www.youtube.com/watch?v=abc', o), 'https://www.youtube.com/watch?v=abc');
  assert.equal(toCloudUrl(null, o), null);
});

function writeContent(rest) {
  const course = { id: C1, title: 'Robótica', description: null, school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', is_shared: false, tags: null, weight: null, bimestre: 1, tinkercad_class_url: null, cnb_area: null, created_at: '2026-11-02T00:00:00Z' };
  const mk = (id, url) => ({ id, title: 'Guía', description: null, content_type: 'pdf', content_url: url, content_path: `lessons/${id}`, quiz_data: null, course_id: C1, order_index: 0, audience: 'estudiante',
    school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', is_shared: false, tags: null, grade_points: null, counts_for_grade: null, created_at: '2026-11-02T00:00:00Z' });
  rest.put('courses', course); rest.enqueue([{ op: 'insert', table: 'courses', row: course }]);
  const l1 = mk(L1, `http://192.168.26.6/storage/v1/object/public/course-content/lessons/${L1}/guia.pdf`);
  const l2 = mk(L2, 'https://www.youtube.com/watch?v=abc');
  for (const l of [l1, l2]) { rest.put('lessons', l); rest.enqueue([{ op: 'insert', table: 'lessons', row: l }]); }
}

test('el curso viaja siempre; un recurso solo cuando sus archivos ya llegaron a la nube, y con la dirección de la nube; fuera de rest_seqs', () => {
  const { db, content, rest, put } = setup();
  put(`lessons/${L1}/guia.pdf`, Buffer.from('PDF'));
  writeContent(rest);
  let push = buildPush(db, { cloudUrl: CLOUD });
  assert.deepEqual(push.content.map((o) => [o.tbl, o.op, o.pk]), [['courses', 'insert', C1], ['lessons', 'insert', L2]], 'L1 espera su archivo');
  assert.equal(push.rest_seqs.some((s) => push.content.some((o) => o.seq === s)), false);
  content.markUploaded(`lessons/${L1}/guia.pdf`);
  push = buildPush(db, { cloudUrl: CLOUD });
  assert.deepEqual(push.content.map((o) => o.pk), [C1, L1, L2], 'en el orden en que se hicieron');
  assert.equal(push.content.find((o) => o.pk === L1).row.content_url, `${BASE}lessons/${L1}/guia.pdf`);
});

test('un archivo rechazado por la nube mantiene el recurso sin subir (y se ve en el estado)', () => {
  const { db, content, rest, put } = setup();
  put(`lessons/${L1}/guia.pdf`, Buffer.from('PDF'));
  content.markRejected(`lessons/${L1}/guia.pdf`, 'Ruta o tipo de archivo no permitido.');
  writeContent(rest);
  assert.deepEqual(buildPush(db, { cloudUrl: CLOUD }).content.map((o) => o.pk), [C1, L2]);
  assert.deepEqual(content.rejected().map((r) => r.path), [`lessons/${L1}/guia.pdf`]);
});

test('lo que la nube confirma sale de la bandeja; lo rechazado para siempre también; un error pasajero se queda', () => {
  const { db, rest } = setup();
  writeContent(rest);
  const push = buildPush(db, { cloudUrl: CLOUD });
  const [a, b, c] = push.content.map((o) => o.seq);
  applyPull(db, { server_time: '2026-11-02T00:00:00Z', applied: { content: [a] }, content_errors: [{ seq: b, error: 'no', permanent: true }, { seq: c, error: 'red', permanent: false }] }, push);
  assert.deepEqual(rest.pending().map((e) => e.seq), [c]);
});
