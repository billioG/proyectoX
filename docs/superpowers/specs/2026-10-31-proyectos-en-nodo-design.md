# Subir proyectos desde el nodo escolar (sin internet)

Fecha: 2026-10-31 · Estado: **implementado en v1.0.188** (falta la prueba con la nube real); plan en `docs/superpowers/plans/2026-10-31-proyectos-en-nodo.md`

## 1. Objetivo

Que un estudiante, sin internet, entre desde su celular por el Wi-Fi de la escuela, **suba su proyecto al nodo**
y que, cuando el nodo tenga internet, el proyecto **llegue a la nube y aparezca como cualquier otro** en el feed
de la escuela.

Hoy, en modo nodo, el estudiante solo ve **Cursos**. La sincronización nodo → nube solo lleva datos pequeños
(avances, PIN, ingresos) en JSON; un video de decenas de MB no cabe en ese canal.

### Decisiones de producto (confirmadas con el usuario)

| Tema | Decisión |
|---|---|
| Tipos de archivo | **Video y modelo 3D** (STL, OBJ, GLB), igual que la nube hoy. **Las fotos no existen como proyecto en la nube**; se agregan en una segunda etapa, en nube y nodo a la vez. |
| Equipos | **Individuales y de equipo.** El nodo trae los equipos de su escuela; al sincronizar se rotan los roles como hace la nube. |
| Revisión | **Se publican solos** al sincronizar (igual que en la nube). El docente puede eliminarlos desde la app. Sin aprobación previa. |
| Reglas | Las de la nube: título ≥ 5 caracteres, descripción ≥ 40, bimestre 1 a 4, **un** archivo de hasta **150 MB**. |

## 2. Fuera de alcance de esta etapa

- Fotos como proyecto (nube y nodo).
- Aprobación del docente antes de publicar.
- Subir proyectos por memoria USB (queda como complemento futuro).
- Miniaturas de modelos 3D (necesitan three.js; se completan al abrir el proyecto con internet, como hoy).
- Insignias y XP: la nube las revisa en el cliente cuando el estudiante entra con internet; no cambia.
- Reanudar una subida cortada a la mitad (si se corta, el estudiante vuelve a intentar).

## 3. Enfoque elegido para el archivo grande

**Subida directa con URL firmada.** El nodo pide a la función `node-sync` un permiso temporal por archivo y lo sube
directo a Supabase Storage (bucket `project-videos`); después confirma y la función inserta la fila en `projects`.

Descartados: mandar el archivo en base64 dentro del JSON de la función (lento, memoria, límites) y usar una llave
con permisos de escritura en el nodo (la llave maestra nunca va al nodo). La subida por USB queda para después.

## 4. Nodo (sin internet)

### 4.1 Almacenamiento

Tabla nueva `projects` en el SQLite del nodo (`school-node/db.js`):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | TEXT PK | UUID local; es también la **referencia de idempotencia** hacia la nube |
| `student_id` | TEXT | del estudiante con sesión |
| `group_id` | INTEGER NULL | equipo elegido (null = individual) |
| `title`, `description` | TEXT | |
| `bimestre` | INTEGER | 1 a 4 |
| `kind` | TEXT | `video` o `model3d` |
| `ext`, `mime` | TEXT | extensión permitida y tipo declarado |
| `file_size` | INTEGER | bytes realmente recibidos |
| `upload_ip` | TEXT | IP del celular en la red local |
| `user_agent` | TEXT | |
| `status` | TEXT | `uploading` → `pending` → `synced` |
| `cloud_path` | TEXT NULL | ruta ya subida a Storage (evita volver a subir si falló el paso final) |
| `cloud_project_id` | TEXT NULL | id del proyecto creado en la nube |
| `attempts` | INTEGER | intentos de sincronización |
| `last_error` | TEXT NULL | motivo legible del último fallo |
| `created_at`, `synced_at` | TEXT | ISO |

Tablas nuevas `groups(id INTEGER PK, name, grade, section)` y `group_members(id, group_id, student_id, role)`,
llenadas por la sincronización (sección 5.1).

Archivos en `dataDir/projects/<id>.<ext>`. Mientras se recibe se escribe `<id>.part`. El nombre original **nunca**
forma parte de la ruta.

### 4.2 API (todas exigen sesión de estudiante, salvo que se indique)

