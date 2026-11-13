// Endurecimiento del nodo tras la auditoría técnica (noviembre 2026):
//  1. Rangos HTTP: «Range: bytes=200-300» sobre un archivo de 100 bytes tumbaba el proceso del nodo (ERR_OUT_OF_RANGE tras enviar cabeceras).
//  2. serveScormEntry: solo HTML de hasta 2 MB y con Host válido (antes leía a memoria cualquier archivo y metía el Host sin validar en <base href>).
//  3. Descarga de archivos de la nube en flujo (antes: 6 archivos completos en RAM a la vez).
//  4. node-sync: una URL con «%» suelto ya no aborta el pull de toda la escuela (safeDecode).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRange, pipeFile } from '../school-node/http-range.js';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible para este Node';

test('parseRange: rangos válidos, sufijos, abiertos y recortados al tamaño del archivo', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), { ok: true, start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=10-', 100), { ok: true, start: 10, end: 99 });
  assert.deepEqual(parseRange('bytes=-20', 100), { ok: true, start: 80, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { ok: true, start: 0, end: 99 }, 'un sufijo mayor que el archivo es todo el archivo');
  assert.deepEqual(parseRange('bytes=90-500', 100), { ok: true, start: 90, end: 99 }, 'el final se recorta al archivo');
});

test('parseRange: lo que no se puede satisfacer da 416; lo mal formado se ignora (archivo completo)', () => {
  assert.deepEqual(parseRange('bytes=200-300', 100), { ok: false }, 'empieza después del final');
  assert.deepEqual(parseRange('bytes=100-', 100), { ok: false });
  assert.deepEqual(parseRange('bytes=-0', 100), { ok: false });
  assert.deepEqual(parseRange('bytes=0-9', 0), { ok: false }, 'archivo vacío');
  assert.equal(parseRange('bytes=50-10', 100), null, 'inicio mayor que final: sintaxis inválida');
  assert.equal(parseRange('bytes=abc', 100), null);
  assert.equal(parseRange('bytes=0-9,20-29', 100), null, 'varios rangos: se sirve completo');
  assert.equal(parseRange('items=0-9', 100), null);
  assert.equal(parseRange(undefined, 100), null);
  assert.equal(parseRange('bytes=-', 100), null);
  assert.equal(parseRange('bytes=99999999999999999999-', 100), null, 'número fuera de rango seguro');
});

test('pipeFile cierra el flujo de lectura cuando el cliente corta (sin descriptores abiertos)', async () => {
  const { Readable, Writable } = await import('node:stream');
  let destroyed = false;
  const src = new Readable({ read() { this.push(Buffer.alloc(1024)); }, destroy(err, cb) { destroyed = true; cb(err); } });
  const res = new Writable({ write(_c, _e, cb) { cb(); } });
  pipeFile(res, src);
  res.emit('close');
  await new Promise((r) => setImmediate(r));
  assert.equal(destroyed, true);
});

const get = (node, urlPath, { range, host } = {}) => new Promise((resolve) => {
  const u = new URL(node.base + urlPath);
  const headers = {};
  if (range) headers.Range = range;
  if (host) headers.Host = host;
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  r.on('error', (e) => resolve({ status: 0, error: e.code }));
  r.setTimeout(4000, () => { r.destroy(); resolve({ status: -1 }); });
  r.end();
});

test('nodo real: un Range imposible responde 416 y el nodo SIGUE VIVO (antes lo tumbaba)', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ contentFiles: { 'a.bin': 'x'.repeat(100) } });
  const bad = await get(node, '/content/a.bin', { range: 'bytes=200-300' });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers['content-range'], 'bytes */100');
  for (const range of ['bytes=50-10', 'bytes=abc', 'bytes=-', 'bytes=0-9,20-29']) {
    const r = await get(node, '/content/a.bin', { range });
    assert.equal(r.status, 200, `rango mal formado ${range}: se entrega completo`);
    assert.equal(r.body.length, 100);
  }
  const part = await get(node, '/content/a.bin', { range: 'bytes=0-9' });
  assert.equal(part.status, 206);
  assert.equal(part.body.length, 10);
  const tail = await get(node, '/content/a.bin', { range: 'bytes=-20' });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers['content-range'], 'bytes 80-99/100');
  const alive = await get(node, '/content/a.bin');
  assert.equal(alive.status, 200, 'el proceso sigue atendiendo');
  assert.doesNotMatch(node.log(), /ERR_OUT_OF_RANGE|ERR_HTTP_HEADERS_SENT/);
});

