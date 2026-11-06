# Recomendaciones de performance y límites actuales

Hecho **solo desde el repositorio**: lectura del código, mediciones con la app real corriendo sobre el nodo escolar, y pruebas en un PostgreSQL de verdad.
**No se midió contra tu Supabase real ni con una Raspberry real**; lo que depende de eso está marcado. Los cambios van en la v1.0.227 y en tres migraciones nuevas.

## 1. Lo más importante

1. **El inicio de sesión de un estudiante hacía 47 peticiones; ahora 27 (−43 %).** La mitad eran repetidas: el inicio de sesión corría **dos veces** (evento `SIGNED_IN` + llamada directa) y
   tres comprobaciones (insignias, punto rojo de retos, gemas) se disparaban desde 2 o 3 lugares. Con 150 estudiantes entrando a la vez, eran ~7 000 peticiones; ahora ~4 000 (cuenta medida en el nodo; la nube suma las de la campana y el latido).
2. **El tope real, mientras el plan sea el gratuito, no es la base de datos: son las 200 conexiones de tiempo real a la vez** (`PENDIENTES.md`; cada estudiante con la app abierta usa una para
   la presencia «en línea» y los duelos). Eso son **unos 200 estudiantes simultáneos en toda la plataforma**, no por colegio. No se cambió nada de plan (fuera de alcance), pero conviene saberlo.
3. Lo que más pesa por usuario **mientras usa la app** es el sondeo periódico (sección 3), no las pantallas.
4. Había consultas **sin límite** que crecían con los datos y, pasadas las 1000 filas que Supabase devuelve por defecto, daban cifras incompletas **en silencio**: la analítica de asistencia (toda la
   historia de todos los alumnos) y el widget de desempeño del equipo docente. Se acotaron al mes que muestran.

## 2. Presupuesto de peticiones medido (estudiante, app real)

`tests/perf-budget.spec.js` corre la app real sobre `school-node/server.js` (capa compatible con Supabase) y cuenta las peticiones a `/rest/v1`, `/functions/v1` y `/auth/v1`: cada una es una
consulta que la nube también recibiría. **Corre en una computadora**; en el nodo no existen el latido ni la presencia en tiempo real (esos se suman en la sección 3).

| Momento | Antes | Ahora | Qué se quitó |
|---|---|---|---|
| Inicio de sesión (hasta que la pantalla queda quieta) | 47 | **27** | El inicio corría 2 veces; insignias, retos y gemas, 2 o 3 veces |
| Abrir Perfil | 21 | **13** | Las mismas comprobaciones repetidas |
| Abrir Cursos | 2 | 2 | — |
| Abrir el Ranking (1.ª vez / 2.ª dentro de 45 s) | 1 / 1 | 1 / **0** | Caché con vigencia |
| Campana de avisos (solo con la nube; **no se mide en el nodo**) | ~11 en fila | ~11 **en paralelo**, y sin repetir en 15 s | Consultas independientes en paralelo |

La prueba **falla** si el inicio de sesión pasa de 35 peticiones o una pantalla pasa de 20: así una pantalla nueva que pida de más se nota. Comando:
`PW_CHANNEL=chrome npx --yes node@20 node_modules/@playwright/test/cli.js test tests/perf-budget.spec.js --workers=1` (imprime también el detalle y las repetidas).

**Aún repetidas** (sin corregir): en Perfil, `group_members`, `projects` y `student_badges` se piden 2 veces (por dos rutas distintas del mismo código del perfil).

## 3. Carga mientras la app está abierta (sondeo periódico)

Cálculo, no medición: lo que hace cada dispositivo **activo** (pestaña visible) en la nube.

| Qué | Cada cuánto | Peticiones por minuto | Código |
|---|---|---|---|
| Latido de tiempo activo (`record_active_heartbeat`) | 30 s | 2 | `js/activity-tracker.js` |
| Evento sorpresa (`checkActiveRandomEvent`) | 60 s (solo con pestaña visible) | 1 | `js/random-events.js` |
| Cartera de gemas (`refreshMyWallet`) | 120 s (solo visible) | 0,5 | `js/gamification.js` |
| Presencia «en línea» y duelos (Realtime) | conexión abierta | 1 conexión por dispositivo | `js/game-arena.js`, `js/duels.js` |
| Cola de sincronización sin conexión | 60 s | 0 si no hay nada pendiente | `js/sync-manager.js` |
| **Total en régimen** | | **≈ 3,5 peticiones/min por estudiante** + 1 conexión Realtime | |

