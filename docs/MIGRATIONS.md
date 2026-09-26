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
