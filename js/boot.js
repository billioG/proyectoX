/*
 * Arranque de index.html (antes eran cuatro <script> en línea; la política de contenido ya no admite script en línea).
 * Script clásico, sin defer: corre antes que cualquier módulo. El número de versión está en js/version.js.
 */
(function () {
// 1) Silenciar console.log/info/debug en producción (activar con localStorage.PX_DEBUG='true').
//    Va antes de todo lo demás porque los console.log de cada módulo corren al importarse.
if (localStorage.getItem('PX_DEBUG') !== 'true') {
    console.log = console.info = console.debug = function () {};
}
    

// 2) La pantalla de login se pinta antes de que terminen de cargar los módulos. Hasta que auth.js defina las funciones reales,
//    estas versiones mínimas evitan el error al tocar el ojo de la contraseña o salir del campo de usuario muy rápido.
window.checkLoginPasswordMode = function () { };
window.toggleLoginPasswordVisibility = function () {
    var i = document.getElementById('login-password'), e = document.getElementById('login-password-eye');
    if (!i || !e) return;
    var h = i.type === 'password'; i.type = h ? 'text' : 'password'; e.className = h ? 'fas fa-eye-slash' : 'fas fa-eye';
};
    

// 3) Cargador de librerías pesadas bajo demanda: JSZip, driver.js (tour), PDF.js, jsQR, QRCode y confetti no bloquean el primer pintado.
//    window.loadLib('jszip', ...) devuelve una promesa (true si quedaron disponibles). Las livianas (confetti, QR) se precargan cuando el navegador está libre.
(function () {
    var J = 'https://cdn.jsdelivr.net/npm/', C = 'https://cdnjs.cloudflare.com/ajax/libs/';
    var LIBS = {
        jszip: { js: J + 'jszip@3.10.1/dist/jszip.min.js', t: 'JSZip' },
        driver: { js: J + 'driver.js@1.11.0/dist/driver.js.iife.js', css: J + 'driver.js@1.11.0/dist/driver.css', t: 'driver' },
        pdfjs: {
            js: C + 'pdf.js/3.11.174/pdf.min.js', t: 'pdfjsLib',
            done: function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = C + 'pdf.js/3.11.174/pdf.worker.min.js'; }
        },
        jsqr: { js: J + 'jsqr@1.4.0/dist/jsQR.min.js', t: 'jsQR' },
        qrcode: { js: 'js/qrcode.min.js', t: 'QRCode' },
        confetti: { js: J + 'canvas-confetti@1.9.2/dist/confetti.browser.min.js', t: 'confetti' }
    };
    // Integridad (SRI): si una CDN cambiara un archivo, el navegador lo rechaza. Se actualiza con scripts/sri-hashes.mjs.
    // Solo se aplica a lo que viene de https (en el nodo escolar se usan copias locales de vendor/, que no llevan integrity).
    var SRI = {
        jszip: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
        driver: 'sha384-IYtZiDPxvr6nvRAL339SO8ZswcKYOVT1EqS0LfuS+uSMgZmi8cuSQcB7oR7Pf4zS',
        driverCss: 'sha384-VwkY5zeG8ASxat2SbNtS/1cZMo1puySWI5Bc8njancMDAy0vty6q1aemwwTnxmuU',
        pdfjs: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
        jsqr: 'sha384-hStSInNIZ8ljtOVrmrgf7zdHMapaLBWoSnPTtF0nzsybp4+LuhDz6sHuEVpWIX8o',
        confetti: 'sha384-xgNdoEQu0JeBEAN3/f7mrS+EPOsrmARCvhS7PEpk7QI2wvo4YOF3xY3EjQGKHAY9'
    };
    var jobs = {};
    function one(name) {
        var L = LIBS[name];
        if (!L) return Promise.resolve(false);
        if (window[L.t]) return Promise.resolve(true);
        if (jobs[name]) return jobs[name];
        if (L.css) {
            var l = document.createElement('link');
            l.rel = 'stylesheet'; l.href = L.css;
            if (SRI[name + 'Css'] && /^https:/.test(L.css)) { l.integrity = SRI[name + 'Css']; l.crossOrigin = 'anonymous'; }
            document.head.appendChild(l);
        }
        jobs[name] = new Promise(function (ok) {
            var sc = document.createElement('script');
            sc.src = L.js; sc.async = true;
            if (SRI[name] && /^https:/.test(L.js)) { sc.integrity = SRI[name]; sc.crossOrigin = 'anonymous'; }
            sc.onload = function () { try { if (L.done) L.done(); } catch (e) { } ok(true); };
            sc.onerror = function () { delete jobs[name]; sc.remove(); ok(false); };
            document.head.appendChild(sc);
        });
        return jobs[name];
    }
    window.loadLib = function () {
        return Promise.all([].slice.call(arguments).map(one)).then(function (r) { return r.every(Boolean); });
    };
    window.addEventListener('load', function () {
        var go = function () { window.loadLib('confetti', 'qrcode', 'jsqr'); };
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 });
        else setTimeout(go, 2000);
    });
})();
    

// 4) Herramientas de desarrollo (Shift + D) -- solo administrador.
// Mostrar herramientas dev si está activado -- solo admin
window.addEventListener('DOMContentLoaded', () => {
    if (window.userRole === 'admin' && localStorage.getItem('PX_DEV_MODE') === 'true') {
        const devTools = document.getElementById('dev-tools');
        if (devTools) devTools.style.display = 'block';
    }
});

// Atajo: Shift + D para activar modo dev -- solo admin
window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'D' && window.userRole === 'admin') {
        // Toggle dev mode
        const isDevMode = localStorage.getItem('PX_DEV_MODE') === 'true';
        localStorage.setItem('PX_DEV_MODE', !isDevMode);

        const devTools = document.getElementById('dev-tools');
        if (devTools) {
            if (!isDevMode) {
                devTools.style.display = 'block';
                showToast('<i class="fas fa-screwdriver-wrench"></i>️ Modo Desarrollador Activado', 'success');
            } else {
                devTools.style.display = 'none';
                showToast('<i class="fas fa-screwdriver-wrench"></i>️ Modo Desarrollador Desactivado', 'default');
            }
        }
    }
});
    
})();
