// Fotos, videos y adjuntos en buckets PRIVADOS para el servidor escolar (acción sign_media de node-sync).
// El nodo no tiene la llave de la nube: cuando necesita bajar una foto o mostrar un video de la nube, pide aquí una dirección firmada. Solo se firman archivos que
// pertenecen a la escuela de ese nodo (dueño = estudiante de la escuela o docente asignado a ella). Las reglas son puras (se prueban con Node); la consulta de
// pertenencia y la firma están en index.ts. Los videos de proyectos sin dueño en la ruta se atribuyen por la tabla projects (video_url).

/** Buckets que el nodo puede pedir firmados. `teacher-evidence` NO: el nodo no lo usa. */
export const NODE_MEDIA_BUCKETS = ['profile-photos', 'project-videos', 'comment-attachments'] as const;
export const MAX_MEDIA_URLS = 40;
export const MEDIA_TTL_SECONDS = 2 * 60 * 60;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface MediaRef { url: string; bucket: typeof NODE_MEDIA_BUCKETS[number]; path: string; owner: { kind: 'user'; id: string } | { kind: 'project' } }

/** Dirección pública de ESTE proyecto, de uno de los buckets permitidos, sin salirse de su carpeta. */
export function parseMediaUrl(raw: unknown, supabaseUrl: string): MediaRef | null {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  const re = new RegExp(`^${escapeRegex(supabaseUrl.replace(/\/+$/, ''))}/storage/v1/object/public/(${NODE_MEDIA_BUCKETS.join('|')})/([^?#]+)$`);
  const m = re.exec(raw.trim());
  if (!m) return null;
  let path: string;
  try { path = decodeURIComponent(m[2]); } catch { return null; }
  if (!path || path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return null;
  const bucket = m[1] as MediaRef['bucket'];
  const lower = path.toLowerCase();

  if (bucket === 'profile-photos') {
    const f = new RegExp(`^(${UUID})_\\d{9,15}\\.(png|jpe?g|webp|gif)$`).exec(lower);
    return f ? { url: raw.trim(), bucket, path, owner: { kind: 'user', id: f[1] } } : null;
  }
  if (bucket === 'comment-attachments') {
    const f = new RegExp(`^(${UUID})/[^/]+$`).exec(lower);
    return f ? { url: raw.trim(), bucket, path, owner: { kind: 'user', id: f[1] } } : null;
  }
  // project-videos: las evidencias de docentes llevan su id en la ruta; los videos de proyectos de estudiantes se atribuyen por la tabla projects.
  const ev = new RegExp(`^evidence/(${UUID})/[^/]+$`).exec(lower);
  if (ev) return { url: raw.trim(), bucket, path, owner: { kind: 'user', id: ev[1] } };
  if (path.includes('/')) return null;
  return { url: raw.trim(), bucket, path, owner: { kind: 'project' } };
}

/** Valida el pedido completo: una lista de direcciones, sin repetidas, con tope. */
export function validateSignRequest(body: any, supabaseUrl: string): { ok: true; refs: MediaRef[] } | { ok: false; error: string } {
  const urls = body?.urls;
  if (!Array.isArray(urls) || urls.length === 0) return { ok: false, error: 'Faltan las direcciones' };
  if (urls.length > MAX_MEDIA_URLS) return { ok: false, error: `Máximo ${MAX_MEDIA_URLS} direcciones por pedido` };
  const refs: MediaRef[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const ref = parseMediaUrl(u, supabaseUrl);
    if (!ref) return { ok: false, error: 'Dirección no permitida' };
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    refs.push(ref);
  }
  return { ok: true, refs };
}
