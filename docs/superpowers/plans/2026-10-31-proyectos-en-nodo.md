# Subir proyectos desde el nodo escolar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un estudiante suba video o modelo 3D (individual o de equipo) al nodo sin internet, y que el nodo lo publique en la nube al sincronizar.

**Architecture:** el nodo guarda el proyecto en SQLite + disco y lo sirve por una API propia (borrador + `PUT` en streaming). Al sincronizar, el nodo pide a `node-sync` una URL firmada de Supabase Storage, sube el archivo directo y confirma; la función valida otra vez e inserta en `projects`. Equipos y miembros bajan en el pull.

**Tech Stack:** Node 20/22 ESM, `better-sqlite3`, `node:test`; Supabase Edge Function (Deno/TypeScript, módulo `.ts` importable también desde Node 22); JS de navegador sin build; Playwright para la prueba de pantalla.

**Spec:** `docs/superpowers/specs/2026-10-31-proyectos-en-nodo-design.md`

## Global Constraints

- Reglas (las de la nube): título 5–120 caracteres, descripción 40–2000, bimestre 1–4, **un** archivo de 1 byte a **150 MB** (`150 * 1024 * 1024`).
- Extensiones: video `mp4 mov m4v webm 3gp avi mkv`; modelo 3D `stl obj glb`.
- Máximo **5** proyectos `uploading`/`pending` por estudiante (`maxPendingProjects`); rechazar si quedan menos de **2048 MB** libres (`minFreeDiskMB`); borrar copias `synced` a los **7 días** (`keepSyncedProjectDays`); borrar `uploading` de más de **1 hora**.
- El archivo se guarda como `dataDir/projects/<id>.<ext>` (`.part` mientras llega); el nombre original nunca forma parte de la ruta.
- Publicación automática (sin aprobación). Sin fotos, sin USB, sin miniaturas 3D en esta etapa.
- La llave de servicio de Supabase nunca va al nodo. Textos al usuario en español con «tú».
- Nube: `supabase/functions/` y `supabase-functions/` deben quedar **idénticos**. No hay SQL nuevo.
- Convenciones del repo: cada entrega sube versión (4 sitios de `index.html` + `service-worker.js`), entrada en `CHANGELOG.md`, `npm run css` si hay clases Tailwind nuevas, commit con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, y **preguntar antes de hacer push**.
- Pruebas del nodo: `better-sqlite3` está compilado para Node 20 en esta máquina, así que las que arrancan el servidor se corren con `PATH=/c/Users/billi/AppData/Local/nvm/v20.19.0:$PATH node --test tests-unit/*.test.mjs` (con Node 22 se omiten solas; el CI usa 22 con `npm ci --prefix school-node`).

## Review Focus

1. Un video que **se pasa del máximo mientras llega** → se corta la conexión, no queda `.part` ni borrador, el cupo no se consume (Task 3).
2. El nodo **se reinicia a mitad de una subida** → borradores `uploading` y `.part` huérfanos se limpian (Task 3).
3. Un estudiante intenta **ver o cancelar el proyecto de otro** → 404, nunca el archivo ni el estado ajeno (Task 3).
4. El archivo **ya se subió a Storage pero la confirmación falla** → el reintento reutiliza `cloud_path`, no sube de nuevo y no duplica el proyecto (Task 6).
5. Nombre de archivo con `../` o título con HTML (`<img onerror>`) → se guarda por `id` y el HTML queda como texto (Tasks 1 y 3).

---

### Task 1: Reglas de validación del proyecto (módulo puro)

**Files:**
- Create: `school-node/project-rules.js`
- Test: `tests-unit/project-rules.test.mjs`

**Interfaces:**
- Produces:
  - `PROJECT_LIMITS = { titleMin: 5, titleMax: 120, descMin: 40, descMax: 2000, maxBytes: 157286400, maxPendingPerStudent: 5, minFreeDiskMB: 2048, keepSyncedDays: 7 }`
  - `classifyFile(filename: string): { kind: 'video' | 'model3d', ext: string, mime: string } | null` (extensión en minúsculas; `null` si no está permitida)
  - `validateProjectDraft(input: { title, description, bimestre, group_id?, filename, size }, ctx: { memberGroupIds: number[], maxBytes?: number }): { ok: true, value: { title, description, bimestre: number, group_id: number | null, kind, ext, mime, size } } | { ok: false, error: string }`

