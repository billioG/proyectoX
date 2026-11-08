// Cableado al navegador de los medios privados (ver private-media-core.js): cada <img>, <video>, <audio>, <source>, <iframe> y <a> que apunte a la dirección pública
// de un bucket privado se cambia, en cuanto aparece en la página, por:
//   * en la nube: una dirección firmada que vence (la firma el propio navegador con su sesión);
//   * en el servidor escolar: /node-media?u=..., una ruta del nodo que consigue la firma con el token del nodo y redirige (solo funciona con internet; la foto ya
//     descargada al nodo se sirve local, ver school-node/rest/photos.js).
// No hace falta tocar las ~60 plantillas que muestran fotos y videos.
import { createMediaResolver, parsePrivateUrl } from './private-media-core.js';

const ATTRS = { IMG: 'src', VIDEO: 'src', AUDIO: 'src', SOURCE: 'src', IFRAME: 'src', A: 'href' };
let resolver = null;

const isNode = () => !!window.QUETZAL_NODE;

function nodeCloudOrigin() {
  try { return new URL(window.QUETZAL_NODE.storage_base).origin; } catch { return null; }
}

function enabled() {
  if (isNode()) return !!nodeCloudOrigin();
  return !!window._supabase?.storage && !!window.SUPABASE_URL;
}

function getResolver() {
  if (resolver) return resolver;
  if (isNode()) {
    const origin = nodeCloudOrigin();
    resolver = {
      parse: (url) => parsePrivateUrl(url, origin),
      resolve: async (url) => (parsePrivateUrl(url, origin) ? `/node-media?u=${encodeURIComponent(String(url).trim())}` : url),
    };
    return resolver;
  }
  resolver = createMediaResolver({
    supabaseUrl: window.SUPABASE_URL,
    sign: async (bucket, paths, opts) => {
      const storage = window._supabase.storage.from(bucket);
      if (opts?.download) {
        // Con «download» (descargar con nombre) se firma uno por uno: createSignedUrls no acepta esa opción.
        const out = [];
        for (const path of paths) {
          const { data } = await storage.createSignedUrl(path, 7200, { download: opts.download });
          out.push({ path, signedUrl: data?.signedUrl || null });
        }
        return out;
      }
      const { data, error } = await storage.createSignedUrls(paths, 7200);
      if (error) throw error;
      return data || [];
    },
  });
  return resolver;
}

async function hydrate(el) {
  const attr = ATTRS[el.tagName];
  if (!attr) return;
  const current = el.getAttribute(attr);
  if (!current || !getResolver().parse(current)) return;
  const resolved = await getResolver().resolve(current);
  // Si mientras tanto la plantilla cambió la dirección, no se pisa.
  if (resolved && resolved !== current && el.getAttribute(attr) === current) el.setAttribute(attr, resolved);
}

function scan(root) {
  if (!enabled() || !root) return;
  if (root.nodeType === 1) {
    if (ATTRS[root.tagName]) hydrate(root);
    root.querySelectorAll?.('img[src], video[src], audio[src], source[src], iframe[src], a[href]').forEach(hydrate);
  }
}

/** Para código que pide el archivo por su cuenta (visor 3D, fetch): devuelve una dirección que funciona aunque el bucket sea privado. */
window.resolveMediaUrl = async function resolveMediaUrl(url) {
  if (!enabled()) return url;
  try { return await getResolver().resolve(url); } catch { return url; }
};
window.isPrivateMediaUrl = (url) => {
  const base = isNode() ? nodeCloudOrigin() : window.SUPABASE_URL;
  return !!(base && parsePrivateUrl(url, base));
};

function start() {
  if (!enabled()) return;
  scan(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') { hydrate(m.target); continue; }
      m.addedNodes.forEach((n) => scan(n));
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'] });
}

// En la nube, los datos de Supabase llegan cuando termina el arranque de la app; se espera a que exista el cliente. En el nodo, /node-config.js ya definió QUETZAL_NODE.
let tries = 0;
const wait = setInterval(() => {
  if (enabled()) { clearInterval(wait); start(); }
  else if (++tries > 120) clearInterval(wait);
}, 500);
