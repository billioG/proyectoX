// Visor de paquetes HTML/SCORM (js/lesson-frame.js + ruta leccion-visor/ del service worker) con la CSP de la app ACTIVA.
// Hasta la v1.0.286 el paquete se metía con srcdoc, que hereda la CSP de index.html (sin scripts en línea ni <base> externo): las
// lecciones no arrancaban en producción y las pruebas no lo veían porque saltan la CSP (playwright.config.js, bypassCSP).
// Storage de Supabase se simula con context.route (en Chromium también intercepta los pedidos del service worker).
const { test, expect } = require('@playwright/test');

test.use({ bypassCSP: false, serviceWorkers: 'allow' });

const STORAGE = 'https://prueba.supabase.co/storage/v1/object/public/course-content/lessons/l1';
const PACKAGE_HTML = `<!doctype html><html><head><title>Paquete</title>
<script>localStorage.setItem('avance', '42');</script>
<script src="js/app.js"></script></head>
<body><p id="estado">sin script</p><img src="img/punto.svg"></body></html>`;

test('un paquete con scripts en línea y archivos relativos arranca dentro del visor, con su almacenamiento aislado', async ({ page, context }) => {
  const served = [];
  await context.route(`${STORAGE}/**`, (route) => {
    const url = route.request().url();
    served.push(url);
    // Supabase entrega el HTML público como text/plain: el service worker tiene que corregirlo.
    if (url.endsWith('/index.html')) return route.fulfill({ status: 200, contentType: 'text/plain', body: PACKAGE_HTML });
    if (url.endsWith('/js/app.js')) return route.fulfill({ status: 200, contentType: 'text/plain', body: "document.addEventListener('DOMContentLoaded',function(){document.getElementById('estado').textContent='script corrió:'+localStorage.getItem('avance');});" });
    if (url.endsWith('/img/punto.svg')) return route.fulfill({ status: 200, contentType: 'text/plain', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' });
    return route.fulfill({ status: 404, body: '' });
  });
  const blocked = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text()) && !/inline event handler/i.test(m.text())) blocked.push(m.text()); });

  await page.goto('/');
  await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
  // La app registra el service worker al arrancar; se espera a que esté activo y conozca la ruta.
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const ok = await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => r(e.data?.lessonFrame); reg.active.postMessage({ type: 'PX_LESSON_FRAME_PING' }, [ch.port2]); setTimeout(() => r(false), 3000); });
    return ok ? reg.scope : null;
  });
  expect(scope).toBeTruthy();

  await page.evaluate(async ({ storage }) => {
    await import('./js/lesson-frame.js');
    const entry = 'https://prueba.supabase.co/functions/v1/serve-scorm-entry?path=' + encodeURIComponent('lessons/l1/index.html');
    const src = globalThis.LessonFrame.frameUrlFor(globalThis.LessonFrame.entryToStorageUrl(entry), (await navigator.serviceWorker.ready).scope, 'u1:l1');
    const f = document.createElement('iframe'); f.id = 'visor-prueba'; f.src = src; document.body.appendChild(f);
  }, { storage: STORAGE });

  const frame = page.frameLocator('#visor-prueba');
  await expect(frame.locator('#estado')).toHaveText('script corrió:42', { timeout: 15_000 });
  // El paquete guardó «avance» con el prefijo del usuario y la lección, no con la clave suelta que verían los demás.
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('avance')));
  expect(keys).toEqual(['px:u1:l1:avance']);
  expect(served.some((u) => u.endsWith('/img/punto.svg'))).toBe(true);
  expect(blocked, blocked.join(' | ')).toEqual([]);
});