- [ ] **Step 1: Write the failing tests** (`project-rules.test.mjs`): `classifyFile('Robot.MP4')` → `{kind:'video',ext:'mp4',mime:'video/mp4'}`; `.glb` → `model3d`; `virus.exe`, `video` (sin extensión) y `a.mp4.exe` → `null`; título de 4 y de 121 caracteres y descripción de 39 y 2001 rechazados con el mensaje exacto de abajo, y 5/120/40/2000 aceptados; bimestre `0`, `5`, `'x'` rechazados y `'3'` aceptado como `3`; `size` `0`, `157286401` y `-1` rechazados y `157286400` aceptado; `group_id` fuera de `memberGroupIds` rechazado, dentro aceptado, ausente → `null`; título `'  <img onerror=x>  '` queda recortado y **sin escapar** (el HTML se conserva como texto); caracteres de control (`\u0000`, `\n`) del título se reemplazan por espacio.
- [ ] **Step 2: Run to verify fail** — `node --test tests-unit/project-rules.test.mjs` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `school-node/project-rules.js` con las firmas de arriba. Mensajes exactos: `'El título debe tener entre 5 y 120 caracteres.'`, `'La descripción debe tener entre 40 y 2000 caracteres.'`, `'El bimestre debe ser de 1 a 4.'`, `'El archivo debe ser un video (mp4, mov, m4v, webm, 3gp, avi, mkv) o un modelo 3D (stl, obj, glb).'`, `'El archivo debe pesar entre 1 byte y 150 MB.'`, `'Ese equipo no es tuyo.'`. Usar `maxBytes` del contexto si viene (las pruebas de API lo bajan).
- [ ] **Step 4: Run to verify pass** — mismo comando → PASS.
- [ ] **Step 5: Commit** — `git add school-node/project-rules.js tests-unit/project-rules.test.mjs && git commit -m "feat(nodo): reglas de validación de proyectos"`.

---

### Task 2: Tablas y almacén de proyectos en el nodo

**Files:**
- Modify: `school-node/db.js` (tablas nuevas), `school-node/sync.js` (`applyPull`)
- Create: `school-node/projects.js`
- Test: `tests-unit/project-store.test.mjs`

**Interfaces:**
- Consumes: `validateProjectDraft`, `PROJECT_LIMITS` (Task 1).
- Produces:
  - Tablas SQLite `projects(id TEXT PK, student_id, group_id INTEGER, title, description, bimestre INTEGER, kind, ext, mime, file_size INTEGER, upload_ip, user_agent, status, cloud_path, cloud_project_id, attempts INTEGER DEFAULT 0, last_error, created_at, synced_at)`, `groups(id INTEGER PK, name, grade, section)`, `group_members(id INTEGER PK, group_id INTEGER, student_id TEXT, role TEXT)`.
  - `applyPull` reemplaza `groups` y `group_members` **solo si** `data.groups` / `data.group_members` son arreglos (un pull viejo no las borra).
  - `class ProjectError extends Error { status: number }`
  - `createProjectStore(db, opts: { dataDir: string, limits?: object, freeDiskMB?: () => number, now?: () => number }): ProjectStore` con:
    - `createDraft(studentId: string, input: object, meta: { ip: string, userAgent: string }): { id: string, max_bytes: number }` (lanza `ProjectError` 400 validación, 409 por cupo de pendientes, 507 por poco disco; fila `uploading`)
    - `tmpPath(id: string): string`, `finalPath(id: string): string`
    - `getDraft(id: string, studentId: string): Project | null` (solo si es del estudiante y está `uploading`)
    - `finishUpload(id: string, bytes: number): void` (renombra `.part` → archivo final, `status='pending'`, `file_size=bytes`)
    - `abortUpload(id: string): void` (borra `.part` y la fila)
    - `listMine(studentId: string): Array<{ id, title, status, kind, file_size, created_at, last_error }>`
    - `cancel(id: string, studentId: string): boolean` (`false` si no existe, es ajeno o ya está `synced`)
    - `groupsFor(studentId: string): Array<{ id: number, name: string }>`
    - `cleanup(): { removed: number }` (borra `uploading` de más de 1 h con su `.part`, y `synced` con más de `keepSyncedDays` días con su archivo)
    - `counts(): { pending: number, synced: number, failed: number, bytes: number }` (`failed` = `pending` con `last_error` no nulo)

