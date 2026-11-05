// Primer encendido de un nodo clonado (school-node/imagen/quetzal-firstboot.sh), con carpetas temporales en vez de /boot y /var.
// Necesita bash (Linux, Mac o Git Bash); si no hay, se omite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fwd = (p) => p.split(path.sep).join('/');
const SCRIPT = fwd(path.resolve('school-node/imagen/quetzal-firstboot.sh'));
const hasBash = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' }).stdout?.trim() === 'ok';
const skip = hasBash ? false : 'no hay bash en esta computadora';

function setup(settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-fb-'));
  const boot = path.join(root, 'boot'), node = path.join(root, 'quetzal', 'school-node'), state = path.join(root, 'state');
  fs.mkdirSync(boot); fs.mkdirSync(node, { recursive: true });
  if (settings !== null) fs.writeFileSync(path.join(boot, 'quetzal.txt'), settings);
  const run = () => spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, QUETZAL_BOOT_DIR: fwd(boot), QUETZAL_NODE_DIR: fwd(node), QUETZAL_STATE_DIR: fwd(state), QUETZAL_USER: 'pi', SYSTEMCTL: 'true', SKIP_CHOWN: '1', NODE_BIN: fwd(process.execPath) },
  });
  return { boot, node, state, run, config: () => JSON.parse(fs.readFileSync(path.join(node, 'config.json'), 'utf8')) };
}

test('crea config.json con el token y un código de docente nuevo, y borra el token de la partición visible', { skip }, () => {
  const t = setup('# comentario\r\nTOKEN=abcd1234EFGH5678\r\nWIFI_SSID=\r\nWIFI_PASS=\r\n');
  const r = t.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = t.config();
  assert.equal(c.nodeToken, 'abcd1234EFGH5678');
  assert.match(c.teacherCode, /^\d{6}$/);
  assert.equal(c.port, 80);
  assert.equal(c.dataDir, './data');
  assert.match(fs.readFileSync(path.join(t.boot, 'quetzal-codigo-docente.txt'), 'utf8'), new RegExp(c.teacherCode));
  assert.match(fs.readFileSync(path.join(t.boot, 'quetzal.txt'), 'utf8'), /TOKEN=\(ya usado\)/);
  assert.equal(fs.existsSync(path.join(t.state, 'firstboot.done')), true);
});

test('sin quetzal.txt se instala igual, con el token pendiente (se pega después en Quetzal)', { skip }, () => {
  const t = setup(null);
  assert.equal(t.run().status, 0);
  assert.match(t.config().nodeToken, /^PEGAR_ACA/);
});

test('un token con caracteres raros se ignora y nunca llega al código (nada se ejecuta)', { skip }, () => {
  const marker = path.join(os.tmpdir(), `quetzal-pwned-${process.pid}`);
  const t = setup(`TOKEN=abc; touch ${fwd(marker)} #xx\nWIFI_SSID=$(touch ${fwd(marker)})\n`);
  const r = t.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(t.config().nodeToken, /^PEGAR_ACA/);
  assert.equal(fs.existsSync(marker), false);
});

test('corre una sola vez: un segundo encendido no cambia el código de docente ni pisa la configuración', { skip }, () => {
  const t = setup('TOKEN=abcd1234EFGH5678\n');
  t.run();
  const first = t.config();
  fs.writeFileSync(path.join(t.boot, 'quetzal.txt'), 'TOKEN=otroTOKEN99999999\n');
  assert.match(t.run().stdout, /ya se hizo/);
  assert.deepEqual(t.config(), first);
});

test('si config.json ya existe (alguien lo puso a mano) se respeta', { skip }, () => {
  const t = setup('TOKEN=abcd1234EFGH5678\n');
  fs.writeFileSync(path.join(t.node, 'config.json'), JSON.stringify({ nodeToken: 'manual', teacherCode: '999999', port: 8080 }));
  assert.equal(t.run().status, 0);
  assert.equal(t.config().teacherCode, '999999');
});

test('los scripts de imagen y el instalador tienen sintaxis de bash válida', { skip }, () => {
  for (const f of ['school-node/imagen/quetzal-firstboot.sh', 'school-node/imagen/prepare-image.sh', 'school-node/install.sh']) {
    const r = spawnSync('bash', ['-n', fwd(path.resolve(f))], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
