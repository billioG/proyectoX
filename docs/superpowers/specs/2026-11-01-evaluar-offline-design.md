# Evaluar proyectos sin internet en el nodo escolar (con PIN personal del docente)

Estado: **implementado en v1.0.195** (falta la prueba con la nube real); resumen del plan en
`docs/superpowers/plans/2026-11-01-evaluar-offline.md`.

## Objetivo
Los docentes pueden seguir evaluando los proyectos de sus estudiantes cuando la escuela no tiene internet. La
evaluación se sube y se valida en la nube al sincronizar. Primera entrega del panel del docente sin internet; los
avisos y la creación de cursos serían las siguientes.

## Hechos del sistema actual (verificados en el código)
- Una evaluación tiene 5 criterios de 0 a 20 (creatividad, claridad, funcionalidad, trabajo en equipo, impacto
  social), total 0 a 100 y observación; guarda la nota en `projects.score` (`sync_save_evaluation`, SECURITY INVOKER).
- Solo el docente **asignado a la clase** (escuela, grado y sección) del estudiante puede evaluar
  (`evaluations-restrict-to-assigned-teacher.sql`). `evaluations.project_id` es UNIQUE.
- El panel del docente del nodo entraba con un **código único compartido** (`teacherCode`), sin identidad.
- Las insignias por nota las otorga el navegador del docente con internet.

## Decisiones tomadas con el usuario
- Se empieza por **evaluar proyectos**; avisos y crear cursos quedan para después.
- Identidad: **PIN personal de 6 números por docente**, solo en el nodo (hash y sal); la primera vez se crea con el
  código de docente del nodo (nadie puede adueñarse del nombre de otro). Bloqueo de 5 minutos tras 5 intentos.
  El código compartido sigue para administrar el nodo (sincronizar, restablecer PIN de estudiantes y de docentes).
- Se pueden evaluar también proyectos que un estudiante guardó en el nodo y aún no se publicaron (la nube los asocia
  por `node_ref` al sincronizar) y se puede ver su video guardado en el nodo.

## Diseño
1. **Nube** (`migrations/node-evaluations.sql`): `apply_node_evaluation(p_teacher, p_school_code, p_project_id,
   p_node_ref, p_evaluation jsonb)` (`security definer`, solo `service_role`): exige docente asignado a la clase y
   proyecto de la escuela del nodo, 5 notas enteras 0 a 20, **recalcula el total**, observación de hasta 1000
   caracteres, una evaluación por proyecto (gana la última) y deja la nota en el proyecto. `node-sync`
   (`evaluations.ts`): valida cada evento, aplica hasta 200 por sync (40 s) y responde `applied.evaluations` y
   `evaluation_errors` (con `permanent`); el pull trae `teachers` (docentes con clases en la escuela, sin
   correos ni PIN) y `evaluations` de los proyectos del Inicio.
2. **Nodo:** tablas `teachers` (PIN solo local, conservado en cada pull), `cloud_evaluations` y `evaluations_local`
   (la evaluación final pendiente por proyecto, clave `c:<id nube>` o `l:<uuid nodo>`). Se borra un pendiente solo
   cuando la nube lo confirma o lo rechaza de forma definitiva; con una función anterior o un error pasajero se
   conserva y se reintenta. Rutas: `GET /api/teachers`, `POST /api/teacher/pin-login`, `GET /api/teacher/evaluations`,
   `GET /api/teacher/evaluations/:key`, `POST /api/teacher/evaluate`, `GET /api/teacher/project-file/:id` (video con
   `Range`; el token va en `?t=` solo en esa ruta), `POST /api/teacher/reset-teacher-pin` (código compartido).
   La sesión del docente es distinta de la del código compartido y de la de estudiante.
3. **Estudiantes:** al evaluar, su Inicio muestra la nota y la observación al instante; un proyecto con nota > 0 se
   vuelve visible para su clase (igual que con internet); la observación sigue visible solo para el dueño y su equipo.
4. **Pantalla:** «Soy docente» → elegir nombre → PIN (+ código la primera vez) → lista de proyectos de sus clases
   (por evaluar primero) → formulario con video, 5 notas, total en vivo y observaciones. En la administración del
   nodo, lista de docentes con «Restablecer PIN».

## Fuera de alcance
Avisos, crear cursos, exámenes, evaluación con IA, insignias por nota y avisos al estudiante desde el nodo.

## Riesgos
- Orden de despliegue: migración → publicar `node-sync` (con `evaluations.ts`) → actualizar el nodo.
- Si dos docentes evalúan el mismo proyecto (uno en el nodo y otro en línea), gana el último que llegue a la nube.
- Los videos de proyectos que solo están en la nube no se pueden ver en el nodo (se evalúan con aviso).
- Quien tenga el código de docente del nodo puede crear el PIN de un docente que aún no tiene; quien tenga el token
  del nodo puede mandar evaluaciones de cualquier docente asignado a la escuela (la nube valida la asignación).
- El SQL se prueba contra un PostgreSQL real; la parte de `index.ts` que habla con Supabase no se prueba aquí.

## Review Focus
1. Un docente no evalúa proyectos de clases que no tiene asignadas (nodo y nube).
2. El total lo calcula siempre la base/el nodo: un total manipulado se ignora.
3. La sesión de estudiante o la del código compartido no abre las rutas de evaluar ni el video.
4. Una evaluación pendiente no se pierde si la nube no la confirma (función vieja, error pasajero, proyecto aún no publicado).
5. El archivo del video solo se sirve a un docente de esa clase y nunca por una ruta o nombre elegido por el cliente.
