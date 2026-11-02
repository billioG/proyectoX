// Videos y modelos 3D de los proyectos que los estudiantes suben EN EL NODO con la app real: la app habla con Storage de Supabase
// (`storage.from('project-videos').upload(<marca de tiempo>_<azar>[.stl|.obj|.glb], archivo)`) y el nodo contesta lo mismo, guardando
// en su disco. Cuando la app inserta la fila del proyecto, el archivo pasa al almacén de proyectos (projects.js) y sube a la nube
// por el camino ya probado (URL firmada + push.projects, que valida y publica). Solo estudiantes, 150 MB, solo videos y modelos 3D.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readMultipartFile } from './multipart.js';
import { PROJECT_LIMITS } from './project-rules.js';

const NAME = /^\d{10,16}_[a-z0-9]{1,12}(\.(stl|obj|glb))?$/;
const MIMES = new Set(['', 'application/octet-stream', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/x-msvideo', 'video/x-matroska', 'video/ogg',
  'model/stl', 'model/obj', 'model/gltf-binary', 'application/sla']);
const MAX_UNUSED_PER_STUDENT = 6;
const MAX_ACTIVE_UPLOADS = 2;
const VIDEO_BY_MIME = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-msvideo': 'avi', 'video/x-matroska': 'mkv', 'video/ogg': 'ogv' };

export const isProjectFileName = (n) => typeof n === 'string' && NAME.test(n);

/** Tipo de archivo del proyecto: la extensión (solo modelos 3D la llevan) o, para los videos, el Content-Type que mandó el navegador. */
export function projectFileKind(name, mime) {
  const ext = /\.(stl|obj|glb)$/.exec(name)?.[1];
  if (ext) return { kind: 'model3d', ext };
  return { kind: 'video', ext: VIDEO_BY_MIME[mime] || 'mp4' };
}

export function createProjectFiles({ db, dir, statfs = fs.statfsSync }) {
  db.exec(`CREATE TABLE IF NOT EXISTS project_uploads (
    name TEXT PRIMARY KEY, owner TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
  )`);
  const root = path.resolve(dir);
  const q = {
    get: db.prepare('SELECT name, owner, size, mime, created_at, used FROM project_uploads WHERE name = ?'),
    put: db.prepare('INSERT OR REPLACE INTO project_uploads (name, owner, size, mime, created_at, used) VALUES (?, ?, ?, ?, ?, 0)'),
    del: db.prepare('DELETE FROM project_uploads WHERE name = ?'),
    unused: db.prepare('SELECT COUNT(*) AS n FROM project_uploads WHERE owner = ? AND used = 0'),
    use: db.prepare('UPDATE project_uploads SET used = 1 WHERE name = ?'),
    stale: db.prepare('SELECT name FROM project_uploads WHERE used = 0 AND created_at < ?'),
  };
  const filePath = (name) => {
    if (!NAME.test(name)) throw new Error('Nombre de archivo no permitido');
    return path.join(root, name);
  };
  return {
    filePath,
    record: (name) => q.get.get(name) || null,
    unusedCount: (owner) => q.unused.get(owner).n,
    freeBytes: () => { try { const s = statfs(root); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } },
    tmpPath: (name) => `${filePath(name)}.${crypto.randomBytes(4).toString('hex')}.part`,
    commit(name, tmp, owner, size, mime, now = Date.now()) { fs.renameSync(tmp, filePath(name)); q.put.run(name, owner, size, mime, now); },
    markUsed: (name) => { q.use.run(name); },
    /** El dueño quita lo que subió y todavía no se convirtió en proyecto. */
    remove(name, owner) {
      const r = q.get.get(name);
      if (!r || r.owner !== owner) return false;
      try { fs.rmSync(filePath(name), { force: true }); } catch { return false; }
      q.del.run(name);
      return true;
    },
    /** Subidas que nunca llegaron a ser proyecto (más de `olderThanMs`): se libera el disco. */
    cleanup(olderThanMs = 24 * 3600_000, now = Date.now()) {
      let n = 0;
      for (const r of q.stale.all(now - olderThanMs)) { try { fs.rmSync(filePath(r.name), { force: true }); } catch { continue; } q.del.run(r.name); n++; }
      return n;
    },
  };
}

const err = (res, status, message) => {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ statusCode: String(status), error: status === 401 || status === 403 ? 'Unauthorized' : 'Error', message }));
};
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };

