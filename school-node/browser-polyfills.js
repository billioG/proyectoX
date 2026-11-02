// Reemplazos para navegadores que abren el nodo por http://<IP> (contexto NO seguro): ahí faltan funciones que la app usa.
// Se entregan dentro de /node-config.js, antes que cualquier módulo de la app.
export const POLYFILLS = `(function () {
  try {
    var c = window.crypto;
    if (c && typeof c.randomUUID !== 'function' && typeof c.getRandomValues === 'function') {
      c.randomUUID = function () {
        var b = new Uint8Array(16);
        c.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
      };
    }
  } catch (e) { /* sin crypto: la app mostrará su propio error */ }
})();
`;
