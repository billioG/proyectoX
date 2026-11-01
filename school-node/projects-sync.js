// Sube a la nube los proyectos que los estudiantes guardaron en el nodo (los pendientes).
// Por cada proyecto: (1) pide a node-sync una URL firmada y sube el archivo DIRECTO a Storage
// (la llave de la nube nunca está en el nodo; los videos no pasan por la función), y guarda la
// ruta para no volver a subirlo si falla lo siguiente; (2) confirma todos juntos con push.projects
// y la nube valida, publica y rota los roles del equipo. Un proyecto que falla no frena a los demás.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { createProjectStore } from './projects.js';
import { friendlyProjectError, OLD_FUNCTION } from './sync-errors.js';

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000; // un video de 150 MB por un internet lento
const CYCLE_BUDGET_MS = 20 * 60 * 1000;   // pasado esto no se empiezan más subidas: el resto va en el siguiente ciclo
const RETRY_BASE_MS = 5 * 60 * 1000;      // espera tras fallar a mitad de subir un archivo: 5, 10, 20, 40 y 60 min
const RETRY_MAX_MS = 60 * 60 * 1000;

// Cuándo falló la última subida de ARCHIVO de cada proyecto. Solo esas fallas esperan: ya gastaron datos
// de la escuela; un "no hay internet" falla antes de mandar nada y se reintenta en cada ciclo.
const lastUploadFailure = new Map();
const retryWait = (attempts) => Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);

/**
 * @returns { synced: number, failed: number }
 */
export async function syncProjects(db, config, { log = () => {}, fetchImpl = fetch, store = createProjectStore(db, { dataDir: config.dataDir }), now = Date.now, budgetMs = CYCLE_BUDGET_MS } = {}) {
  const pending = store.listPending();
  if (!pending.length) return { synced: 0, failed: 0 };

  const endpoint = `${config.cloudUrl}/functions/v1/node-sync`;
  const call = async (body) => {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-node-token': config.nodeToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `node-sync respondió ${res.status}`);
    return data;
  };

  let synced = 0;
  let failed = 0;
  const ready = [];

  const startedAt = now();
  let attempted = 0;
  for (const project of pending) {
    if (attempted > 0 && now() - startedAt >= budgetMs) break; // sin marcar error: lo que falta sigue pendiente
    const lastFail = lastUploadFailure.get(project.id);
    if (lastFail !== undefined && now() - lastFail < retryWait(project.attempts)) continue;
    attempted++;
    let sending = false;
    try {
      if (!project.cloud_path) {
        const file = store.finalPath(project.id);
        if (!fs.existsSync(file)) throw new Error('El archivo ya no está en la computadora de la escuela.');
        const { path: cloudPath, signed_url: signedUrl } = await call({ action: 'project_upload_url', client_ref: project.id, ext: project.ext, size: project.file_size });
        // La función anterior no conoce `action`: responde un sync normal, sin URL.
        if (!cloudPath || !signedUrl) throw new Error(OLD_FUNCTION);
        sending = true;
        const res = await fetchImpl(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': project.mime, 'Content-Length': String(project.file_size) },
          body: Readable.toWeb(fs.createReadStream(file)),
          duplex: 'half',
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`No se pudo subir el archivo a la nube (${res.status}).`);
        store.setCloudPath(project.id, cloudPath);
        project.cloud_path = cloudPath;
        log(`📤 Archivo de "${project.title}" subido a Storage.`);
      }
      ready.push(project);
    } catch (e) {
      if (sending) lastUploadFailure.set(project.id, now());
      store.markFailed(project.id, friendlyProjectError(e.message));
      failed++;
    }
  }

  if (ready.length) {
    try {
      const data = await call({
        push: {
          projects: ready.map(p => ({
            client_ref: p.id, student_id: p.student_id, group_id: p.group_id, title: p.title, description: p.description,
            bimestre: p.bimestre, upload_ip: p.upload_ip, cloud_path: p.cloud_path, created_at: p.created_at,
          })),
        },
      });
      if (!Array.isArray(data.applied?.projects)) throw new Error(OLD_FUNCTION);
      const done = new Map(data.applied.projects.map(a => [a.client_ref, a.project_id]));
      const why = new Map((data.project_errors || []).map(e => [e.client_ref, e.error]));
      for (const p of ready) {
        lastUploadFailure.delete(p.id);
        if (done.has(p.id)) { store.markSynced(p.id, done.get(p.id)); synced++; }
        else { store.markFailed(p.id, why.get(p.id) || 'La nube no confirmó este proyecto.'); failed++; }
      }
    } catch (e) {
      for (const p of ready) store.markFailed(p.id, friendlyProjectError(e.message));
      failed += ready.length;
    }
  }
  return { synced, failed };
}