- [ ] **Step 1: Write the failing tests** (`project-store.test.mjs`, omitida si `better-sqlite3` no carga, con directorio temporal): `createDraft` devuelve `{id, max_bytes: 157286400}` y deja la fila `uploading`; el 6.º borrador de un mismo estudiante lanza `ProjectError` con `status 409`; con `freeDiskMB: () => 100` lanza `507`; `group_id` de un equipo ajeno (según `group_members`) lanza 400; el nombre `'../../x.mp4'` produce `finalPath` dentro de `dataDir/projects` y de la forma `<id>.mp4`; `finishUpload` mueve el archivo y pasa a `pending`; `abortUpload` deja 0 filas y 0 `.part` y libera el cupo; `cancel` de otro estudiante → `false` y el archivo sigue; `cleanup` con `now` adelantado 2 h borra el `uploading` y su `.part` pero no el `pending`, y adelantado 8 días borra el `synced` y su archivo; `applyPull` con `groups`/`group_members` los reemplaza completos y con un pull sin esas llaves los deja intactos; `counts` cuenta correctamente.
- [ ] **Step 2: Run to verify fail** — `PATH=…v20… node --test tests-unit/project-store.test.mjs` → FAIL.
- [ ] **Step 3: Implement** las tablas en `db.js` (`CREATE TABLE IF NOT EXISTS`), el reemplazo de equipos en `applyPull` y `school-node/projects.js` con las firmas de arriba. `id` = `crypto.randomUUID()`; la ruta se arma solo con `id` y la extensión validada; comprobar que `path.resolve` quede dentro de `dataDir/projects`.
- [ ] **Step 4: Run to verify pass** → PASS; correr también `node --test tests-unit/*.test.mjs` para ver que nada previo se rompió.
- [ ] **Step 5: Commit** — `git add school-node/db.js school-node/sync.js school-node/projects.js tests-unit/project-store.test.mjs && git commit -m "feat(nodo): almacén de proyectos y equipos"`.

---

### Task 3: API HTTP de proyectos en el nodo

**Files:**
- Modify: `school-node/server.js` (rutas con `:id`, streaming, limpieza periódica, `overview`), `school-node/config.example.json`
- Create: `tests-unit/helpers/start-node.mjs` (extrae de `node-api.test.mjs` el arranque con configuración temporal y agrega `seed`), `tests-unit/node-projects-api.test.mjs`
- Modify: `tests-unit/node-api.test.mjs` (usar el helper)

**Interfaces:**
- Consumes: `createProjectStore`, `ProjectError` (Task 2); `studentFromSession(req)` existente en `server.js`.
- Produces (rutas, todas con sesión de estudiante; sin sesión → 401):
  - `GET /api/projects/groups` → `{ groups: [{id,name}] }`
  - `POST /api/projects` body `{ title, description, bimestre, group_id?, filename, size }` → `{ id, max_bytes }`
  - `PUT /api/projects/:id/file` cuerpo binario; exige `Content-Length` = `size` declarado; → `{ ok: true }`
  - `GET /api/projects/mine` → `{ projects: [...] }`
  - `DELETE /api/projects/:id` → `{ ok: true }` (404 si no existe, es ajeno o está `synced`)
  - `GET /api/teacher/overview` agrega `projects: counts()` (y `last_error` de proyectos no cambia el de la sincronización general).
