// Auditoría de los manejadores en línea (onclick="...", onchange="...") contra el intérprete seguro (js/safe-handlers.js).
//
//   node scripts/handlers-audit.mjs            comprueba: todo manejador del código se entiende y js/handler-allowlist.js está al día (sale 1 si no)
//   node scripts/handlers-audit.mjs --write    regenera js/handler-allowlist.js (la lista de funciones que un manejador puede llamar)
//   node scripts/handlers-audit.mjs --list     imprime todos los manejadores encontrados y su resultado
//
// Se corre al agregar un onclick nuevo que llame a una función que todavía no estaba en ningún manejador (tests-unit/csp-handlers.test.mjs lo exige).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SH = require('../js/safe-handlers.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW_FILE = path.join(ROOT, 'js', 'handler-allowlist.js');

function sourceFiles() {
  const out = ['index.html'];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && e.name !== 'safe-handlers.js' && e.name !== 'handler-allowlist.js') out.push(p);
    }
  })('js');
  return out;
}

/** Salta una interpolación ${...} de una plantilla (llaves, cadenas y plantillas anidadas). `i` apunta al «$». */
function skipInterp(s, i) {
  let depth = 0, k = i + 1;
  for (; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return k + 1; }
    else if (c === '/' && (s[k - 1] === '(' || s[k - 1] === ',') && s[k + 1] !== '/' && s[k + 1] !== '*') {
      // literal de expresión regular (p. ej. .replace(/'/g, ...)): se salta completo, sus comillas no abren cadenas
      k++;
      while (k < s.length && s[k] !== '/') { if (s[k] === '\\') k++; k++; }
    }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; k++;
      while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; if (q === '`' && s[k] === '$' && s[k + 1] === '{') k = skipInterp(s, k) - 1; k++; }
    }
  }
  return s.length;
}

const ATTR = /[\s'"`;>]on([a-z]+)\s*=\s*(["'])/g;

