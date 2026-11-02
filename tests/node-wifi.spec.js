// Pantalla /wifi del nodo en un navegador de verdad, con un nmcli de mentira: el docente entra, busca redes, elige una, pone la clave
// (una mala se explica y no guarda nada) y se conecta. Se omite si better-sqlite3 no está compilado para este Node.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let node = null;
let skipReason = '';
let calls = () => [];

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword, emailHash } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  const state = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nmcli-pw-')), 'state.json');
  const fake = path.resolve(__dirname, '..', 'tests-unit', 'helpers', 'fake-nmcli.mjs');
  node = await helper.startNode({
    config: { nmcli: [process.execPath, fake, state], wifiPlatform: 'linux', cloudUrl: 'http://127.0.0.1:1' },
    rest: {
      teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
      },
    },
  });
  calls = () => (fs.existsSync(state + '.log') ? fs.readFileSync(state + '.log', 'utf8').trim().split('\n').map((x) => JSON.parse(x)) : []);
});
test.afterAll(async () => { if (node) await node.stop(); });

test('el docente entra a /wifi, ve las redes, se conecta a una y una clave mala se explica', async ({ page }) => {
  test.skip(!node, skipReason);
  await page.goto(`${node.base}/wifi`);
  await expect(page.getByRole('heading', { name: 'Conectar a Wi-Fi' })).toBeVisible();
  await expect(page.locator('#panel')).toBeHidden();

  await page.fill('#email', 'marta@escuela.com');
  await page.fill('#pass', 'equivocada');
  await page.click('#login button[type=submit]');
  await expect(page.locator('#login-msg')).toContainText('incorrectos');

  await page.fill('#pass', '654321');
  await page.click('#login button[type=submit]');
  await expect(page.locator('#state')).toContainText('Conectado a: CasaMia');
  expect(calls().length).toBeGreaterThan(0);

  await page.click('#scan');
  await expect(page.locator('#nets')).toContainText('Vecino:5G');
  await expect(page.locator('#nets')).toContainText('Abierta');

  await page.locator('#nets .net', { hasText: 'Vecino:5G' }).click();
  await expect(page.locator('#connect')).toBeVisible();
  await page.fill('#pw', 'mala-clave-1');
  await page.click('#go');
  await expect(page.locator('#msg')).toContainText('revisa la contraseña');

  await page.fill('#pw', 'buena-clave-1');
  await page.click('#go');
  await expect(page.locator('#msg')).toContainText('Conectado a Vecino:5G');
  await expect(page.locator('#saved')).toContainText('Vecino:5G');
});