/** Atiende subir/borrar en `/storage/v1/object/project-videos` y servir en `/storage/v1/object/public/project-videos/<nombre>`. true si era suyo. */
export function createProjectFilesHandler({ store, auth, now = Date.now, reserveBytes = 2048 * 1024 * 1024 }) {
  let active = 0;
  const student = (req) => { const u = auth.userFromAccessToken((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); return u && u.role === 'student' ? u : null; };

  function serve(req, res, name) {
    const r = NAME.test(name) ? store.record(name) : null;
    let file;
    try { file = r ? store.filePath(name) : null; } catch { file = null; }
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('No encontrado'); }
    const size = fs.statSync(file).size;
    const type = r.mime && r.mime !== 'application/octet-stream' ? r.mime : 'application/octet-stream';
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; sandbox" };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : 0;
      const end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }

  async function upload(req, res, name, user) {
    const refuse = (status, message) => { err(res, status, message); req.resume(); };
    if (!NAME.test(name)) return refuse(400, 'Nombre de archivo no permitido.');
    if (store.record(name)) return refuse(409, 'The resource already exists');
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > PROJECT_LIMITS.maxBytes + 1_000_000) return refuse(413, 'El archivo pesa más de 150 MB.');
    if (store.unusedCount(user.uid) >= MAX_UNUSED_PER_STUDENT) return refuse(429, 'Tienes varios archivos subidos que no se convirtieron en proyecto. Termina o cancela alguno.');
    if (store.freeBytes() < (Number.isFinite(declared) ? declared : PROJECT_LIMITS.maxBytes) + reserveBytes) return refuse(507, 'No hay espacio suficiente en la computadora de la escuela. Avisa a tu docente.');
    if (active >= MAX_ACTIVE_UPLOADS) return refuse(429, 'Hay otras subidas en curso. Espera un momento.');
    const type = String(req.headers['content-type'] || '');
    active++;
    const tmp = store.tmpPath(name);
    let out = null;
    try {
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      out = fs.createWriteStream(tmp);
      out.on('error', () => {});
      const sink = { write: (c) => new Promise((resolve, reject) => { out.write(c, (e) => (e ? reject(e) : resolve())); }) };
      let size = 0, mime = '';
      if (/^multipart\/form-data/i.test(type)) {
        ({ size, contentType: mime } = await readMultipartFile(req, type, { maxBytes: PROJECT_LIMITS.maxBytes, sink }));
      } else {
        mime = type.split(';')[0].trim().toLowerCase();
        for await (const c of req) {
          size += c.length;
          if (size > PROJECT_LIMITS.maxBytes) throw Object.assign(new Error('El archivo pesa más de 150 MB.'), { status: 413 });
          await sink.write(c);
        }
        if (!size) throw Object.assign(new Error('El archivo está vacío.'), { status: 400 });
      }
      if (!MIMES.has(mime)) throw Object.assign(new Error('El archivo debe ser un video o un modelo 3D.'), { status: 400 });
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      out = null;
      store.commit(name, tmp, user.uid, size, mime || 'application/octet-stream', now());
      json(res, 200, { Key: `project-videos/${name}`, Id: crypto.createHash('sha1').update(name).digest('hex') });
    } catch (e) {
      if (out) out.destroy();
      await new Promise((r) => setTimeout(r, 0));
      try { fs.rmSync(tmp, { force: true }); } catch { /* queda un .part suelto */ }
      err(res, e.status || 500, e.status ? e.message : 'No se pudo guardar el archivo en la computadora de la escuela.');
      req.resume();
    } finally { active--; }
  }

  return {
    async handle(req, res, url) {
      const p = url.pathname;
      const pub = /^\/storage\/v1\/object\/public\/project-videos\/([^/]+)$/.exec(p);
      if (pub && (req.method === 'GET' || req.method === 'HEAD')) {
        let name = '';
        try { name = decodeURIComponent(pub[1]); } catch { name = ''; }
        serve(req, res, name);
        return true;
      }
      const put = /^\/storage\/v1\/object\/project-videos\/([^/]+)$/.exec(p);
      const del = p === '/storage/v1/object/project-videos';
      if (!put && !del) return false;
      const user = student(req);
      if (!user) { err(res, req.headers.authorization ? 403 : 401, 'Solo los estudiantes suben el video de su proyecto.'); req.resume(); return true; }
      try {
        if (put && (req.method === 'POST' || req.method === 'PUT')) {
          let name = '';
          try { name = decodeURIComponent(put[1]); } catch { name = ''; }
          await upload(req, res, name, user);
        } else if (del && req.method === 'DELETE') {
          let raw = '';
          for await (const c of req) { raw += c; if (raw.length > 50_000) break; }
          let body = {};
          try { body = JSON.parse(raw || '{}'); } catch { /* vacío */ }
          const removed = (Array.isArray(body.prefixes) ? body.prefixes : []).filter((n) => typeof n === 'string' && NAME.test(n)).filter((n) => store.remove(n, user.uid));
          json(res, 200, removed.map((name) => ({ name })));
        } else err(res, 405, 'Método no permitido.');
      } catch { err(res, 500, 'Error interno del nodo'); }
      return true;
    },
  };
}
