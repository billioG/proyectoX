// Formato de error de las Edge Functions (ADR-002): el helper común (_shared/http.ts) y una revisión estática de TODAS las funciones:
// toda respuesta de error escrita como json({...}, 4xx|5xx) lleva la clave `error`. Corre con Node 22 (importa TypeScript).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');

let http = null;
let skip = false;
try {
  http = await import('../supabase/functions/_shared/http.ts');
} catch (e) {
  if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

test('errorResponse: estado, tipo y cuerpo según el contrato', { skip }, async () => {
  const r = http.errorResponse(403, 'No autorizado');
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.deepEqual(await r.json(), { error: 'No autorizado' });

  const withCode = http.errorResponse(429, 'Demasiados intentos', { code: 'rate_limited', detail: 'ip 1.2.3.4', headers: { 'Access-Control-Allow-Origin': 'https://x.org' } });
  assert.equal(withCode.headers.get('access-control-allow-origin'), 'https://x.org');
  assert.deepEqual(await withCode.json(), { error: 'Demasiados intentos', code: 'rate_limited', message: 'ip 1.2.3.4' });
});

test('errorResponse: un estado que no es de error se corrige a 500 (un descuido no puede dar 200 con un error)', { skip }, async () => {
  for (const bad of [200, 302, 0, 99999, NaN, 404.5]) assert.equal(http.errorResponse(bad, 'x').status, 500, String(bad));
  assert.equal(http.errorResponse(404, 'x').status, 404);
  assert.equal(http.errorResponse(599, 'x').status, 599);
});

test('jsonResponse: Content-Type siempre JSON, aunque los encabezados de CORS traigan otro', { skip }, async () => {
  const r = http.jsonResponse({ ok: true }, 201, { 'Content-Type': 'text/plain', 'X-Otro': '1' });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('x-otro'), '1');
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(http.jsonResponse({}).status, 200);
});

test('toErrorMessage e internalError: nunca devuelven una traza ni revientan con cualquier cosa lanzada', { skip }, async () => {
  assert.equal(http.toErrorMessage(new Error('falló la base')), 'falló la base');
  assert.equal(http.toErrorMessage('texto'), 'texto');
  assert.equal(http.toErrorMessage({ message: 'de un objeto' }), 'de un objeto');
  for (const weird of [null, undefined, 42, {}, [], Symbol('x')]) assert.equal(http.toErrorMessage(weird), 'Error desconocido');
  const e = new Error('boom'); e.stack = 'TRAZA SECRETA en /srv/app.ts:10';
  const r = http.internalError(e, { 'X-A': 'b' });
  assert.equal(r.status, 500);
  const body = await r.json();
  assert.deepEqual(body, { error: 'Error interno', message: 'boom' });
  assert.ok(!JSON.stringify(body).includes('TRAZA'));
  assert.equal(r.headers.get('x-a'), 'b');
  assert.equal((await http.internalError(null, {}, 'No se pudo guardar').json()).error, 'No se pudo guardar');
});

// ---- Revisión estática de todas las funciones ----
/** Llamadas json(...) o reply(...) (así se llama el ayudante de node-sync) con sus argumentos leídos respetando paréntesis, llaves y textos. */
function jsonCalls(src) {
  const calls = [];
  const re = /(?<![A-Za-z0-9_.])(?:json|reply)\(/g;
  for (let m; (m = re.exec(src));) {
    let depth = 1, i = m.index + m[0].length, quote = null, args = [], start = i;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) break; }
      else if (c === ',' && depth === 1) { args.push(src.slice(start, i)); start = i + 1; }
    }
    args.push(src.slice(start, i));
    calls.push({ line: src.slice(0, m.index).split('\n').length, args: args.map((a) => a.trim()) });
  }
  return calls;
}

const names = fs.readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(FUNCTIONS, e.name, 'index.ts')))
  .map((e) => e.name).sort();

test('hay funciones que revisar', () => { assert.ok(names.length >= 25, `hay ${names.length}`); });

