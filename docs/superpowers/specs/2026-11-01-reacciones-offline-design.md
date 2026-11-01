# Reacciones a proyectos sin internet (nodo escolar)

Estado: **implementado en v1.0.194** (falta la prueba con la nube real); plan en `docs/superpowers/plans/2026-11-01-reacciones-offline.md`.

## Objetivo
Los estudiantes del nodo (sin internet) reaccionan a los proyectos de su Inicio con las mismas cinco reacciones de
la app, y la nube las aplica y cuenta los votos cuando el nodo se sincroniza.

## Hechos del sistema actual (verificados en el código)
- `project_likes (project_id integer, user_id uuid, reaction text)` con `UNIQUE (project_id, user_id)`: **una
  reacción por estudiante y proyecto**. Reacciones: `like`, `excelente`, `wow`, `destacar`, `animo`.
- `react_to_project(p_project_id, p_reaction)` (usa `auth.uid()`): sin reacción previa la inserta; tocar la misma la
  quita; otra distinta la reemplaza. `projects.votes` = reacciones `like` + `excelente` (migración
  `project-reactions-likes-only.sql`). Los votos dan 10 XP al dueño (y a su equipo).
- Un disparador sobre `project_likes` crea el aviso de la campana al dueño/equipo sin revelar quién reaccionó;
  el push (`notify-reaction`) lo pide el navegador con la sesión del usuario.
- `react_to_project` no impide reaccionar al propio proyecto.

## Decisiones tomadas con el usuario
- Las **5 reacciones** de la app, una por proyecto (se cambia o se quita), como con internet.
- La nube es la única que cuenta votos. El nodo guarda la **reacción final** por (estudiante, proyecto), no un contador.
- Misma regla que la app respecto al propio proyecto (no se bloquea).
- Sin push desde el nodo (necesita sesión de internet); el aviso de la campana sí se crea en la nube al sincronizar.

## Diseño
1. **Migración SQL `migrations/node-reactions.sql`:** `apply_node_reaction(p_student uuid, p_project integer,
   p_reaction text) returns jsonb` (`security definer`, `set search_path = public`, solo `service_role`): reacción
   `null` borra la fila de `project_likes`; una de las cinco la inserta o la reemplaza (`on conflict (project_id,
   user_id) do update`); exige que el proyecto exista y que su dueño sea de la misma escuela (`school_code`) que el
   estudiante; recalcula `projects.votes`; devuelve `{ mine, votes }`. Idempotente.
2. **`node-sync`** (lógica pura en `reactions.ts`, espejo idéntico): el push acepta
   `reactions: [{ student_id, project_id, reaction }]` (`reaction` null = quitar); `validateReactionEvent` exige
   estudiante del nodo, `project_id` entero positivo y reacción ∈ las cinco o null; se aplican con la función SQL;
   respuesta `applied.reactions` (claves `"<student_id>|<project_id>"` confirmadas) y `reaction_errors`.
   El pull agrega `reactions: [{ student_id, project_id, reaction }]` con las reacciones propias de los alumnos del
   nodo sobre los proyectos de las fichas del Inicio.
3. **Nodo:** tablas `cloud_reactions (student_id, project_id, reaction, PRIMARY KEY (student_id, project_id))`
   (base, se reemplaza completa **solo si** el pull trae `reactions`) y `reactions_local (student_id, project_id,
   reaction NULL, updated_at, PRIMARY KEY (...))` con solo la última reacción pendiente por par. `buildPush` agrega
   `reactions`; `applyPull` borra los pendientes enviados salvo los cambiados mientras se sincronizaba (se compara
   `updated_at`). `POST /api/projects/:id/react { reaction }` (sesión de estudiante; `:id` = id de la ficha de la
   nube): el proyecto debe estar en el Inicio del estudiante (mismas reglas de visibilidad que `/api/feed`), si no
   404; reaccionar con la misma que ya tiene la quita; devuelve `{ mine, votes }`. `GET /api/feed` agrega
   `my_reaction` y `votes` = votos de la nube ± el efecto de **todo** lo pendiente del nodo, de cualquier estudiante
   (así todos ven el mismo número; solo `like`/`excelente` cuentan).
4. **Pantalla:** cada tarjeta del Inicio del nodo tiene un botón de reacción (corazón o la reacción propia), un
   selector con las cinco reacciones y el conteo de votos; se actualiza al instante.
5. **Pruebas:** `reactions.ts` (validación), nodo (store, API de visibilidad/toggle/votos, push y limpieza tras
   sync) y Playwright (clic real: reaccionar, cambiar, quitar, recargar conserva).

## Fuera de alcance
Push de reacciones, reacciones a recursos/comentarios, bloquear el propio proyecto, ver quién reaccionó.

## Riesgos
- Orden de despliegue: migración → publicar `node-sync` (con `reactions.ts`) → actualizar el nodo.
- El SQL y el cableado de `index.ts` no se prueban de forma automática (sin Supabase ni Deno).
- Un estudiante puede reaccionar a su propio proyecto (igual que con internet), lo que suma 10 XP por voto de
  `like`/`excelente`; el límite es una reacción por proyecto.
- Si dos dispositivos reaccionan distinto antes de sincronizar, gana la del nodo al sincronizar (última en llegar).

## Review Focus
1. Una reacción repetida (mismo estado reenviado) no suma dos veces el voto.
2. Un estudiante no puede reaccionar a un proyecto que no ve en su Inicio (otra sección, no aprobado y ajeno).
3. Reacción inventada, estudiante ajeno al nodo o proyecto de otra escuela no se aplican.
4. Tras sincronizar el conteo no se cuenta dos veces lo pendiente.
5. Un pull sin `reactions` (función vieja / USB antiguo) no borra las reacciones guardadas.
