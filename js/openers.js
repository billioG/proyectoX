/*
 * Aperturas «perezosas» de pantallas desde botones del HTML (antes eran onclick="(async () => { ... import(...) })()", que la política de contenido
 * sin 'unsafe-inline' ya no admite). Cada función carga el módulo la primera vez y después llama a la función real.
 * Script clásico: se carga en el <head>, después de js/safe-handlers.js.
 */
(function () {
  var base = (document.currentScript && document.currentScript.src) || '';
  function mod(file) { return new URL(file, base || document.baseURI).href; }
  function lazy(globalName, loader) {
    return function () {
      var go = function () { return window[globalName](); };
      if (typeof window[globalName] === 'function') return go();
      return Promise.resolve(loader()).then(go);
    };
  }
  window.lazyOpenNodeUsbSync = lazy('openNodeUsbSync', function () { return import(mod('./node-usb.js')); });
  window.lazyOpenImpactDashboard = lazy('openImpactDashboard', function () { return import(mod('./impact.js')); });
  window.lazyOpenQuetzadexAdmin = lazy('openQuetzadexAdmin', function () { return window.loadModule('profile'); });
  window.lazyOpenNodeAdmin = lazy('openNodeAdmin', function () { return import(mod('./node-admin.js') + '?v=' + (window.APP_VERSION || '')); });
  window.openCalendarBooking = function () { window.open('https://calendar.app.google/X8DMwgVgMLY2yKCx7', '_blank', 'noopener'); };
})();