- Config nueva en `config.json` (todas opcionales): `maxPendingProjects` (5), `minFreeDiskMB` (2048), `keepSyncedProjectDays` (7), `projectMaxBytes` (157286400; las pruebas lo bajan a 1 MB).
- `helpers/start-node.mjs`: `startNode({ students?: Array, groups?: Array, members?: Array, config?: object }): Promise<{ api(path, opts), login(studentId, pin): Promise<string>, stop(): void, dataDir: string }>`; siembra la base con `better-sqlite3` antes de arrancar.

- [ ] **Step 1: Write the failing tests** (`node-projects-api.test.mjs`): sin sesión → 401 en las 5 rutas; flujo feliz: `POST` (video de 3 MB) → `PUT` con el buffer → aparece en `mine` como `pending` y el archivo existe en `dataDir/projects/<id>.mp4`; **Review 1**: con `projectMaxBytes` = 1 MB, `PUT` de 3 MB con `Content-Length` mayor al declarado → rechazo, y de un cuerpo que **excede lo declarado** → la conexión se corta (error de red o 413), no queda `.part` ni borrador y se puede crear otro borrador (cupo intacto); `Content-Length` distinto de `size` → 400; **Review 2**: tras reiniciar el nodo con un `.part` y una fila `uploading` de hace 2 h sembradas, ambas desaparecen en el arranque; **Review 3**: el estudiante B hace `DELETE` y lo lee en `mine` de un proyecto de A → 404 y el de A sigue `pending`; **Review 5**: `filename: '../../evil.mp4'` termina en `<id>.mp4` y `title: '<img src=x onerror=1>'` vuelve idéntico en `mine`; equipos: `groups` devuelve solo los del estudiante y un `group_id` ajeno da 400; cupo: el 6.º `POST` da 409; `overview` del docente trae `projects.pending`.
- [ ] **Step 2: Run to verify fail** — `PATH=…v20… node --test tests-unit/node-projects-api.test.mjs` → FAIL.
- [ ] **Step 3: Implement** en `server.js`: una función `matchProjectRoute(method, pathname)` que reconozca `/api/projects/:id` y `/api/projects/:id/file` (el id debe ser un UUID) y se consulte **antes** del diccionario `api`; el `PUT` cuenta bytes con `req.on('data')`, escribe en `store.tmpPath(id)` y, si se pasa de `projectMaxBytes` o la conexión se cierra antes de terminar, llama `abortUpload` y destruye el socket; `store.cleanup()` al arrancar y cada hora (`setInterval(...).unref()`); construir el almacén con `limits: { ...PROJECT_LIMITS, maxBytes: config.projectMaxBytes ?? PROJECT_LIMITS.maxBytes, maxPendingPerStudent: config.maxPendingProjects ?? 5, minFreeDiskMB: config.minFreeDiskMB ?? 2048, keepSyncedDays: config.keepSyncedProjectDays ?? 7 }` y `freeDiskMB` basado en `fs.statfsSync(dataDir)`; documentar las llaves en `config.example.json`.
- [ ] **Step 4: Run to verify pass** → PASS; luego `PATH=…v20… node --test tests-unit/*.test.mjs` completo.
- [ ] **Step 5: Commit** — `git add school-node/server.js school-node/config.example.json tests-unit && git commit -m "feat(nodo): API de proyectos con subida en streaming"`.

---

### Task 4: Pantalla del estudiante (Subir proyecto + Mis proyectos)

**Files:**
- Create: `js/node-projects.js`
- Modify: `js/node-mode.js` (menú), `js/project-modals.js` (`initUploadView`, `uploadProject` delegan en modo nodo), `js/main.js` (`MODULE_MAP.upload` suma `js/node-projects.js`), `service-worker.js` (`LAZY_MODULES`)
- Test: `tests/node-projects.spec.js` (Playwright)

**Interfaces:**
- Consumes: rutas de la Task 3 vía `window.nodeApi(path, { method, body })` y `localStorage.PX_NODE_TOKEN`.
- Produces: `window.nodeProjects = { initUploadView(): Promise<void>, uploadProject(): Promise<void>, renderMine(): Promise<void> }`; en modo nodo, `window.initUploadView` y `window.uploadProject` llaman a esas funciones.

