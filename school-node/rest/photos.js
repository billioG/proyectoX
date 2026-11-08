// Fotos de perfil sin internet. La foto de un estudiante o docente es una dirección del Storage de la nube: sin internet no carga.
// El nodo las descarga al sincronizar (solo imágenes razonables, solo de la nube del proyecto), las guarda en data/photos y la app
// las recibe con la dirección local (/photos/<huella>.<ext>). Mientras una foto no esté guardada se deja la dirección de la nube.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1_500_000;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const NAME = /^[0-9a-f]{40}\.(jpg|png|webp|gif)$/;
export const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

export function createPhotos({ db, dir }) {
  db.exec('CREATE TABLE IF NOT EXISTS rest_photos (url TEXT PRIMARY KEY, file TEXT NOT NULL)');
  const cached = () => new Map(db.prepare('SELECT url, file FROM rest_photos').all().map((r) => [r.url, r.file]));
  const save = db.prepare('INSERT OR REPLACE INTO rest_photos (url, file) VALUES (?, ?)');
  const storageHost = () => {
    try { return new URL(db.prepare("SELECT value FROM meta WHERE key = 'storage_base'").get()?.value).host; } catch { return null; }
  };
  const fromProject = (url) => {
    let u;
    try { u = new URL(url); } catch { return false; }
    const host = storageHost();
    return u.protocol === 'https:' && (host ? u.host === host : u.host.endsWith('.supabase.co'));
  };

  return {
    dir,
    isServableName: (name) => NAME.test(String(name)),

    /** Mapeador de filas: la foto guardada sale con la dirección local; si no está guardada, queda la de la nube. */
    mapper() {
      const map = cached();
      return (row) => (typeof row.profile_photo_url === 'string' && map.has(row.profile_photo_url) ? { ...row, profile_photo_url: `/photos/${map.get(row.profile_photo_url)}` } : row);
    },

    /** Baja las fotos que faltan de estudiantes y docentes de la réplica. Un fallo no detiene nada: se reintenta en la próxima. */
    async sync(store, { fetchFn = fetch, log = () => {}, max = 300, signer = null } = {}) {
      const have = cached();
      const urls = new Set();
      for (const t of ['students', 'teachers']) for (const r of store.all(t)) if (typeof r.profile_photo_url === 'string' && r.profile_photo_url.startsWith('https://')) urls.add(r.profile_photo_url);
      let downloaded = 0, failed = 0;
      fs.mkdirSync(dir, { recursive: true });
      const missing = [...urls].slice(0, max).filter((url) => !have.has(url) && fromProject(url));
      // Con el bucket privado la dirección pública ya no abre: se piden las firmadas a node-sync. Si no hay firmador, o no devolvió una, se intenta la pública (bucket aún público).
      const signed = signer && missing.length ? await signer.sign(missing).catch(() => ({})) : {};
      for (const url of missing) {
        try {
          const res = await fetchFn(signed[url] || url, { signal: AbortSignal.timeout(15000) });
          const ext = TYPES[String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()];
          if (!res.ok || !ext) throw new Error('no es una imagen');
          if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('demasiado pesada');
          const body = Buffer.from(await res.arrayBuffer());
          if (body.length === 0 || body.length > MAX_BYTES) throw new Error('tamaño inválido');
          const file = `${crypto.createHash('sha1').update(url).digest('hex')}.${ext}`;
          const tmp = path.join(dir, `${file}.part`);
          fs.writeFileSync(tmp, body);
          fs.renameSync(tmp, path.join(dir, file));
          save.run(url, file);
          downloaded++;
        } catch (e) {
          failed++;
          log(`⚠️ Foto de perfil no descargada: ${e.message}`);
        }
      }
      return { downloaded, failed };
    },
  };
}