Con **150 estudiantes simultáneos**: ≈ 525 peticiones/min (≈ 9 por segundo) en régimen, y ráfagas al inicio de clase (27 peticiones por inicio). Es una carga baja para Postgres **si las consultas
tienen índice** (sección 5). Lo que la hace crecer es lo que cada pedido cuesta, por eso se aligeró el latido (migración `performance-2026-11.sql`: de 4 consultas a 2 por latido, atómico).

## 4. Qué se encontró y qué se hizo

### 4.1 Consultas pesadas o frecuentes

| Dónde | Problema | Estado |
|---|---|---|
| `js/attendance-summary-view.js` (analítica de asistencia, admin y coordinador) | Traía **toda la asistencia de todos los tiempos** (cada alumno, cada día) con dos relaciones y filtraba el mes en el navegador; pasadas 1000 filas, cifras incompletas | **Hecho:** pide solo el mes que se ve, completo (paginado con orden estable) y guardado por mes. *El CSV por docente ahora exporta el mes en pantalla (el nombre del archivo lo dice).* |
| `js/team-performance-widget.js` (tablero del equipo docente) | Traía las tablas `attendance`, `evaluations`, `weekly_evidence` y `teacher_monthly_reports` **completas** y usaba solo el mes | **Hecho:** filtros de base de datos con los mismos instantes que el filtro de la pantalla (resultado idéntico, un día de margen en la asistencia por la zona horaria) |
| Ranking (`js/ranking.js`) | `ORDER BY votes DESC, score DESC LIMIT 20` sin índice: ordenaba toda `projects` en cada visita de cada estudiante | **Hecho:** índice parcial `idx_projects_ranking` (probado: el plan lo usa) + caché de 45 s que se invalida al votar |
| Campana de avisos (`loadAnnouncementsUnreadCount`) | ~11 consultas **una tras otra**, en cada inicio de sesión y refresco, y 2 o 3 veces seguidas | **Hecho:** en paralelo, compartida y con 15 s de descanso (las acciones que cambian el conteo fuerzan la actualización) |
| Inicio de sesión | Corría dos veces | **Hecho** (`js/auth.js`) |
| Latido (`record_active_heartbeat`) | 4 consultas por llamada, 2 llamadas por minuto por usuario, y se podía contar doble con dos pestañas | **Hecho** (migración): 2 consultas, una sola sentencia atómica |
| Feed de proyectos del Inicio (`js/projects.js`) | Trae **todos** los proyectos visibles (sin límite) con autor, escuela, equipo y evaluaciones, **incluida la miniatura en base64 de los modelos 3D (10–20 KB cada una)**; el filtrado y el orden se hacen en el navegador. Es la carga más grande por estudiante y crece con la cantidad de proyectos | **Parcial:** `schools(*)` → `schools(name, code)`. **Pendiente (recomendado):** una función `get_feed(limite, desplazamiento)` en el servidor que pagine y deje las miniaturas para cuando se vean |
| Tablero del administrador (`js/admin-dashboard.js`) | Trae `projects`, `evaluations`, `teacher_ratings`, `active_time_tracking` (una fila por usuario y día) y `teachers`/`schools` con `select('*')`, sin límite (solo `students` está paginada) | **Pendiente:** una función que devuelva ya los totales (el administrador es uno o dos usuarios, así que no es un problema de concurrencia, pero sí de exactitud pasadas las 1000 filas) |
| `select('*')` | 99 usos en 30 archivos (lessons, bonus-system, admin-success…) | **Pendiente:** listar columnas en las que más datos devuelven |

### 4.2 N+1 y consultas repetidas

