# Inicio del estudiante en el nodo escolar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El estudiante que entra al nodo (sin internet) ve en Inicio los proyectos aprobados de su clase, los suyos y los de su equipo, como fichas sin video.

**Architecture:** `node-sync` agrega `projects` al pull (forma y filtrado en `projects.ts`, lógica pura); el nodo guarda `cloud_projects` y `GET /api/feed` los filtra por visibilidad/clase; `js/node-feed.js` dibuja las tarjetas y `main.js` lo elige cuando `window.isNodeSession`.

**Tech Stack:** Node ESM + better-sqlite3 (nodo), Deno/TS (Edge Function, lógica pura importable en Node 22), JS vanilla + Tailwind (app), node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-inicio-en-nodo-design.md` (autoridad). Ejecución: nativa (la misma que el usuario eligió en la etapa de proyectos), con una sola revisión final de la rama.

## Global Constraints

- Español neutro de tú en TODO texto visible; prosa de commits normal; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Se edita en `C:\Users\billi\Downloads\proyectoX-main\proyectoX-main` (no es repo git) y se copia a `C:\Users\billi\px-push` (clon git); rama `feat/inicio-nodo`. NO `git push` sin confirmar con AskUserQuestion.
- `supabase/functions/node-sync/` y `supabase-functions/node-sync/` deben quedar idénticos (también `projects.ts`); `projects.ts` en TS con sintaxis borrable (sin enum/namespace) para que Node 22 lo importe.
- Pruebas con SQLite: Node 20 (`PATH=/c/Users/billi/AppData/Local/nvm/v20.19.0:$PATH node --test tests-unit/`); las que importan `.ts`: Node 22 (`/v22.23.3`, `node --test "tests-unit/*.test.mjs"`).
- Pantalla: `PW_CHANNEL=chrome npx playwright test tests/node-projects.spec.js --workers=1`.
- Al agregar clases Tailwind: `npm run css`. Cada push sube versión (4 sitios de `index.html` + `CACHE_NAME` de `service-worker.js`) y agrega entrada a `CHANGELOG.md`.
- El pull NUNCA lleva `video_url` ni rutas de Storage. Datos de menores: solo misma clase.

## Review Focus

1. El pull nunca incluye `video_url` ni rutas de Storage (Task 1).
2. Estudiante de otro grado/sección no ve nada de esta clase (Task 3).
3. Retroalimentación de otro estudiante no sale por la API (Task 3).
4. Título con HTML se muestra como texto, no se ejecuta (Task 4).
5. Un pull sin `projects` (función vieja / USB antiguo) no borra el feed guardado (Task 2).

---

### Task 1: Forma del pull en la función (`projects.ts` + `index.ts`)

**Files:**
- Modify: `supabase/functions/node-sync/projects.ts`, `supabase/functions/node-sync/index.ts`
- Mirror (idénticos): `supabase-functions/node-sync/projects.ts`, `supabase-functions/node-sync/index.ts`
- Test: `tests-unit/node-sync-projects.test.mjs` (Node 22)

**Interfaces:**
- Produces: `export const FEED_LIMIT = 300;`
  `export interface FeedProject { id: string; user_id: string; group_id: number | null; title: string; description: string; bimestre: number | null; score: number | null; votes: number; created_at: string; author_name: string; group_name: string | null; grade: string | null; section: string | null; kind: 'video' | 'model'; feedback: string | null }`
  `export function buildFeedProjects(rows: any[], students: { id: string; full_name?: string; grade?: string; section?: string }[], groups: { id: number; name?: string }[]): FeedProject[]`
- Consumes: filas de `projects` con `evaluations(total_score, feedback)` anidado y `video_url`.

- [ ] **Step 1: Write the failing tests** en `tests-unit/node-sync-projects.test.mjs` (mismo estilo que los existentes), caso por caso:
  - `buildFeedProjects: deja solo campos permitidos y nunca video_url ni rutas` — una fila con `video_url: 'https://x/storage/v1/object/public/project-videos/123_ab.mp4'`; `assert.equal('video_url' in out[0], false)` y `assert.doesNotMatch(JSON.stringify(out), /storage|project-videos|123_ab/)`.
  - `kind sale de la extensión: stl/obj/glb = model, el resto = video` (3 filas).
  - `author_name y grade/section salen del estudiante; group_name del equipo; filas de usuarios que no son del nodo se descartan`.
  - `feedback es la última evaluación con texto (recortada a 1000) o null`.
  - `ordena por created_at descendente y corta en FEED_LIMIT` (301 filas → 300, la más nueva primero).
- [ ] **Step 2: Run** `node --test tests-unit/node-sync-projects.test.mjs` (Node 22). Expected: FAIL `buildFeedProjects is not a function`.
- [ ] **Step 3: Implement `buildFeedProjects` and `FEED_LIMIT` in `projects.ts`** (función pura; whitelist explícita de campos; `kind` por regex `/\.(stl|obj|glb)(\?|$)/i` sobre `video_url`).
- [ ] **Step 4: Run** el mismo comando. Expected: PASS.
- [ ] **Step 5: Wire in `index.ts`:** importar `buildFeedProjects, FEED_LIMIT`; tras `groupMembers`, consultar por trozos de `studentIds` (`chunk`, `.in('user_id', ids)`, `.order('created_at', { ascending: false }).limit(FEED_LIMIT)`) `select('id, user_id, group_id, title, description, bimestre, score, votes, created_at, video_url, evaluations(total_score, feedback)')`; si falla la consulta, `feedProjects = null` (no tumba el sync); agregar `projects: feedProjects ?? undefined` al objeto `pull`. Actualizar el comentario de cabecera del protocolo. Copiar ambos archivos al espejo y verificar `diff -r supabase/functions/node-sync supabase-functions/node-sync` vacío.
- [ ] **Step 6: Commit** `feat(nube): node-sync entrega las fichas de proyectos de la clase`.

### Task 2: Guardar los proyectos de la nube en el nodo

**Files:**
- Modify: `school-node/db.js` (tabla), `school-node/sync.js` (`applyPull`)
- Test: `tests-unit/node-feed-store.test.mjs` (Node 20, SQLite)

**Interfaces:**
- Produces: tabla `cloud_projects (id TEXT PRIMARY KEY, user_id TEXT, group_id INTEGER, title TEXT, description TEXT, bimestre INTEGER, score REAL, votes INTEGER, created_at TEXT, author_name TEXT, group_name TEXT, grade TEXT, section TEXT, kind TEXT, feedback TEXT)`; `applyPull(db, data)` la reemplaza completa **solo si** `Array.isArray(data.projects)`.
- Consumes: `applyPull(db, data, pushed)` existente (firma sin cambios).

- [ ] **Step 1: Failing tests** (`skip` si no hay SQLite, patrón de `project-store.test.mjs`): `applyPull guarda projects y los reemplaza completos en el siguiente pull`; `un pull sin projects NO borra los ya guardados` (Review Focus 5); `un pull con projects: [] vacía la lista`. Usar `openDb(tmp)` y un `data` mínimo (`students:[]`, `courses:[]`, `completions:[]`, `files:[]`, `node:{}`).
- [ ] **Step 2: Run** Node 20. Expected: FAIL (`no such table: cloud_projects`).
- [ ] **Step 3: Implement** tabla en `db.js` (`CREATE TABLE IF NOT EXISTS`) y bloque en `applyPull` dentro de la transacción, junto al de equipos (valores `?? null`, `votes ?? 0`).
- [ ] **Step 4: Run** los tests de la tarea + `node --test tests-unit/` completo. Expected: PASS, 0 fallos.
- [ ] **Step 5: Commit** `feat(nodo): guarda las fichas de proyectos que baja el pull`.

### Task 3: `GET /api/feed` con visibilidad y privacidad

**Files:**
- Create: `school-node/feed.js`
- Modify: `school-node/projects.js` (método `feedRows(studentId)`), `school-node/server.js` (ruta), `tests-unit/helpers/start-node.mjs` (opción `cloudProjects`)
- Test: `tests-unit/node-feed-api.test.mjs` (Node 20)

**Interfaces:**
- Consumes: `cloud_projects` (Task 2), `group_members`, store de proyectos.
- Produces: `export function buildStudentFeed(db, student, localRows): FeedItem[]` en `feed.js`;
  `FeedItem = { id, title, description, bimestre, score, votes, created_at, author_name, group_name, kind, feedback, mine: boolean, state: 'cloud' | 'uploading' | 'pending' | 'synced' }`;
  store: `feedRows(studentId) -> [{ id, title, description, bimestre, kind, status, created_at, cloud_project_id, group_id }]`;
  `GET /api/feed` → `200 { projects: FeedItem[] }`, `401 { error: 'Sesión vencida' }`; helper `startNode({ cloudProjects: [...] })` inserta filas en `cloud_projects`.

- [ ] **Step 1: Failing tests** en `node-feed-api.test.mjs` con alumnos `s1`, `s2` (Primero A, ambos del equipo 7) y `s3` (Segundo B), y `cloudProjects`: c1 (de s2, score 80, feedback 'Muy bien'), c2 (de s2, score 0, sin equipo), c3 (de s2, equipo 7, score 0, feedback 'Revisa tu video'), c4 (Segundo B, score 90). Casos: `sin sesión: 401`; `s1 ve c1 y c3 pero no c2 ni c4` (aprobado/equipo; Review Focus 2); `s3 ve solo c4`; `el feedback de c1 NO llega a s1 pero sí a s2 (dueño)` y `c3 sí lleva feedback para s1 (equipo)` (Review Focus 3); `s2 ve c2 (dueño aunque no esté aprobado)`; `un proyecto propio guardado en el nodo (status pending) aparece primero con state 'pending' y mine true`; `un propio ya subido (cloud_project_id presente en cloud_projects) no se duplica`; `ningún campo del resultado contiene video_url`.
- [ ] **Step 2: Run** Node 20. Expected: FAIL (404 en `/api/feed`).
- [ ] **Step 3: Implement** `buildStudentFeed` (mismo grado y sección; aprobado = `score > 0`; dueño; miembro del equipo; `feedback` solo si dueño o equipo; locales primero, luego nube por `created_at` desc), `feedRows` en el store, la ruta en `server.js` y la opción del helper.
- [ ] **Step 4: Run** tests de la tarea + suite completa Node 20. Expected: PASS.
- [ ] **Step 5: Commit** `feat(nodo): GET /api/feed con las reglas de visibilidad de la nube`.

### Task 4: Pantalla del Inicio en modo nodo

**Files:**
- Create: `js/node-feed.js`
- Modify: `js/main.js` (MODULE_MAP `'node-feed'`, remap en `loadModule` para `feed`, `case 'feed'`), `js/node-mode.js` (menú: dejar visible Inicio; CSS: permitir toque en el logo/`'feed'`), `service-worker.js` (LAZY_MODULES), `css/tailwind.css` (`npm run css`)
- Test: `tests/node-projects.spec.js`

**Interfaces:**
- Consumes: `GET /api/feed` (Task 3), `window.nodeApi`, `window.sanitizeInput`, `window.nav`.
- Produces: `window.loadNodeFeed()` que llena `#feed-container`; tarjetas con `data-feed-project="<id>"`; estado visible «Guardado en la escuela» / «Subiendo...» / «Subido a la nube».

