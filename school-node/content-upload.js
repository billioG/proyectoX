// Archivos de los cursos que el docente sube EN EL NODO (sin internet): la app habla con Storage de Supabase
// (`storage.from('course-content').upload / list / remove`) y el nodo contesta lo mismo, guardando en su disco.
// La ruta la decide el navegador (`lessons/<id de la lección>/<archivo>`), igual que en la nube: la dirección pública
// del recurso es idéntica antes y después de que el archivo llegue a la nube. Solo docentes y administradores.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readMultipartFile } from './multipart.js';

export const MAX_FILE_BYTES = 150 * 1024 * 1024;   // igual que los proyectos de los estudiantes
const DISK_RESERVE_BYTES = 300 * 1024 * 1024;       // el nodo nunca deja el disco sin aire
const MAX_ACTIVE_UPLOADS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_CHARS = /[\u0000-\u001F\u007F\\:*?"<>|%]/;
// Lo que la app sube hoy (recursos sueltos y paquetes SCORM/H5P/HTML5 descomprimidos). Nada ejecutable del sistema.
export const ALLOWED_EXT = new Set(('html htm xhtml js mjs css json xml xsd dtd png jpg jpeg gif svg webp ico bmp avif mp3 ogg oga wav m4a aac flac mp4 webm ogv mov m4v pdf '
  + 'txt csv md woff woff2 ttf otf eot wasm map glb gltf bin docx pptx xlsx doc ppt xls odt odp ods zip h5p vtt srt swf').split(' '));

const MIME = {
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml', js: 'application/javascript', mjs: 'application/javascript', css: 'text/css', json: 'application/json',
  xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  md: 'text/markdown', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', wasm: 'application/wasm',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', vtt: 'text/vtt', zip: 'application/zip',
};
/** Tipo de contenido de un archivo por su extensión (la nube lo guarda así y los navegadores lo necesitan para mostrarlo). */
export const mimeFor = (rel) => MIME[String(rel).split('.').pop().toLowerCase()] || 'application/octet-stream';

/** Ruta de Storage permitida o null: `lessons/<uuid>/archivo` (con subcarpetas), sin trucos de ruta y con extensión conocida. */
export function validateObjectPath(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400 || BAD_CHARS.test(rel)) return null;
  const seg = rel.split('/');
  if (seg.length < 3 || seg.length > 12 || seg[0] !== 'lessons' || !UUID.test(seg[1])) return null;
  for (const s of seg.slice(2)) {
    if (!s || s === '.' || s === '..' || s.length > 200 || s.startsWith('.') || /[. ]$/.test(s)) return null;
  }
  const last = seg[seg.length - 1];
  if (!last.includes('.') || !ALLOWED_EXT.has(last.split('.').pop().toLowerCase())) return null;
  return rel;
}

