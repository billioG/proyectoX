// Pantalla «Bitácora de seguridad» con la app real en el navegador (celular y computadora): lista, filtro, «Ver más», errores y texto escapado.
// La respuesta de la base se simula (no hay sesión de administrador ni internet): se prueba la pantalla, no el servidor.
const { test, expect } = require('@playwright/test');

async function openScreen(page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort('failed'));
  await page.goto('/');
  await page.waitForSelector('#login-username');
  await page.evaluate(async () => {
    await import('/js/audit-log.js');
    // La sección real ya está en index.html (oculta hasta entrar como administrador): se muestra para poder tocarla.
    document.getElementById('view-audit-log').style.display = 'block';
    window.__calls = [];
    const row = (i, over = {}) => ({ id: i, created_at: new Date(Date.UTC(2026, 10, 10, 20, 0, 0) - i * 60_000).toISOString(), actor_id: 'a1', actor_name: 'Admin Prueba', actor_role: 'admin', action: 'class_password_changed', target_type: 'class', target_id: 'ESC1|Primero|A', school_code: 'ESC1', details: { grade: 'Primero', section: 'A', protegida: true }, source: 'db:class_passwords', ...over });
    window.__row = row;
    // Sin internet la librería de CDN no carga y no hay cliente: se simula uno (esta prueba es de la pantalla, no de Supabase).
    window._supabase = window._supabase || {};
    window._supabase.rpc = async (fn, args) => {
      window.__calls.push([fn, args]);
      if (window.__mode === 'missing') return { data: null, error: { code: '42883', message: 'function get_security_audit_log does not exist' } };
      if (window.__mode === 'denied') return { data: null, error: { message: 'Solo un administrador puede ver la bitácora' } };
      if (window.__mode === 'empty') return { data: [], error: null };
      const all = Array.from({ length: 53 }, (_, i) => row(i + 1, i === 0 ? { action: 'students_deleted', details: { count: 3, schools: ['ESC1'] }, actor_name: '<img src=x onerror="window.__xss=1">' } : {}));
      const filtered = args.p_action ? all.filter((r) => r.action === args.p_action) : all;
      const rows = args.p_before ? filtered.filter((r) => r.created_at < args.p_before) : filtered;
      return { data: rows.slice(0, args.p_limit), error: null };
    };
  });
}

test('lista las acciones, escapa el texto, filtra y pagina con «Ver más»', async ({ page }) => {
  test.setTimeout(60_000);
  await openScreen(page);
  await page.evaluate(() => window.loadAuditLog());
  await expect(page.locator('#audit-list [data-audit-id]')).toHaveCount(50);
  await expect(page.locator('#audit-list')).toContainText('Alumnos eliminados');
  await expect(page.locator('#audit-list')).toContainText('3 alumnos · de ESC1');
  await expect(page.locator('#audit-list')).toContainText('Contraseña de clase cambiada');
  await expect(page.locator('#audit-list')).toContainText('Primero A · con contraseña');
  await expect(page.locator('#audit-log-container')).toContainText('No se puede modificar ni borrar');
  // El HTML que vino en el nombre NO se ejecuta ni se dibuja como etiqueta.
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('#audit-list img').count()).toBe(0);

  // «Ver más» pide las anteriores a la última fecha mostrada y agrega las 3 que faltan.
  // Toque directo: encima hay la pantalla de ingreso (no hay sesión de administrador en esta prueba) y taparía el clic del mouse.
  await page.locator('#audit-more-btn').evaluate((el) => el.click());
  await expect(page.locator('#audit-list [data-audit-id]')).toHaveCount(53);
  await expect(page.locator('#audit-more')).toContainText('Fin del registro');
  const calls = await page.evaluate(() => window.__calls);
  expect(calls[0][1]).toMatchObject({ p_limit: 50, p_action: null, p_before: null });
  expect(calls[1][1].p_before).toBeTruthy();

  // Filtro por acción: vuelve a pedir con esa acción.
  await page.locator('#audit-action').evaluate((el) => { el.value = 'students_deleted'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#audit-list [data-audit-id]')).toHaveCount(1);
  expect((await page.evaluate(() => window.__calls)).at(-1)[1].p_action).toBe('students_deleted');
});

test('estados: vacío, falta la migración y quien no es administrador', async ({ page }) => {
  test.setTimeout(60_000);
  await openScreen(page);
  await page.evaluate(() => { window.__mode = 'empty'; return window.loadAuditLog(); });
  await expect(page.locator('#audit-list')).toContainText('Todavía no hay acciones registradas');
  await page.evaluate(() => { window.__mode = 'missing'; return window.loadAuditLog(); });
  await expect(page.locator('#audit-list')).toContainText('todavía no está activa');
  await expect(page.locator('#audit-list')).toContainText('security-audit-log.sql');
  await page.evaluate(() => { window.__mode = 'denied'; return window.loadAuditLog(); });
  await expect(page.locator('#audit-list')).toContainText('Solo un administrador puede ver la bitácora');
});

test('el acceso del menú existe una sola vez y la vista está oculta al cargar', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#login-username');
  expect(await page.locator("[onclick=\"nav('audit-log')\"]").count()).toBe(1);
  await expect(page.locator('#view-audit-log')).toBeHidden();
});
