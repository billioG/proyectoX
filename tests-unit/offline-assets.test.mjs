// El nodo escolar debe poder arrancar sin internet (school-node/offline-assets.js).
// Correr con: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizeIndexHtml, CDN_REPLACEMENTS, CDN_NOT_VENDORED } from '../school-node/offline-assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('cada reemplazo aparece en index.html (si se cambia una librería, esta prueba avisa)', () => {
  for (const [from] of CDN_REPLACEMENTS) assert.ok(html.includes(from), `index.html ya no contiene: ${from}`);
});

test('cada archivo local al que apunta un reemplazo existe', () => {
  for (const [, to] of CDN_REPLACEMENTS) {
    const rel = to.replace(/^'|'$/g, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `falta ${rel}`);
  }
});

test('el index.html del nodo ya no pide nada a un CDN (salvo PDF.js)', () => {
  const out = localizeIndexHtml(html);
  const allowed = (u) => CDN_NOT_VENDORED.some(ok => u.includes(ok));
  // 1) Direcciones completas. Los dos prefijos J y C del cargador de librerías se revisan en el punto 2.
  const prefixes = ['https://cdn.jsdelivr.net/npm/', 'https://cdnjs.cloudflare.com/ajax/libs/'];
  const external = [...out.matchAll(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)[^"'\s)]*/g)]
    .map(m => m[0]).filter(u => !prefixes.includes(u));
  assert.deepEqual(external.filter(u => !allowed(u)), [], 'quedan dependencias de internet');
  // 2) Librerías del cargador: J + '...' (jsdelivr) y C + '...' (cdnjs).
  const loader = [...out.matchAll(/\b[JC] \+ '([^']+)'/g)].map(m => m[1]);
  assert.ok(loader.length > 0, 'no se encontró el cargador de librerías');
  assert.deepEqual(loader.filter(u => !allowed(u)), [], 'librerías del cargador que siguen pidiéndose a internet');
});

test('la CSP que entrega el nodo no menciona ningún CDN, pero conserva el resto de sus cierres', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(localizeIndexHtml(html))?.[1];
  assert.ok(csp, 'el nodo entrega index.html con CSP');
  assert.doesNotMatch(csp, /jsdelivr|cdnjs|googleapis|gstatic/);
  assert.match(csp, /script-src 'self' 'unsafe-inline';/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
});

test('supabase-js se carga desde el propio nodo, y sin las conexiones tempranas a CDN', () => {
  const out = localizeIndexHtml(html);
  assert.match(out, /<script defer src="vendor\/cdn\/supabase-js-2\.118\.0\.js"><\/script>/);
  assert.doesNotMatch(out, /rel="preconnect"/);
});

test('las fuentes de Font Awesome y de Inter que referencian los CSS locales existen', () => {
  const fa = fs.readFileSync(path.join(ROOT, 'vendor/cdn/font-awesome-6.4.0/css/all.min.css'), 'utf8');
  for (const f of ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'fa-brands-400.woff2']) {
    assert.ok(fa.includes(f), f + ' no aparece en el CSS');
    assert.ok(fs.existsSync(path.join(ROOT, 'vendor/cdn/font-awesome-6.4.0/webfonts', f)), 'falta ' + f);
  }
  const inter = fs.readFileSync(path.join(ROOT, 'vendor/cdn/inter/inter.css'), 'utf8');
  for (const f of ['inter-latin.woff2', 'inter-latin-ext.woff2']) {
    assert.ok(inter.includes(f));
    assert.ok(fs.existsSync(path.join(ROOT, 'vendor/cdn/inter', f)), 'falta ' + f);
  }
});

test('el resto de index.html no cambia', () => {
  const out = localizeIndexHtml(html);
  assert.ok(out.includes('id="login-password"'));
  assert.ok(out.includes('js/app.js?v='));
});
