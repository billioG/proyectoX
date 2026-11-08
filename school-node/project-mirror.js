// Videos y modelos 3D de los proyectos de la PROPIA escuela, guardados en el nodo para verse sin internet.
// Los proyectos de los estudiantes de esta escuela ya vienen en la réplica (tabla `projects`) con la dirección de la nube; el archivo no. Al sincronizar, el nodo baja los más
// recientes (con la firma que le da node-sync, porque el bucket es privado), los guarda en data/project-mirror y la app recibe /project-mirror/<huella>.<ext>.
// Los proyectos de otras escuelas no se copian: solo se ven con internet (ruta /node-media). Topes para no llenar la memoria de la Raspberry:
//   * por archivo (por defecto el mismo de las subidas, 150 MB), * total de la copia (por defecto 3 GB), * por sincronización (por defecto 8 archivos, los más nuevos primero),
//   * y nunca deja menos disco libre que el mínimo del nodo (minFreeDiskMB, 2 GB por defecto).
// Lógica con red y disco inyectables: se prueba sin internet.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isPrivateCloudUrl } from './media-sign.js';

export const MIRROR_DEFAULTS = { maxFileBytes: 150 * 1024 * 1024, maxTotalBytes: 3 * 1024 * 1024 * 1024, maxPerRun: 8, minFreeBytes: 2048 * 1024 * 1024 };
const NAME = /^[0-9a-f]{40}\.(mp4|webm|mov|m4v|3gp|mkv|ogv|stl|obj|glb)$/;
const EXT_BY_MIME = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp', 'video/x-matroska': 'mkv', 'video/ogg': 'ogv' };
const MIME_BY_EXT = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', mkv: 'video/x-matroska', ogv: 'video/ogg', stl: 'application/octet-stream', obj: 'application/octet-stream', glb: 'model/gltf-binary' };
const MODEL_EXT = /\.(stl|obj|glb)$/i;

