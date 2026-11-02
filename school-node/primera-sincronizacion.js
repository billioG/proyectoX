// Verificador de la instalación del nodo escolar: espera a que el servidor arranque, hace la PRIMERA sincronización con la
// nube, espera a que baje todo (estudiantes, contraseñas de clase, archivos de los cursos) y dice, en español, qué falta.
// Lo llaman los instaladores (Windows y Raspberry) al terminar; también se puede correr a mano:
//   node primera-sincronizacion.js
// Códigos de salida: 0 = todo listo, 1 = falta algo (el mensaje dice qué), 2 = falta el token de la escuela.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = /^PEGAR/;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Lee el estado del nodo y lo traduce a «qué falta». `busy` = todavía está trabajando (no es un problema). */
export function describeStatus(s, { hasToken = true } = {}) {
  const problems = [];
  const files = Number(s?.pending?.files) || 0;
  if (!hasToken) problems.push('Falta el token de la escuela: pégalo en Quetzal (botón Docente → «Guardar y sincronizar») o ponlo en token.txt y vuelve a ejecutar el instalador.');
  if (!s?.last_sync_at) problems.push('Todavía no se sincronizó con la nube.');
  if (s?.sync_error) problems.push(`No se pudo sincronizar: ${s.sync_error}.`);
  if (s?.rest !== true && s?.last_sync_at) {
    const missing = Array.isArray(s.rest_missing) ? s.rest_missing : [];
    problems.push(missing.length
      ? `Clases sin contraseña: ${missing.join(', ')}. Ponles su contraseña de clase en Quetzal (como docente o administrador) y vuelve a sincronizar; mientras tanto el servidor usa el modo anterior (elegir clase y nombre con PIN).`
      : 'La aplicación normal todavía no está activa: faltan estudiantes o contraseñas de clase por bajar.');
  }
  if (files > 0) problems.push(`Faltan descargar ${plural(files, 'archivo', 'archivos')} de los cursos.`);
  const busy = !!s?.syncing;
  return { ready: problems.length === 0 && !busy, busy, problems, files };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param config { port, teacherCode, nodeToken }
 * @returns { ok, code, waitedMs }
 */
export async function runCheck({
  fetchFn = fetch, config, log = console.log, now = Date.now, sleep = defaultSleep,
  startWaitMs = 90_000, maxWaitMs = 20 * 60_000, pollMs = 5000, attempts = 3,
}) {
  const t0 = now();
  const base = `http://127.0.0.1:${config.port || 80}`;
  const hasToken = !!config.nodeToken && !PLACEHOLDER.test(String(config.nodeToken));
  const waited = () => now() - t0;
  const done = (code) => ({ ok: code === 0, code, waitedMs: waited() });
  const getStatus = async () => {
    try { const r = await fetchFn(`${base}/api/node/status`); return r.ok ? await r.json() : null; } catch { return null; }
  };

  log('Esperando a que el servidor de Quetzal arranque...');
  let status = null;
  while (!(status = await getStatus())) {
    if (waited() >= startWaitMs) {
      log('El servidor no responde. Revisa que esté prendido y mira el registro (Windows: C:\\Quetzal\\logs\\nodo.log; Raspberry: journalctl -u quetzal-node -n 50).');
      return done(1);
    }
    await sleep(2000);
  }
  log('El servidor está funcionando.');

  if (!hasToken) {
    for (const p of describeStatus(status, { hasToken }).problems) log(`FALTA: ${p}`);
    return done(2);
  }

  const login = await fetchFn(`${base}/api/teacher/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(config.teacherCode ?? '') }) }).catch(() => null);
  if (!login || !login.ok) {
    log('FALTA: el servidor no aceptó el código de docente de la configuración (revisa teacherCode en config.json).');
    return done(1);
  }
  const { token } = await login.json();

  let lastFiles = -1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    log(attempt === 1 ? 'Sincronizando con la nube (puede tardar varios minutos)...' : `Sincronizando otra vez (intento ${attempt} de ${attempts})...`);
    const sync = await fetchFn(`${base}/api/teacher/sync-now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!sync || !sync.ok) {
      const msg = sync ? ((await sync.json().catch(() => ({}))).error || `respondió ${sync.status}`) : 'no respondió';
      log(`FALTA: no se pudo iniciar la sincronización (${msg}).`);
      return done(1);
    }
    await sleep(2000);
    // Espera a que termine esta sincronización.
    for (;;) {
      status = (await getStatus()) || status;
      const d = describeStatus(status, { hasToken });
      if (d.files !== lastFiles && d.files > 0) { log(`  descargando archivos de los cursos... faltan ${d.files}`); lastFiles = d.files; }
      if (!d.busy) {
        if (d.ready) {
          log('Todo listo: la aplicación normal está activa, los cursos están en el servidor y no queda nada por subir.');
          return done(0);
        }
        const onlyFiles = d.problems.length === 1 && d.files > 0;
        if (onlyFiles && attempt < attempts) { await sleep(15_000); break; }   // a veces una descarga falla: se reintenta
        for (const p of d.problems) log(`FALTA: ${p}`);
        return done(1);
      }
      if (waited() >= maxWaitMs) {
        log('Sigue sincronizando después de mucho tiempo (puede que haya muchos videos o internet lento). Déjalo prendido: continúa solo. Revisa más tarde http://localhost/api/node/status');
        return done(1);
      }
      await sleep(pollMs);
    }
  }
  return done(1);
}

// ---------- uso desde la terminal ----------
function readConfig() {
  const dir = process.env.QUETZAL_CONFIG_DIR || path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(dir, 'config.json');
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let config;
  try { config = readConfig(); } catch (e) { console.log(`FALTA: ${e.message}`); process.exit(1); }
  runCheck({ config }).then((r) => process.exit(r.code), (e) => { console.log(`Error inesperado: ${e.message}`); process.exit(1); });
}