- [ ] **Step 1: Write the failing test** (`tests/node-projects.spec.js`, Playwright; arranca el nodo con `start-node` en otro proceso y **bloquea todo lo que no sea el nodo**): el estudiante entra con su PIN, el menú muestra «Subir proyecto» además de Cursos, el selector de equipo lista «Individual» y su equipo, un título de 4 letras muestra el error del formulario sin llamar a la API, subir un `.mp4` de prueba (3 MB) muestra la barra de progreso y termina con «Guardado en la escuela», y la lista **Mis proyectos** muestra ese título; no hay errores de JavaScript ni pedidos externos.
- [ ] **Step 2: Run to verify fail** — `PW_CHANNEL=chrome npx playwright test tests/node-projects.spec.js --workers=1` → FAIL.
- [ ] **Step 3: Implement** `js/node-projects.js`: mismas reglas de formulario que la nube (5/40 caracteres, bimestre, equipo, un archivo), `POST /api/projects` y luego `XMLHttpRequest` `PUT` con `upload.onprogress` para la barra; mensajes claros («Guardado en la escuela», «No se pudo subir: …»); lista con los estados «Guardado en la escuela» / «Subido a la nube» / «No se pudo subir: …»; todo el texto del usuario escapado con `window.sanitizeInput`. En `node-mode.js` ampliar el filtro del menú de `/lessons|logout/i` a `/lessons|upload|logout/i`. En `project-modals.js`, `if (window.isNodeSession) return window.nodeProjects.<fn>()` al inicio de `initUploadView` y `uploadProject`. No pedir `api.ipify.org` ni generar miniatura 3D en modo nodo. Correr `npm run css` si se agregan clases.
- [ ] **Step 4: Run to verify pass** → el spec nuevo y las 14 pruebas de humo (`PW_CHANNEL=chrome npx playwright test --workers=1`) en verde.
- [ ] **Step 5: Commit** — `git add js tests service-worker.js css && git commit -m "feat(nodo): pantalla para subir proyectos"`.

---

### Task 5: Función de la nube `node-sync` (URL firmada + proyectos + equipos)

**Files:**
- Create: `supabase/functions/node-sync/projects.ts`, `supabase-functions/node-sync/projects.ts` (idéntico)
- Modify: `supabase/functions/node-sync/index.ts` y su espejo `supabase-functions/node-sync/index.ts`, `.github/workflows/ci.yml`
- Test: `tests-unit/node-sync-projects.test.mjs`

**Interfaces:**
- Produces (`projects.ts`, TypeScript **sin sintaxis no borrable** como `enum`, para que Node 22 lo importe):
  - `MAX_PROJECT_BYTES = 157286400`
  - `validateUploadRequest(req: { client_ref: string, ext: string, size: number }, deps?: { now?: () => number, rand?: () => string }): { ok: true, path: string } | { ok: false, error: string }` (`path` = `<timestamp>_<aleatorio>.<ext>`)
  - `validateProjectPush(p: PushedProject, ctx: { studentIds: Set<string>, membersOf: Map<number, Set<string>>, objectSize: (path: string) => number | null }): { ok: true, row: object } | { ok: false, error: string }` (valida estudiante ∈ escuela, equipo de la escuela y membresía, `cloud_path` con forma `^\d+_[a-z0-9]+\.(mp4|mov|m4v|webm|3gp|avi|mkv|stl|obj|glb)$`, objeto existente ≤ 150 MB, y las reglas de título/descripción/bimestre)
  - `nextRoles(members: Array<{ id: number, role: string }>): Array<{ id: number, role: string }>` (rotación `planner → maker → speaker → helper → planner`; con menos de 2 miembros devuelve `[]`)
