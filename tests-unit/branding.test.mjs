// Marca del colegio: validación del nombre y el logo, y que el crédito de Yo Aprendo - Quetzal LMS nunca falte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
globalThis.window = globalThis;
const { brandView, cleanBrandName, isSafeLogo, CREDIT_TEXT, MAX_BRAND_NAME } = await import('../js/branding.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('sin nombre ni logo se queda la marca de Quetzal', () => {
  assert.deepEqual(brandView({}), { name: '', logo: null, custom: false });
  assert.deepEqual(brandView(null), { name: '', logo: null, custom: false });
});

test('con nombre o logo es marca propia', () => {
  assert.equal(brandView({ brand_name: '  Colegio   San José ' }).name, 'Colegio San José');
  assert.equal(brandView({ brand_name: 'X' }).custom, true);
  assert.equal(brandView({ logo_data: PNG }).custom, true);
});

test('el nombre se recorta a 60 caracteres', () => {
  assert.equal(cleanBrandName('a'.repeat(200)).length, MAX_BRAND_NAME);
});

test('un logo que no es imagen png/jpeg/webp en data URL se descarta (nada de svg, scripts ni enlaces)', () => {
  for (const bad of ['http://x/y.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/png;base64,AA"onerror="x', '', null, 42]) {
    assert.equal(isSafeLogo(bad), false, String(bad));
  }
  assert.equal(isSafeLogo(PNG), true);
  assert.equal(isSafeLogo(`data:image/png;base64,${'A'.repeat(150000)}`), false, 'demasiado grande');
  assert.equal(brandView({ logo_data: 'http://x/y.png' }).logo, null);
});

test('el crédito «Hecho por Yo Aprendo · Quetzal LMS» siempre está: encabezado (marca propia), pie del menú y pantalla de entrada', () => {
  assert.equal(CREDIT_TEXT, 'Hecho por Yo Aprendo · Quetzal LMS');
  const html = read('index.html');
  assert.match(html, /id="brand-credit"[^>]*>Hecho por Yo Aprendo · Quetzal LMS/);
  assert.match(html, /id="app-credit-sidebar"[^>]*>Hecho por Yo Aprendo · Quetzal LMS/);
  assert.match(html, /Hecho por Yo Aprendo<\/span>/); // pantalla de entrada
  const js = read('js/branding.js');
  assert.match(js, /creditEl\.classList\.toggle\('hidden', !view\.custom\)/, 'con marca propia el crédito del encabezado se muestra');
});

test('la migración y las listas de columnas del nodo incluyen la marca', () => {
  const sql = read('migrations/school-branding.sql');
  assert.match(sql, /add column if not exists brand_name/);
  assert.match(sql, /add column if not exists logo_data/);
  assert.match(read('school-node/rest/schema.js'), /'brand_name', 'logo_data'/);
  assert.match(read('supabase/functions/node-sync/tables.ts'), /'brand_name', 'logo_data'/);
});

test('el formulario solo envía la marca si la columna existe (no rompe antes de aplicar la migración)', () => {
  const js = read('js/schools.js');
  assert.match(js, /'brand_name' in school/);
  assert.match(js, /document\.getElementById\('edit-school-brand-name'\)\s*\?/);
});
