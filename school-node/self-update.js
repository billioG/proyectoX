// Actualizar el servidor desde la plataforma en línea («Actualizar servidores», migrations/node-remote-update.sql): hace lo mismo que
// `install.sh --update` pero sin SSH: git pull (solo avance, nunca pisa cambios) y, si cambiaron las dependencias, npm ci.
// Si algo falla, vuelve a la versión anterior y deja el motivo para mostrarlo en la plataforma. Quien lo llama reinicia el servicio
// (systemd lo vuelve a levantar) solo cuando hubo cambios. Lógica con comandos inyectados: se prueba sin red ni git.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function defaultRun(cmd, args, { cwd, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim(), error });
    });
  });
}

const short = (text, max = 180) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function createSelfUpdate({ appDir, nodeDir = path.join(appDir, 'school-node'), run = defaultRun, readFile = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } } } = {}) {
  const lockSignature = () => `${readFile(path.join(nodeDir, 'package.json'))}\n${readFile(path.join(nodeDir, 'package-lock.json'))}`;

  /** @returns {Promise<{ ok: boolean, changed: boolean, from?: string, to?: string, error?: string }>} */
  async function update() {
    const head = await run('git', ['-C', appDir, 'rev-parse', 'HEAD']);
    if (!head.ok || !head.stdout) {
      return { ok: false, changed: false, error: 'Este servidor no se instaló con git: actualízalo una vez con install.sh --update.' };
    }
    const from = head.stdout;
    const lockBefore = lockSignature();

    const pull = await run('git', ['-C', appDir, 'pull', '--ff-only']);
    if (!pull.ok) return { ok: false, changed: false, from, error: `No se pudo descargar la versión nueva: ${short(pull.stderr || pull.stdout || pull.error?.message)}` };

    const after = await run('git', ['-C', appDir, 'rev-parse', 'HEAD']);
    const to = after.ok && after.stdout ? after.stdout : from;
    if (to === from) return { ok: true, changed: false, from, to };

    if (lockSignature() !== lockBefore) {
      const npm = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev'], { cwd: nodeDir, timeoutMs: 600_000 });
      if (!npm.ok) {
        await run('git', ['-C', appDir, 'reset', '--hard', from]); // vuelve a lo que ya funcionaba
        return { ok: false, changed: false, from, error: `Falló la instalación de dependencias; se dejó la versión anterior: ${short(npm.stderr || npm.stdout || npm.error?.message)}` };
      }
    }
    return { ok: true, changed: true, from, to };
  }

  return { update };
}
