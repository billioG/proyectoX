# Reacciones sin internet en el nodo — Plan de implementación (resumen)

> Ejecutado en modo nativo (superpowers:executing-plans), tarea por tarea con pruebas primero. Este archivo es el
> resumen de lo ejecutado; el diseño autoritativo es el spec.

**Spec:** `docs/superpowers/specs/2026-11-01-reacciones-offline-design.md`

**Goal:** Los estudiantes del nodo reaccionan a los proyectos de su Inicio con las 5 reacciones de la app y la nube las
aplica y cuenta los votos al sincronizar.

## Review Focus

1. Una reacción repetida (mismo estado reenviado) no suma dos veces el voto.
2. Un estudiante no puede reaccionar a un proyecto que no ve en su Inicio.
3. Reacción inventada, estudiante ajeno al nodo o proyecto de otra escuela no se aplican.
4. Tras sincronizar el conteo no se cuenta dos veces lo pendiente.
5. Un pull sin `reactions` (función vieja / USB antiguo) no borra las reacciones guardadas.

## Tareas

1. **`reactions.ts`** (lógica pura, Node 22): `REACTIONS`, `validateReactionEvent(ev, { studentIds })`; espejo idéntico en
   `supabase-functions/`. Pruebas: `tests-unit/node-sync-reactions.test.mjs`.
2. **`migrations/node-reactions.sql`:** `apply_node_reaction(p_student uuid, p_project integer, p_reaction text)`
   (`security definer`, solo `service_role`), idempotente, misma escuela, recalcula `projects.votes`. Pruebas contra
   PostgreSQL real desechable: `tests-unit/node-reactions-sql.test.mjs` (+ `helpers/temp-postgres.mjs`).
3. **`node-sync` (`index.ts`):** aplica `push.reactions` (tope 1000 por sync), responde `applied.reactions` y
   `reaction_errors` (con `permanent`), baja `reactions` propias de los alumnos sobre las fichas del Inicio. Sin
   prueba automática (sin Deno ni nube real).
4. **Nodo — almacén:** tablas `cloud_reactions` y `reactions_local`; `school-node/reactions.js`
   (`react`, `effective`, `adjustVotes(projectId, cloudVotes)`, `pending`, `clearSent`); `buildPush`/`applyPull`.
   Pruebas: `tests-unit/node-reactions-store.test.mjs`.
5. **Nodo — API:** `POST /api/projects/:id/react` y `GET /api/feed` con `my_reaction` y `votes`. Pruebas:
   `tests-unit/node-reactions-api.test.mjs`.
6. **Pantalla:** botón, selector de 5 reacciones y contador en cada tarjeta (`js/node-feed.js`). Prueba de Playwright con
   clic real: elegir, cambiar, quitar y recargar.
7. **Documentación y versión** (v1.0.194).
