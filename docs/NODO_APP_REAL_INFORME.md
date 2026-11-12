# Informe: la app real sobre el nodo escolar (sin internet)

Medido el 2026-11-01 sobre la versión **v1.0.197**. Los números salen del repositorio y de pruebas en el navegador; los
puntos marcados como **estimación** son criterio, no medición.

> Para volver a medir la cobertura cuando cambie la app: `node scripts/node-cobertura.mjs`.

> **Nota de actualización (12/11/2026, v1.0.266).** Este informe es la **foto del 1/11/2026 (v1.0.197)** y se conserva como registro de
> lo que costó y de cómo se construyó; **varias filas de las secciones 1, 3 y 4 ya no son ciertas.** Desde entonces el nodo agregó,
> sin internet: subir proyecto y reaccionar (v1.0.208, la «regresión» de la sección 3 está resuelta), comentarios y notas de las
> lecciones, asistencia (QR o lista rápida), equipos, exámenes con hoja de respuestas, permisos de asistencia, mascota (elegir,
> huevos, accesorios), retos Contrarreloj y Ahorcado, foto de perfil, buzón, progreso del docente y creación de cursos y recursos
> (el docente entra con su misma contraseña, sin PIN aparte). **Siguen necesitando internet:** el asistente con IA, los retos de
> comprensión, ortografía y depuración, la tienda y el pase de temporada, el chat de la mascota, las notificaciones y adjuntar
> imágenes a un comentario. La referencia vigente es `school-node/README.md`.
>
> **Cobertura recalculada hoy** con `node scripts/node-cobertura.mjs`: de 82 tablas que usa la app, el nodo sirve con datos reales
> 31, otras 11 responden vacío y 40 dan error 404 (en la foto: 81 tablas, 15, 17 y 49); de 75 funciones (RPC) de la nube que llama la
> app, 28 están emuladas (en la foto: 69 y 8). Los demás números de este informe (líneas, pruebas, hallazgos) **no se recalcularon**.
> Para el kit de router, el HTTPS opcional, la imagen de microSD y la actualización de servidores ver `docs/NODO_KIT_ROUTER.md`,
> `docs/NODO_LIMITES.md`, `docs/NODO_IMAGEN_MICROSD.md` y `school-node/README.md`.

## 1. Resumen

- El nodo ahora responde con el mismo «idioma» que Supabase (`/rest/v1`, `/auth/v1`, `/functions/v1/student-login`) sobre una
  réplica SQLite de la escuela. La **app real** corre encima sin pantallas copiadas.
- Funciona sin internet: **login** (estudiante con contraseña de clase, docente con su correo y contraseña normal), **Inicio**, **Cursos**,
  **Perfil**, **avance de lecciones con XP**, **cofre diario**, **Práctica** del Centro de Juego (sin IA), **Evaluar proyectos**
  y **Avisos**. Todo se guarda en el nodo y se sube solo cada 10 minutos, o con **Sincronizar ahora**.
- **Pero hay una regresión que conviene decidir ya:** cuando la app real se activa en el nodo, **dejan de funcionar «Subir
  proyecto» y las reacciones a proyectos**, que sí funcionaban en el modo anterior (pantalla con PIN, disponible en `/?modo=pin`).
  Ver sección 3.
- La capa local es **grande en cuanto a líneas** pero **angosta en cobertura**: de 81 tablas que usa la app, el nodo sirve con
  datos reales 15, otras 17 responden vacío, y **49 dan error 404**. De 69 funciones de la nube que llama la app, 8 están emuladas.

## 2. Qué costó

### Código nuevo (rama completa contra el estado anterior de `main`)

| Área | Archivos | Líneas añadidas |
|---|---:|---:|
| Nodo: capa local (`school-node/rest`) | 11 | 1 554 |
| Nodo: resto (servidor, sincronización, README) | 8 | 607 |
| Nube: `node-sync` (más su espejo idéntico) | 6 + 6 | 638 + 638 |
| Nube: migraciones SQL | 2 | 184 |
| App (`js/`, `index.html`, service worker) | 8 | 360 |
| Pruebas | 29 | 3 267 |
| Documentación | 11 | 289 |
| **Total** | **81** | **7 537** (36 borradas) |

Las pruebas son casi tantas líneas como todo el código de producción junto (3 267 contra unas 3 300, sin contar el espejo de la nube). Fue deliberado: es
una capa de seguridad y de sincronización, y ahí se rompe en silencio.

### Qué se construyó