/** Disco: guarda los archivos bajo `dir` y recuerda quién subió cada uno (y si ya llegó a la nube). */
export function createContentStore({ db, dir, statfs = fs.statfsSync }) {
  // uploaded: 0 = falta subirlo a la nube, 1 = ya está en la nube, 2 = la nube lo rechazó para siempre (error dice por qué)
  db.exec(`CREATE TABLE IF NOT EXISTS content_uploads (
    path TEXT PRIMARY KEY, owner TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL,
    uploaded INTEGER NOT NULL DEFAULT 0, error TEXT
  )`);
  const q = {
    get: db.prepare('SELECT path, owner, size, created_at, uploaded, error FROM content_uploads WHERE path = ?'),
    put: db.prepare('INSERT INTO content_uploads (path, owner, size, created_at, uploaded) VALUES (?, ?, ?, ?, 0) ON CONFLICT(path) DO UPDATE SET owner = excluded.owner, size = excluded.size, created_at = excluded.created_at, uploaded = 0, error = NULL'),
    del: db.prepare('DELETE FROM content_uploads WHERE path = ?'),
    under: db.prepare("SELECT path, size, created_at FROM content_uploads WHERE path LIKE ? ESCAPE '\\' ORDER BY path"),
    pending: db.prepare('SELECT path, owner, size FROM content_uploads WHERE uploaded = 0 ORDER BY created_at'),
    done: db.prepare('UPDATE content_uploads SET uploaded = 1, error = NULL WHERE path = ?'),
    reject: db.prepare('UPDATE content_uploads SET uploaded = 2, error = ? WHERE path = ?'),
    rejected: db.prepare('SELECT path, error FROM content_uploads WHERE uploaded = 2 ORDER BY path'),
    blocked: db.prepare("SELECT DISTINCT substr(path, 9, 36) AS id FROM content_uploads WHERE uploaded != 1"),
    count: db.prepare('SELECT COUNT(*) AS n FROM content_uploads WHERE uploaded = 0'),
  };
  const root = path.resolve(dir);
  const filePath = (rel) => {
    const f = path.resolve(root, rel);
    if (!f.startsWith(root + path.sep)) throw new Error('Ruta fuera de la carpeta de contenido');
    return f;
  };
  return {
    filePath,
    exists: (rel) => { try { return fs.statSync(filePath(rel)).isFile(); } catch { return false; } },
    record: (rel) => q.get.get(rel) || null,
    freeBytes: () => { try { const s = statfs(root); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } },
    tmpPath: (rel) => `${filePath(rel)}.${crypto.randomBytes(4).toString('hex')}.part`,
    commit(rel, tmp, owner, size, now = Date.now()) {
      fs.renameSync(tmp, filePath(rel));
      q.put.run(rel, owner, size, now);
    },
    /** Borra los archivos pedidos que subió `owner` (un administrador puede borrar cualquiera de los subidos aquí). */
    remove(rels, { uid, admin }) {
      const removed = [];
      for (const rel of rels) {
        if (validateObjectPath(rel) === null) continue;
        const r = q.get.get(rel);
        if (!r || (r.owner !== uid && !admin)) continue;
        try { fs.rmSync(filePath(rel), { force: true }); } catch { continue; }
        q.del.run(rel);
        removed.push(rel);
      }
      return removed;
    },
    /** Hijos directos de una carpeta (archivos y subcarpetas), con la forma que devuelve Storage al listar. */
    list(prefix) {
      const base = prefix.replace(/\/+$/, '');
      const rows = q.under.all(`${base.replace(/[\\%_]/g, '\\$&')}/%`);
      const seen = new Map();
      for (const r of rows) {
        const rest = r.path.slice(base.length + 1);
        const [first, ...more] = rest.split('/');
        if (more.length) { if (!seen.has(first)) seen.set(first, { name: first, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null }); continue; }
        const iso = new Date(r.created_at).toISOString();
        seen.set(first, { name: first, id: crypto.createHash('sha1').update(r.path).digest('hex'), updated_at: iso, created_at: iso, last_accessed_at: iso, metadata: { size: r.size } });
      }
      return [...seen.values()];
    },
    pending: () => q.pending.all(),
    pendingCount: () => q.count.get().n,
    markUploaded: (rel) => { q.done.run(rel); },
    markRejected: (rel, message) => { q.reject.run(String(message).slice(0, 300), rel); },
    rejected: () => q.rejected.all(),
    /** Recursos (ids de lección) que todavía tienen algún archivo sin llegar a la nube: su fila no debe viajar aún. */
    blockedLessonIds: () => new Set(q.blocked.all().map((r) => r.id.toLowerCase())),
  };
}

const storageError = (res, status, message) => {
  if (res.headersSent) return;
  const names = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Unauthorized', 404: 'Not Found', 409: 'Duplicate', 413: 'Payload Too Large', 429: 'Too Many Requests', 507: 'Insufficient Storage' };
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ statusCode: String(status), error: names[status] || 'Error', message }));
};
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };

async function readJson(req, limit = 100_000) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > limit) throw Object.assign(new Error('Pedido demasiado grande'), { status: 413 }); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