/** Un archivo del proyecto en el bucket privado de proyectos de ESTA nube, con nombre simple (los videos); las evidencias de docentes y otras carpetas no. */
function isProjectFileUrl(url, cloudUrl) {
  if (!isPrivateCloudUrl(url, cloudUrl)) return false;
  return /\/storage\/v1\/object\/public\/project-videos\/[^/?#]+$/.test(url.trim());
}

export function createProjectMirror({ db, dir = null, statfs = fs.statfsSync }) {
  db.exec('CREATE TABLE IF NOT EXISTS project_mirror (url TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, created_at TEXT NOT NULL)');
  const root = dir ? path.resolve(dir) : null;
  const q = {
    all: db.prepare('SELECT url, name, size FROM project_mirror'),
    byName: db.prepare('SELECT name, mime, size FROM project_mirror WHERE name = ?'),
    put: db.prepare('INSERT OR REPLACE INTO project_mirror (url, name, size, mime, created_at) VALUES (?, ?, ?, ?, ?)'),
    del: db.prepare('DELETE FROM project_mirror WHERE url = ?'),
    total: db.prepare('SELECT IFNULL(SUM(size), 0) AS n FROM project_mirror'),
  };
  const cached = () => new Map(q.all.all().map((r) => [r.url, r.name]));
  const fileOf = (name) => { if (!NAME.test(name) || !root) throw new Error('Nombre de archivo no permitido'); return path.join(root, name); };

  return {
    isServableName: (name) => NAME.test(String(name)),
    totalBytes: () => Number(q.total.get().n),

    /** Mapeador de filas de `projects`: el archivo ya guardado sale con la dirección local; si no, queda la de la nube. */
    mapper() {
      const map = cached();
      return (row) => (typeof row.video_url === 'string' && map.has(row.video_url) ? { ...row, video_url: `/project-mirror/${map.get(row.video_url)}` } : row);
    },

    /**
     * Baja lo que falta (lo más nuevo primero) respetando los topes. Un fallo no detiene nada: se reintenta en la siguiente sincronización.
     * @returns {{ downloaded: number, failed: number, skipped: number, removed: number }}
     */
    async sync(store, { signer = null, cloudUrl, fetchFn = fetch, log = () => {}, limits = {}, freeBytes = null } = {}) {
      const L = { ...MIRROR_DEFAULTS, ...limits };
      const free = freeBytes || (() => { try { const s = statfs(root); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } });
      fs.mkdirSync(root, { recursive: true });
      // Filas SIN la vista (con las direcciones de la nube): la vista ya cambia las copiadas por la dirección local.
      const rows = (store.raw ? store.raw('projects') : store.all('projects')).filter((r) => typeof r.video_url === 'string' && isProjectFileUrl(r.video_url, cloudUrl));
      let removed = 0;

      // Lo que ya no está en la réplica (proyecto borrado) se libera del disco.
      const live = new Set(rows.map((r) => r.video_url));
      for (const r of q.all.all()) {
        if (live.has(r.url)) continue;
        try { fs.rmSync(fileOf(r.name), { force: true }); } catch { continue; }
        q.del.run(r.url); removed++;
      }

      const have = cached();
      const missing = rows.filter((r) => !have.has(r.video_url)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const batch = [...new Set(missing.map((r) => r.video_url))].slice(0, L.maxPerRun);
      let downloaded = 0, failed = 0, skipped = missing.length - batch.length;
      if (!batch.length) return { downloaded, failed, skipped, removed };
      const signed = signer ? await signer.sign(batch).catch(() => ({})) : {};

      for (const url of batch) {
        try {
          if (q.total.get().n >= L.maxTotalBytes) { skipped++; continue; }
          const res = await fetchFn(signed[url] || url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
          if (!res.ok || !res.body) throw new Error(`la nube respondió ${res.status}`);
          const declared = Number(res.headers.get('content-length'));
          if (Number.isFinite(declared) && declared > L.maxFileBytes) throw new Error('demasiado pesado');
          if (Number.isFinite(declared) && declared > 0 && (free() - declared < L.minFreeBytes || Number(q.total.get().n) + declared > L.maxTotalBytes)) { skipped++; continue; }
          const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          const ext = MODEL_EXT.test(new URL(url).pathname) ? new URL(url).pathname.split('.').pop().toLowerCase() : EXT_BY_MIME[mime];
          if (!ext) throw new Error('no es un video ni un modelo 3D');
          const name = `${crypto.createHash('sha1').update(url).digest('hex')}.${ext}`;
          const tmp = `${fileOf(name)}.${crypto.randomBytes(4).toString('hex')}.part`;
          let size = 0;
          const limit = new Transform({ transform(chunk, _enc, cb) { size += chunk.length; cb(size > L.maxFileBytes ? new Error('demasiado pesado') : null, chunk); } });
          try {
            await pipeline(Readable.fromWeb(res.body), limit, fs.createWriteStream(tmp));
          } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
          if (size === 0) { fs.rmSync(tmp, { force: true }); throw new Error('archivo vacío'); }
          fs.renameSync(tmp, fileOf(name));
          q.put.run(url, name, size, MIME_BY_EXT[ext] || 'application/octet-stream', new Date().toISOString());
          downloaded++;
        } catch (e) {
          failed++;
          log(`⚠️ Video de proyecto no descargado: ${e.message}`);
        }
      }
      return { downloaded, failed, skipped, removed };
    },

    /** Sirve un archivo guardado (con rangos, para que los videos se puedan adelantar). true si respondió. */
    serve(req, res, name) {
      const rec = NAME.test(String(name)) ? q.byName.get(name) : null;
      let file = null;
      try { file = rec ? fileOf(name) : null; } catch { file = null; }
      if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end('No encontrado'); return true; }
      const size = fs.statSync(file).size;
      const base = {
        'Content-Type': rec.mime, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin',
      };
      const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      if (range) {
        const start = range[1] ? parseInt(range[1], 10) : 0;
        const end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true; }
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
        return true;
      }
      res.writeHead(200, { ...base, 'Content-Length': size });
      if (req.method === 'HEAD') { res.end(); return true; }
      fs.createReadStream(file).pipe(res);
      return true;
    },
  };
}
