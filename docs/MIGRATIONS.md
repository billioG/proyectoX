# Migraciones de la base de datos

## Lo más importante

Las migraciones de `migrations/` **no alcanzan para crear la base desde cero**.
Las tablas principales (`students`, `teachers`, `schools`, `projects`,
`attendance`, `evaluations`, `teacher_assignments`, etc.) se crearon desde el
panel de Supabase antes de que se empezaran a guardar migraciones en el
repositorio (24 de agosto de 2026). La primera migración ya modifica tablas
que tienen que existir.

La forma correcta de tener una copia completa es **volcar el esquema de
producción**:

```powershell
./scripts/dump-schema.ps1
```

Eso genera `supabase/schema.sql` con todas las tablas, funciones, políticas y
permisos actuales (sin datos de alumnos). Ver [SETUP.md](SETUP.md).

## Reglas para migraciones nuevas

- Un archivo por cambio, en `migrations/`, con nombre descriptivo en minúsculas y guiones.
- **Seguras de re-ejecutar**: `create table if not exists`, `add column if not exists`, `create or replace function`, `drop policy if exists` antes de `create policy`.
- **No destructivas**: no borrar columnas ni datos sin un plan acordado.
- Encabezado que explique qué hace, por qué, y qué otras migraciones requiere.
- Tablas nuevas: `enable row level security`, políticas explícitas, `revoke all ... from anon, authenticated` y luego solo los `grant` necesarios.
- Funciones con privilegios: `security definer` + `set search_path = public`.
- Terminar con `notify pgrst, 'reload schema';`.
- **Nunca** escribir secretos en una migración (tokens, claves, `CRON_SECRET`). Usar marcadores como `<CRON_SECRET>` y reemplazarlos solo en el SQL Editor.
- Agregar la migración nueva al final de la tabla de abajo.

Cuando el proyecto pase a la CLI de Supabase, estas migraciones se moverán a
`supabase/migrations/` con prefijo de fecha (`20260926120000_nombre.sql`).

## Orden de aplicación

Orden en que se agregaron al repositorio (historial de git). Aplicadas en este
orden sobre una base que ya tiene las tablas principales, reproducen el estado
de producción.

