// Prueba de carga del nodo: simula N tablets que abren la app a la vez y se quedan conectadas.
//
//   node school-node/herramientas/prueba-de-carga.mjs --url http://quetzal.local --alumnos 30 --segundos 60
//
// Cada «tablet» baja la página principal con todos sus archivos (JS, CSS, imágenes) y luego consulta el estado del servidor
// cada 5 a 10 segundos, como hace la app abierta. Mide cuánto tarda en abrir cada tablet y cuántos errores hubo.
// No inicia sesión (no usa PIN de nadie): mide la parte que más pesa, que es servir la aplicación.
// Corre desde OTRA computadora de la misma red, no desde la Raspberry (si no, la prueba le quita fuerza al servidor).
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--url', 'http://quetzal.local').replace(/\/$/, '');
const N = Math.max(1, Number(arg('--alumnos', 20)));
const SECONDS = Math.max(5, Number(arg('--segundos', 30)));
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

async function get(url) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
    const buf = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, bytes: buf.byteLength, ms: performance.now() - t0, text: res.headers.get('content-type')?.includes('html') ? new TextDecoder().decode(buf) : '' };
  } catch (e) {
    return { ok: false, status: 0, bytes: 0, ms: performance.now() - t0, error: e.name === 'AbortError' ? 'tardó más de 30 s' : e.message, text: '' };
  } finally { clearTimeout(timer); }
}

function assetsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
    const u = m[1];
    if (/^(https?:)?\/\//.test(u) || u.startsWith('data:') || u.startsWith('mailto:') || u.startsWith('javascript:')) continue;
    if (/\.(js|mjs|css|png|jpg|jpeg|svg|webp|ico|woff2?|json)(\?|$)/i.test(u)) out.add(u.startsWith('/') ? u : `/${u}`);
  }
  return [...out];
}

const stats = { opens: [], errors: [], polls: [], bytes: 0, requests: 0 };
let stop = false;

async function tablet(i) {
  await sleep(Math.random() * 2000); // no abren todas en el mismo milisegundo
  const t0 = performance.now();
  const page = await get(`${BASE}/`);
  stats.requests++; stats.bytes += page.bytes;
  if (!page.ok) { stats.errors.push(`tablet ${i + 1}: la página principal falló (${page.error || page.status})`); return; }
  const files = assetsOf(page.text);
  let failed = 0;
  // Un navegador baja unos 6 archivos a la vez por servidor.
  const queue = files.slice();
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const r = await get(BASE + queue.shift());
      stats.requests++; stats.bytes += r.bytes;
      if (!r.ok) { failed++; stats.errors.push(`tablet ${i + 1}: ${r.error || r.status}`); }
    }
  }));
  stats.opens.push({ ms: performance.now() - t0, failed });
  while (!stop) {
    await sleep(5000 + Math.random() * 5000);
    if (stop) break;
    const r = await get(`${BASE}/api/node/status`);
    stats.requests++; stats.bytes += r.bytes; stats.polls.push(r.ms);
    if (!r.ok) stats.errors.push(`tablet ${i + 1}: estado ${r.error || r.status}`);
  }
}

console.log(`Probando ${BASE} con ${N} tablets durante ${SECONDS} s...`);
const first = await get(`${BASE}/api/node/status`);
if (!first.ok) { console.error(`No se pudo hablar con ${BASE} (${first.error || first.status}). ¿Es la dirección correcta y estás en la misma red?`); process.exit(2); }
const started = performance.now();
const all = Array.from({ length: N }, (_, i) => tablet(i));
setTimeout(() => { stop = true; }, SECONDS * 1000);
await Promise.all(all);
const secs = (performance.now() - started) / 1000;

const opens = stats.opens.map((o) => o.ms);
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
console.log(`\nResultado con ${N} tablets (${stats.opens.length} lograron abrir la app):`);
console.log(`  Abrir la app:    la mitad en ${s(pct(opens, 50))}, el 95 % en ${s(pct(opens, 95))}, la más lenta ${s(Math.max(0, ...opens))}`);
console.log(`  Consulta de estado: la mitad en ${Math.round(pct(stats.polls, 50))} ms, el 95 % en ${Math.round(pct(stats.polls, 95))} ms`);
console.log(`  Datos servidos:  ${(stats.bytes / 1048576).toFixed(1)} MB en ${secs.toFixed(0)} s (${stats.requests} pedidos)`);
console.log(`  Errores:         ${stats.errors.length}${stats.errors.length ? `\n    - ${[...new Set(stats.errors)].slice(0, 5).join('\n    - ')}` : ''}`);
const slow = pct(opens, 95) > 15_000, bad = stats.errors.length > 0 || stats.opens.length < N;
console.log(`\n  Veredicto: ${bad ? 'NO ALCANZA con esta cantidad (hubo errores o tablets que no pudieron abrir).' : slow ? 'JUSTO: funciona, pero abrir la app tarda más de 15 s en el 5 % más lento.' : 'BIEN: todas abrieron sin errores y en tiempo razonable.'}`);
process.exit(bad ? 1 : 0);
