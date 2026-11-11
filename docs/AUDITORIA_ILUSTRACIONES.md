# Auditoría de ilustraciones, íconos, sonidos y tipografías (11/11/2026)

Alcance: todo lo gráfico y sonoro que llega al navegador desde este repositorio. Hecho leyendo el código y los archivos del repositorio;
**no es asesoría legal**. La propiedad de lo que hizo una persona o una herramienta de IA por encargo del titular la confirma el titular.

## Resultado en una línea

El repositorio casi no contiene imágenes de terceros: solo hay **2 archivos de imagen** (`icon-192.png`, `icon-512.png`) y son la identidad
de Quetzal LMS confirmada por el titular. Las mascotas, ilustraciones, íconos de juego y sonidos están **dibujados o sintetizados en código**.
Se encontraron y **corrigieron 2 recursos de terceros** (una trama de fondo y una imagen de relleno).

## Inventario

| Qué | Dónde está | Origen | Estado |
|---|---|---|---|
| Ícono de la app (192 y 512 px) y mascota quetzal | `icon-192.png`, `icon-512.png` | Identidad de Quetzal LMS / Yo Aprendo, confirmada por el titular el 11/11/2026 | OK |
| Mascotas (quetzal, jaguar, manatí, panda, danta y demás especies), huevos, etapas, aura, corona, accesorios | `js/companion.js`, `js/mascot-widget.js` | SVG dibujado en código (formas planas) | OK: obra del proyecto. La especie «panda» se hizo a pedido del titular siguiendo una referencia tipo clipart (solo el estilo; no se copió ningún archivo). Conviene que el titular confirme que no usó una imagen ajena como calco. |
| Nombres de especies y datos del Quetzadex | `js/companion.js` | Animales reales de Guatemala; estado de conservación según la UICN (dato público) | OK. Ninguna mascota usa nombres ni diseños de personajes comerciales. |
| Colores de los ODS (ONU) | `js/companion.js` (`ODS`) | Solo el color oficial y el nombre del objetivo; **no** se usan los logotipos ni los íconos de los ODS | OK. Si algún día se muestran los íconos oficiales de los ODS, hay que seguir las reglas de uso de las Naciones Unidas (no comerciales sin permiso). |
| Íconos de interfaz | Font Awesome Free 6.4.0 (`fa-*`) | Íconos CC BY 4.0 (atribución en la cabecera de `all.min.css` y en `THIRD_PARTY_NOTICES.md`) | OK |
| Emojis (🏆, 💎, ⭐…) | Textos de la interfaz | Caracteres Unicode; los dibuja la fuente de cada dispositivo | OK |
| Tipografías | Inter y Outfit (Google Fonts, `vendor/cdn/inter/`) | SIL OFL 1.1 | OK |
| Sonidos | `js/companion.js`, `js/game-arena.js` | Sintetizados con Web Audio (`AudioContext`); no hay archivos de audio | OK |
| Confeti, tour guiado, códigos QR | canvas-confetti (ISC), driver.js (MIT), `js/qrcode.min.js` | Librerías con licencia permisiva (ver `THIRD_PARTY_NOTICES.md`) | OK |
| Trama de fondo «cubes» de certificados, reportes, perfil y bonos | era `https://www.transparenttextures.com/patterns/cubes.png` | **Imagen de un tercero** (Transparent Textures, patrones con licencias de sus autores, varias CC BY-SA) enlazada desde 5 lugares; además se pedía a internet y no cargaba sin conexión | **Corregido en v1.0.263**: clase CSS propia `.px-pattern-cubes` en `css/styles.css` |
| Imagen de relleno de una subida sin conexión | era `https://via.placeholder.com/400x300` | Servicio de terceros (ya fuera de uso) | **Corregido en v1.0.263**: imagen SVG propia incrustada en `js/sync-manager.js` |
| Videos de YouTube / TinkerCAD (enlaces) | Textos de ayuda y cursos | Enlaces a contenido ajeno (no se copia) | OK |
| Contenido de cursos (imágenes, videos, SCORM/H5P que suben los docentes) | Supabase Storage, no este repositorio | Cada docente responde por lo que sube | Ver `docs/PRIVACIDAD_Y_CONSENTIMIENTO.md` y los términos de uso |
| `vendor/h5p-standalone/` | Reproductor H5P (MIT) | Falta anotar la versión exacta y el enlace a su `LICENSE` | Pendiente (ver `THIRD_PARTY_NOTICES.md`) |

## Cómo se revisó (para repetirlo)

```bash
git ls-files | grep -iE "\.(png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|glb|stl|obj)$"   # imágenes, audio, video y modelos 3D del repositorio
grep -rhoE "https?://[a-zA-Z0-9.-]+" js index.html *.html | sort | uniq -c | sort -rn    # todos los dominios a los que apunta el código
```

Lo esperado: solo `icon-192.png` e `icon-512.png`, y como dominios externos CDN de librerías (jsDelivr, cdnjs, Google Fonts), Supabase, YouTube
y los propios del proyecto. Cualquier dominio de imágenes, íconos o texturas nuevo es una señal para revisar su licencia.

## Pendientes del titular

1. Confirmar que la mascota «panda» (y cualquier otra) se dibujó desde cero y no calcando una imagen ajena.
2. Si se agregan imágenes o ilustraciones por encargo a terceros: pedir por escrito la cesión o licencia y guardarla.
3. Anotar la versión y el `LICENSE` de `vendor/h5p-standalone/`.