- `index.ts`: la respuesta del pull suma `groups` y `group_members` (equipos con `school_code` del nodo y sus miembros); `body.action === 'project_upload_url'` responde `{ path, signed_url }` con `admin.storage.from('project-videos').createSignedUploadUrl(path)`; cada elemento de `push.projects` se valida, se inserta en `projects` (`user_id`, `group_id`, `title`, `description`, `bimestre`, `upload_ip`, `video_url` = URL pública, `client_metadata: { source: 'nodo', node_ref: client_ref, node_id }`), se rotan los roles si hay equipo, y la respuesta incluye `applied.projects: [{ client_ref, project_id }]`; `school_nodes.last_sync_info` suma `appliedProjects` (cuántos se aplicaron). **Idempotencia:** antes de insertar se busca por `client_metadata->>node_ref` y por (`user_id`, `title`, `bimestre`); si existe se devuelve ese `project_id`.

- [ ] **Step 1: Write the failing tests** (`node-sync-projects.test.mjs`, importa `../supabase/functions/node-sync/projects.ts`): `validateUploadRequest` rechaza `exe`, tamaño `0` y `157286401`, acepta `mp4`/`glb` con `path` que cumple la expresión; `validateProjectPush` rechaza un estudiante de otra escuela, un `group_id` donde no es miembro, `cloud_path` con `../` o sin forma, objeto inexistente (`objectSize` → `null`) o de 157286401 bytes, y acepta el caso correcto devolviendo la fila con `client_metadata.source === 'nodo'`; `nextRoles` con 4 miembros rota cada rol una posición y con 1 miembro devuelve `[]`.
- [ ] **Step 2: Run to verify fail** — `node --test tests-unit/node-sync-projects.test.mjs` (Node 22) → FAIL.
- [ ] **Step 3: Implement** `projects.ts` y conectar `index.ts` según lo de arriba (la lógica de BD se queda en `index.ts`, lo puro en `projects.ts`); copiar ambos archivos al espejo. En `ci.yml`: el chequeo de espejos pasa de comparar solo `index.ts` a `diff -r supabase/functions supabase-functions` (por carpeta de función), y el job de pruebas unitarias ya corre `tests-unit/*.test.mjs` con Node 22.
- [ ] **Step 4: Run to verify pass** — test nuevo en verde; `diff -r supabase/functions/node-sync supabase-functions/node-sync` sin diferencias. (`deno check` no está instalado aquí: lo corre el CI; avisar al usuario de que esa verificación queda pendiente hasta el push.)
- [ ] **Step 5: Commit** — `git add supabase supabase-functions .github tests-unit && git commit -m "feat(nube): node-sync acepta proyectos del nodo y entrega equipos"`.

---

### Task 6: El nodo sube sus proyectos a la nube

**Files:**
- Create: `school-node/projects-sync.js`, `school-node/sync-errors.js`, `tests-unit/helpers/fake-cloud.mjs`, `tests-unit/projects-sync.test.mjs`
- Modify: `school-node/sync.js` (`runSync` llama a `syncProjects`), `school-node/server.js` (importa `friendlySyncError` de `sync-errors.js`)

**Interfaces:**
- Consumes: `createProjectStore` (Task 2), protocolo de la Task 5.
- Produces:
  - `sync-errors.js`: `friendlySyncError(message: string): string` (movida desde `server.js`, mismo comportamiento) y `friendlyProjectError(message: string): string` (agrega: «La nube todavía no acepta proyectos: pide al administrador actualizar la función node-sync.» cuando la respuesta no trae `applied.projects`).
  - `syncProjects(db, config, opts?: { log?: Function, fetchImpl?: typeof fetch }): Promise<{ synced: number, failed: number }>`; por cada proyecto `pending` en orden de `created_at`: (1) si no hay `cloud_path`, pide `project_upload_url` con `x-node-token` y sube el archivo con `PUT` en streaming (`duplex: 'half'`, `Content-Type` = `mime`, `Content-Length` = `file_size`) y guarda `cloud_path`; (2) confirma con `push.projects`; (3) en `applied.projects` marca `synced`, guarda `cloud_project_id` y `synced_at`. Un error se guarda en `last_error`, suma `attempts` y **no detiene** a los demás ni a `runSync`.
  - `fake-cloud.mjs`: `startFakeCloud(opts?: { failStorage?: boolean, failConfirm?: boolean, oldFunction?: boolean }): Promise<{ url: string, stats: { uploads: number, confirms: number }, projects: Array, stop(): void }>` que imita `POST /functions/v1/node-sync` (acción de URL firmada, `push.projects`, con idempotencia por `client_ref`) y `PUT /fake-storage/<path>`.