/** Todos los manejadores en línea del texto: [{ ev, raw, line }]. `raw` conserva las interpolaciones como «§». */
export function extractHandlers(src) {
  const out = [];
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(src))) {
    const lineStart = src.lastIndexOf(String.fromCharCode(10), m.index) + 1;
    const lineHead = src.slice(lineStart, m.index).trim();
    if (/^(\/\/|\*|\/\*|<!--)/.test(lineHead) || src.lastIndexOf('<!--', m.index) > src.lastIndexOf('-->', m.index)) continue; // comentarios
    const q = m[2];
    let j = m.index + m[0].length, body = '';
    while (j < src.length && src[j] !== q) {
      if (src[j] === '$' && src[j + 1] === '{') { j = skipInterp(src, j); body += '§'; continue; }
      if (src[j] === '\\') { body += src[j + 1] === q || src[j + 1] === '\\' ? src[j + 1] : src[j] + src[j + 1]; j += 2; continue; }
      body += src[j]; j++;
    }
    out.push({ ev: m[1], raw: body, line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** Manejadores guardados como texto en una propiedad (onclick: 'window.fn()') que después se escribe en un atributo (p. ej. GameArena.heroHtml). */
export function extractPropHandlers(src) {
  const out = [];
  const re = /(?:^|[\s{,])(?:on([a-z]+)|(go))\s*:\s*(["'])((?:\\.|(?!\3)[^\\\n])*)\3/g;
  let m;
  while ((m = re.exec(src))) out.push({ ev: m[1] || 'click', raw: m[4], line: src.slice(0, m.index).split(String.fromCharCode(10)).length });
  return out;
}

/** Lo que el navegador le entregaría al manejador: entidades HTML decodificadas y cada «§» (valor que llega en ejecución) sustituido por un literal. */
export function materialize(raw) {
  const decoded = raw.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let out = '', quote = null;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded[i];
    if (quote) { if (c === '\\') { out += c + (decoded[i + 1] || ''); i++; continue; } if (c === quote) quote = null; out += c === '§' ? 'x' : c; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    out += c === '§' ? '0' : c;
  }
  return out.trim();
}

/** Un «§» (valor que llega en ejecución) donde va el CÓDIGO del manejador (no un dato entre comillas) no se puede auditar: se rechaza. */
export function dynamicProblem(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c !== '§') continue;
    const before = raw.slice(0, i).trim(), after = raw[i + 1] || '';
    if (!before) return 'el manejador se arma entero en ejecución (no se puede auditar): usar un texto fijo o una función con nombre';
    if (/[\w.$]$/.test(raw.slice(0, i)) || /[\w.$]/.test(after) && after !== '' && !/\s/.test(after) && after !== '(' ) return 'un nombre de función se arma en ejecución (no se puede auditar)';
    if (after === '(') return 'un nombre de función se arma en ejecución (no se puede auditar)';
  }
  return '';
}

export function audit() {
  const handlers = [], failures = [];
  const calls = new Set(), reads = new Set(), methods = new Set();
  for (const f of sourceFiles()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const lines = src.split(/\r?\n/);
    // Pistas: «// handlers-audit: código ;; código -- explicación» declara los manejadores que un trozo de código arma en ejecución (nombres de función que se
    // eligen con una variable). Se auditan igual que los demás. Sin código después de los dos puntos solo avisa que las fuentes ya están auditadas aparte.
    const hints = [];
    lines.forEach((l, i) => { const m = /handlers-audit:\s*(.*?)(?:\s+--\s.*)?$/.exec(l); if (m) m[1].split(';;').map((x) => x.trim()).filter(Boolean).forEach((code) => hints.push({ ev: 'click', raw: code, line: i + 1, hint: true })); });
    const hintAt = (line) => lines.slice(Math.max(0, line - 60), line).some((l) => /handlers-audit:/.test(l));
    for (const h of [...extractHandlers(src), ...extractPropHandlers(src), ...hints]) {
      const code = materialize(h.raw);
      const where = `${f}:${h.line}`;
      handlers.push({ where, ev: h.ev, code });
      const dyn = h.hint ? '' : dynamicProblem(h.raw);
      if (dyn && hintAt(h.line)) continue; // armado en ejecución, pero declarado con una pista justo arriba
      if (dyn) { failures.push({ where, code: h.raw, why: dyn + ' (o declararlo con una pista «// handlers-audit: código» justo arriba)' }); continue; }
      if (!code) { failures.push({ where, code: h.raw, why: 'vacío (probablemente el atributo completo se arma en ejecución: revisar a mano)' }); continue; }
      try {
        const info = SH.analyze(SH.parse(code));
        if (info.errors.length) { failures.push({ where, code, why: info.errors.join('; ') }); continue; }
        info.calls.forEach((c) => calls.add(c)); info.reads.forEach((r) => reads.add(r)); info.methods.forEach((x) => methods.add(x));
      } catch (e) { failures.push({ where, code, why: e.message }); }
    }
  }
  const badMethods = [...methods].filter((x) => !SH.DOM_METHODS[x]);
  const badNames = [...calls, ...reads].filter((x) => SH.NEVER.test(x) || SH.NEVER.test(x.split('.').pop()));
  return { handlers, failures, calls: [...calls].sort(), reads: [...reads].sort(), methods: [...methods].sort(), badMethods, badNames };
}

export function allowlistSource(a) {
  const fmt = (xs) => '[\n' + xs.map((x) => `    '${x}'`).join(',\n') + '\n  ]';
  return `// GENERADO por scripts/handlers-audit.mjs --write: NO editar a mano.
// Funciones globales que un manejador en línea (onclick="...") puede llamar (calls) y nombres globales que puede leer (reads).
// Salen de los manejadores que el propio código de la app contiene; js/safe-handlers.js no ejecuta nada fuera de esta lista.
self.__PX_HANDLER_ALLOW = {
  calls: ${fmt(a.calls)},
  reads: ${fmt(a.reads)}
};
`;
}

if (process.argv[1] && process.argv[1].endsWith('handlers-audit.mjs')) {
  const a = audit();
  const arg = process.argv[2];
  if (arg === '--list') { for (const h of a.handlers) console.log(`${h.where}  on${h.ev}="${h.code.slice(0, 110)}"`); }
  console.log(`manejadores: ${a.handlers.length} | funciones permitidas: ${a.calls.length} | lecturas: ${a.reads.length} | métodos: ${a.methods.join(', ')}`);
  for (const f of a.failures) console.log(`NO ENTIENDE  ${f.where}  ${f.why}\n    ${String(f.code).slice(0, 200).replace(/\n/g, ' ')}`);
  for (const m of a.badMethods) console.log(`MÉTODO NO PERMITIDO: .${m}()`);
  for (const n of a.badNames) console.log(`NOMBRE PROHIBIDO en un manejador: ${n}`);
  if (arg === '--write') {
    if (a.failures.length || a.badMethods.length || a.badNames.length) { console.log('No se escribe la lista mientras haya problemas.'); process.exit(1); }
    fs.writeFileSync(ALLOW_FILE, allowlistSource(a));
    console.log('escrito js/handler-allowlist.js');
  } else {
    const cur = fs.existsSync(ALLOW_FILE) ? fs.readFileSync(ALLOW_FILE, 'utf8').replace(/\r\n/g, '\n') : '';
    const stale = cur !== allowlistSource(a);
    if (stale) console.log('js/handler-allowlist.js está desactualizada: corre  node scripts/handlers-audit.mjs --write');
    process.exit(a.failures.length || a.badMethods.length || a.badNames.length || stale ? 1 : 0);
  }
}