| Ruta | Qué hace |
|---|---|
| `GET /api/projects/groups` | Equipos del estudiante: `[{ id, name }]` |
| `POST /api/projects` | Crea el borrador. Body: `{ title, description, bimestre, group_id?, filename, size }`. Valida (tabla 4.3). Responde `{ id, max_bytes }`. |
| `PUT /api/projects/:id/file` | Cuerpo binario en streaming. Exige `Content-Length` igual a `size`. Cuenta bytes mientras llegan y **corta** si se pasa del máximo. Al terminar renombra a `<id>.<ext>` y pasa a `pending`. |
| `GET /api/projects/mine` | `[{ id, title, status, kind, file_size, created_at, last_error }]` |
| `DELETE /api/projects/:id` | El dueño cancela un proyecto que no esté `synced`; borra el archivo. |

Docente (panel): `GET /api/teacher/overview` agrega `projects: { pending, synced, failed, bytes }`. Es solo
informativo (sin aprobación).

### 4.3 Validaciones y protecciones

| Regla | Valor |
|---|---|
| Título | 5 a 120 caracteres (sin caracteres de control) |
| Descripción | 40 a 2000 caracteres |
| Bimestre | entero 1 a 4 |
| Extensiones | video: `mp4 mov m4v webm 3gp avi mkv`; modelo 3D: `stl obj glb` |
| Tamaño | 1 byte a 150 MB (`max_bytes`) |
| Equipo | si viene `group_id`, el estudiante debe ser miembro (según `group_members` del nodo) |
| Pendientes | máximo **5** proyectos `uploading`/`pending` por estudiante (`maxPendingProjects` en `config.json`) |
| Disco | se rechaza si quedaría menos de **2 GB** libres (`minFreeDiskMB`) |
| Borradores huérfanos | al arrancar y cada hora se borran los `uploading` de más de 1 hora y sus `.part` |
| Rutas | el archivo se guarda por `id`; se verifica que la ruta resuelta quede dentro de `dataDir/projects` |

### 4.4 Interfaz (`js/node-mode.js` y la vista `#view-upload` existente)

- En modo nodo el menú del estudiante muestra **Cursos** y **Subir proyecto**; el formulario es el de la nube
  (título, descripción, bimestre, equipo, archivo) con **barra de progreso** (XHR `upload.onprogress`).
- El selector de equipo se llena con `GET /api/projects/groups` en lugar de Supabase.
- Se reemplaza el envío (`_syncManager.enqueue('upload_project')`) por `POST /api/projects` + `PUT .../file`.
- **Mis proyectos**: lista con el estado en lenguaje claro: «Guardado en la escuela», «Subido a la nube»,
  «No se pudo subir: …».
- Se omiten el detector de IP (`api.ipify.org`) y la miniatura 3D, que necesitan internet.

## 5. Sincronización con la nube

### 5.1 Traer equipos (pull)

`node-sync` agrega a su respuesta `groups` (`groups` con `school_code` del nodo) y `group_members` de esos
equipos. El nodo los reemplaza completos en cada sincronización (son pocos datos).

### 5.2 Subir proyectos (push), por cada proyecto `pending`

1. **Pedir permiso**: `POST node-sync { action: 'project_upload_url', client_ref, ext, size }`.
   La función valida extensión y tamaño, genera la ruta `<timestamp>_<aleatorio>.<ext>` (como el flujo actual) y
   responde `{ path, signed_url }` con `admin.storage.from('project-videos').createSignedUploadUrl(path)`.
2. **Subir el archivo** con `PUT` en streaming a `signed_url` (Node `fetch` con `duplex: 'half'`). Si sale bien, el
   nodo guarda `cloud_path` y no vuelve a subir aunque falle el paso 3.
3. **Confirmar**: `POST node-sync { push: { projects: [{ client_ref, student_id, group_id, title, description,
   bimestre, upload_ip, cloud_path, created_at }] } }`.

### 5.3 Validación en la nube (`supabase/functions/node-sync`)

Por cada proyecto de `push.projects`, con la llave de servicio pero **limitado a la escuela del nodo**:

- `student_id` ∈ estudiantes de la escuela del nodo.
- Si hay `group_id`: es un equipo de esa escuela y el estudiante es miembro.
- `cloud_path` tiene la forma esperada y el objeto existe en Storage con tamaño ≤ 150 MB.
- Título, descripción y bimestre cumplen las reglas de 4.3 (se validan otra vez: el nodo no es de confianza total).
- **Idempotencia**: si ya existe un proyecto con `client_metadata->>node_ref = client_ref`, o el mismo
  (`user_id`, `title`, `bimestre`) como en el flujo actual, no se duplica y se devuelve el existente.
