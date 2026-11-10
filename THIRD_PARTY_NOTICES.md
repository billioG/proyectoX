# Avisos de terceros

Quetzal LMS usa las librerías de abajo, cada una con **su propia licencia**. El `LICENSE` del proyecto (todos los derechos
reservados) cubre solo el código y el contenido del autor; no cambia las licencias de estas piezas. Revisión del 9/11/2026,
hecha leyendo las licencias declaradas por cada proyecto; no es asesoría legal.

Las licencias permisivas (MIT, ISC, Apache-2.0, OFL) permiten usar la librería dentro de un proyecto propietario siempre que se conserve
su aviso de copyright y su texto de licencia: por eso cada copia dentro de `vendor/` y de `css/` conserva su cabecera, y este archivo
las lista.

## Que llegan al navegador (la app)

| Componente | Versión | Licencia | De dónde viene |
|---|---|---|---|
| supabase-js | 2.118.0 | MIT | CDN y `vendor/cdn/` |
| JSZip | 3.10.1 | MIT **o** GPL-3.0 (se usa bajo MIT) | CDN y `vendor/cdn/` |
| driver.js | 1.x | MIT | CDN y `vendor/cdn/` |
| canvas-confetti | 1.9.2 | ISC | CDN y `vendor/cdn/` |
| jsQR | 1.4.0 | Apache-2.0 | CDN y `vendor/cdn/` |
| three.js | 0.128.0 | MIT | CDN (visor 3D) |
| PDF.js | 3.11.174 | Apache-2.0 | CDN (importación de nóminas PDF) |
| Font Awesome Free | 6.4.0 | Íconos CC BY 4.0 · fuentes SIL OFL 1.1 · código MIT | CDN y `vendor/cdn/` (la cabecera de `all.min.css` conserva la atribución) |
| Inter | — | SIL OFL 1.1 | Google Fonts y `vendor/cdn/` |
| Outfit | — | SIL OFL 1.1 | Google Fonts |
| h5p-standalone | — | MIT (proyecto upstream; **confirmar la versión exacta de la copia**) | `vendor/h5p-standalone/` |
| Tailwind CSS | 3.4.17 | MIT | genera `css/tailwind.css` (no se distribuye el código de Tailwind) |

## Servidor escolar (`school-node/`, dependencias de producción)

| Componente | Licencia |
|---|---|
| better-sqlite3 | MIT |
| bcryptjs | MIT |
| multicast-dns | MIT |

## Solo desarrollo (no se distribuyen)

`@playwright/test` (Apache-2.0), `http-server` (MIT), `tailwindcss` (MIT).

## Pendiente de confirmar por el autor

- `icon-192.png`, `icon-512.png` y la identidad visual (mascotas, ilustraciones, cursos): confirmar que son obra propia o que se
  tiene permiso de uso.
- Copia de `vendor/h5p-standalone/`: anotar la versión y el enlace al `LICENSE` de ese proyecto.
- Contenido de cursos: vive en Supabase, no en este repositorio; cada docente responde por el material que sube.