/** Atiende `/storage/v1/object/course-content/<ruta>` (subir), `/storage/v1/object/list/course-content` y borrar. Devuelve true si el pedido era suyo. */
export function createStorageHandler({ store, auth, now = Date.now }) {
  let active = 0;
  const who = (req) => {
    const u = auth.userFromAccessToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    return u && (u.role === 'teacher' || u.role === 'admin') ? u : null;
  };

  async function upload(req, res, rel, user) {
    const refuse = (status, message) => { storageError(res, status, message); req.resume(); }; // se descarta el resto del cuerpo para que el navegador reciba el motivo
    if (validateObjectPath(rel) === null) return refuse(400, 'Ruta o tipo de archivo no permitido.');
    const upsert = String(req.headers['x-upsert'] || '').toLowerCase() === 'true';
    const known = store.record(rel);
    if (store.exists(rel)) {
      if (!upsert) return refuse(409, 'The resource already exists');
      if (!known || (known.owner !== user.uid && user.role !== 'admin')) return refuse(403, 'Ese archivo no es tuyo.');
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 1_000_000) return refuse(413, 'El archivo pesa más de 150 MB.');
    if (store.freeBytes() < (Number.isFinite(declared) ? declared : MAX_FILE_BYTES) + DISK_RESERVE_BYTES) return refuse(507, 'No hay espacio suficiente en la computadora de la escuela.');
    if (active >= MAX_ACTIVE_UPLOADS) return refuse(429, 'Hay otras subidas en curso. Espera un momento.');

    active++;
    const tmp = store.tmpPath(rel);
    let out = null;
    try {
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      out = fs.createWriteStream(tmp);
      const failed = new Promise((_, reject) => out.once('error', reject));
      failed.catch(() => {});
      const sink = {
        write: (chunk) => new Promise((resolve, reject) => { out.write(chunk, (e) => (e ? reject(e) : resolve())); }),
      };
      let size = 0;
      const type = String(req.headers['content-type'] || '');
      if (/^multipart\/form-data/i.test(type)) {
        ({ size } = await readMultipartFile(req, type, { maxBytes: MAX_FILE_BYTES, sink }));
      } else {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_FILE_BYTES) throw Object.assign(new Error('El archivo pesa más de 150 MB.'), { status: 413 });
          await sink.write(chunk);
        }
        if (!size) throw Object.assign(new Error('El archivo está vacío.'), { status: 400 });
      }
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      out = null;
      store.commit(rel, tmp, user.uid, size, now());
      sendJson(res, 200, { Key: `course-content/${rel}`, Id: crypto.createHash('sha1').update(rel).digest('hex') });
    } catch (e) {
      // Se espera a que el archivo se cierre de verdad (en Windows, borrarlo con el manejador abierto falla y dejaba un .part suelto).
      if (out && !out.closed) await new Promise((r) => { const t = setTimeout(r, 1000); out.once('close', () => { clearTimeout(t); r(); }); out.destroy(); });
      try { fs.rmSync(tmp, { force: true }); } catch { /* Windows aún lo tiene abierto: queda un .part suelto */ }
      storageError(res, e.status || 500, e.status ? e.message : 'No se pudo guardar el archivo en la computadora de la escuela.');
      req.resume();
    } finally {
      active--;
    }
  }

  return {
    async handle(req, res, url) {
      const p = url.pathname;
      let rel = null;
      const put = /^\/storage\/v1\/object\/course-content\/(.+)$/.exec(p);
      const isList = p === '/storage/v1/object/list/course-content';
      const isDelete = p === '/storage/v1/object/course-content';
      if (!put && !isList && !isDelete) return false;
      if (put) { try { rel = decodeURIComponent(put[1]); } catch { rel = ''; } }

      const user = who(req);
      if (!user) { storageError(res, req.headers.authorization ? 403 : 401, 'Solo los docentes pueden subir archivos.'); req.resume(); return true; }
      try {
        if (put && (req.method === 'POST' || req.method === 'PUT')) await upload(req, res, rel, user);
        else if (isList && req.method === 'POST') {
          const body = await readJson(req);
          const prefix = String(body.prefix ?? '').replace(/^\/+|\/+$/g, '');
          if (!/^lessons(\/|$)/.test(prefix) || prefix.length > 400 || /\.\./.test(prefix)) return storageError(res, 400, 'Carpeta no permitida.'), true;
          sendJson(res, 200, store.list(prefix));
        } else if (isDelete && req.method === 'DELETE') {
          const body = await readJson(req);
          const prefixes = Array.isArray(body.prefixes) ? body.prefixes.filter((x) => typeof x === 'string').slice(0, 1000) : [];
          const removed = store.remove(prefixes, { uid: user.uid, admin: user.role === 'admin' });
          sendJson(res, 200, removed.map((name) => ({ name })));
        } else storageError(res, 405, 'Método no permitido.');
      } catch (e) {
        storageError(res, e.status || 500, e.status ? e.message : 'Error interno del nodo');
      }
      return true;
    },
  };
}
