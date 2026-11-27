/**
 * VISOR DE RECURSOS HTML/SCORM POR UNA RUTA PROPIA (script clásico: lo usan el service worker con importScripts, js/lessons.js
 * y el servidor de la escuela; se prueba con Node en tests-unit/lesson-frame.test.mjs).
 *
 * Por qué existe: el HTML del paquete se metía en el iframe con `srcdoc`. Un documento srcdoc HEREDA la política de contenido
 * (CSP) de index.html, que desde la v1.0.260 no permite scripts en línea y tiene `base-uri 'self'`: el navegador bloqueaba
 * los scripts del paquete y el <base href> hacia Storage, y la lección no arrancaba.
 * Ahora el iframe navega a `<app>/leccion-visor/<proyecto>.supabase.co/storage/v1/object/public/...`: el service worker
 * pide el archivo a Storage y lo entrega con su tipo correcto y una CSP propia para el paquete. El documento queda en el MISMO
 * origen que la app (la API SCORM de window.parent sigue al alcance) y sus rutas relativas caen bajo la misma carpeta, que el
 * service worker también atiende. En el servidor de la escuela el contenido ya es del mismo origen y se navega directo.
 */
(function (g) {
  const PREFIX = 'leccion-visor/';
  const PING = PREFIX + '__ping';
  const SCOPE_PARAM = 'pxscope';
  const STORAGE_HOST = /^[a-z0-9-]+\.supabase\.co$/i;
  const PUBLIC_PATH = /^\/storage\/v1\/object\/public\/[^/]/;

  // Política del documento del paquete: es contenido de cursos (lo suben docentes y administradores), corre en el mismo
  // origen que antes con srcdoc; se le permite lo que los paquetes SCORM/HTML5 usan (scripts en línea, eval de algunos
  // motores, recursos https) pero no plugins, ni formularios a otros sitios, ni que otra página lo enmarque.
  const FRAME_CSP = [
    "default-src 'self' https: data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' https: data: blob:",
    "media-src 'self' https: data: blob:",
    "font-src 'self' https: data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

  const TYPES = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', xhtml: 'application/xhtml+xml',
    js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    ico: 'image/x-icon', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4',
    webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm',
    pdf: 'application/pdf', vtt: 'text/vtt; charset=utf-8',
  };

  function extOf(pathname) {
    const m = /\.([a-z0-9]+)$/i.exec(String(pathname || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function contentTypeFor(pathname) { return TYPES[extOf(pathname)] || 'application/octet-stream'; }
  function isHtmlPath(pathname) { return /^(html?|xhtml)$/.test(extOf(pathname)); }

  /** ¿Es un archivo PÚBLICO de Storage de Supabase (lo único que la ruta del visor acepta)? */
  function isProxyableStorageUrl(url) {
    try {
      const u = new URL(String(url));
      return u.protocol === 'https:' && STORAGE_HOST.test(u.hostname) && !u.port && PUBLIC_PATH.test(u.pathname);
    } catch { return false; }
  }

  /**
   * Los paquetes SCORM/HTML5 guardan como dirección la función `serve-scorm-entry?path=<ruta en course-content>` (antes
   * reenviaba el HTML de entrada con un <base>). La ruta del visor ya no la necesita: se usa el archivo público de Storage
   * (mismo host; en el servidor de la escuela, el mismo origen). Otras direcciones se devuelven tal cual.
   */
  function entryToStorageUrl(url) {
    let u;
    try { u = new URL(String(url)); } catch { return String(url); }
    if (!/\/functions\/v1\/serve-scorm-entry\/?$/.test(u.pathname)) return u.href;
    const objectPath = u.searchParams.get('path');
    if (!objectPath || objectPath.split('/').some(seg => seg === '..' || seg === '.')) return u.href;
    const out = new URL(u.origin + '/storage/v1/object/public/course-content/' + objectPath.split('/').map(encodeURIComponent).join('/'));
    u.searchParams.forEach((v, k) => { if (k !== 'path') out.searchParams.append(k, v); });
    return out.href;
  }

  /** Dirección del visor para un recurso de Storage. `scopeUrl` = scope del service worker (con «/» final). */
  function frameUrlFor(contentUrl, scopeUrl, scopeKey) {
    if (!isProxyableStorageUrl(contentUrl)) return null;
    const u = new URL(String(contentUrl));
    const out = new URL(PREFIX + u.hostname + u.pathname + u.search, String(scopeUrl));
    if (scopeKey) out.searchParams.set(SCOPE_PARAM, String(scopeKey));
    return out.href;
  }

  /** Inverso: la dirección de Storage que corresponde a un pedido a la ruta del visor (o null si no es válida). Quita `pxscope`. */
  function upstreamFor(requestUrl, scopeUrl) {
    let req;
    try { req = new URL(String(requestUrl)); } catch { return null; }
    const base = new URL(PREFIX, String(scopeUrl));
    if (req.origin !== base.origin || !req.pathname.startsWith(base.pathname)) return null;
    const rest = req.pathname.slice(base.pathname.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return null;
    const host = rest.slice(0, slash);
    const path = rest.slice(slash);
    if (!STORAGE_HOST.test(host) || !PUBLIC_PATH.test(path)) return null;
    const up = new URL('https://' + host + path);
    req.searchParams.forEach((v, k) => { if (k !== SCOPE_PARAM) up.searchParams.append(k, v); });
    return isProxyableStorageUrl(up.href) ? up.href : null;
  }

  /** ¿Es el pedido de prueba con el que la app verifica que el service worker activo ya conoce la ruta? */
  function isPing(requestUrl, scopeUrl) {
    try { return new URL(String(requestUrl)).href.split('?')[0] === new URL(PING, String(scopeUrl)).href; } catch { return false; }
  }

  /**
   * El paquete guarda su avance en localStorage con una clave fija por curso; como el documento comparte origen con la app,
   * lo verían todos los que usan el mismo navegador. Antes de cualquier script del paquete se pone un localStorage y un
   * sessionStorage con prefijo por usuario y lección.
   */
  function storagePatch(scopeKey) {
    return `<script>(function(){var P=${JSON.stringify('px:' + scopeKey + ':').replace(/</g, '\\u003c')};
function mk(real){function mine(){return Object.keys(real).filter(function(k){return k.indexOf(P)===0;});}
return{getItem:function(k){return real.getItem(P+k);},setItem:function(k,v){real.setItem(P+k,v);},
removeItem:function(k){real.removeItem(P+k);},clear:function(){mine().forEach(function(k){real.removeItem(k);});},
key:function(i){var ks=mine();return ks[i]===undefined?null:ks[i].slice(P.length);},get length(){return mine().length;}};}
try{Object.defineProperty(window,'localStorage',{value:mk(window.localStorage),configurable:true});
Object.defineProperty(window,'sessionStorage',{value:mk(window.sessionStorage),configurable:true});}catch(e){}})();<\/script>`;
  }
  function withIsolatedStorage(html, scopeKey) {
    const src = String(html ?? '');
    if (!scopeKey) return src;
    const patch = storagePatch(scopeKey);
    const head = /<head(?:\s[^>]*)?>/i.exec(src);
    return head ? src.slice(0, head.index + head[0].length) + patch + src.slice(head.index + head[0].length) : patch + src;
  }

  g.LessonFrame = {
    PREFIX, PING, SCOPE_PARAM, FRAME_CSP,
    contentTypeFor, isHtmlPath, isProxyableStorageUrl, entryToStorageUrl, frameUrlFor, upstreamFor, isPing, withIsolatedStorage,
  };
})(typeof self !== 'undefined' ? self : globalThis);
