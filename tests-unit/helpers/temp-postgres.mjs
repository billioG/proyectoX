// Un PostgreSQL desechable para probar migraciones de verdad (sin Supabase ni credenciales): initdb en una carpeta
// temporal, arranque en un puerto libre y limpieza al final. Se omite si no hay binarios de PostgreSQL (PG_BIN, la
// ruta de Windows de siempre o /usr/lib/postgresql), si es root (initdb no corre) o en el CI.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);

function findBin() {
  const candidates = [process.env.PG_BIN, 'C:/Program Files/PostgreSQL/16/bin', 'C:/Program Files/PostgreSQL/17/bin'];
  try { for (const v of fs.readdirSync('/usr/lib/postgresql')) candidates.push(`/usr/lib/postgresql/${v}/bin`); } catch { /* sin PostgreSQL */ }
  return candidates.filter(Boolean).find((d) => fs.existsSync(path.join(d, exe('initdb'))));
}

const bin = findBin();
/** Motivo para omitir la prueba, o false si se puede correr. */
export const pgSkip = (process.env.CI && 'se omite en el CI (corre en la máquina de desarrollo)')
  || (!bin && 'no hay binarios de PostgreSQL (define PG_BIN)')
  || (typeof process.getuid === 'function' && process.getuid() === 0 && 'initdb no corre como root');

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});
const run = (cmd, args, opts = {}) => spawnSync(path.join(bin, exe(cmd)), args, { encoding: 'utf8', ...opts });

/** Levanta un servidor y devuelve { psql(file) -> resultado de spawnSync, stop() }. */
export async function startTempPostgres() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-pg-'));
  const dataDir = path.join(dir, 'data');
  const init = run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale']);
  if (init.status !== 0) throw new Error(`initdb falló: ${init.stderr}`);
  const port = await freePort();
  // Sin pipes en el arranque: el servidor las hereda y spawnSync no volvería.
  const start = run('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
  if (start.status !== 0) throw new Error('pg_ctl start falló; revisa pg.log');
  return {
    psql: (file) => run('psql', ['-U', 'postgres', '-h', '127.0.0.1', '-p', String(port), '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-f', file]),
    // Igual que psql pero asíncrono: para lanzar varias sesiones A LA VEZ (pruebas de concurrencia).
    psqlAsync: (file) => new Promise((resolve) => {
      const p = spawn(path.join(bin, exe('psql')), ['-U', 'postgres', '-h', '127.0.0.1', '-p', String(port), '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
      p.on('close', (status) => resolve({ status, stdout, stderr }));
    }),
    stop() {
      run('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop']);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
