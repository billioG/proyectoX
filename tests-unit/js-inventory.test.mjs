// Inventario de js/: guardia contra la deuda silenciosa.
//  1. Todo archivo que el service worker pone en la caché existe (si falta uno, cache.addAll() falla y el service worker NO se instala).
//  2. Todo módulo de js/ lo carga alguien (index.html, el mapa de módulos de main.js, app.js u otro módulo): no se acumulan huérfanos.
//  3. La versión es la misma en index.html (4 sitios), en el service worker y en el parámetro de app.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');
const sw = read('service-worker.js');
const main = read('js/main.js');

function jsFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []);
}
const files = jsFiles('js');

test('hay un inventario que revisar', () => { assert.ok(files.length >= 80, `hay ${files.length} archivos en js/`); });

test('todo archivo js/... de la caché del service worker existe', () => {
  const listed = [...new Set([...sw.matchAll(/'((?:js|css|vendor)\/[^'?]+\.[a-z0-9]+)'/gi)].map((m) => m[1]))];
  assert.ok(listed.length > 40, `${listed.length} rutas en el service worker`);
  const missing = listed.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, [], 'estos archivos están en service-worker.js pero no existen: el service worker no se instalaría');
});

test('todo módulo de js/ está cargado por index.html, main.js, app.js u otro módulo (sin huérfanos)', () => {
  const others = files.map((f) => [f, read(f)]);
  const orphans = [];
  for (const f of files) {
    const base = path.basename(f);
    const rel = f; // js/x.js
    const pattern = new RegExp(`(?<![A-Za-z0-9_.-])(?:${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-z0-9_-])`);
    const loadedBy = pattern.test(html) || pattern.test(main) || others.some(([g, text]) => g !== f && pattern.test(text));
    if (!loadedBy) orphans.push(f);
  }
  assert.deepEqual(orphans, [], 'estos módulos no los carga nadie: si ya no se usan, bórralos (y quítalos del service worker); si se usan, agrégalos al mapa de main.js');
});

test('la versión coincide en js/version.js, index.html (scripts y etiquetas), el service worker y app.js', () => {
  const v = /window\.APP_VERSION = 'v([0-9.]+)'/.exec(fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8'))?.[1];
  assert.ok(v, 'no se encontró APP_VERSION');
  assert.equal(/CACHE_NAME = 'projectx-v([0-9.]+)'/.exec(sw)?.[1], v, 'service-worker.js');
  assert.equal(/js\/app\.js\?v=([0-9.]+)/.exec(html)?.[1], v, 'index.html app.js?v=');
  for (const f of ['handler-allowlist', 'safe-handlers', 'openers', 'version', 'boot']) assert.equal(new RegExp(`js/${f}\\.js\\?v=([0-9.]+)`).exec(html)?.[1], v, `index.html ${f}.js?v=`);
  assert.equal(html.split(`v${v}</span>`).length - 1, 2, 'las dos etiquetas de versión visibles de index.html');
});