- [ ] **Step 1: Write the failing tests** (`projects-sync.test.mjs`, contra la nube simulada): camino feliz → el proyecto pasa a `synced` con `cloud_project_id`, `stats.uploads === 1`; **Review 4**: con `failConfirm` el primer intento deja `pending`, `cloud_path` guardado y `last_error`; al reintentar sin fallo `stats.uploads` sigue en **1** (no re-sube) y `projects.length === 1` (no duplica); `failStorage` deja `pending` con `last_error` legible y `attempts === 1`; un proyecto que falla no impide que el siguiente se suba; con `oldFunction` (sin `applied.projects`) el error es el mensaje de actualizar `node-sync`; sin internet (puerto cerrado) → «No hay internet en esta computadora todavía…»; `store.cleanup()` a los 8 días borra el archivo local de un `synced`.
- [ ] **Step 2: Run to verify fail** — `PATH=…v20… node --test tests-unit/projects-sync.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `projects-sync.js` y `sync-errors.js`; en `runSync` llamar `syncProjects` **después** de aplicar el pull y descargar archivos, dentro de `try/catch` propio; registrar `appliedProjects` en el log. En `server.js` el resumen del docente expone `projects.failed` ya calculado por `counts()`.
- [ ] **Step 4: Run to verify pass** → test nuevo y la suite completa con Node 20 en verde (incluida `node-api.test.mjs`, que usa `friendlySyncError`).
- [ ] **Step 5: Commit** — `git add school-node tests-unit && git commit -m "feat(nodo): sincroniza proyectos con URL firmada"`.

---

### Task 7: Documentación, versión y entrega

**Files:**
- Modify: `CHANGELOG.md`, `school-node/README.md`, `index.html` + `service-worker.js` (versión 1.0.188), `PENDIENTES.md`, guía en Word (`mk_paso.py` del scratchpad) y su PDF
- Modify: `docs/superpowers/specs/2026-10-31-proyectos-en-nodo-design.md` (estado: implementado)

**Interfaces:** consume todo lo anterior.

- [ ] **Step 1: Verificación completa** — `PATH=…v20… node --test tests-unit/*.test.mjs` (todo en verde, nada omitido), `PW_CHANNEL=chrome npx playwright test --workers=1` (humo + `node-projects.spec.js`), `node --check` de todos los `js/*.js` y `school-node/*.js`, y `diff -r supabase/functions supabase-functions` sin diferencias.
- [ ] **Step 2: Documentar** — `CHANGELOG.md` (entrada de v1.0.188), sección del README del nodo (cómo sube un estudiante, qué se sincroniza, `maxPendingProjects`/`minFreeDiskMB`/`keepSyncedProjectDays`), `PENDIENTES.md` (marcar hecho; dejar fotos, aprobación previa y USB como pendientes), y la guía de instalación: sección «Subir proyectos sin internet» para estudiantes y preguntas frecuentes («subí un proyecto y no aparece en la nube», «el celular dice que no hay espacio»).
- [ ] **Step 3: Subir versión** — `sed` de `1.0.187` → `1.0.188` en `index.html` y `service-worker.js`; `npm run css` si hay clases nuevas.
- [ ] **Step 4: Lista de despliegue para el usuario** (en el mensaje final, no en archivos): `npx supabase functions deploy node-sync --no-verify-jwt`; confirmar en Supabase → Storage → Settings que el límite por archivo es **≥ 150 MB**; actualizar el nodo con `actualizar-windows.cmd` con internet; prueba real: subir un video corto desde un celular, sincronizar y ver el proyecto en el feed.
- [ ] **Step 5: Commit y push con confirmación** — copiar a `C:\Users\billi\px-push`, `git commit` con el trailer del repo, **preguntar con AskUserQuestion antes del `git push`**, y tras el push comprobar `git log origin/main`.