| Dónde | Problema | Estado |
|---|---|---|
| `checkDuelResults` (`js/duels.js`) | Una consulta **por duelo terminado**, en fila, cada vez que se abre el Centro de Juego (historial de 10 duelos = 10 viajes) | **Hecho:** una sola consulta |
| `checkAndAwardBadges`, `checkAllBadges` (`js/badges.js`) | Por cada insignia: «¿ya la tiene?» + insert, en fila; evaluar el proyecto de un equipo de 4 con 6 insignias posibles eran **50+ consultas**; y dos consultas a `resource_comments` con los mismos datos | **Hecho:** una consulta de lo que ya tiene y un insert con lo que falta; los integrantes del equipo en paralelo; una sola consulta de comentarios |
| Insignias, retos y gemas al iniciar sesión | Corrían 2 o 3 veces (auth, temporizador de carga, Centro de Juego) | **Hecho:** coalescedor (`window.coalesce`) con espera mínima; los cambios reales fuerzan |
| `settle-random-event` (cron cada minuto) | Por cada premiado: leer gemas → sumar → escribir → escribir puesto (3 viajes). Además **pisaba** las gemas que el alumno ganara en ese instante (leer-sumar-escribir) y podía pagar dos veces si el cron se solapaba | **Hecho:** función SQL atómica `settle_random_event` (`random-event-settle-atomic.sql`); la Edge Function la usa y, si la migración falta, sigue como antes |
| `warmExamsOffline` (`js/exams.js`) | Dos consultas por examen, en fila, una vez por carga | Pendiente (bajo impacto: solo docentes con exámenes) |
| `node-sync` (nube) | Ya agrupa en lotes (con reintento fila por fila solo si el lote falla) y pagina con `fetchAll` | Sin cambios |
| `notify-*` | Una consulta de suscripciones por destinatario (necesario: cada push es un envío distinto) | Con el índice `push_subscriptions(user_id)` es barato |
| `ai-proxy` | Con el tope diario suma **1 consulta por pregunta de un estudiante** (el contador) y **2 de un docente** (su rol y el contador). Es el costo de poner el tope | Aceptado; el contador es una sola sentencia |

### 4.3 Índices (`migrations/performance-2026-11.sql`)

Se cruzaron los filtros del código con los índices del volcado y de las migraciones (ya existían los 72 de `security-hardening-2026-10.sql`). Faltaban, y se crean solo si la tabla y la columna
existen en tu base: `projects (votes desc, score desc) where score is not null` (Ranking), `announcement_reads (user_id)` (campana, en cada inicio de sesión), `push_subscriptions (user_id)`,
`resource_comments (author_id)`, `survey_responses (user_id)`, `attendance (teacher_id, date)`, `teacher_challenges (teacher_id)` y `(topic, created_at desc)` en los 4 duelos (las funciones de IA buscan temas usados).
Se crean sin `CONCURRENTLY` (no se puede en el SQL Editor): con miles de filas el bloqueo dura una fracción de segundo.

**Cómo ver cuáles son las consultas más costosas EN TU base** (solo lee; la extensión `pg_stat_statements` viene activa en Supabase):

```sql
select left(query, 120) as consulta, calls, round(mean_exec_time::numeric, 1) as ms_medio, round(total_exec_time::numeric) as ms_total
from pg_stat_statements
where query ilike '%public.%' and query not ilike '%pg_stat%'
order by total_exec_time desc limit 20;
```

Si una de las de arriba hace `Seq Scan` en una tabla grande, ahí falta un índice: `explain analyze <consulta>`.

## 5. Caché del cliente

`fetchWithCache` era «mostrar lo guardado y **siempre** volver a pedirlo»: acelera la pantalla pero **no baja la carga del servidor**. Ahora (`js/query-cache.js`, sin cambiar a quien no lo pida):

- **`{ ttlMs }`**: si lo guardado es reciente, **no consulta**. En uso: Ranking (45 s) y top por XP del Centro de Juego (60 s).
- **Consultas compartidas:** dos pedidas iguales a la vez hacen una.
- **`invalidateCache(clave o prefijo)`**: tras un cambio, la próxima lectura va al servidor (votar invalida el Ranking).
- Los establecimientos de la analítica de asistencia: 10 min.

**Reglas para poner un TTL en otra pantalla:** solo datos que cambian despacio y que **nadie edita en esa misma pantalla** (si hay un botón «guardar» que recarga la lista, el TTL escondería el cambio
salvo que invalides la clave); TTL de decenas de segundos a pocos minutos; y llamar a `invalidateCache` en el código que escribe. **No** se puso TTL al feed de proyectos (cambia con cada proyecto, voto y
evaluación) ni a las pantallas que se recargan tras guardar (escuelas, docentes, estudiantes).

