# Librerías de terceros (copia local)

Copias exactas de lo que `index.html` descarga de CDN. **Solo las usa el nodo escolar**
(`school-node/offline-assets.js` reescribe `index.html` para apuntar aquí) para que la app
arranque en una escuela sin internet. La versión en la nube sigue usando los CDN.

| Archivo | Origen | Licencia |
|---|---|---|
| `supabase-js-2.118.0.js` | cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0 | MIT |
| `font-awesome-6.4.0/` (css + webfonts woff2) | cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0 | CSS MIT · fuentes SIL OFL 1.1 |
| `inter/` (latin + latin-ext) | fonts.googleapis.com/css2?family=Inter | SIL OFL 1.1 |
| `jszip-3.10.1.min.js` | cdn.jsdelivr.net/npm/jszip@3.10.1 | MIT o GPLv3 |
| `driver-1.js.iife.js`, `driver-1.css` | cdn.jsdelivr.net/npm/driver.js@1 | MIT |
| `confetti-1.9.2.browser.min.js` | cdn.jsdelivr.net/npm/canvas-confetti@1.9.2 | ISC |
| `jsqr-1.4.0.min.js` | cdn.jsdelivr.net/npm/jsqr@1.4.0 | Apache-2.0 |
| `three-0.128.0/` (5 archivos, ver abajo) | cdn.jsdelivr.net/npm/three@0.128.0 | MIT |

`three-0.128.0/` es el visor 3D de proyectos (STL/OBJ/GLB, `js/model-viewer.js`). Conserva la estructura relativa de la CDN y son byte a byte los mismos archivos
(su sha384 coincide con `THREE_SRI` en `js/model-viewer.js` y con `scripts/sri-hashes.json`; lo verifica `tests-unit/model-viewer-offline.test.mjs`):

- `build/three.min.js`
- `examples/js/controls/OrbitControls.js`
- `examples/js/loaders/STLLoader.js`
- `examples/js/loaders/OBJLoader.js`
- `examples/js/loaders/GLTFLoader.js`

`model-viewer.js` los usa solo si existe `window.QUETZAL_NODE` (modo nodo), sin atributos `integrity`/`crossorigin`; en la nube sigue con la CDN y SRI.

No se copia PDF.js (más de 1 MB): solo sirve para importar PDF de alumnos, que no se hace en el nodo.

Al subir la versión de una librería en `index.html`, actualiza también la copia y la tabla de
`school-node/offline-assets.js` (hay una prueba que avisa si quedan CDN sin reemplazar).
