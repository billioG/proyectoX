// Fotos, videos y adjuntos en buckets PRIVADOS de la nube: el nodo no tiene la llave, así que pide direcciones firmadas a la función node-sync (acción sign_media, con su token).
// Lo usan (1) la descarga de fotos de perfil al sincronizar (rest/photos.js) y (2) la ruta /node-media del servidor, que redirige el navegador de la red local a la dirección
// firmada cuando hay internet (los videos y fotos de la nube que se ven en el nodo). Lógica con la red inyectada: se prueba sin internet.
const BUCKETS = ['profile-photos', 'project-videos', 'comment-attachments'];
const CHUNK = 40; // el mismo tope que node-sync
const KEEP_MS = 100 * 60 * 1000; // la firma dura 2 h; se reutiliza 100 min

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿Es una dirección pública de un bucket privado de ESTA nube? (el nodo no firma nada de otros sitios) */
export function isPrivateCloudUrl(url, cloudUrl) {
  if (typeof url !== 'string' || !cloudUrl) return false;
  return new RegExp(`^${escapeRegex(String(cloudUrl).replace(/\/+$/, ''))}/storage/v1/object/public/(${BUCKETS.join('|')})/[^?#]+$`).test(url.trim());
}

export function createMediaSigner({ cloudUrl, nodeToken, fetchImpl = fetch, now = Date.now, timeoutMs = 20000 }) {
  const cache = new Map(); // dirección pública -> { signed, at }

  async function request(urls) {
    const res = await fetchImpl(`${cloudUrl}/functions/v1/node-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-node-token': nodeToken },
      body: JSON.stringify({ action: 'sign_media', urls }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`node-sync respondió ${res.status}`);
    const out = await res.json();
    return out && typeof out.signed === 'object' && out.signed ? out.signed : {};
  }

  /** Firma varias direcciones (en lotes). Devuelve { <pública>: <firmada> } solo con las que se pudieron firmar; un fallo de red no lanza: devuelve lo que haya. */
  async function sign(urls) {
    const out = {};
    const todo = [];
    for (const u of [...new Set(urls)]) {
      if (!isPrivateCloudUrl(u, cloudUrl)) continue;
      const hit = cache.get(u);
      if (hit && now() - hit.at < KEEP_MS) out[u] = hit.signed;
      else todo.push(u.trim());
    }
    for (let i = 0; i < todo.length; i += CHUNK) {
      try {
        const signed = await request(todo.slice(i, i + CHUNK));
        for (const [u, s] of Object.entries(signed)) {
          if (typeof s !== 'string' || !/^https:\/\//.test(s)) continue;
          cache.set(u, { signed: s, at: now() });
          out[u] = s;
        }
      } catch { /* sin internet o la nube aún no conoce sign_media: se reintenta en la siguiente */ }
    }
    return out;
  }

  return { sign, signOne: async (url) => (await sign([url]))[url.trim()] || null };
}
