// Sube a la nube lo que el docente creó en el nodo sin internet: primero los ARCHIVOS de sus recursos (URL firmada que da node-sync;
// van directo a Storage, la llave de la nube nunca está en el nodo) y, en la misma sincronización, las filas de cursos y recursos
// (sync.js las manda en push.content, solo las de recursos cuyos archivos ya llegaron). Mismo patrón que projects-sync.js.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { createContentStore, mimeFor } from './content-upload.js';

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const CYCLE_BUDGET_MS = 20 * 60 * 1000; // pasado esto no se empiezan más subidas: el resto va en el siguiente ciclo

const CLOUD_STORAGE = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/course-content\/(lessons\/.+)$/;
const SCORM_ENTRY = /^https?:\/\/[^/]+\/functions\/v1\/serve-scorm-entry\?(.+)$/;

/** La dirección de un recurso subido en el nodo (la del nodo, con el nombre o IP que usó el docente) pasa a la de la nube. */
export function toCloudUrl(url, { storageBase, cloudUrl }) {
  if (typeof url !== 'string') return url;
  const m = CLOUD_STORAGE.exec(url);
  if (m && storageBase) return storageBase + m[1];
  if (url.startsWith('/content/lessons/') && storageBase) return storageBase + url.slice('/content/'.length);
  const s = SCORM_ENTRY.exec(url);
  if (s && cloudUrl) return `${cloudUrl}/functions/v1/serve-scorm-entry?${s[1]}`;
  return url;
}

/** @returns { uploaded, failed, rejected } */
export async function uploadContentFiles(db, config, { content = createContentStore({ db, dir: `${config.dataDir}/content` }), fetchImpl = fetch, log = () => {}, now = Date.now, budgetMs = CYCLE_BUDGET_MS } = {}) {
  const pending = content.pending();
  const out = { uploaded: 0, failed: 0, rejected: 0 };
  const startedAt = now();
  let attempted = 0;
  for (const f of pending) {
    if (attempted > 0 && now() - startedAt >= budgetMs) break;
    attempted++;
    try {
      const file = content.filePath(f.path);
      if (!fs.existsSync(file)) { content.markRejected(f.path, 'El archivo ya no está en la computadora de la escuela.'); out.rejected++; continue; }
      const res = await fetchImpl(`${config.cloudUrl}/functions/v1/node-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-node-token': config.nodeToken },
        body: JSON.stringify({ action: 'content_upload_url', path: f.path, size: fs.statSync(file).size }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.error) { content.markRejected(f.path, data.error); out.rejected++; continue; } // la nube dijo que no, para siempre
      if (!res.ok || !data.signed_url) throw new Error(data.error || `node-sync respondió ${res.status}`);
      const put = await fetchImpl(data.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeFor(f.path), 'Content-Length': String(fs.statSync(file).size), 'x-upsert': 'true' },
        body: Readable.toWeb(fs.createReadStream(file)),
        duplex: 'half',
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!put.ok) throw new Error(`No se pudo subir el archivo a la nube (${put.status}).`);
      content.markUploaded(f.path);
      out.uploaded++;
      log(`📤 Recurso subido a la nube: ${f.path}`);
    } catch (e) {
      out.failed++; // sin internet o a mitad de subir: se reintenta en el próximo ciclo
    }
  }
  return out;
}