- **Motor de consultas** que entiende lo que manda `supabase-js` (select con relaciones anidadas, filtros, orden, upsert).
- **Réglas de acceso por fila** copiadas de las políticas reales de la nube (qué ve cada estudiante y docente).
- **Almacén SQLite** con réplica y **bandeja de salida** (lo que se hace sin internet y aún no subió).
- **Acceso**: JWT propio del nodo, login de estudiantes (contraseña de clase), login de docentes (correo + PIN fijado en línea),
  límites de intentos por IP y por usuario.
- **Sincronización**: bajada genérica de tablas desde `node-sync`; subida de avances, prácticas, evaluaciones y avisos, con
  confirmación una por una y validación otra vez en la nube (el nodo no es de confianza).
- **8 funciones de la nube emuladas** y **17 tablas que responden vacío** para que la app no falle al entrar.

### Calidad

| Qué | Resultado |
|---|---|
| Pruebas del nodo (Node 20) | 317 pruebas: 267 pasan, 0 fallan, 50 omitidas |
| Pruebas de la nube con TypeScript (Node 22) | 50 de 50 |
| Pruebas de pantalla (Playwright) | 21 de 21 |
| Migración SQL contra PostgreSQL real | pasa |
| Revisiones independientes con el modelo más capaz | 2 rondas, **20 hallazgos** |

Los 20 hallazgos fueron: 4 críticos, 7 importantes y 9 menores. Los críticos y los importantes están corregidos, con prueba que
primero falló. Ejemplos: un estudiante podía fabricar XP o trabar la sincronización de toda la escuela con un avance falso, un
solo `GET` con muchos comodines congelaba el nodo, y un aviso recién enviado desaparecía hasta la siguiente sincronización.
Dato útil para estimar: salió **más de un defecto serio por cada 500 líneas** de la capa de seguridad y sincronización; por eso
cada pieza nueva debe llevar revisión independiente.

## 3. Qué funciona y qué no

Estados: **Sí** funciona con datos reales; **Vacío** la pantalla abre pero sin datos (no hay error); **No** falla (404 o permiso).
Todo lo de la columna «Verificado» se probó en el navegador contra un nodo de prueba.

| Pantalla o función | Estado | Verificado |
|---|---|---|
| Login estudiante y docente | Sí | pantalla + pruebas |
| Inicio (proyectos de la clase, rango, XP, trabajo pendiente) | Sí | pantalla |
| Cursos y avance de lecciones (+10 XP al instante) | Sí | pantalla |
| Perfil | Sí | pantalla |
| Cofre diario | Sí | pantalla |
| Práctica del Centro de Juego (preguntas del banco, sin IA) | Sí | pantalla |
| Evaluar proyectos (docente) | Sí | pantalla |
| Avisos (docente envía, estudiante ve y marca leído) | Sí | pantalla |
| Aviso de sincronización y botón «Sincronizar ahora» | Sí | pantalla |
| Ranking | Sí (con la lista de la clase) | consulta |
| Recursos de los cursos (video, PDF, imagen, H5P/SCORM) | Sí, desde v1.0.198 (se sirven desde el espejo del nodo) | pruebas + prueba real en escuela |
| Fotos de perfil | Sí, desde v1.0.198 (se descargan al sincronizar) | pruebas |
| Comentarios y notas de las lecciones | No: avisa «Esto no está disponible sin internet» | consulta |
| **Subir proyecto (video / modelo 3D)** | **No** (permiso denegado; solo en `/?modo=pin`) | consulta |
| **Reaccionar a un proyecto** | **No** (`react_to_project` no emulada; solo en `/?modo=pin`) | consulta |
| Mi progreso por competencia | No (`get_my_progress`) | consulta |
| Liga, Pase de temporada, Tienda, Cosméticos, Mascota | No | consulta |
| Tema semanal de la clase | No | consulta |
| Retos 1v1, torneos, eventos aleatorios | Vacío / No | consulta |
| Asistencia, exámenes, bonos, KPI | Vacío / No | consulta |
| Encuestas, comentarios, notificaciones | Vacío | consulta |
| IA (evaluar con IA, generar preguntas) | No (nunca, requiere internet) | — |
| Notificaciones push y avisos a padres | No (solo al sincronizar con internet) | — |
| Racha diaria | No sube sin internet (la calcula la nube) | prueba |

**La regresión.** Antes de la capa nueva, el modo del nodo ya tenía «Subir proyecto» (con el video guardado en el nodo y publicado
en la nube al sincronizar) y las cinco reacciones, ambas con su validación en la nube (`node-sync` y `apply_node_reaction`).
Ese código sigue en el repositorio y en la nube, pero la app real no lo usa: sus llamadas (`projects.insert`, almacenamiento
`/storage/v1`, `react_to_project`) no están emuladas. Mientras la capa nueva esté activa, esos dos botones fallan.

## 4. Qué costaría completar el resto (estimación)

