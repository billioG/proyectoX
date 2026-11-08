// Medios privados de estudiantes y docentes (fotos de perfil, videos y evidencias de proyectos, adjuntos de comentarios, evidencias de docentes).
// En la base se sigue guardando la dirección «pública» de siempre; al MOSTRAR un medio se cambia por una dirección firmada que vence (createSignedUrl).
// Así los buckets pueden ser privados sin migrar ningún dato, y sirve igual si todavía son públicos (si firmar falla, se deja la dirección original).
// Lógica pura con el firmador inyectado: se prueba sin navegador ni Supabase. El cableado al DOM está en private-media.js.

export const PRIVATE_BUCKETS = ['profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence'];
export const SIGNED_TTL_SECONDS = 2 * 60 * 60; // las páginas quedan abiertas horas: 2 h cubre una clase larga sin dejar enlaces vivos para siempre
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // se vuelve a firmar si faltan menos de 5 min

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @returns {{ bucket: string, path: string, download: string|null }|null} null si no es una dirección pública de un bucket privado. */
export function parsePrivateUrl(url, supabaseUrl) {
  if (typeof url !== 'string' || !supabaseUrl) return null;
  const m = new RegExp(`^${escapeRegex(String(supabaseUrl).replace(/\/+$/, ''))}/storage/v1/object/public/(${PRIVATE_BUCKETS.join('|')})/([^?#]+)(?:\\?([^#]*))?(?:#.*)?$`).exec(url.trim());
  if (!m) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch { return null; }
  if (!path || path.split('/').includes('..')) return null;
  const download = m[3] ? new URLSearchParams(m[3]).get('download') : null;
  return { bucket: m[1], path, download };
}

/**
 * Crea el resolutor de direcciones.
 * @param {{ supabaseUrl: string, sign: (bucket: string, paths: string[], opts: { download?: string }) => Promise<Array<{ path: string, signedUrl?: string|null }>>, now?: () => number, batchMs?: number, schedule?: Function }} deps
 */
export function createMediaResolver({ supabaseUrl, sign, now = Date.now, batchMs = 25, schedule = (fn, ms) => setTimeout(fn, ms) }) {
  const cache = new Map(); // clave bucket|path|download -> { url, expires }
  const pending = new Map(); // clave -> { resolvers: [], bucket, path, download }
  let timer = null;

  const keyOf = (p) => `${p.bucket}|${p.path}|${p.download || ''}`;

  async function flush() {
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    const groups = new Map(); // bucket|download -> items (createSignedUrls firma varios de un mismo bucket de una vez)
    for (const item of batch) {
      const g = `${item.bucket}|${item.download || ''}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(item);
    }
    for (const items of groups.values()) {
      let results = [];
      try {
        results = await sign(items[0].bucket, items.map((i) => i.path), items[0].download ? { download: items[0].download } : {});
      } catch { results = []; }
      const byPath = new Map((results || []).map((r) => [r.path, r.signedUrl]));
      for (const item of items) {
        const signed = byPath.get(item.path) || null;
        if (signed) cache.set(keyOf(item), { url: signed, expires: now() + SIGNED_TTL_SECONDS * 1000 });
        for (const resolve of item.resolvers) resolve(signed);
      }
    }
  }

  /** Devuelve la dirección para mostrar: la firmada si es un medio privado y se pudo firmar; si no, la original (que funciona mientras el bucket sea público). */
  async function resolve(url) {
    const parsed = parsePrivateUrl(url, supabaseUrl);
    if (!parsed) return url;
    const key = keyOf(parsed);
    const hit = cache.get(key);
    if (hit && hit.expires - now() > REFRESH_MARGIN_MS) return hit.url;
    const signed = await new Promise((res) => {
      if (!pending.has(key)) pending.set(key, { ...parsed, resolvers: [] });
      pending.get(key).resolvers.push(res);
      if (!timer) timer = schedule(flush, batchMs);
    });
    return signed || url;
  }

  return { resolve, parse: (url) => parsePrivateUrl(url, supabaseUrl), clear: () => cache.clear() };
}