test('toda respuesta json({...}, 4xx|5xx) de las funciones lleva la clave `error` con un texto', () => {
  const problems = [];
  let checked = 0;
  for (const n of names) {
    const src = fs.readFileSync(path.join(FUNCTIONS, n, 'index.ts'), 'utf8');
    for (const c of jsonCalls(src)) {
      const status = /^([45]\d\d)$/.exec(c.args[c.args.length - 1] ?? '')?.[1];
      if (!status || c.args.length < 2) continue;
      checked++;
      const body = c.args[0];
      if (!/^\{/.test(body) || !/(^|[\s,{])error\s*[:,}]/.test(body)) problems.push(`${n}/index.ts:${c.line} → json(${body.slice(0, 60)}…, ${status})`);
    }
  }
  assert.ok(checked > 120, `se revisaron ${checked} respuestas de error`);
  assert.deepEqual(problems, [], 'estas respuestas de error no siguen el contrato { error: "..." } (docs/DECISIONES.md, ADR-002)');
});

test('ninguna función usa `msg`, `errorMessage` ni `err` como clave en un 4xx/5xx', () => {
  const problems = [];
  for (const n of names) {
    const src = fs.readFileSync(path.join(FUNCTIONS, n, 'index.ts'), 'utf8');
    for (const c of jsonCalls(src)) {
      const status = /^([45]\d\d)$/.exec(c.args[c.args.length - 1] ?? '')?.[1];
      if (status && /\b(msg|errorMessage|err)\s*:/.test(c.args[0])) problems.push(`${n}/index.ts:${c.line}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('el helper no tiene dependencias externas (se copia tal cual a una función)', () => {
  const src = fs.readFileSync(path.join(FUNCTIONS, '_shared', 'http.ts'), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\bDeno\./);
});

// ---- Exportador para el editor del panel ----
test('exportar-funciones: copia los archivos de la función y trae el módulo compartido con su import corregido', async () => {
  const { exportFunction, functionNames, PANEL_FILE_LIMIT } = await import('../scripts/exportar-funciones.mjs');
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-src-'));
  fs.mkdirSync(path.join(src, '_shared')); fs.mkdirSync(path.join(src, 'mi-funcion')); fs.mkdirSync(path.join(src, 'otra'));
  fs.writeFileSync(path.join(src, '_shared', 'http.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(src, 'mi-funcion', 'index.ts'), "import { x } from '../_shared/http.ts';\nimport { y } from './util.ts';\nconsole.log(x, y);\n");
  fs.writeFileSync(path.join(src, 'mi-funcion', 'util.ts'), 'export const y = 2;\n');
  fs.writeFileSync(path.join(src, 'otra', 'index.ts'), 'console.log(1);\n');
  assert.deepEqual(functionNames(src), ['mi-funcion', 'otra']);

  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-dest-'));
  const r = exportFunction('mi-funcion', dest, src);
  assert.deepEqual(r.files, ['http.ts', 'index.ts', 'util.ts']);
  assert.deepEqual(r.warnings, []);
  assert.match(fs.readFileSync(path.join(dest, 'mi-funcion', 'index.ts'), 'utf8'), /from '\.\/http\.ts'/);
  assert.doesNotMatch(fs.readFileSync(path.join(dest, 'mi-funcion', 'index.ts'), 'utf8'), /_shared/);
  assert.equal(fs.readFileSync(path.join(src, 'mi-funcion', 'index.ts'), 'utf8').includes('../_shared/http.ts'), true, 'la fuente no se toca');

  // Re-exportar reemplaza lo anterior (no deja archivos viejos).
  fs.writeFileSync(path.join(dest, 'mi-funcion', 'viejo.ts'), 'x');
  exportFunction('mi-funcion', dest, src);
  assert.equal(fs.existsSync(path.join(dest, 'mi-funcion', 'viejo.ts')), false);

  assert.throws(() => exportFunction('no-existe', dest, src), /No existe la función/);
  fs.writeFileSync(path.join(src, 'otra', 'index.ts'), "import { z } from '../_shared/falta.ts';\n");
  assert.throws(() => exportFunction('otra', dest, src), /falta\.ts, que no existe/);

  fs.mkdirSync(path.join(src, 'grande'));
  for (let i = 0; i < PANEL_FILE_LIMIT + 1; i++) fs.writeFileSync(path.join(src, 'grande', i === 0 ? 'index.ts' : `m${i}.ts`), '//\n');
  assert.match(exportFunction('grande', dest, src).warnings[0], /admite 16/);
});

test('exportar-funciones sobre las funciones reales: cada una se exporta, y node-sync cabe en el editor del panel', async () => {
  const { exportFunction, functionNames, PANEL_FILE_LIMIT } = await import('../scripts/exportar-funciones.mjs');
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-real-'));
  const all = functionNames();
  assert.ok(all.length >= 25 && all.includes('node-sync'));
  for (const n of all) {
    const r = exportFunction(n, dest);
    assert.ok(r.files.includes('index.ts'), n);
    assert.ok(r.files.length <= PANEL_FILE_LIMIT, `${n} tiene ${r.files.length} archivos`);
  }
});