- [ ] **Step 1: Failing test** (Playwright, sembrar `cloudProjects` en el `startNode` del spec y una ficha con título `<img src=x onerror="window.__xss=1">`): `el Inicio del estudiante en el nodo muestra fichas de su clase sin internet` — entra como estudiante, toca el logo/Inicio con clic real, espera `[data-feed-project]`, comprueba título/autor/nota, que NO se ven fichas de otra sección, que `window.__xss` es `undefined` (Review Focus 4) y que el texto literal `<img` aparece como texto; sin `pageerror`.
- [ ] **Step 2: Run** Playwright. Expected: FAIL (no hay `[data-feed-project]`).
- [ ] **Step 3: Implement** `js/node-feed.js` (tarjeta: ícono `fa-video`/`fa-cube`, título, autor o equipo, bimestre, nota «Nota 80», estado; sección «Mis proyectos recién guardados» si hay locales; mensaje vacío «Todavía no hay proyectos aprobados en tu clase.»; todo con `esc`), cableado en `main.js` (`feed` remapeado a `node-feed` si `isNodeSession`; `case 'feed'` llama `loadNodeFeed`), menú y CSS en `node-mode.js`, service worker; `npm run css`.
- [ ] **Step 4: Run** Playwright completo (`--workers=1`) y suite Node 20. Expected: PASS.
- [ ] **Step 5: Commit** `feat(nodo): Inicio del estudiante con las fichas de proyectos de su clase`.

### Task 5: Documentación y versión

**Files:**
- Modify: `CHANGELOG.md`, `school-node/README.md`, `PENDIENTES.md`, `index.html` (4 sitios) + `service-worker.js` (`CACHE_NAME`) → v1.0.191, spec (estado: implementado)

- [ ] **Step 1:** Entrada de CHANGELOG (qué ve el estudiante, que falta volver a publicar `node-sync` subiendo también `projects.ts`, privacidad por clase, límites: sin videos/votos); sección en el README del nodo; PENDIENTES: prueba real con la nube, videos de proyectos en el nodo, votos/reacciones, feed del docente; subir versión.
- [ ] **Step 2: Run** suite completa Node 20 + Node 22 y Playwright; `diff -r` de espejos por blobs. Expected: 0 fallos.
- [ ] **Step 3: Commit** `docs/nodo: Inicio con proyectos de la clase (v1.0.191)`.
