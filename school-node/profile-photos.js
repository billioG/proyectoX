// Foto de perfil sin internet. La app sube la foto al depósito `profile-photos` (supabase-js: POST /storage/v1/object/profile-photos/<id>_<hora>.<ext>), pide su dirección pública
// y llama a la función claim_first_profile_photo_reward. Aquí el nodo guarda la imagen en su disco, la sirve en la misma dirección pública que tendría en la nube y, al sincronizar,
// la sube a Storage con una URL firmada que da node-sync (la llave de la nube nunca está en el nodo). La función del premio se anota en la bandeja (rest/profile-photo.js) y viaja
// cuando la imagen ya llegó a la nube. Mismo patrón que content-upload.js / content-sync.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { readMultipartFile } from './multipart.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // igual que la app (5 MB)
const MAX_PENDING_PER_USER = 5;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const PHOTO_PUBLIC = /^\/storage\/v1\/object\/public\/profile-photos\/([^/]+)$/;
const PHOTO_UPLOAD = /^\/storage\/v1\/object\/profile-photos\/([^/]+)$/;

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `<id del usuario>_<hora>.<extensión>`: el nombre que arma la app; el prefijo tiene que ser del propio usuario. */
export const validPhotoName = (name, uid) => typeof name === 'string' && typeof uid === 'string' && uid.length > 0
  && new RegExp(`^${escapeRx(uid)}_\\d{9,15}\\.(png|jpe?g|webp|gif)$`, 'i').test(name);
const extOf = (name) => String(name).split('.').pop().toLowerCase();
export const photoMime = (name) => MIME[extOf(name)] || 'application/octet-stream';

