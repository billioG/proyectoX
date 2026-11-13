// Actualizar el servidor desde la plataforma en línea («Actualizar servidores», migrations/node-remote-update.sql): hace lo mismo que
// `install.sh --update` pero sin SSH: git pull (solo avance, nunca pisa cambios) y, si cambiaron las dependencias, npm ci.
// Si algo falla, vuelve a la versión anterior y deja el motivo para mostrarlo en la plataforma. Quien lo llama reinicia el servicio
// (systemd lo vuelve a levantar) solo cuando hubo cambios. Lógica con comandos inyectados: se prueba sin red ni git.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function defaultRun(cmd, args, { cwd, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim(), error });
    });
  });
}

const short = (text, max = 180) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Un corte de luz puede dejar objetos de git vacíos o a medias: `git pull` falla para siempre y el nodo no vuelve a actualizarse.
const DAMAGE_PATTERN = /is empty|bad object|cannot read existing object|invalid index-pack|loose object .* is corrupt|object file .* is empty/i;

/** Borra los archivos de 0 bytes dentro de `dir` (recursivo, sin seguir symlinks). Devuelve cuántos borró. */
export function removeEmptyFiles(dir, fsImpl = fs) {
  let removed = 0;
  let entries;
  try { entries = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { removed += removeEmptyFiles(full, fsImpl); continue; }
    if (!entry.isFile()) continue;
    try {
      if (fsImpl.lstatSync(full).size === 0) { fsImpl.unlinkSync(full); removed++; }
    } catch { /* si no se puede borrar, git lo dirá en el reintento */ }
  }
  return removed;
}

export function createSelfUpdate({ appDir, nodeDir = path.join(appDir, 'school-node'), run = defaultRun, readFile = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }, fsImpl = fs, tmpRoot = os.tmpdir() } = {}) {
  const gitDir = path.join(appDir, '.git');
  const lockSignature = () => `${readFile(path.join(nodeDir, 'package.json'))}\n${readFile(path.join(nodeDir, 'package-lock.json'))}`;

  // Segundo recurso: clona de nuevo y reemplaza SOLO <appDir>/.git (config.json y data/ no están en git y no se tocan).
  async function recloneGitDir() {
    const url = await run('git', ['-C', appDir, 'remote', 'get-url', 'origin']);
    if (!url.ok || !url.stdout) return { ok: false, reason: 'no se pudo leer la dirección de origen del repositorio' };
    let tmp = '';
    try {
      tmp = fsImpl.mkdtempSync(path.join(tmpRoot, 'quetzal-reclone-'));
      const dest = path.join(tmp, 'repo');
      const clone = await run('git', ['clone', '--quiet', url.stdout, dest], { cwd: tmp, timeoutMs: 600_000 });
      if (!clone.ok) return { ok: false, reason: `no se pudo clonar de nuevo: ${short(clone.stderr || clone.stdout || clone.error?.message)}` };
      const staged = `${gitDir}.nuevo`;
      fsImpl.rmSync(staged, { recursive: true, force: true });
      try { fsImpl.renameSync(path.join(dest, '.git'), staged); } catch { fsImpl.cpSync(path.join(dest, '.git'), staged, { recursive: true }); } // otro disco: copia
      fsImpl.rmSync(gitDir, { recursive: true, force: true });
      fsImpl.renameSync(staged, gitDir);
      const reset = await run('git', ['-C', appDir, 'reset', '--hard', 'HEAD']);
      if (!reset.ok) return { ok: false, reason: `se reemplazó el repositorio pero no se pudo restaurar los archivos: ${short(reset.stderr || reset.stdout || reset.error?.message)}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `no se pudo reemplazar el repositorio: ${short(e?.message)}` };
    } finally {
      if (tmp) { try { fsImpl.rmSync(tmp, { recursive: true, force: true }); } catch { /* el temporal se limpia solo con el sistema */ } }
    }
  }

  // Repara el repositorio dañado y reintenta una vez. Devuelve { ok, recloned?, reason? }.
  async function repair(firstError) {
    removeEmptyFiles(path.join(gitDir, 'objects'), fsImpl);
    const fetched = await run('git', ['-C', appDir, 'fetch', 'origin']);
    const retry = await run('git', ['-C', appDir, 'pull', '--ff-only']);
    if (retry.ok) return { ok: true };
    const retryError = short(retry.stderr || retry.stdout || retry.error?.message);
    const headOk = await run('git', ['-C', appDir, 'cat-file', '-e', 'HEAD^{commit}']);
    if (headOk.ok) return { ok: false, reason: retryError || short(firstError) };
    const re = await recloneGitDir();
    if (re.ok) return { ok: true, recloned: true };
    return { ok: false, reason: `${re.reason}${fetched.ok ? '' : ` (${short(fetched.stderr || fetched.stdout || fetched.error?.message, 100)})`}` };
  }

  /** @returns {Promise<{ ok: boolean, changed: boolean, from?: string, to?: string, error?: string }>} */
  async function update() {
    const head = await run('git', ['-C', appDir, 'rev-parse', 'HEAD']);
    if (!head.ok || !head.stdout) {
      return { ok: false, changed: false, error: 'Este servidor no se instaló con git: actualízalo una vez con install.sh --update.' };
    }
    const from = head.stdout;
    const lockBefore = lockSignature();

    // Si el servidor tiene archivos del programa modificados (una instalación anterior que reescribió package-lock.json, otro fin de línea, una
    // prueba a mano...), `git pull` se niega y el nodo queda para siempre en su versión. Esos cambios nunca son del programa oficial: se guardan
    // aparte con `git stash` (se pueden recuperar con `git stash list`) y se actualiza. config.json y data/ no se tocan (no están en git).
    const dirty = await run('git', ['-C', appDir, 'status', '--porcelain', '--untracked-files=no']);
    if (dirty.ok && dirty.stdout) {
      const saved = await run('git', ['-C', appDir, 'stash', 'push', '-m', `quetzal-antes-de-actualizar-${new Date().toISOString().slice(0, 10)}`]);
      if (!saved.ok) return { ok: false, changed: false, from, error: `El servidor tiene cambios locales y no se pudieron guardar aparte: ${short(saved.stderr || saved.stdout || saved.error?.message)}` };
    }
    const pull = await run('git', ['-C', appDir, 'pull', '--ff-only']);
    if (!pull.ok) {
      const detail = short(pull.stderr || pull.stdout || pull.error?.message);
      if (!DAMAGE_PATTERN.test(`${pull.stderr || ''} ${pull.stdout || ''}`)) return { ok: false, changed: false, from, error: `No se pudo descargar la versión nueva: ${detail}` };
      const fixed = await repair(detail);
      if (!fixed.ok) return { ok: false, changed: false, from, error: `El repositorio del servidor estaba dañado (probablemente por un corte de luz); se intentó repararlo y no fue posible: ${fixed.reason || detail}` };
    }

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