| # | Fecha | Archivo | Qué hace |
|---|---|---|---|
| 1 | 2026-08-24 | `fix-rls-privilege-escalation.sql` | FIX CRÍTICO: escalación de privilegios en proyectoX |
| 2 | 2026-08-24 | `class-passwords.sql` | Contraseña por clase (escuela + grado + sección) estilo Kolibri: |
| 3 | 2026-08-24 | `class-passwords-login-mode-lookup.sql` | Permite que la pantalla de login (sin sesión, rol anon) sepa si un |
| 4 | 2026-08-25 | `lessons.sql` | Módulo de Lecciones (Fase 1: video/PDF/imagen, sin nota automática) |
| 5 | 2026-08-25 | `lessons-school-fk.sql` | Falta esta FK para que PostgREST pueda resolver el embed lessons->schools |
| 6 | 2026-08-25 | `lessons-scorm-h5p.sql` | Fase 2: soporte SCORM / H5P para Lecciones |
| 7 | 2026-08-25 | `lessons-share-edit.sql` | Lecciones: compartir en biblioteca global + edición de metadata |
| 8 | 2026-08-25 | `lessons-tags.sql` | Etiquetas de lecciones -- filtrar/agrupar en la biblioteca compartida |
| 9 | 2026-08-25 | `ai-project-evaluations.sql` | Evaluación por IA -- segunda opinión junto a la del docente |
| 10 | 2026-08-25 | `evaluations-restrict-to-assigned-teacher.sql` | Solo el docente ASIGNADO a la clase del estudiante puede calificar |
| 11 | 2026-08-25 | `courses.sql` | Cursos: contenedor de lecciones ordenadas con bloqueo secuencial |
| 12 | 2026-08-25 | `teacher-monthly-reports-fk.sql` | teacher_monthly_reports.teacher_id no tenía FK hacia teachers, |
| 13 | 2026-08-25 | `courses-school-fk.sql` | courses.school_code sin FK -- rompe el embed courses(*, schools(name)) |
| 14 | 2026-08-25 | `teacher-monthly-reports-unique.sql` | Evita que un docente envíe varios informes duplicados del mismo mes |
| 15 | 2026-08-25 | `course-grading.sql` | Ponderación de cursos + Código Personal (para export estilo SIRE) |
| 16 | 2026-08-25 | `weekly-evidence-one-per-week.sql` | Máximo 1 evidencia semanal por docente por semana ISO (respaldo a |
| 17 | 2026-08-25 | `student-duels-settlement.sql` | Liquidación automática del Desafío 1v1: cuando ambos alumnos ya |
| 18 | 2026-08-25 | `student-duels.sql` | Desafíos 1v1 entre estudiantes -- quiz de trivia generado por IA, |
| 19 | 2026-08-25 | `duel-harden.sql` | Blinda las respuestas del Desafío 1v1: el cliente ya no puede leer |
| 20 | 2026-08-25 | `quiz-and-ai-code.sql` | #6: recurso "quiz" dentro de un curso (opcion multiple, V/F, numero, rango, texto abierto). |
| 21 | 2026-08-25 | `lessons-content-url-nullable.sql` | System.Object[] |
| 22 | 2026-08-26 | `badge-celebrated-rls.sql` | El alumno/docente necesita poder marcar SU PROPIA insignia como |
| 23 | 2026-08-26 | `badge-celebrated.sql` | El "ya vi esta insignia" se guardaba en localStorage (por dispositivo) -- |
| 24 | 2026-08-26 | `duel-cancel-status.sql` | Permite que el challenger cancele un desafío 1v1 que todavía está |
| 25 | 2026-08-26 | `duel-result-seen.sql` | checkDuelResults() (duels.js) lee/escribe result_seen en |
| 26 | 2026-08-26 | `enable-pg-cron-pg-net.sql` | System.Object[] |
| 27 | 2026-08-26 | `random-events-cron.sql` | CRON: eventos sorpresa nocturnos |
| 28 | 2026-08-26 | `random-events-rpc.sql` | Igual que get_duel_questions: entrega las preguntas del evento SIN |
| 29 | 2026-08-26 | `random-events.sql` | EVENTOS SORPRESA NOCTURNOS -- quiz relámpago con notificación push |
| 30 | 2026-08-26 | `random-events-admin-rls.sql` | El admin necesita poder lanzar un evento manualmente (para probar o |
| 31 | 2026-08-26 | `login-case-insensitive.sql` | Los usuarios de alumno se generan siempre en minusculas; si el |
| 32 | 2026-08-26 | `duel-review-rpc.sql` | Una vez que el duelo terminó, ya no hay nada que blindar -- entrega las |
| 33 | 2026-08-26 | `mascot-chat-history.sql` | Historial de la conversación con la mascota (antes se perdía al |
| 34 | 2026-08-26 | `announcements.sql` | Ítem 5 (parte 1): avisos in-app. Docente -> a su clase asignada. |
| 35 | 2026-08-26 | `get-event-questions-userid.sql` | System.Object[] |
| 36 | 2026-08-26 | `push-sub-role.sql` | System.Object[] |
| 37 | 2026-08-26 | `random-events-teachers.sql` | Ítem 12: eventos sorpresa también para docentes -- totalmente |
| 38 | 2026-08-26 | `surveys.sql` | Ítem 5 (parte 2): encuestas del admin -- varias preguntas de distinto |
| 39 | 2026-08-26 | `tournaments.sql` | TORNEOS ENTRE ESTABLECIMIENTOS -- temporada tipo liga. Equipos nuevos |
| 40 | 2026-08-26 | `announcements-delete.sql` | El que mando un aviso lo puede borrar (desaparece para todos los |
| 41 | 2026-08-26 | `resource-notes-comments.sql` | Notas personales (privadas) y comentarios de equipo por recurso (lesson). |
| 42 | 2026-08-26 | `resource-comments-likes-replies.sql` | Likes + respuestas anidadas para resource_comments. |
| 43 | 2026-08-26 | `resource-notes-append-only.sql` | Las notas privadas eran un único registro que se sobreescribía (upsert). |
| 44 | 2026-08-26 | `comment-notifications.sql` | Notificación al autor de un comentario cuando le responden o le dan like. |
| 45 | 2026-08-26 | `course-feedback.sql` | Like + feedback de un docente hacia un curso de OTRO docente en la |
| 46 | 2026-08-26 | `surveys-delete.sql` | Admin puede eliminar encuestas (y sus respuestas) igual que ya podía con avisos. |
| 47 | 2026-08-26 | `duels-realtime.sql` | Habilita Supabase Realtime en student_duels para que el retador vea el |
| 48 | 2026-08-27 | `student-duels-grants.sql` | "permission denied for table student_duels" es un error de GRANT a nivel |
| 49 | 2026-08-27 | `coordinador-role.sql` | ROL COORDINADOR + AGRUPACIÓN POR PROGRAMA |
| 50 | 2026-08-27 | `programs.sql` | PROGRAMAS/PROYECTOS COMO CATÁLOGO ADMINISTRADO |
| 51 | 2026-08-27 | `reengagement-emails.sql` | CORREOS DE REENGANCHE (24h / 3 días sin ingresar) |
| 52 | 2026-08-27 | `companion-gems-total.sql` | MASCOTA DE ESTUDIANTE -- gemas totales ganadas en la vida |
| 53 | 2026-08-28 | `lessons-html5.sql` | Permite content_type='html5' (y confirma 'quiz', ya en uso pero sin |
| 54 | 2026-08-28 | `resource-comments-attachments.sql` | Permite adjuntar una imagen/archivo a un comentario de recurso -- |
| 55 | 2026-08-28 | `student-challenges.sql` | Reto del mes tambien para estudiantes (antes solo docentes via |
| 56 | 2026-08-28 | `student-practice-quiz.sql` | Modo Práctica Solo (repaso individual, sin rival) -- mismo motor de |
| 57 | 2026-08-28 | `student-practice-quiz-review.sql` | Práctica Solo no mostraba retroalimentación al terminar (a diferencia |
| 58 | 2026-08-28 | `shop-items.sql` | Rediseño de la Tienda de Mascotas: antes 3 de 4 items no hacían nada |
| 59 | 2026-08-28 | `student-promotion.sql` | Fin de ciclo escolar: promover estudiantes de grado sin tener que |
| 60 | 2026-08-28 | `student-hangman-duels.sql` | Ahorcado 1v1 -- mismo espíritu que los Desafíos de Código (student_duels) |
| 61 | 2026-08-28 | `student-debug-duels.sql` | Encontrá el Error 1v1 -- se muestra una secuencia corta de "bloques" de |
| 62 | 2026-08-28 | `student-timed-math-duels.sql` | Contrarreloj 1v1 -- operaciones matemáticas cronometradas, gana quien |
| 63 | 2026-08-28 | `student-baja.sql` | "Dar de baja" a un estudiante (se retiró a mitad de año, distinto de |
| 64 | 2026-08-29 | `tinkercad.sql` | Conexión con Tinkercad: (1) link a la Clase de Tinkercad del docente, |
| 65 | 2026-08-29 | `cnb-boletas.sql` | Primer paso para poder generar el Cuadro de Resultados Finales / Certificado |
| 66 | 2026-08-29 | `economy-server-side.sql` | FIX CRÍTICO: xp/gems/flags de economía se escribían directo desde el |
| 67 | 2026-08-29 | `project-votes-server-side.sql` | Fix: projects.votes se escribía con un número calculado en el cliente |
| 68 | 2026-08-29 | `economy-server-side-fix2.sql` | FIX del fix: el REVOKE UPDATE (columna) de economy-server-side.sql NO |
| 69 | 2026-08-30 | `streak-server-side.sql` | Fix: la racha (streak/last_login) todavía se escribía directo desde el |
| 70 | 2026-08-30 | `content-url-allowlist.sql` | Allowlist de hosts para lessons.content_url -- se embebe en iframe o se |
| 71 | 2026-08-30 | `login-rate-limit.sql` | Rate limit por IP para student-login -- endpoint público (necesario, es |
| 72 | 2026-09-10 | `student-spelling-duels.sql` | Ortografía 1v1 -- mismo espíritu que Ahorcado (student_hangman_duels) |
| 73 | 2026-09-25 | `audit-fixes-duels-chest.sql` | Fixes de auditoría (septiembre 2026): |
| 74 | 2026-09-25 | `active-time-server-side.sql` | Tiempo activo calculado en servidor. Antes el cliente leía |
| 75 | 2026-09-25 | `push-subscriptions-rpc.sql` | Suscripciones push vía RPC: |
| 76 | 2026-09-25 | `companion-species.sql` | Mascotas elegibles: cada estudiante elige UNA especie inicial (quetzal, |
| 77 | 2026-09-25 | `companion-cosmetics.sql` | Accesorios y trajes para las mascotas (estilo Free Fire). |
| 78 | 2026-09-25 | `season-pass.sql` | Pase de Temporada (gratis, estilo Clash Royale). Una temporada por mes |
| 79 | 2026-09-25 | `weekly-leagues.sql` | Ligas semanales (estilo Duolingo). 5 divisiones: Bronce, Plata, Oro, |
| 80 | 2026-09-25 | `duel-rivalries.sql` | Rivalidades + aviso de resultado de duelos. |
| 81 | 2026-09-25 | `duel-facts.sql` | "¿Sabías que?" al terminar un duelo: un dato educativo del tema que |
| 82 | 2026-09-25 | `weekly-topic.sql` | Tema de repaso de la semana: el docente marca un tema por clase y los |
| 83 | 2026-09-26 | `duel-report.sql` | Reporte de duelos para el docente: % de aciertos por tema y por alumno |
| 84 | 2026-09-26 | `duel-streaks.sql` | Racha de victorias en duelos 1v1 (los 5 juegos cuentan juntos). |
| 85 | 2026-09-26 | `relay-progress.sql` | Relevo de progreso offline (Fase 1 offline). |
| 86 | 2026-09-26 | `school-nodes.sql` | Nodos escolares (Raspberry Pi) para escuelas sin internet. |
| 87 | 2026-09-26 | `duel-played-ids.sql` | ¿En cuáles de estos duelos ya jugué? (los 5 juegos 1v1) |
| 88 | 2026-09-26 | `teacher-self-service.sql` | Docente autónomo: agrega alumnos a SUS clases y crea sus propios |
| 89 | 2026-09-26 | `duel-rewards-live-gems.sql` | Gemas que se sienten: premio de la arena + avisos en vivo. |
| 90 | 2026-09-26 | `companion-collection.sql` | Quetzadex: más mascotas (fauna de Guatemala) y colección. |
| 91 | 2026-09-26 | `companion-more.sql` | Quetzadex ampliada: 4 mascotas más (guacamaya, danta, pizote, |
| 92 | 2026-09-26 | `guardians.sql` | AVISOS A PADRES DE FAMILIA (SMS + notificaciones) |
| 93 | 2026-09-26 | `announcements-targeting.sql` | AVISOS CON DESTINATARIOS A ELECCIÓN |
| 94 | 2026-09-26 | `guardian-consent.sql` | Consentimiento de padres desde el Portal de padres; sin avisos a quien no aceptó |
| 95 | 2026-09-26 | `impact-metrics.sql` | Tablero de impacto del admin: métricas por establecimiento y tendencia mensual |
| — | 2026-09-27 | `demo-school.sql` | **Opcional, no es migración.** Plantel de demostración con datos inventados para demos comerciales. Se quita con `demo-school-remove.sql`. |
| 96 | 2026-09-27 | `school-project-visibility.sql` | `schools.public_projects`; política restrictiva en `projects` (privado = solo su escuela, admin y su coordinador); RPC `set_school_public_projects`; lectura de `attendance` para coordinador |
| 97 | 2026-09-27 | `season-pass-companion-reward.sql` | Nuevo premio de mascota gratis en el Pase de Temporada (nivel 18: guacamaya) |
| 98 | 2026-09-27 | `guardian-paper-consent.sql` | RPC `record_guardian_paper_consent`: el docente/admin registra el consentimiento firmado en papel en la inscripción, sin depender del portal del padre |
| 99 | 2026-09-27 | `coordinator-see-announcements.sql` | El coordinador ve los avisos del admin y de sus docentes asignados, sin importar a quién iban dirigidos |
| 100 | 2026-09-28 | `lesson-audience.sql` | `lessons.audience` ('estudiante'/'docente'); política restrictiva: un alumno no puede leer una lección marcada "solo docentes" |
| 101 | 2026-10-04 | `duel-per-player-content.sql` | Retos: columnas `questions_b`/`word_b`/`hint_b`/`steps_b`/`problems_b` (contenido del rival); RPCs de los 5 retos y `get_duel_review`/`get_duel_fact` eligen el contenido de quien llama; el banco del Ahorcado elige 2 palabras distintas y sin repetir; generador de problemas sin repetidas ni "1 huevos"; banco ampliado a 34 palabras; `get_duel_questions` entrega también el texto (`passage`/`title`) de Comprensión Lectora |
| 102 | 2026-10-05 | `practice-progress.sql` | Progreso por competencia: `practice_results` (solo vía `log_practice`, idempotente por `client_ref`), `get_my_progress`, `get_group_progress`, `get_groups_progress`, `can_view_group` (admin / docente del grupo / coordinador de ese docente) y `_student_plays` (práctica + retos) |
| 103 | 2026-10-21 | `security-hardening-2026-10.sql` | Auditoría de seguridad: `students.password_generated`/`cui`/`codigo_personal`/`pin_*`/`qr_*` solo vía `staff_student_secrets` (admin o docente asignado); `staff_existing_cuis`; trigger `guard_student_self_update` (un alumno no cambia su nombre/estado/gemas totales); quita `anon` de `calculate_rocks_xp`/`get_teacher_rocks`; 72 índices en claves foráneas. **Correr DESPUÉS de publicar v1.0.172.** Si se agrega una columna a `students`, re-ejecutar el bloque 1 |
| 104 | 2026-10-21 | `course-resource-weights.sql` | Ponderación por recurso: `lessons.grade_points`/`counts_for_grade`, `courses.weights_approved_at/_by`, RPC `set_course_resource_points` (creador del curso, admin o docente asignado; los puntos deben sumar `courses.weight`); trigger `guard_lesson_completion` (nota 0-100, conserva la mejor, no vuelve a `incomplete`) |
| 105 | 2026-11-01 | `xp-events.sql` | XP por lección (+10, una vez por estudiante y lección, solo lecciones de su clase y hasta 30 al día, también con internet) vía disparador en `lesson_completions`; `xp_events` (registro idempotente, sin políticas); `apply_node_chest()` (solo `service_role`) para el cofre diario sorteado por un nodo escolar. Ejecutar antes de publicar `node-sync` con `xp.ts`. |
| 106 | 2026-11-01 | `node-reactions.sql` | `apply_node_reaction(estudiante, proyecto, reacción)` (solo `service_role`): aplica la reacción FINAL (o null = quitar) que un estudiante hizo en un nodo escolar sin internet; idempotente, misma escuela, recalcula `projects.votes` (like + excelente). Ejecutar antes de publicar `node-sync` con `reactions.ts`. |
| 109 | 2026-11-02 | `teacher-node-password.sql` | `node_teacher_password_hashes(uuid[])` (solo `service_role`): huella bcrypt de la contraseña de los docentes para que `node-sync` la mande al nodo y entren sin internet con su contraseña normal. Reemplaza al PIN. |
| 116 | 2026-11-02 | `feedback-inbox.sql` | Buzón: `get_feedback_inbox(escuela, días)` y `get_my_ratings()`; el docente lee sugerencias y evaluaciones ANÓNIMAS y el administrador con nombres; se quita al docente de la lectura directa de `student_suggestions` y `teacher_ratings`. |
| 115 | 2026-11-02 | `node-remote-sync.sql` | Sincronizar desde la plataforma: columnas de estado en `school_nodes`, `get_school_nodes`, `request_node_sync`, `can_manage_school_nodes` y `node_heartbeat` (solo `service_role`). Ejecutar antes de publicar `node-sync` con `node_ping`. |
| 114 | 2026-11-02 | `node-feedback.sql` | `apply_node_feedback(tipo, estudiante, fila jsonb)` (solo `service_role`): aplica las sugerencias y la evaluación del docente hechas en un nodo sin internet; idempotente por `id` (rango reservado), la evaluación exige que el docente sea de la clase del estudiante y respeta el UNIQUE estudiante+docente. Ejecutar antes de publicar `node-sync` con el buzón. |
| 113 | 2026-11-02 | `node-profile-photo.sql` | `apply_node_profile_photo(usuario, dirección)` (solo `service_role`): aplica la foto de perfil cambiada en un nodo sin internet (estudiante o docente), con el premio de la primera foto una sola vez; la dirección tiene que ser una imagen de ese usuario en el depósito `profile-photos`. Ejecutar antes de publicar `node-sync` con la foto de perfil. |
| 112 | 2026-11-02 | `node-hangman-duel.sql` | `apply_node_hangman_duel(foto jsonb)` (solo `service_role`): aplica el Ahorcado jugado en un nodo sin internet; palabras solo del banco `hangman_word_bank`, acierto y errores recalculados con las letras y liquidación por el disparador de la nube. Ejecutar antes de publicar `node-sync` con `hangman.ts`. |
| 111 | 2026-11-02 | `node-timed-math-duel.sql` | `apply_node_timed_math_duel(foto jsonb)` (solo `service_role`): aplica el reto Contrarreloj jugado en un nodo sin internet; recalcula el puntaje con las respuestas y deja que el disparador de la nube liquide gemas y XP. Un duelo ya terminado no se toca. Ejecutar antes de publicar `node-sync` con `timedmath.ts`. |
| 110 | 2026-11-02 | `node-companion.sql` | `apply_node_companion(estudiante, función, especie, accesorio, slot)` (solo `service_role`): la mascota hecha en el nodo sin internet, con la misma lógica que las funciones del estudiante. |
| 108 | 2026-11-01 | `teacher-node-pin.sql` | PIN del docente para entrar al nodo sin internet, fijado EN LÍNEA: tabla `teacher_node_pins` (sin acceso desde la app; solo `service_role`), RPC `set_teacher_node_pin(hash, sal)`, `has_teacher_node_pin()` y `clear_teacher_node_pin()` (solo docentes; el hash lo calcula el navegador, el servidor nunca ve el PIN). `node-sync` lo baja al nodo de las escuelas donde el docente está asignado. |
| 107 | 2026-11-01 | `node-evaluations.sql` | `apply_node_evaluation(docente, escuela, proyecto, node_ref, evaluación jsonb)` (solo `service_role`): aplica la evaluación que un docente hizo en un nodo escolar sin internet; exige docente asignado a la clase y proyecto de la escuela del nodo, notas enteras 0 a 20 con el total recalculado en la base, una evaluación por proyecto (gana la última) y deja la nota en el proyecto. Ejecutar antes de publicar `node-sync` con `evaluations.ts`. |
| 117 | 2026-11-05 | `ai-usage-limit.sql` | Límite diario de IA por usuario: `ai_usage_daily` (sin políticas) y `ai_usage_take(usuario, tipo, tope, costo)` atómica (solo `service_role`), día de Guatemala. Correr **antes** de redesplegar `ai-proxy` |
| 118 | 2026-11-05 | `student-password-hash.sql` | Contraseñas de alumnos sin texto legible, **fase 1 de 3**: `students.password_hash` (bcrypt) y `password_enc` (cifrado por una Edge Function), `student_password_ok`, `set_student_password`, `staff_student_password_blobs`, `backfill_student_password_hashes`. No borra nada |
| 119 | 2026-11-05 | `student-password-drop-plaintext.sql` | **Fase 3 de 3** (irreversible, con guarda): borra el texto de `students.password_generated` solo si TODAS las contraseñas ya tienen hash y cifrado |
| 120 | 2026-11-05 | `security-rls-audit-2026-11.sql` | Cierra escrituras abiertas (`notifications`, `teacher_notifications`, `teacher_badges`) y lecturas públicas (tablas de personal solo `is_staff()`; las de uso con sesión solo `authenticated`) |
| 121 | 2026-11-05 | `security-function-exposure-2026-11.sql` | Quita EXECUTE a `PUBLIC` y `anon` de toda función `SECURITY DEFINER` salvo las 2 del ingreso; conserva lo de `authenticated`/`service_role`; y lo mismo por defecto para las nuevas |
| 123 | 2026-11-05 | `performance-2026-11.sql` | Índices que faltaban (Ranking, campana de avisos, suscripciones push, comentarios, encuestas, asistencia, retos, temas de duelos; se saltan si la tabla o columna no existe) y `record_active_heartbeat` más liviano (2 consultas en vez de 4, atómico). Detalle: `docs/PERFORMANCE.md` |
| 124 | 2026-11-05 | `random-event-settle-atomic.sql` | `settle_random_event(evento, reparto)` (solo `service_role`): liquida un evento sorpresa en una transacción (puestos, premios, SUMA de gemas sin pisar, no paga dos veces). Correr **antes** de redesplegar `settle-random-event` |
| 122 | 2026-11-05 | `rls-auth-uid-initplan.sql` | Envuelve `auth.uid()`, `auth.role()`, `auth.jwt()`, `is_staff()` e `is_admin()` en `(select ...)` en todas las políticas de `public` (rendimiento; mismo resultado) |

### Migraciones sin número en la tabla de arriba

Estas migraciones existen en `migrations/` pero quedaron fuera de la tabla numerada (se agregaron al repositorio entre el
28 de septiembre y el 4 de octubre de 2026). Están listadas aquí por fecha de incorporación; **el orden para aplicarlas
está en la sección siguiente**. Una prueba automática (`tests-unit/migrations-docs.test.mjs`) falla si una migración nueva
no aparece en este documento.

| Fecha | Archivo | Qué hace |
|---|---|---|
| 2026-09-28 | `hangman-word-bank.sql` | Banco fijo de palabras «Vida silvestre y ODS de Guatemala» para Ahorcado 1v1 (`hangman_word_bank`, nunca legible por el cliente). Requiere `duel-facts.sql` |
| 2026-09-28 | `timed-math-word-problems.sql` | Contrarreloj: `generate_math_problems()` con mini-historias de contexto guatemalteco (misma cuenta, mismo resultado). Requiere `student-timed-math-duels.sql` |
| 2026-09-28 | `sync-queue-idempotency.sql` | `sync_save_evaluation` (evaluar proyecto en una sola función atómica) y `tutor_attendance.client_ref` para que un reintento de la cola offline no duplique |
| 2026-09-29 | `fix-password-reset-rpc-exposure.sql` | **CRÍTICO.** `admin_reset_user_password` y `reset_password_via_admin` estaban abiertas a `anon` (cambiar la contraseña de cualquier cuenta sin sesión): se cierran y se les exige permiso |
| 2026-09-29 | `fix-students-and-notifications-rls.sql` | `students` ya no se lee completo entre colegios: solo uno mismo, personal o compañeros de clase; notificaciones más cerradas. Correr después de `fix-password-reset-rpc-exposure.sql` |
| 2026-09-29 | `fix-students-rls-recursion.sql` | **CRÍTICO.** Arregla la «recursión infinita» que la anterior provocó en la lectura de `students` (`my_classroom_key()`) |
| 2026-09-29 | `fix-votes-and-evaluations-exposure.sql` | Cierra a `anon` las 4 funciones viejas que modificaban `projects.votes` y una exposición de evaluaciones |
| 2026-09-29 | `student-pin-cloud.sql` | PIN personal también en el modo sin conexión de la app en la nube (`set_student_pin`, `clear_student_pin`). Requiere `school-nodes.sql` |
| 2026-09-29 | `companion-panda.sql` | Panda como mascota 11 de la Quetzadex (`is_companion_species`). Requiere `companion-more.sql` |
| 2026-10-02 | `fix-is-staff-coordinador.sql` | `is_staff()` reconoce al rol `coordinador` (si no, las políticas basadas en `is_staff()` le devuelven vacío) |
| 2026-10-02 | `fix-coordinator-own-schools.sql` | `set_school_public_projects` vale también para las escuelas de las clases propias del coordinador |
| 2026-10-02 | `fix-cross-school-public-projects.sql` | `project_author_visible` / `public_project_authors` (SECURITY DEFINER): corrige la regresión de proyectos públicos entre colegios. Requiere `fix-students-and-notifications-rls.sql` y `school-project-visibility.sql` |
| 2026-10-02 | `fix-toggle-project-like-integer.sql` | `toggle_project_like` recreada con `integer` (con `uuid` todo voto fallaba) |
| 2026-10-03 | `project-reactions.sql` | Reacciones en proyectos (like, excelente, wow, destacar, ánimo): `project_likes.reaction`, `react_to_project`, `get_project_reactions` |
| 2026-10-03 | `project-reactions-likes-only.sql` | **Reemplazada** por la siguiente (el Ranking contaba solo «me gusta»). No hace falta correrla si vas a correr `project-reactions-ranking-count.sql` |
| 2026-10-03 | `project-reactions-ranking-count.sql` | Versión vigente: `projects.votes` = «me gusta» + «excelente». Recalcula los votos |
| 2026-10-03 | `project-reaction-notifications.sql` | Aviso en la campanita al dueño/equipo cuando reaccionan (sin decir quién; filas creadas solo por el disparador) |
| 2026-10-03 | `project-thumbnails.sql` | `projects.thumbnail_url`: miniatura JPEG (data URL) para proyectos con modelo 3D |
| 2026-10-04 | `exams.sql` | Exámenes con hoja de respuestas: `exams`/`exam_results` (la clave nunca llega al alumno) y `my_exam_results()` |

## Orden seguro de lo pendiente

`PENDIENTES.md` marca varias migraciones como «sin correr», pero esa lista quedó atrás de lo que hay en el repositorio. Antes
de correr nada, **averigua qué falta**: pega `migrations/verificar-migraciones.sql` en el SQL Editor de Supabase (solo lee) y
corre, de arriba hacia abajo, solo las filas con `aplicada = false`. El orden sigue estas reglas:

1. **Primero lo que cierra huecos de seguridad,** en el orden en que se descubrieron: cada archivo dice «correr después de»
   el anterior.
2. **Primero lo que otra migración requiere** (cada archivo lo dice en su encabezado; las dependencias están abajo).
3. **Antes de publicar** la versión de la app o de `node-sync` que usa la función, no después (una función que no existe
   hace fallar la llamada; una columna sobrante no molesta a nadie).
4. **Todas son seguras de re-ejecutar** (regla de este documento): si dudas de una, volver a correrla no daña.

| Fase | Migración (en este orden) | Requiere antes | Notas |
|---|---|---|---|
| 1. Seguridad crítica | `fix-password-reset-rpc-exposure.sql` | — | Toma de cuentas sin sesión. **La más urgente** |
| | `fix-students-and-notifications-rls.sql` | la anterior | Probar después que un alumno ve a sus compañeros |
| | `fix-students-rls-recursion.sql` | la anterior | Sin ella, la lectura de `students` falla con «infinite recursion» |
| | `fix-votes-and-evaluations-exposure.sql` | las tres anteriores, `project-votes-server-side.sql` | |
| 2. Coordinador y proyectos | `fix-is-staff-coordinador.sql` | `coordinador-role.sql` | |
| | `fix-coordinator-own-schools.sql` | `school-project-visibility.sql` | |
| | `fix-cross-school-public-projects.sql` | fase 1 completa, `school-project-visibility.sql` | |
| | `fix-toggle-project-like-integer.sql` | — | Si los votos fallan con «invalid input syntax for type uuid» |
| 3. Funciones de la app (v1.0.123 a v1.0.131) | `sync-queue-idempotency.sql` | — | |
| | `student-pin-cloud.sql` | `school-nodes.sql` | |
| | `hangman-word-bank.sql` | `duel-facts.sql` | |
| | `timed-math-word-problems.sql` | `student-timed-math-duels.sql` | |
| | `companion-panda.sql` | `companion-more.sql` | |
| 4. Retos, reacciones, exámenes, progreso | `duel-per-player-content.sql` | los 5 retos y `audit-fixes-duels-chest.sql` | **Importante:** cada jugador recibe su propio contenido. Correrla **antes** de redesplegar las 4 funciones `ai-generate-*` |
| | `project-reactions.sql` | — | |
| | `project-reactions-ranking-count.sql` | `project-reactions.sql` | Omite `project-reactions-likes-only.sql` (reemplazada) |
| | `project-reaction-notifications.sql` | `project-reactions.sql` | Antes de redesplegar `notify-reaction` |
| | `project-thumbnails.sql` | — | |
| | `exams.sql` | — | |
| | `practice-progress.sql` | los 5 retos, `coordinador-role.sql` | Sin ella, «Mi progreso» sale vacío |
| 5. Auditoría de octubre | `course-resource-weights.sql` | `lessons.sql`, `courses.sql` | |
| | `security-hardening-2026-10.sql` | **la app v1.0.172 o posterior ya publicada** | Al final muestra una fila que debe dar `false, false, true, true`. Si se corre antes de publicar, las versiones viejas de la app fallan al iniciar sesión |
| 5b. Seguridad de noviembre (`docs/SEGURIDAD_2026-11.md`) | `security-hardening-2026-10.sql` (versión revisada: transacción y comprobaciones previas; se puede re-ejecutar) | `fix-is-staff-coordinador.sql`, `guardians.sql` (`can_manage_student`), `teacher-self-service.sql` (`students.created_by`) | Probar el ingreso de un alumno y la lista de alumnos de un docente |
| | `ai-usage-limit.sql` y después redesplegar `ai-proxy` | — | Secretos opcionales `AI_DAILY_*` |
| | `student-password-hash.sql` → redesplegar `student-login`, `admin-bulk-import-students` y la nueva `staff-student-passwords` con el secreto `PASSWORD_VAULT_KEY` → `backfill` → `student-password-drop-plaintext.sql` | `security-hardening-2026-10.sql` | Las 3 fases en orden; la 3 es irreversible y se niega si falta algo |
| | `security-rls-audit-2026-11.sql` | `fix-is-staff-coordinador.sql` | Prueba con estudiante, docente y administrador |
| | `security-function-exposure-2026-11.sql` | todas las anteriores | Probar la pantalla de ingreso (alumno y docente) |
| | `rls-auth-uid-initplan.sql` | todas las anteriores (la última) | Es rendimiento, no seguridad: puede esperar; mismas pruebas |
| 5c. Rendimiento (`docs/PERFORMANCE.md`) | `performance-2026-11.sql` | `security-function-exposure-2026-11.sql` (deja el latido solo para `authenticated`) | Probar que el tiempo activo sigue sumando (+30 s) |
| | `random-event-settle-atomic.sql` → redesplegar `settle-random-event` | — | Probar con un evento de prueba |
| 6. Nodo escolar | `xp-events.sql`, `node-reactions.sql`, `node-evaluations.sql`, `teacher-node-pin.sql`, `teacher-node-password.sql` | `economy-server-side.sql`, fase 4 (`project-reactions*`), `evaluations-restrict-to-assigned-teacher.sql` | Cada una, **antes** de publicar `node-sync` con el módulo correspondiente |
| | `node-companion.sql`, `node-timed-math-duel.sql`, `node-hangman-duel.sql`, `node-profile-photo.sql`, `node-feedback.sql` | `companion-collection.sql`, `companion-cosmetics.sql`, `student-timed-math-duels.sql`, `student-hangman-duels.sql`, `hangman-word-bank.sql`, `duel-per-player-content.sql`, `audit-fixes-duels-chest.sql`, `economy-server-side.sql` | Solo `service_role` las ejecuta |
| | `node-remote-sync.sql`, `feedback-inbox.sql` | `school-nodes.sql` | Después publicar `node-sync` completo (14 archivos) |

**Por qué las funciones se publican después del SQL:** la función `node-sync` o la app llaman a funciones de la base por
nombre. Si la migración todavía no corrió, esa llamada falla; si corre primero, la versión vieja de la función ni la usa.
**Con las migraciones de la fase 1:** corre las cuatro de una vez y prueba, con un alumno, que ve su ranking y a sus
compañeros, y que un docente ve a sus estudiantes; con la 2 prueba a un coordinador.

> **Pendiente de verificar contra producción.** Esta lista sale de leer los encabezados del repositorio, no de consultar tu
> base. `verificar-migraciones.sql` es la forma de saber el estado real; no hay que fiarse de las casillas de `PENDIENTES.md`.
