// El visor 3D de proyectos (STL/OBJ/GLB) debe funcionar en el nodo escolar sin internet:
// three.js r128 sale de vendor/cdn/three-0.128.0/ (mismos archivos que la CDN, sin SRI).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';

after(stopAllNodes);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewer = fs.readFileSync(path.join(ROOT, 'js/model-viewer.js'), 'utf8');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0';
const FILES = ['build/three.min.js', 'examples/js/controls/OrbitControls.js', 'examples/js/loaders/STLLoader.js', 'examples/js/loaders/OBJLoader.js', 'examples/js/loaders/GLTFLoader.js'];
const sha384 = (file) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');

test('los 5 archivos de three.js existen en vendor/cdn/three-0.128.0 y su sha384 es el de THREE_SRI', () => {
  for (const f of FILES) {
    const file = path.join(ROOT, 'vendor/cdn/three-0.128.0', f);
    assert.ok(fs.existsSync(file), `falta vendor/cdn/three-0.128.0/${f}`);
    const m = new RegExp("'" + (CDN + '/' + f).split('.').join('[.]') + "': '(sha384-[^']+)'").exec(viewer);
    assert.ok(m, `THREE_SRI no lista ${f}`);
    assert.equal(sha384(file), m[1], `el sha384 de ${f} no coincide`);
  }
});

// Ejecuta model-viewer.js con un DOM mínimo y devuelve las etiquetas <script> que intentó insertar.
async function scriptsRequested({ node }) {
  const scripts = [];
  const document = {
    documentElement: { nodeType: 1 },
    head: { appendChild(s) { scripts.push(s); queueMicrotask(() => s.onload?.()); } },
    createElement: () => ({}),
  };
  const window = { QUETZAL_NODE: node ? { rest: true } : undefined };
  const ctx = vm.createContext({ window, document, MutationObserver: class { observe() {} }, console, queueMicrotask });
  vm.runInContext(viewer, ctx);
  await window.captureModelThumbnail('blob:x', 'stl').catch(() => {}); // sin THREE real falla después de pedir los scripts
  return scripts;
}

test('modo nodo: model-viewer.js pide three.js a vendor/cdn, sin CDN ni integrity/crossorigin', async () => {
  const scripts = await scriptsRequested({ node: true });
  assert.deepEqual(scripts.map(s => s.src).sort(), [
    'vendor/cdn/three-0.128.0/build/three.min.js',
    'vendor/cdn/three-0.128.0/examples/js/controls/OrbitControls.js',
    'vendor/cdn/three-0.128.0/examples/js/loaders/STLLoader.js',
  ].sort());
  for (const s of scripts) {
    assert.doesNotMatch(s.src, /cdn\.jsdelivr\.net/);
    assert.equal(s.integrity, undefined);
    assert.equal(s.crossOrigin, undefined);
  }
});

test('nube: sigue con la CDN y con SRI', async () => {
  const scripts = await scriptsRequested({ node: false });
  assert.equal(scripts.length, 3);
  for (const s of scripts) {
    assert.ok(s.src.startsWith(CDN + '/'), s.src);
    assert.match(s.integrity, /^sha384-/);
    assert.equal(s.crossOrigin, 'anonymous');
  }
});

test('el servidor del nodo entrega three.min.js como JavaScript', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode();
  for (const f of FILES) {
    const res = await fetch(`${node.base}/vendor/cdn/three-0.128.0/${f}`);
    assert.equal(res.status, 200, f);
    assert.match(res.headers.get('content-type'), /javascript/, f);
  }
  const body = Buffer.from(await (await fetch(`${node.base}/vendor/cdn/three-0.128.0/build/three.min.js`)).arrayBuffer());
  assert.equal(body.length, fs.statSync(path.join(ROOT, 'vendor/cdn/three-0.128.0/build/three.min.js')).size);
});