/** ¿Los primeros bytes son de verdad una imagen del tipo que dice la extensión? */
export function looksLikeImage(buf, name) {
  if (!buf || buf.length < 12) return false;
  const ext = extOf(name);
  if (ext === 'png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === 'jpg' || ext === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === 'gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (ext === 'webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export function createProfilePhotoStore({ db, dir }) {
  db.exec(`CREATE TABLE IF NOT EXISTS profile_photo_files (
    name TEXT PRIMARY KEY, uid TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT, created_at INTEGER NOT NULL
  )`);
  const q = {
    get: db.prepare('SELECT * FROM profile_photo_files WHERE name = ?'),
    put: db.prepare("INSERT INTO profile_photo_files (name, uid, size, status, created_at) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(name) DO UPDATE SET size = excluded.size, status = 'pending', error = NULL"),
    pending: db.prepare("SELECT * FROM profile_photo_files WHERE status = 'pending' ORDER BY created_at"),
    pendingOf: db.prepare("SELECT COUNT(*) AS n FROM profile_photo_files WHERE uid = ? AND status = 'pending'"),
    done: db.prepare("UPDATE profile_photo_files SET status = 'uploaded', error = NULL WHERE name = ?"),
    reject: db.prepare("UPDATE profile_photo_files SET status = 'rejected', error = ? WHERE name = ?"),
    rejected: db.prepare("SELECT name, error FROM profile_photo_files WHERE status = 'rejected'"),
    count: db.prepare("SELECT COUNT(*) AS n FROM profile_photo_files WHERE status = 'pending'"),
  };
  const filePath = (name) => path.join(dir, name);
  return {
    record: (name) => q.get.get(name) || null,
    filePath,
    exists: (name) => { try { return fs.statSync(filePath(name)).isFile(); } catch { return false; } },
    pendingOf: (uid) => q.pendingOf.get(uid).n,
    save(uid, name, buffer, now = Date.now()) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${filePath(name)}.part`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, filePath(name));
      q.put.run(name, uid, buffer.length, now);
    },
    pending: () => q.pending.all(),
    pendingCount: () => q.count.get().n,
    markUploaded: (name) => { q.done.run(name); },
    markRejected: (name, message) => { q.reject.run(String(message).slice(0, 300), name); },
    rejected: () => q.rejected.all(),
    /** ¿Ya está en la nube? (el premio y el cambio de foto viajan solo después) */
    isUploaded: (name) => q.get.get(name)?.status === 'uploaded',
    /** Una foto rechazada para siempre por la nube: su cambio no se reintenta. */
    isRejected: (name) => q.get.get(name)?.status === 'rejected',
  };
}

const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const storageError = (res, status, message) => {
  if (res.headersSent) return;
  const names = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Unauthorized', 404: 'Not Found', 413: 'Payload Too Large', 429: 'Too Many Requests' };
  sendJson(res, status, { statusCode: String(status), error: names[status] || 'Error', message });
};

/** Atiende subir (`POST|PUT /storage/v1/object/profile-photos/<nombre>`) y ver (`GET /storage/v1/object/public/profile-photos/<nombre>`). Devuelve true si el pedido era suyo. */
export function createProfilePhotoHandler({ store, auth, now = Date.now }) {
  const who = (req) => auth.userFromAccessToken((req.headers.authorization || '').replace(/^Bearer\s+/i, '')) || null;

  async function upload(req, res, name) {
    const refuse = (status, message) => { storageError(res, status, message); req.resume(); };
    const user = who(req);
    if (!user?.uid) return refuse(401, 'Entra con tu cuenta para cambiar la foto.');
    if (!validPhotoName(name, user.uid)) return refuse(400, 'El nombre de la foto no es válido.');
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES + 100_000) return refuse(413, 'La foto no debe superar 5MB.');
    if (!store.record(name) && store.pendingOf(user.uid) >= MAX_PENDING_PER_USER) return refuse(429, 'Tienes varias fotos esperando para subirse: conéctate a internet para sincronizar.');
    const chunks = [];
    let size = 0;
    const take = (chunk) => { size += chunk.length; if (size > MAX_PHOTO_BYTES) throw Object.assign(new Error('La foto no debe superar 5MB.'), { status: 413 }); chunks.push(Buffer.from(chunk)); };
    try {
      const type = String(req.headers['content-type'] || '');
      if (/^multipart\/form-data/i.test(type)) await readMultipartFile(req, type, { maxBytes: MAX_PHOTO_BYTES, sink: { write: async (c) => take(c) } });
      else for await (const c of req) take(c);
      const buffer = Buffer.concat(chunks);
      if (!looksLikeImage(buffer, name)) return storageError(res, 400, 'El archivo no es una imagen válida.');
      store.save(user.uid, name, buffer, now());
      sendJson(res, 200, { Key: `profile-photos/${name}`, Id: crypto.createHash('sha1').update(name).digest('hex') });
    } catch (e) {
      storageError(res, e.status || 500, e.status ? e.message : 'No se pudo guardar la foto en el servidor de la escuela.');
      req.resume();
    }
  }

  return {
    async handle(req, res, url) {
      const up = PHOTO_UPLOAD.exec(url.pathname);
      if (up && (req.method === 'POST' || req.method === 'PUT')) {
        let name = '';
        try { name = decodeURIComponent(up[1]); } catch { name = ''; }
        await upload(req, res, name);
        return true;
      }
      const pub = PHOTO_PUBLIC.exec(url.pathname);
      if (pub && (req.method === 'GET' || req.method === 'HEAD')) {
        let name = '';
        try { name = decodeURIComponent(pub[1]); } catch { name = ''; }
        if (!/^[^/\\]+\.(png|jpe?g|webp|gif)$/i.test(name) || !store.record(name) || !store.exists(name)) { res.writeHead(404); res.end('No encontrado'); return true; }
        const size = fs.statSync(store.filePath(name)).size;
        res.writeHead(200, { 'Content-Type': photoMime(name), 'Content-Length': size, 'Cache-Control': 'public, max-age=300' });
        if (req.method === 'HEAD') res.end(); else fs.createReadStream(store.filePath(name)).pipe(res);
        return true;
      }
      return false;
    },
  };
}

/** Sube a la nube las fotos pendientes (URL firmada de node-sync). @returns { uploaded, failed, rejected } */
export async function uploadProfilePhotos(db, config, { store = createProfilePhotoStore({ db, dir: path.join(config.dataDir, 'profile-photos') }), fetchImpl = fetch, log = () => {} } = {}) {
  const out = { uploaded: 0, failed: 0, rejected: 0 };
  for (const f of store.pending()) {
    try {
      if (!store.exists(f.name)) { store.markRejected(f.name, 'La foto ya no está en el servidor de la escuela.'); out.rejected++; continue; }
      const size = fs.statSync(store.filePath(f.name)).size;
      const res = await fetchImpl(`${config.cloudUrl}/functions/v1/node-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-node-token': config.nodeToken },
        body: JSON.stringify({ action: 'profile_photo_upload_url', name: f.name, user_id: f.uid, size }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.error) { store.markRejected(f.name, data.error); out.rejected++; continue; } // la nube dijo que no, para siempre
      if (!res.ok || !data.signed_url) throw new Error(data.error || `node-sync respondió ${res.status}`);
      const put = await fetchImpl(data.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': photoMime(f.name), 'Content-Length': String(size), 'x-upsert': 'true' },
        body: Readable.toWeb(fs.createReadStream(store.filePath(f.name))),
        duplex: 'half',
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      if (!put.ok) throw new Error(`No se pudo subir la foto a la nube (${put.status}).`);
      store.markUploaded(f.name);
      out.uploaded++;
      log(`📤 Foto de perfil subida a la nube: ${f.name}`);
    } catch {
      out.failed++; // sin internet o a mitad de subir: se reintenta en el próximo ciclo
    }
  }
  return out;
}
