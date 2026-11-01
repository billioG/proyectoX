# Inicio del estudiante en el nodo escolar (sin internet)

Estado: diseño aprobado por el usuario (2026-11-01); pendiente revisión del spec escrito.

## Objetivo
El estudiante que entra al nodo ve en **Inicio** lo mismo que vería con internet, hasta donde se pueda sin nube:
los proyectos aprobados de su clase, los suyos y los de su equipo, con autor, equipo, bimestre y nota.
Hoy el Inicio del nodo muestra el feed de la nube (que no carga sin internet).

## Decisiones tomadas con el usuario
- Solo **fichas**: no se descargan videos ni modelos 3D al nodo. Un proyecto de otra persona no se reproduce sin internet.
  Los propios sí se ven como «Guardado en la escuela» (el archivo está en el nodo).
- Mismas reglas de visibilidad que la nube: nota > 0, o dueño, o miembro del equipo.
- Privacidad de menores: el estudiante solo ve proyectos de su **mismo grado y sección**. La retroalimentación
  del docente la ve solo el dueño o su equipo.
- Sin votos ni reacciones (necesitan la nube). Sin panel de docente en esta etapa.

## Diseño
1. **`node-sync` (nube, sin SQL nuevo):** el pull suma `projects: [{ id, user_id, group_id, title, description,
   bimestre, score, votes, created_at, author_name, group_name, grade, section, feedback }]` de los alumnos de la
   escuela del nodo (los 300 más recientes). Nunca incluye `video_url` ni rutas de Storage. `feedback` sale de
   `evaluations` (la última). Lógica de selección/forma en `projects.ts` (pura, con prueba); espejo idéntico en
   `supabase-functions/`.
2. **Nodo:** tabla `cloud_projects`; `applyPull` la reemplaza solo si el pull trae `projects` (patrón de `groups`).
   El sync por USB comparte `applyPull`.
3. **API:** `GET /api/feed` (sesión de estudiante) devuelve `{ projects }`: filtra por visibilidad y por
   grado/sección del estudiante; quita `feedback` salvo dueño o equipo; añade los proyectos locales propios aún no
   subidos (status uploading/pending) arriba, con estado. Sin sesión: 401.
4. **Pantalla:** en modo nodo el Inicio usa `js/node-feed.js` (`window.loadNodeFeed`), tarjetas con ícono de
   video o 3D, título, autor o equipo, bimestre y nota; arriba el banner de avance de cursos si existe. Todo texto
   escapado. `main.js` elige entre `loadProjects` y `loadNodeFeed` según `window.isNodeSession`.
5. **Pruebas:** unitarias (forma del pull en `projects.ts`; API: visibilidad, otra sección no se ve, feedback solo
   del dueño/equipo, 401, propios pendientes arriba), y de pantalla con clic real en «Inicio».

## Fuera de alcance
Videos/modelos 3D, votar y reaccionar, panel y feed del docente, fotos.

## Riesgos
- Hay que volver a publicar `node-sync` (`--no-verify-jwt`, subiendo también `projects.ts`).
- El cableado de `index.ts` con la base real no se prueba automáticamente (sin Supabase ni Deno aquí); se verifica
  con una prueba real en la escuela.
- Título/descripción de proyectos ajenos viajan al nodo: es contenido ya visible para la clase en la nube.

## Review Focus
1. El pull nunca incluye `video_url` ni rutas de Storage.
2. Estudiante de otro grado/sección no ve nada de esta clase.
3. Retroalimentación de otro estudiante no sale por la API.
4. Título con HTML se muestra como texto.
5. Pull sin `projects` (función vieja o USB antiguo) no borra el feed ya guardado.