const SCORM = '/functions/v1/serve-scorm-entry?path=';
test('nodo real: serveScormEntry solo entrega HTML pequeño y rechaza un Host con comillas o etiquetas', { skip, timeout: 60000 }, async () => {
  const node = await startNode({
    contentFiles: {
      'lessons/L1/res/index.html': '<!doctype html><html><head><title>Aula</title></head><body>Hola</body></html>',
      'lessons/L1/res/video.mp4': 'x'.repeat(5000),
      'lessons/L1/res/enorme.html': '<html><head></head><body>' + 'a'.repeat(2 * 1024 * 1024 + 10) + '</body></html>',
    },
  });
  const ok = await get(node, SCORM + 'lessons/L1/res/index.html');
  assert.equal(ok.status, 200);
  assert.match(ok.body, /<base href="http:\/\/127\.0\.0\.1:\d+\/storage\/v1\/object\/public\/course-content\/lessons\/L1\/res\/">/);

  assert.equal((await get(node, SCORM + 'lessons/L1/res/video.mp4')).status, 404, 'un .mp4 no es una entrada SCORM (no se lee a memoria)');
  assert.equal((await get(node, SCORM + 'lessons/L1/res/enorme.html')).status, 413, 'HTML de más de 2 MB');

  for (const host of ['x"><script>alert(1)</script>', 'a b', 'evil.com"onload="x']) {
    const r = await get(node, SCORM + 'lessons/L1/res/index.html', { host });
    assert.ok([400, 0].includes(r.status) || r.status === 400, `Host peligroso ${JSON.stringify(host)} no debe entrar al HTML (estado ${r.status})`);
    assert.doesNotMatch(r.body || '', /alert\(1\)|onload=/);
  }
  const named = await get(node, SCORM + 'lessons/L1/res/index.html', { host: 'quetzal.local' });
  assert.equal(named.status, 200);
  assert.match(named.body, /<base href="http:\/\/quetzal\.local\//);
  const v6 = await get(node, SCORM + 'lessons/L1/res/index.html', { host: '[::1]:8080' });
  assert.equal(v6.status, 200);
});

test('safeDecode (node-sync): decodifica bien y NO lanza con un «%» suelto', async (t) => {
  let mod;
  try { mod = await import('../supabase/functions/node-sync/content.ts'); } catch { return t.skip('esta versión de Node no importa TypeScript (usa Node 22)'); }
  assert.equal(mod.safeDecode('lessons/L1/gu%C3%ADa.pdf'), 'lessons/L1/guía.pdf');
  assert.equal(mod.safeDecode('guia_100%_lista.pdf'), null, 'el % suelto no debe abortar la sincronización');
  assert.equal(mod.safeDecode('%E0%A4%A'), null);
  assert.equal(mod.safeDecode('normal.pdf'), 'normal.pdf');
});

test('integración: el nodo baja un archivo en flujo desde una nube falsa (sin cargarlo entero) y limpia el .part si se corta', { skip, timeout: 120000 }, async () => {
  // Nube falsa: sirve un archivo de 30 MB en trozos y otro que se corta a la mitad.
  const big = 30 * 1024 * 1024;
  const cloud = http.createServer((req, res) => {
    if (req.url.endsWith('/grande.bin')) {
      res.writeHead(200, { 'Content-Length': big });
      let sent = 0;
      const chunk = Buffer.alloc(1024 * 1024, 7);
      // Se envían 10 MB, se espera, y luego el resto: un nodo que baja EN FLUJO ya tiene bytes en el .part durante la pausa; uno que carga todo en RAM no.
      (function next() {
        if (sent >= big) return res.end();
        if (sent === 10 * 1024 * 1024 && !next.paused) { next.paused = true; return setTimeout(next, 900); }
        sent += chunk.length;
        res.write(chunk) ? next() : res.once('drain', next);
      })();
    } else if (req.url.endsWith('/cortado.bin')) {
      res.writeHead(200, { 'Content-Length': 5_000_000 });
      res.write(Buffer.alloc(1_000_000, 1));
      setTimeout(() => res.destroy(), 50);
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => cloud.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${cloud.address().port}/storage/v1/object/public/course-content/`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-stream-'));
  let db = null;
  try {
    const sync = await import('../school-node/sync.js');
    const { openDb } = await import('../school-node/db.js');
    db = openDb(dir);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('storage_base', ?)").run(base);
    db.prepare('INSERT INTO files (path, downloaded) VALUES (?, 0)').run('lessons/L1/grande.bin');
    db.prepare('INSERT INTO files (path, downloaded) VALUES (?, 0)').run('lessons/L1/cortado.bin');
    const grandePart = path.join(dir, 'content', 'lessons', 'L1', 'grande.bin.part');
    let enFlujo = false;
    const poll = setInterval(() => { try { if (fs.statSync(grandePart).size >= 5 * 1024 * 1024) enFlujo = true; } catch { /* aún no existe */ } }, 50);
    await sync.downloadFiles(db, { dataDir: dir, cloudUrl: base }, () => {});
    clearInterval(poll);
    assert.equal(enFlujo, true, 'durante la descarga el .part ya tenía datos en disco: se baja en flujo, no cargando el archivo entero en RAM');
    const grande = path.join(dir, 'content', 'lessons', 'L1', 'grande.bin');
    assert.equal(fs.statSync(grande).size, big);
    assert.equal(fs.existsSync(path.join(dir, 'content', 'lessons', 'L1', 'cortado.bin.part')), false, 'no queda el .part del archivo cortado');
    assert.equal(fs.existsSync(path.join(dir, 'content', 'lessons', 'L1', 'cortado.bin')), false);
  } finally { try { db?.close(); } catch { /* ya cerrada */ } cloud.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
