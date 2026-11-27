// Visor de paquetes HTML/SCORM por la ruta leccion-visor/ del service worker (js/lesson-frame.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/lesson-frame.js';

const L = globalThis.LessonFrame;
const SCOPE = 'https://clases.yoaprendo.online/';
const PROJ = 'https://abc123.supabase.co';
const ENTRY = `${PROJ}/functions/v1/serve-scorm-entry?path=${encodeURIComponent('lessons/l1/pkg x/index.html')}&lang=es`;

test('serve-scorm-entry se traduce al archivo público de course-content (conserva los demás parámetros)', () => {
  assert.equal(L.entryToStorageUrl(ENTRY), `${PROJ}/storage/v1/object/public/course-content/lessons/l1/pkg%20x/index.html?lang=es`);
  assert.equal(L.entryToStorageUrl('https://x.org/a.html'), 'https://x.org/a.html');
  // Una ruta con «..» no se traduce (se queda como estaba y no pasa la validación del visor).
  const bad = `${PROJ}/functions/v1/serve-scorm-entry?path=${encodeURIComponent('lessons/../../secret')}`;
  assert.equal(L.entryToStorageUrl(bad), new URL(bad).href);
});

test('ida y vuelta: dirección del visor <-> Storage, con pxscope solo hacia el service worker', () => {
  const storage = L.entryToStorageUrl(ENTRY);
  const frame = L.frameUrlFor(storage, SCOPE, 'u1:l1');
  assert.equal(frame, 'https://clases.yoaprendo.online/leccion-visor/abc123.supabase.co/storage/v1/object/public/course-content/lessons/l1/pkg%20x/index.html?lang=es&pxscope=u1%3Al1');
  assert.equal(L.upstreamFor(frame, SCOPE), storage);
  // Recurso relativo del paquete (resuelto por el navegador dentro de la misma carpeta).
  const css = new URL('css/app.css', frame).href;
  assert.equal(L.upstreamFor(css, SCOPE), `${PROJ}/storage/v1/object/public/course-content/lessons/l1/pkg%20x/css/app.css`);
});

test('la app servida en un subdirectorio (GitHub Pages) también funciona', () => {
  const scope = 'https://billiog.github.io/proyectoX/';
  const f = L.frameUrlFor(`${PROJ}/storage/v1/object/public/c/a/index.html`, scope);
  assert.ok(f.startsWith('https://billiog.github.io/proyectoX/leccion-visor/abc123.supabase.co/'));
  assert.equal(L.upstreamFor(f, scope), `${PROJ}/storage/v1/object/public/c/a/index.html`);
});

test('solo acepta archivos PÚBLICOS de Storage de Supabase', () => {
  const r = (rest) => L.upstreamFor(`${SCOPE}leccion-visor/${rest}`, SCOPE);
  assert.equal(r('evil.com/storage/v1/object/public/c/x.html'), null);
  assert.equal(r('abc.supabase.co.evil.com/storage/v1/object/public/c/x.html'), null);
  assert.equal(r('abc.supabase.co/storage/v1/object/sign/c/x.html'), null);
  assert.equal(r('abc.supabase.co/rest/v1/students'), null);
  assert.equal(r('abc.supabase.co'), null);
  assert.equal(L.upstreamFor('https://otro.sitio/leccion-visor/abc.supabase.co/storage/v1/object/public/c/x.html', SCOPE), null);
  assert.equal(L.frameUrlFor('http://abc.supabase.co/storage/v1/object/public/c/x.html', SCOPE), null);
  assert.equal(L.frameUrlFor('https://abc.supabase.co:8443/storage/v1/object/public/c/x.html', SCOPE), null);
});

test('tipos de archivo y política del documento del paquete', () => {
  assert.match(L.contentTypeFor('/a/index.HTML'), /^text\/html/);
  assert.match(L.contentTypeFor('/a/app.js'), /^text\/javascript/);
  assert.equal(L.contentTypeFor('/a/x.woff2'), 'font/woff2');
  assert.equal(L.contentTypeFor('/a/sin-extension'), 'application/octet-stream');
  assert.ok(L.isHtmlPath('/a/b.htm') && !L.isHtmlPath('/a/b.js'));
  assert.match(L.FRAME_CSP, /script-src [^;]*'unsafe-inline'/);
  assert.match(L.FRAME_CSP, /object-src 'none'/);
  assert.match(L.FRAME_CSP, /frame-ancestors 'self'/);
  assert.doesNotMatch(L.FRAME_CSP, /base-uri/);
});

test('almacenamiento aislado: se inserta antes de los scripts del paquete y no rompe el HTML', () => {
  const html = '<!doctype html><html><head><title>x</title><script>localStorage.a=1</script></head><body></body></html>';
  const out = L.withIsolatedStorage(html, 'u1:l1');
  assert.ok(out.indexOf('px:u1:l1:') < out.indexOf('localStorage.a=1'));
  assert.ok(out.startsWith('<!doctype html><html><head><script>'));
  assert.equal(L.withIsolatedStorage(html, null), html);
  // Un valor con «</script>» no puede cerrar la etiqueta del parche.
  assert.doesNotMatch(L.withIsolatedStorage('<p>x</p>', 'a</script><b>'), /a<\/script><b>/);
});
