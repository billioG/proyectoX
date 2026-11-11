// Integridad (SRI, sha384) de las librerías que la página carga desde CDN.
//   node scripts/sri-hashes.mjs            calcula los hashes desde las CDN y los imprime (JSON); redirige a scripts/sri-hashes.json para actualizarlos
//   node scripts/sri-hashes.mjs --check    compara la CDN con scripts/sri-hashes.json y falla si una CDN cambió un archivo
// Al subir la versión de una librería: cambia la URL aquí, regenera el JSON y copia el hash nuevo a js/boot.js (cargador), index.html y js/model-viewer.js
// (tests-unit/sri.test.mjs falla si alguno de los tres no coincide).
import crypto from 'node:crypto';
import fs from 'node:fs';

const J = 'https://cdn.jsdelivr.net/npm/', C = 'https://cdnjs.cloudflare.com/ajax/libs/';
export const URLS = [
  C + 'font-awesome/6.4.0/css/all.min.css',
  J + '@supabase/supabase-js@2.118.0',
  J + 'jszip@3.10.1/dist/jszip.min.js',
  J + 'driver.js@1.11.0/dist/driver.js.iife.js', J + 'driver.js@1.11.0/dist/driver.css',
  C + 'pdf.js/3.11.174/pdf.min.js',
  J + 'jsqr@1.4.0/dist/jsQR.min.js',
  J + 'canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  J + 'three@0.128.0/build/three.min.js', J + 'three@0.128.0/examples/js/controls/OrbitControls.js',
  J + 'three@0.128.0/examples/js/loaders/STLLoader.js', J + 'three@0.128.0/examples/js/loaders/OBJLoader.js', J + 'three@0.128.0/examples/js/loaders/GLTFLoader.js',
];

const hash = (buf) => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');

if (process.argv[1] && process.argv[1].endsWith('sri-hashes.mjs')) {
  const check = process.argv.includes('--check');
  const known = check ? JSON.parse(fs.readFileSync(new URL('./sri-hashes.json', import.meta.url), 'utf8')) : {};
  const table = {};
  let bad = 0;
  for (const u of URLS) {
    const res = await fetch(u);
    if (!res.ok) { console.error('ERROR', res.status, u); bad++; continue; }
    table[u] = hash(Buffer.from(await res.arrayBuffer()));
    if (check && known[u] !== table[u]) { console.error('DISTINTO', u, '\n  esperado', known[u], '\n  la CDN   ', table[u]); bad++; }
  }
  if (!check) console.log(JSON.stringify(table, null, 2));
  else if (!bad) console.log('Las ' + URLS.length + ' librerías coinciden con scripts/sri-hashes.json');
  process.exit(bad ? 1 : 0);
}
