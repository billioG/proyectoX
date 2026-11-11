// El nodo escolar funciona SIN internet, pero index.html descarga de CDN
// supabase-js (sin él la pantalla de login ni arranca), Font Awesome, la
// tipografía Inter y otras librerías. Sin internet esas descargas fallan, y
// en una red de router sin salida a internet suelen fallar con
// ERR_CERT_AUTHORITY_INVALID porque el router contesta él mismo.
//
// Solución: el nodo entrega index.html con esas direcciones cambiadas por las
// copias locales de vendor/cdn/ (ver vendor/cdn/README.md). La versión en la
// nube (GitHub Pages) no cambia: sigue usando los CDN.

// [texto original en index.html, reemplazo]. Cada uno debe aparecer al menos
// una vez en index.html (lo verifica tests-unit/offline-assets.test.mjs).
export const CDN_REPLACEMENTS = [
  ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'vendor/cdn/font-awesome-6.4.0/css/all.min.css'],
  ['https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap', 'vendor/cdn/inter/inter.css'],
  ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0', 'vendor/cdn/supabase-js-2.118.0.js'],
  // Cargador de librerías bajo demanda (window.loadLib): J = jsdelivr.
  ["J + 'jszip@3.10.1/dist/jszip.min.js'", "'vendor/cdn/jszip-3.10.1.min.js'"],
  ["J + 'driver.js@1.11.0/dist/driver.js.iife.js'", "'vendor/cdn/driver-1.js.iife.js'"],
  ["J + 'driver.js@1.11.0/dist/driver.css'", "'vendor/cdn/driver-1.css'"],
  ["J + 'canvas-confetti@1.9.2/dist/confetti.browser.min.js'", "'vendor/cdn/confetti-1.9.2.browser.min.js'"],
  ["J + 'jsqr@1.4.0/dist/jsQR.min.js'", "'vendor/cdn/jsqr-1.4.0.min.js'"],
];

// Solo sirve para importar PDF de alumnos (pesa más de 1 MB con su worker); el
// modo nodo no lo usa, así que no se copia.
export const CDN_NOT_VENDORED = ['pdf.js/3.11.174'];

const SRI_ATTRS = /\s+(?:integrity="[^"]*"|crossorigin="anonymous")/g;
const PRECONNECT_LINK = /^[ \t]*<link rel="preconnect"[^>]*>\r?\n/gm;

// La CSP de index.html permite los CDN; el nodo ya no les pide nada, así que se los quita (la política del nodo es más estricta que la de la nube).
const CSP_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const CDN_IN_CSP = /\s+https:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/g;

export function localizeIndexHtml(html) {
  // Las copias locales de vendor/ pueden no ser byte a byte las de la CDN (p. ej. driver.js): sin los atributos de integridad (SRI) y de CORS de las etiquetas.
  let out = html.replace(PRECONNECT_LINK, '').replace(SRI_ATTRS, '');
  for (const [from, to] of CDN_REPLACEMENTS) out = out.split(from).join(to);
  out = out.replace(CSP_META, (meta) => meta.replace(CDN_IN_CSP, ''));
  return out;
}

/** js/boot.js (cargador de librerías) lleva las mismas direcciones de CDN que antes estaban en index.html: el nodo lo entrega con las copias locales. */
export function localizeBootScript(js) {
  let out = js;
  for (const [from, to] of CDN_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}
