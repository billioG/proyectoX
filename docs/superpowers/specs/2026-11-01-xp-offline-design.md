# XP sin internet (nodo escolar) con sincronización a la nube

Estado: diseño aprobado por el usuario (2026-11-01); pendiente revisión del spec escrito.

## Objetivo
Los estudiantes del nodo (sin internet) ganan XP al completar lecciones, al subir proyectos y al abrir el
cofre diario, lo ven en su Perfil, y todo se valida y suma en la nube cuando el nodo se sincroniza.

## Hechos del sistema actual (verificados en el código)
- XP total (app, `calculateStudentXP`) = proyectos×50 + votos×10 + suma de notas + insignias×100 + `students.xp`
  (bonos). Nivel = floor(XP/500)+1. Gemas = `students.gems`.
- `students.xp/gems/daily_chest_last_claimed` solo se escriben en el servidor (migración `economy-server-side.sql`
  revocó el UPDATE a los clientes). El cofre (`claim_daily_chest`) da 20/5, 50/15 o 100/50 (XP/gemas), una vez al día.
- Completar una lección **hoy no da XP** ni con internet.
- Un proyecto subido desde el nodo ya cuenta 50 XP + su nota cuando la nube lo publica.

## Decisiones tomadas con el usuario
- Fuentes de XP sin internet: completar lecciones, subir proyecto, cofre diario.
- **+10 XP por lección completada, una sola vez por estudiante y lección, también con internet** (igual para todos).
- El cofre lo **sortea el nodo** (mismos tres premios); la nube valida y aplica. Riesgo aceptado: la nube no puede
  comprobar el azar; solo acepta un cofre por día por estudiante y solo los tres premios válidos.
- La nube es la única que escribe XP/gemas. No hay retroactivo: las lecciones ya completadas no dan XP.

## Diseño
1. **Migración SQL `migrations/xp-events.sql`** (la ejecuta el usuario en Supabase):
   tabla `xp_events (id, student_id, kind, ref, xp, gems, created_at, UNIQUE (student_id, kind, ref))` con RLS sin
   políticas; disparador `AFTER INSERT OR UPDATE OF status` en `lesson_completions` (security definer) que, al
   pasar a `completed`, inserta `('lesson', lesson_id, 10, 0)` y, solo si se insertó, suma a `students.xp`;
   función `apply_node_chest(p_student, p_date, p_xp, p_gems)` (solo `service_role`) que acepta el cofre si el
   premio es válido, la fecha no es futura ni de hace más de 3 días y `daily_chest_last_claimed` es menor, inserta el
   evento `('chest', fecha, ...)` y actualiza xp, gems y `daily_chest_last_claimed` de forma atómica e idempotente.
2. **`node-sync`** (lógica pura en `xp.ts`, con espejo): el pull agrega por estudiante `xp_total`, `gems` y
   `daily_chest_last_claimed` (XP total con la misma fórmula de la app; consulta de proyectos, equipos e
   insignias de los alumnos del nodo); el push acepta `xp_events` de tipo `chest`, valida con `validateXpEvent`
   (premio ∈ {20/5, 50/15, 100/50}, fecha válida, estudiante del nodo) y llama `apply_node_chest`; responde
   `applied.xp_events` (refs aceptadas) y `xp_errors`.
3. **Nodo:** `xp_total/gems/daily_chest_last_claimed` viven en `students.extra` (sin cambio de esquema). Tabla
   `xp_events_local (id, student_id, kind, ref, xp, gems, created_at)` con los eventos aún no confirmados:
   `lesson` (se crea la primera vez que una lección pasa a `completed` en el nodo; la nube la paga con su
   disparador al subir el progreso) y `chest` (se sube en el push). XP mostrado = `xp_total` + suma de pendientes.
   Tras un sync exitoso los pendientes enviados se borran (el nuevo `xp_total` ya los incluye). `POST /api/chest`
   sortea el premio (uno por día según `daily_chest_last_claimed` y los pendientes) y lo registra.
4. **Pantalla:** el cofre diario vuelve en el nodo (usa `POST /api/chest`); el Perfil del nodo muestra nivel, rango,
   barra de XP y gemas; al completar una lección sale «+10 XP» (en el nodo y con internet).
5. **Pruebas:** SQL probado con revisión manual y pruebas de la lógica pura; `xp.ts` (fórmula, validación) y el
   nodo (eventos, cofre una vez al día, sin doble conteo tras sync) con pruebas automáticas; Playwright del cofre
   y del Perfil con clic real.

## Fuera de alcance
Gemas por lecciones, tienda, insignias y retos en el nodo, retroactivo, ranking del nodo.

## Riesgos
- Hay que ejecutar la migración, volver a publicar `node-sync` (con `xp.ts`) y actualizar el nodo; el orden es
  migración → función → nodo.
- El SQL y el cableado de `index.ts` no se pueden probar aquí (sin Supabase ni Deno): se verifican en la escuela.
- Un administrador de la PC de la escuela podría forzar siempre el premio mayor del cofre (aceptado).

## Review Focus
1. La misma lección completada dos veces (o desde nodo e internet) paga 10 XP una sola vez.
2. El cofre: dos eventos el mismo día, fecha futura o premio inventado no suman.
3. Ningún cliente gana permiso de escribir `xp/gems` (solo disparador y función `service_role`).
4. Tras sincronizar no se cuenta dos veces el XP pendiente.
5. Un pull sin `xp_total` (función vieja) no rompe el Perfil ni el cofre del nodo.
