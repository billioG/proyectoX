/**
 * LÓGICA PURA DEL VISOR DE RECURSOS HTML/SCORM (sin DOM: se prueba con Node, tests-unit/lessons-iframe-logic.test.mjs).
 * La usa js/lessons.js (loadIframeViaFetch). El recurso se mete en el iframe con srcdoc, que no tiene URL propia: sus enlaces
 * relativos («index.html», «./», «/», «») se resolverían contra la URL de la app y abrirían Quetzal dentro del visor.
 */

/** Carpeta (con «/» final) de la URL que se pidió con fetch(); `pageUrl` resuelve las direcciones relativas («/content/...»). */
export function iframeBaseFolder(url, pageUrl) {
  try { return new URL('.', new URL(String(url), pageUrl)).href; } catch { return null; }
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Pone `<base href="carpeta">` al inicio del <head> para que los enlaces y recursos relativos del paquete queden bajo su carpeta.
 * Si el HTML ya trae un <base href>, no lo duplica; si no hay <head>, lo crea (después de <html> o del doctype, para no sacar al
 * navegador del modo estándar). Si `folder` no es una dirección http(s), devuelve el HTML tal cual.
 */
export function injectBaseHref(html, folder) {
  const src = String(html ?? '');
  if (!/^https?:\/\//i.test(String(folder || ''))) return src;
  if (/<base\s[^>]*\bhref\s*=/i.test(src)) return src;
  const tag = `<base href="${escAttr(folder)}">`;
  const head = /<head(?:\s[^>]*)?>/i.exec(src);
  if (head) return src.slice(0, head.index + head[0].length) + tag + src.slice(head.index + head[0].length);
  const make = `<head>${tag}</head>`;
  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(src);
  if (htmlTag) return src.slice(0, htmlTag.index + htmlTag[0].length) + make + src.slice(htmlTag.index + htmlTag[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(src);
  if (doctype) return src.slice(0, doctype[0].length) + make + src.slice(doctype[0].length);
  return make + src;
}

/**
 * Qué hacer con un enlace dentro del visor:
 *  'platform' -> lleva a Quetzal (raíz de la app, /index.html) o pide salir del visor (target _top/_parent): se bloquea.
 *  'hash'     -> ancla dentro de la misma página (con <base> navegaría a la carpeta): se resuelve desplazando.
 *  'external' -> http(s) a otro origen: se abre en otra pestaña (_blank + noopener).
 *  'internal' -> otro archivo del mismo paquete (o del mismo origen): navega normal.
 *  'ignore'   -> mailto:, tel:, javascript:, sin href o dirección ilegible: no se toca.
 * `baseUrl` es el baseURI del documento del iframe (si es about:srcdoc se resuelve contra la raíz de la app, como haría el navegador).
 */
export function classifyLink({ href, target, baseUrl, appOrigin }) {
  const t = String(target || '').trim().toLowerCase();
  if (t === '_top' || t === '_parent') return 'platform';
  if (href == null) return 'ignore';
  const raw = String(href).trim();
  if (raw.startsWith('#')) return 'hash';
  let resolveBase = String(baseUrl || '');
  if (!/^https?:/i.test(resolveBase)) resolveBase = `${appOrigin}/`;
  let u;
  try { u = new URL(raw, resolveBase); } catch { return 'ignore'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'ignore';
  if (u.origin !== appOrigin) return 'external';
  if (u.pathname === '/' || u.pathname === '/index.html') return 'platform';
  return 'internal';
}
