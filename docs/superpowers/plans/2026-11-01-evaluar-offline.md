# Evaluar proyectos sin internet con PIN personal — Plan de implementación (resumen)

> Ejecutado en modo nativo (superpowers:executing-plans), tarea por tarea con pruebas primero. El diseño autoritativo es el
> spec: `docs/superpowers/specs/2026-11-01-evaluar-offline-design.md`.

## Review Focus
1. Un docente no evalúa proyectos de clases que no tiene asignadas (nodo y nube).
2. El total lo calcula siempre la base o el nodo; uno manipulado se ignora.
3. La sesión de estudiante o la del código compartido no abre las rutas de evaluar ni el video.
4. Una evaluación pendiente no se pierde si la nube no la confirma.
5. El video solo se sirve a un docente de esa clase y nunca por una ruta o nombre elegido por el cliente.

## Tareas
1. `evaluations.ts` (lógica pura, Node 22): `validateEvaluationEvent`, `buildTeacherList`, `shapeEvaluations`; espejo idéntico.
2. `migrations/node-evaluations.sql`: `apply_node_evaluation(...)`; pruebas contra PostgreSQL real.
3. `node-sync` (`index.ts`): aplica `push.evaluations` (200 por sync / 40 s); pull con `teachers` y `evaluations`. Sin prueba automática.
4. Nodo — tablas, `evaluations.js`, `teachers.js`, `buildPush`/`applyPull`; pruebas con SQLite.
5. Nodo — rutas (`pin-login`, evaluar, video con Range, reset de PIN) y nota visible para el estudiante.
6. Pantalla del docente (`js/node-mode.js`) con prueba de Playwright con clic real.
7. Documentación y versión (v1.0.195).
