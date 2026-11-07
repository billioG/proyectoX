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
  assert.deepEqual(brandView({}), { name: '', logo: null, color: null, color2: null, color3: null, custom: false });
  assert.deepEqual(brandView(null), { name: '', logo: null, color: null, color2: null, color3: null, custom: false });
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

const { isUsableColor, contrastWithWhite, schoolCodeToShow } = await import('../js/branding.js');

test('color: solo #RRGGBB y con contraste suficiente con texto blanco', () => {
  assert.equal(isUsableColor('#1d4ed8'), true);
  assert.equal(isUsableColor('#00c853'), false, 'el verde de Quetzal es claro: contraste < 3 (ya lo usa la app, pero un color nuevo debe ser más oscuro)');
  assert.equal(isUsableColor('#ffff00'), false);
  for (const bad of ['red', '#fff', '#12345g', 'rgb(0,0,0)', 'url(x)', '', null]) assert.equal(isUsableColor(bad), false, String(bad));
  assert.ok(contrastWithWhite('#000000') > 20);
  assert.equal(brandView({ brand_color: '#1D4ED8' }).color, '#1d4ed8');
  assert.equal(brandView({ brand_color: '#ffff00' }).color, null);
  assert.equal(brandView({ brand_color: '#1d4ed8' }).custom, true);
});

test('qué colegio mostrar en la entrada: sesión > enlace ?colegio= > último del dispositivo', () => {
  assert.equal(schoolCodeToShow({ sessionCode: 'ESC1', search: '?colegio=OTRO', last: 'ULT' }), 'ESC1');
  assert.equal(schoolCodeToShow({ search: '?x=1&colegio=ESC2', last: 'ULT' }), 'ESC2');
  assert.equal(schoolCodeToShow({ search: '', last: 'ULT' }), 'ULT');
  assert.equal(schoolCodeToShow({ search: '?colegio=<script>', last: null }), null);
  assert.equal(schoolCodeToShow({}), null);
});

test('migración: color con formato, vista pública mínima (sin funciones) y columna en el nodo', () => {
  const sql = read('migrations/school-branding.sql');
  assert.match(sql, /add column if not exists brand_color/);
  assert.match(sql, /create or replace view public\.school_brands/);
  assert.match(sql, /select code, brand_name, logo_data, brand_color/);
  assert.match(sql, /grant select on public\.school_brands to anon, authenticated/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /security definer/i);
  assert.match(read('school-node/rest/schema.js'), /'brand_color'/);
  assert.match(read('supabase/functions/node-sync/tables.ts'), /'brand_color'/);
  assert.match(read('tailwind.config.js'), /--primary-rgb/);
});

const { shades, SHADE_STEPS, PRESETS, isUsableAccent } = await import('../js/branding.js');

test('de un color base salen 11 tonos: el 500 es el elegido, los bajos más claros y los altos más oscuros', () => {
  const sh = shades('#4f46e5');
  assert.deepEqual(Object.keys(sh).map(Number), SHADE_STEPS);
  assert.equal(sh[500], '#4f46e5');
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
  for (let i = 1; i < SHADE_STEPS.length; i++) assert.ok(lum(sh[SHADE_STEPS[i - 1]]) > lum(sh[SHADE_STEPS[i]]), `${SHADE_STEPS[i - 1]} más claro que ${SHADE_STEPS[i]}`);
  assert.match(sh[50], /^#[0-9a-f]{6}$/);
});

test('las paletas sugeridas cumplen las reglas de contraste', () => {
  assert.ok(PRESETS.length >= 4);
  for (const p of PRESETS) {
    assert.equal(isUsableColor(p.colors[0]), true, `${p.name} principal`);
    assert.equal(isUsableColor(p.colors[1]), true, `${p.name} secundario`);
    assert.equal(isUsableAccent(p.colors[2]), true, `${p.name} acento`);
  }
});

test('el acento puede ser más claro que el principal, pero no casi blanco', () => {
  assert.equal(isUsableAccent('#f59e0b'), true);
  assert.equal(isUsableAccent('#fde68a'), false);
  assert.equal(isUsableAccent('#ffffff'), false);
  assert.equal(brandView({ brand_color2: '#4f46e5', brand_color3: '#f59e0b' }).color2, '#4f46e5');
  assert.equal(brandView({ brand_color3: '#fde68a' }).color3, null);
});

test('Tailwind: índigo/violeta/púrpura/azul usan --sec-* y ámbar/naranja/amarillo usan --acc-*, con su valor de siempre de respaldo; rojo y esmeralda no cambian', () => {
  const css = read('css/tailwind.css');
  assert.match(css, /\.bg-indigo-600\{[^}]*var\(--sec-600,79 70 229\)/);
  assert.match(css, /\.bg-blue-600\{[^}]*var\(--sec-600,37 99 235\)/);
  assert.match(css, /\.text-amber-500\{[^}]*var\(--acc-500,245 158 11\)/);
  assert.match(css, /\.bg-orange-500\{[^}]*var\(--acc-500,249 115 22\)/);
  assert.match(css, /\.bg-rose-500\{[^}]*rgb\(244 63 94/);
  assert.match(css, /\.bg-emerald-500\{[^}]*rgb\(16 185 129/);
});

test('la migración y el nodo incluyen los colores 2 y 3 y la vista pública los expone', () => {
  const sql = read('migrations/school-branding.sql');
  assert.match(sql, /add column if not exists brand_color2/);
  assert.match(sql, /add column if not exists brand_color3/);
  assert.match(sql, /select code, brand_name, logo_data, brand_color, brand_color2, brand_color3/);
  assert.equal((sql.match(/create or replace view public\.school_brands/g) || []).length, 1, 'una sola definición de la vista: volver a correr el archivo no falla');
  assert.match(read('school-node/rest/schema.js'), /'brand_color2', 'brand_color3'/);
  assert.match(read('supabase/functions/node-sync/tables.ts'), /'brand_color2', 'brand_color3'/);
  assert.match(read('school-node/server.js'), /brand_color2: row\.brand_color2/);
});
