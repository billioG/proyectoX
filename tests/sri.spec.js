// Integridad (SRI) con el navegador real y las CDN reales: el hash de cada librería coincide con lo que sirve la CDN (si no, el navegador la
// rechaza), el cargador window.loadLib las carga, y un hash equivocado SÍ se rechaza (la protección funciona de verdad). Necesita internet.
const { test, expect } = require('@playwright/test');
const TABLE = require('../scripts/sri-hashes.json');

test('las 13 librerías de CDN cargan con su hash y un hash equivocado se rechaza', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForSelector('#login-username');
  const results = await page.evaluate(async (table) => {
    const load = (url, integrity) => new Promise((resolve) => {
      const isCss = url.endsWith('.css');
      const el = document.createElement(isCss ? 'link' : 'script');
      if (isCss) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; }
      el.integrity = integrity; el.crossOrigin = 'anonymous';
      el.onload = () => resolve('ok'); el.onerror = () => resolve('bloqueada');
      document.head.appendChild(el);
    });
    const out = {};
    for (const [url, h] of Object.entries(table)) out[url] = await load(url, h);
    out.__malo = await load('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js?x=' + Date.now(), 'sha384-' + 'A'.repeat(64));
    return out;
  }, TABLE);
  const bad = Object.entries(results).filter(([k, v]) => k !== '__malo' && v !== 'ok');
  expect(bad, 'librerías que el navegador rechazó con su hash: ' + JSON.stringify(bad)).toEqual([]);
  expect(results.__malo, 'un hash equivocado debe bloquear la carga').toBe('bloqueada');
});

test('window.loadLib carga las librerías con integridad desde la CDN real', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForSelector('#login-username');
  const ok = await page.evaluate(() => window.loadLib('jszip', 'driver', 'confetti', 'jsqr', 'pdfjs'));
  expect(ok).toBe(true);
  expect(await page.evaluate(() => [typeof window.JSZip, typeof window.driver, typeof window.confetti, typeof window.jsQR, typeof window.pdfjsLib])).toEqual(['function', 'object', 'function', 'function', 'object']);
});