Tamaños, para alguien que ya conoce esta capa, **incluyendo pruebas y revisión**: **S** ≈ medio día a un día, **M** ≈ 2 a 4 días,
**L** ≈ 1 a 2 semanas.

| Qué | Tamaño | Notas |
|---|:--:|---|
| Reaccionar a proyectos (`react_to_project`, `get_project_reactions`) | **S** | La validación en la nube (`apply_node_reaction`) y la lógica del nodo ya existen; falta emularlas en la capa y subirlas por la bandeja |
| Subir proyecto con video | **M** | Hay que emular el almacenamiento (`/storage/v1`), dejar que el estudiante inserte su proyecto, servir el video con rango y reutilizar la subida a la nube que ya existe |
| Mi progreso por competencia (`get_my_progress`) | **M** | Portar el SQL a JavaScript y guardar las prácticas en la réplica |
| Tema semanal, encuestas, comentarios | **S** cada uno | Lectura sobre la réplica; escribir pide reglas nuevas |
| Evaluar con una tabla de criterios propia del docente, crear lecciones y cursos | **L** | Subir archivos H5P/SCORM grandes y mantener la jerarquía curso → lección |
| Asistencia y exámenes (incluye el escáner de hojas) | **M–L** | El registro GPS no tiene sentido sin señal; la asistencia manual sí |
| Liga, pase, tienda, cosméticos, mascota | **L** | Es economía del juego: escribe XP y gemas, así que cada función exige validación estricta en la nube |
| Retos 1v1, torneos, eventos aleatorios | **No recomendado** | Necesitan dos jugadores a la vez y, varios, IA; la Práctica ya cubre el juego en solitario |
| IA | **Imposible** | Requiere internet |

**Recomendación:** hacer primero **reacciones** y **subir proyecto**, para eliminar la regresión de la sección 3 y que activar la
capa nueva no le quite nada a nadie frente al modo anterior. Lo demás depende de qué necesiten de verdad las escuelas sin señal.

## 5. Cómo mantenerlo

La capa local es una **copia manual** de partes de la nube. Cada vez que la nube o la app cambian, hay que revisar:

1. **Tabla o columna nueva en la nube que la app pida:** agregarla en `school-node/rest/schema.js` (lista permitida),
   `supabase/functions/node-sync/tables.ts` (qué baja) y `school-node/rest/policies.js` (quién la ve). Una prueba comprueba que
   las columnas que baja la nube coinciden con las que sirve el nodo, pero **no detecta que la app empiece a pedir algo nuevo**.
2. **Política de seguridad (RLS) que cambia en la nube:** copiarla a `policies.js`; si no, el nodo seguirá con la regla vieja.
3. **Función (RPC) nueva en la app:** sin emular, la app recibe 404. `node scripts/node-cobertura.mjs` lista lo que falta.
4. **Migración de la nube:** sigue el procedimiento de `docs/MIGRATIONS.md`; las del nodo son `xp-events`, `node-reactions`,
   `node-evaluations` y `teacher-node-pin`.
5. Tras cualquier cambio: `node --test tests-unit/` con Node 20, el mismo comando con Node 22 para los archivos de la nube, y
   `npx playwright test --workers=1`.

## 6. Riesgos y decisiones abiertas

- **Contraseñas guardadas en el disco del nodo.** El hash de la contraseña de clase y el hash del PIN de docente (6 números)
  quedan en `data/node.db`. Quien se lleve ese archivo podría adivinarlos sin conexión. La de clase da acceso a esa clase en la
  nube; el PIN de docente da acceso a *otros nodos* de ese docente, no a la nube. Mitigaciones posibles: más vueltas del hash,
  PIN más largo, o guardar el disco bajo llave. **Decisión pendiente.**
- **Costo de CPU en la nube:** cada sincronización calcula un hash por cada clase de la escuela. No se midió en una escuela con
  muchas clases; si pasa del límite de la función, se puede guardar un hash ya calculado.
- **Menores diferidos:** editar un aviso responde 403 sin internet; el XP de una lección puede bajar hasta la siguiente
  sincronización si el avance cambia justo mientras sincroniza; la bajada de avisos consulta los avisos generales de toda la
  plataforma de los últimos 90 días en cada sincronización.
- **Prueba inestable:** una prueba de proyectos del modo anterior (`node-projects-api`) falla a veces cuando corre toda la suite junta,
  y pasa sola. Ya existía antes de estos cambios.
- **Activación todo o nada:** la capa nueva solo se activa si **todas** las clases con estudiantes tienen contraseña de clase.
  Si una no la tiene, la escuela entera se queda en el modo anterior. Es seguro, pero puede sorprender.