## 6. Límites actuales conocidos

| Límite | Valor | Fuente | Verificado |
|---|---|---|---|
| Estudiantes simultáneos en la nube con el plan gratuito | **~200** (conexiones Realtime) | `PENDIENTES.md`, plan de Supabase | Sí, es un límite documentado del plan; **cada estudiante abierto usa una** |
| Filas por consulta sin paginar | **1000** (valor por defecto de Supabase) | PostgREST | Sí; por eso se paginan las consultas de totales (`fetchAllRows`) |
| Peticiones al iniciar sesión (estudiante) | **27** (techo de la prueba: 35) | `tests/perf-budget.spec.js` | Medido sobre el nodo |
| Peticiones en régimen por estudiante activo | **≈ 3,5/min** + 1 conexión Realtime | Cálculo, sección 3 | Cálculo |
| Preguntas a la IA por día | estudiante 30, docente 100, administrador 300 | `docs/SEGURIDAD_2026-11.md` | Pruebas con PostgreSQL |
| Tamaño de proyecto subido | 150 MB (nodo) | `docs/NODO_LIMITES.md` | Código |
| Almacenamiento y transferencia (plan gratuito) | 500 MB de base, 5 GB/mes de transferencia | `PENDIENTES.md` | Documentado por el plan; el feed de proyectos (miniaturas en base64) es el mayor consumidor de transferencia por estudiante |
| Estudiantes con la app abierta en un nodo | 20 recomendados; 21–40 probable con SSD y router; >40 medir | `docs/NODO_LIMITES.md` | 20: piloto real; el resto, cálculo |

### El nodo escolar (resumen; detalle en `docs/NODO_LIMITES.md`)

- La app (JavaScript, CSS y página) pesa 2,3 MB y el nodo la entrega **comprimida (0,6 MB)**; en la nube la comprime GitHub Pages. La primera apertura de 20 tablets a la vez son ~12 MB: el cuello de botella es el **Wi-Fi**, no la Raspberry.
- El nodo **no hace el latido ni la presencia en tiempo real**, así que su carga por estudiante es menor que la de la nube; cada petición pasa por la capa compatible con Supabase sobre SQLite (una sola escritura a la vez).
- Cada petición de la lista del apartado 2 también la atiende el nodo: **reducir peticiones ayuda al nodo igual que a la nube**.
- Se recomienda **medir en cada escuela** con `school-node/herramientas/prueba-de-carga.mjs` (10 minutos).

## 7. Recomendaciones, por impacto

1. **Aplicar `performance-2026-11.sql` y `random-event-settle-atomic.sql`** y redesplegar `settle-random-event` (en ese orden).
2. **Paginar el feed del Inicio con una función del servidor** (`get_feed`): es lo que más datos mueve por estudiante y lo que más crece. Dejar la miniatura 3D para cuando la tarjeta esté a la vista.
3. **Resumir el tablero del administrador en SQL** (totales ya calculados) en vez de traer tablas enteras.
4. **Quitar la repetición de Perfil** (`group_members`, `projects`, `student_badges` ×2) con una sola lectura compartida por el nivel y las insignias.
5. **Revisar los 99 `select('*')`**, empezando por `lessons.js` y `bonus-system.js`.
6. Si el uso crece y se sigue en el plan gratuito, **avisar antes de las 200 conexiones**: la presencia en línea podría hacerse bajo demanda (solo en el Centro de Juego) en vez de abrir el canal en cada sesión. Esa decisión es de producto.
7. Minificar `js/*.js` (ya está en `PENDIENTES.md`: PageSpeed móvil 64).

## 8. Cómo medir de nuevo

| Qué | Cómo |
|---|---|
| Peticiones por pantalla | `tests/perf-budget.spec.js` (arriba) |
| Consultas costosas en producción | La consulta de `pg_stat_statements` de §4.3 |
| Un índice se usa | `explain select …` debe mostrar `Index Scan using idx_…` |
| Nodo con N tablets | `school-node/herramientas/prueba-de-carga.mjs` desde otra computadora |
| Que el caché y los N+1 siguen corregidos | `tests-unit/query-cache.test.mjs` |
