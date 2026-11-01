// migrations/xp-events.sql contra un PostgreSQL de verdad (uno desechable que levanta la propia prueba, sin
// credenciales ni Supabase): disparador de lecciones, tope diario, lecciones ajenas, cofre del nodo y permisos.
// Se omite si no hay binarios de PostgreSQL (PG_BIN, la ruta de Windows de siempre o /usr/lib/postgresql) o en el CI.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);

function findBin() {
  const candidates = [process.env.PG_BIN, 'C:/Program Files/PostgreSQL/16/bin', 'C:/Program Files/PostgreSQL/17/bin'];
  try { for (const v of fs.readdirSync('/usr/lib/postgresql')) candidates.push(`/usr/lib/postgresql/${v}/bin`); } catch { /* sin PostgreSQL */ }
  return candidates.filter(Boolean).find((d) => fs.existsSync(path.join(d, exe('initdb'))));
}
const bin = findBin();
const skip = (process.env.CI && 'se omite en el CI (corre en la máquina de desarrollo)')
  || (!bin && 'no hay binarios de PostgreSQL (define PG_BIN)')
  || (typeof process.getuid === 'function' && process.getuid() === 0 && 'initdb no corre como root');

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});
const run = (cmd, args, opts = {}) => spawnSync(path.join(bin, exe(cmd)), args, { encoding: 'utf8', ...opts });

let dataDir = null;
after(() => {
  if (dataDir) {
    run('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop']);
    fs.rmSync(path.dirname(dataDir), { recursive: true, force: true });
  }
});

test('xp-events.sql: lecciones, tope diario, lecciones ajenas, cofre del nodo y permisos', { skip, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-pg-'));
  dataDir = path.join(dir, 'data');
  const init = run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale']);
  assert.equal(init.status, 0, init.stderr);
  const port = await freePort();
  const start = run('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' }); // sin pipes: el servidor las hereda y spawnSync no volvería
  assert.equal(start.status, 0, 'pg_ctl start falló; revisa pg.log');

  const psql = (file) => run('psql', ['-U', 'postgres', '-h', '127.0.0.1', '-p', String(port), '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-f', file]);
  const stub = psql(path.join(HERE, 'sql', 'xp-events.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = psql(path.join(HERE, 'sql', 'xp-events.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /XP_EVENTS_SQL_OK/);
});