- Inserta en `projects` los mismos campos que hoy (`user_id`, `group_id`, `title`, `description`, `bimestre`,
  `upload_ip`, `video_url` = URL pública, `client_metadata: { source: 'nodo', node_ref, node_id }`).
- Si hay equipo, rota los roles (`planner → maker → speaker → helper`), igual que `rotateRoles` en `groups.js`.
- Responde `applied.projects: [{ client_ref, project_id }]`; el nodo marca `synced`, guarda `cloud_project_id`
  y `synced_at`.

### 5.4 Errores y reintentos

- Cada fallo se guarda en `last_error` con texto legible (sin internet, token no reconocido, archivo demasiado
  grande para la nube...) y `attempts += 1`; se reintenta en el siguiente ciclo (10 min).
- Un error en un proyecto **no frena** a los demás ni al resto de la sincronización (avances, PIN, ingresos).
- Tras sincronizar, el nodo borra la copia local a los **7 días** (`keepSyncedProjectDays`, configurable) para
  liberar disco.
- `school_nodes.last_sync_info` suma `appliedProjects`.

## 6. Seguridad y privacidad (son menores de edad)

- Las rutas de subida y consulta exigen sesión de estudiante; cada estudiante solo ve y cancela **sus** proyectos.
- El nodo no guarda ninguna llave de la nube más allá de su token (que solo da acceso a su escuela).
- La URL firmada es de un solo archivo, con ruta generada por la nube y de corta vida.
- La nube valida todo otra vez. El HTML de título y descripción se muestra siempre escapado (como hoy).
- El archivo no se expone por ninguna ruta del nodo mientras está guardado (vive fuera de `content/` y solo se sube a la nube).

## 7. Pruebas

| Qué | Cómo |
|---|---|
| Validación (título, descripción, extensión, tamaño, equipo, cupos) | Prueba unitaria sobre un módulo puro del nodo |
| API completa en el nodo | Prueba que arranca `server.js` de verdad (como `node-api.test.mjs`): borrador, subida, límite que corta, sesión, equipos, cancelar |
| Interfaz | Prueba en navegador real con los CDN bloqueados: formulario, progreso, lista «Mis proyectos» |
| Subida a la nube | Prueba del cliente contra una **nube simulada** (servidor local que imita `project_upload_url`, el PUT y la confirmación): reintento, idempotencia, fallo parcial |
| Función `node-sync` | `deno check` (ya está en el CI) y prueba de su lógica de validación como módulo puro (`projects.ts`) |
| **Nube real** | **No se puede probar desde el desarrollo** (requiere el Supabase del usuario). Se prueba juntos en el nodo del piloto. |

## 8. Despliegue

1. Volver a publicar la edge function `node-sync` con **Verify JWT en OFF**. No hay SQL nuevo.
2. Confirmar en Supabase (Storage → Settings) que el **límite de tamaño por archivo es ≥ 150 MB**: si fuera 50 MB,
   los videos grandes ya fallarían hoy también desde la nube.
3. Actualizar el nodo con `actualizar-windows.cmd` (con internet).

## 9. Riesgos abiertos

- **Límite de Storage** por archivo (ver 8.2): lo confirma el usuario.
- **Subida por Wi-Fi de videos grandes**: un router doméstico con varios estudiantes subiendo a la vez puede ir
  lento; la barra de progreso y el cupo de pendientes lo mitigan, pero conviene medirlo en el piloto.
- **Disco del nodo**: depende de la computadora; hay umbral mínimo y limpieza a los 7 días.
- **Moderación**: al publicarse solos, un contenido inadecuado se publica al sincronizar, igual que hoy en la nube;
  la mitigación es que el docente lo elimine. Si esto preocupa, la aprobación previa es la siguiente mejora.
- **Tipo de `groups.id`**: el código lo trata como número (`${g.id}` sin comillas); se confirma al implementar y se
  guarda tal como lo devuelva la nube.

## 10. Orden de trabajo (para el plan)

1. Módulo de validación y almacenamiento de proyectos en el nodo (tabla, API, pruebas).
2. Interfaz del estudiante: Subir proyecto y Mis proyectos.
3. Traer equipos y miembros en la sincronización.
4. Función de la nube (`project_upload_url`, `push.projects`) y subida desde el nodo, con nube simulada para probar.
5. Guía actualizada y prueba real con el usuario.
