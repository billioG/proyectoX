// Integridad (SRI) de las librerías que se cargan desde CDN: si una CDN cambiara un archivo, el navegador lo rechaza.
// Sin red: comprueba que cada librería tiene su hash, que los hashes de index.html y model-viewer.js son los de scripts/sri-hashes.json,
// que ninguna URL usa una versión flotante y que el nodo escolar (copias locales en vendor/) quita los atributos de integridad.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localizeIndexHtml } from '../school-node/offline-assets.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TABLE = JSON.parse(read('scripts/sri-hashes.json'));
const index = read('index.html');
const viewer = read('js/model-viewer.js');
const sw = read('service-worker.js');

test('scripts/sri-hashes.json: hashes sha384 válidos para cada URL de CDN', () => {
  assert.ok(Object.keys(TABLE).length >= 13);
  for (const [url, h] of Object.entries(TABLE)) {
    assert.match(url, /^https:\/\/(cdn\.jsdelivr\.net\/npm|cdnjs\.cloudflare\.com\/ajax\/libs)\//, url);
    assert.match(h, /^sha384-[A-Za-z0-9+/]{64}$/, `hash de ${url}`);
  }
});

test('index.html: cada hash que lleva es el de la tabla, y cada librería de CDN tiene el suyo', () => {
  const tagged = [...index.matchAll(/integrity="(sha384-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(tagged.length >= 3, 'FA (x2) y supabase-js llevan integrity en la etiqueta');
  const hashes = new Set(Object.values(TABLE));
  for (const h of tagged) assert.ok(hashes.has(h), `hash que no está en la tabla: ${h}`);
  // Cargador window.loadLib: cada librería (por nombre) lleva el hash de su archivo en la tabla.
  const J = 'https://cdn.jsdelivr.net/npm/', C = 'https://cdnjs.cloudflare.com/ajax/libs/';
  const byName = {
    jszip: J + 'jszip@3.10.1/dist/jszip.min.js', driver: J + 'driver.js@1.11.0/dist/driver.js.iife.js', driverCss: J + 'driver.js@1.11.0/dist/driver.css',
    pdfjs: C + 'pdf.js/3.11.174/pdf.min.js', jsqr: J + 'jsqr@1.4.0/dist/jsQR.min.js', confetti: J + 'canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  };
  const loader = index.slice(index.indexOf('var SRI = {'), index.indexOf('var jobs = {}'));
  for (const [name, url] of Object.entries(byName)) {
    assert.ok(TABLE[url], `${url} está en la tabla`);
    assert.ok(loader.includes(`${name}: '${TABLE[url]}'`), `el cargador lleva el hash de ${name}`);
  }
  assert.match(index, /SRI\[name\] && \/\^https:\/\.test\(L\.js\)/, 'solo lo que viene de https lleva integrity (el nodo usa copias locales)');
  assert.match(index, /SRI\[name \+ 'Css'\] && \/\^https:\/\.test\(L\.css\)/);
});

test('model-viewer.js: los 5 archivos de three.js r128 llevan el hash de la tabla', () => {
  const base = 'https://cdn.jsdelivr.net/npm/three@0.128.0';
  for (const p of ['/build/three.min.js', '/examples/js/controls/OrbitControls.js', '/examples/js/loaders/STLLoader.js', '/examples/js/loaders/OBJLoader.js', '/examples/js/loaders/GLTFLoader.js']) {
    assert.ok(TABLE[base + p], `falta ${p} en la tabla`);
    assert.ok(viewer.includes(`'${base}${p}': '${TABLE[base + p]}'`), `model-viewer.js: hash de ${p}`);
  }
  assert.match(viewer, /s\.integrity = THREE_SRI\[src\]/);
});

test('ninguna librería de CDN usa una versión flotante (no se puede verificar la integridad de algo que cambia)', () => {
  for (const [name, src] of [['index.html', index], ['js/model-viewer.js', viewer], ['service-worker.js', sw]]) {
    const urls = src.match(/(?:cdn\.jsdelivr\.net\/npm\/|J \+ ')[^'"\s)]+/g) || [];
    for (const u of urls) {
      const spec = u.replace(/^.*npm\//, '').replace(/^J \+ '/, '');
      if (!/@/.test(spec)) continue;
      assert.match(spec, /@(?:\d+\.\d+\.\d+)(?:[/?]|$)/, `${name}: versión flotante en ${u}`);
    }
  }
});

test('nodo escolar: sus copias locales no llevan integrity ni crossorigin (no son byte a byte las de la CDN)', () => {
  const local = localizeIndexHtml(index);
  assert.doesNotMatch(local, /integrity="/);
  assert.doesNotMatch(local, /crossorigin="anonymous"/);
  assert.match(local, /vendor\/cdn\/supabase-js-2\.118\.0\.js/);
  assert.match(local, /vendor\/cdn\/driver-1\.js\.iife\.js/);
});
