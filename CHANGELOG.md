# Historial de cambios

Cambios publicados en Quetzal LMS, del más reciente al más antiguo. Cada línea es un cambio del repositorio; la versión entre paréntesis es la que ven los usuarios en la app.

Al publicar una versión nueva, agregá una línea arriba de todo (ver CONTRIBUTING.md).

## 2026-09-26

- Project documentation: README, architecture, setup, migrations order, contributing guide, changelog and schema dump script; remove a leaked cron secret from a migration
- Announcements targeted by audience, schools or groups (v1.0.99)
- Parent notifications by SMS and push, with a parent portal (v1.0.98)
- Share pet card as an image on social networks (v1.0.97)
- Fix scrolling in arena overlays on phones (v1.0.96)
- Species-specific emotes and admin screen for Quetzadex videos (v1.0.95)
- Quetzadex: 4 more pets, 12 accessories and per-species videos (v1.0.94)
- Quetzadex: species info cards, 3 new pets and a collection (v1.0.93)
- Hide Quetzal assistant on graded screens, tutor mode for students (v1.0.92)
- Arena gem rewards, live gem updates and how-to-earn guide (v1.0.91)
- Teacher-created students follow the admin username convention (v1.0.90)
- Teachers can add students to their classes and open their own clubs (v1.0.89)
- Teams view lists every assigned class, even without teams (v1.0.88)
- Live gem balance, reliable daily chest, varied duel content (v1.0.87)
- Admin: create schools anytime, optional CUI, extracurricular clubs (v1.0.86)
- Show which classmates are online for 1v1 challenges (v1.0.85)
- Fix duel Play button showing after already playing (v1.0.84)
- feat: app en modo nodo escolar -- login con PIN, cursos y progreso locales (v1.0.83)
- feat: nodo escolar para Raspberry Pi -- nube y servidor local (etapa 1, partes 1-2)
- feat: offline fase 1 -- tablets compartidas y relevo de progreso (v1.0.82)
- feat: racha de victorias en duelos 1v1 (v1.0.81)
- fix: H5P aislado en iframe propio, sin recargar la app (v1.0.80)
- feat: reporte de duelos para el docente (v1.0.79)

## 2026-09-25

- fix: weekly-topic.sql define current_week_id() para no depender de weekly-leagues.sql
- feat: tema de repaso de la semana elegido por el docente (v1.0.78)
- feat: dato educativo al terminar cada duelo (v1.0.77)
- feat: duelos con temas de la clase del alumno; quita titulos repetidos (v1.0.76)
- feat: aviso de resultado, revancha con historial y reto rapido (v1.0.75)
- feat: ligas semanales por escuela estilo Duolingo (v1.0.74)
- feat: arena con mascotas en los 5 juegos 1v1 (v1.0.73)
- feat: pase de temporada mensual gratis con 30 niveles (v1.0.72)
- feat: vestidor de mascotas y mascotas en el VS (v1.0.71)
- feat: movimientos naturales y emotes de mascotas por etapa (v1.0.70)
- feat: mascotas elegibles estilo Pokemon -- quetzal, jaguar, tortuga (v1.0.69)
- feat: arena visual para juegos 1v1, estreno en Ortografia (v1.0.68)
- fix: ai-generate-spelling-word -- razonamiento de gpt-oss cortaba el JSON
- fix: push notifications -- 404 al tocar, tablets compartidas, rol falsificable (v1.0.67)
- fix: tiempo activo calculado en servidor, borra ai-generate-practice-quiz (v1.0.66)
- perf: Tailwind compilado en vez de cdn.tailwindcss.com (v1.0.65)
- fix: cierra exploits de apuestas 1v1, dia de Guatemala en cofre/racha (v1.0.64)

## 2026-09-10

- fix: sube reintentos de ai-generate-spelling-word de 2 a 3 (Groq JSON flakeo)
- feat: agrega Ortografia 1v1 (5to desafio) y saca Practica Solo

## 2026-08-30

- fix: SW registrado sin updateViaCache:none, nunca detectaba version nueva real (v1.0.62)
- fix: activate borraba cache viejo aunque el nuevo quedara incompleto en app shell critico (v1.0.61)
- fix: cofre diario quedaba atascado si el reclamo fallaba (v1.0.60)
- fix: descarga offline no escribia al cache real, dependia del SW (v1.0.59)
- Fix: la descarga offline intentaba bajar links de YouTube/Tinkercad, imposible por CORS y sin sentido de todas formas
- Descarga offline: protege los archivos que rompen una lección entera si fallan + fix precache de Tailwind
- Fix crítico offline: precache completo -- app.js y ~40 módulos "eager" nunca se cacheaban, más libs externas faltantes/con URL equivocada
- Fix crítico offline: SIGNED_OUT por falla de refresh sin red borraba la sesión offline cacheada
- Descarga offline más rápida/confiable (16 en paralelo + reintento por archivo) + sesión offline degradada manda a Cursos
- Seguridad: rate limit en student-login + allowlist de hosts para content_url
- Seguridad: racha (streak/last_login) ya no se escribe directo desde el cliente + corrige regresión del REVOKE de streak_freeze
- Fix: descarga offline de cursos con H5P era brutalmente lenta (secuencial, sin reusar caché)
- Inbox unificado: retos 1v1 pendientes aparecen en la campana de avisos, no solo como punto rojo
- CORS restringido en las 20 funciones restantes + umbral 90% para "Listo offline"
- Reintento automático en las 9 funciones de IA con salida JSON estricta

## 2026-08-29

- Fix del fix: REVOKE de columna no alcanzaba, había un GRANT de tabla completa por debajo
- Fix crítico offline: precargar TODOS los módulos JS lazy en cada instalación del service worker
- Fix cola offline no borra acciones desconocidas + % real de descarga + liberar espacio offline por curso
- CI básico: sintaxis JS, deno check de Edge Functions, y chequeo de que las carpetas espejo sigan idénticas
- Centro de notificaciones: punto único para refrescar todos los badges al login
- Rangos dinámicos según nivel + quita location.reload() residual del cofre diario
- Seguridad: CORS de ai-proxy restringido a los dominios reales de la app
- Fix: votos de proyecto se recalculan server-side (evita que el dueño infle su propio contador)
- Offline SCORM/H5P completo: "Descargar para offline" ahora baja TODO el paquete, no solo el archivo de entrada
- Relevo QR (Kolibri): botón visible para generar código de entrega + escáner del docente continuo entre alumnos
- Offline pt. 2: botón "Descargar para offline" por curso + avanzar/completar lección sin perder progreso sin red
- Fix: migración de economía fallaba -- teachers no tiene columna streak_freeze
- Seguridad crítica: xp/gemas/cofre/tienda ya no se escriben directo desde el cliente
- Offline: cursos y contenido ya visto quedan disponibles sin internet
- Nuevo: Cuadro de Resultados Finales (borrador) -- notas por área CNB y promoción, listo para transcribir al SIRE
- CNB: curso ahora requiere área curricular oficial; alumno ahora captura sexo y código personal MINEDUC
- Centro de Juego: los 4 desafíos 1v1 en grid de 2 columnas en desktop; Práctica Solo con más columnas; fix modal de resultado de duelo que nunca se mostraba
- Fix: párrafo SEO se veía en pantalla (y se colaba arriba del header ya logueado)
- Fix contraste (Lighthouse): logo, link de contraseña y frase motivacional en verde/gris claro sobre fondo blanco
- Fix accesibilidad (Lighthouse): botón sin nombre accesible, contraste insuficiente, sin landmark principal
- SEO básico: meta tags, Open Graph, datos estructurados, robots.txt, sitemap.xml y texto real en el login
- Nota del curso sale solo de actividades con nota real (H5P/SCORM/Quiz); aviso si a un curso nuevo le falta una
- Fix: recurso Tinkercad no se podía embeber (X-Frame-Options sameorigin) -- ahora abre el diseño en pestaña nueva
- Conexión con Tinkercad: link de Clase (botón en cada curso) + recurso embebido de diseño/circuito puntual en lecciones

## 2026-08-28

- Notificaciones push llevan a la sección correcta al hacer clic; retador ve en vivo cuando aceptan en Ahorcado/Contrarreloj/Encontrá el Error
- Nuevo: boton 'Reiniciar' notificaciones en Perfil -- desuscribe, borra la fila del servidor y vuelve a pedir permiso/suscribir desde cero
- Fix: letras correctas del Ahorcado no se pintaban (el render reconstruia el modal sin recordar lo revelado); traba para no disparar generaciones de IA en paralelo y agotar el limite de tokens/minuto de Groq
- Fix: filtro explicito por grado/seccion en Evaluacion + badge grado/seccion en cada card, Dar de baja tambien visible para docente, animacion de horca (dibujo + sacudido) en Ahorcado por cada error
- Feedback docentes: Inicio muestra trabajo pendiente de cursos, evaluacion se subagrupa por grado/seccion dentro de cada colegio, y nuevo 'Dar de baja' para alumnos que se retiran a mitad de ciclo
- Fix: notificaciones/push y badge de pendientes no funcionaban para Ahorcado/Contrarreloj/Encontra el Error (notify-duel estaba hardcodeado a student_duels); sube limite de video de 50MB a 150MB
- Nuevo: Contrarreloj 1v1 (matematica sin IA, cronometrado, gana quien saca mas correctas) y Encontra el Error 1v1 (bloques de programacion generados por IA, gana quien encuentra el bug primero)
- Nuevo: Ahorcado 1v1 -- desafio asincrono donde gana quien adivina la palabra mas rapido, misma arquitectura de seguridad que Desafios de Codigo (palabra oculta del cliente, tiempo/score validado en servidor)
- IA mascota: baja temperatura + aviso de incertidumbre para evitar contradecirse en fechas/datos; Nuevo: Promover Ciclo Escolar (bulk por clase, mantiene XP/gemas, marca egresados en el ultimo grado sin poder loguear)
- Rediseno de tienda: saca items sin funcion (Buho Cibernetico, Desafio 1v1), agrega Marco Dorado (borde en ranking) y Gafas de la Mascota (accesorio permanente), ambos funcionales
- IA: baja temperatura + instruccion explicita de exactitud para reducir preguntas con respuesta incorrecta; Practica Solo ahora muestra retroalimentacion (correcta/incorrecta por pregunta) al terminar
- Duelos: historial de rechazados/cancelados/completados colapsado en acordeon; temas y dificultad de IA se filtran/ajustan segun el grado del alumno (Duelos y Practica Solo)
- Fix: insert de practica solo pedia select(*) tras el insert, chocaba con la columna questions vedada por RLS
- Nuevo: Practica Solo -- minijuego de repaso individual sin rival, mismo motor de duelos (IA genera quiz server-side, score validado en servidor), +temas tecnicos (kits, C++) al pool compartido con Duelos
- Fix: reto del mes de alumnos ahora es su propia lista (gestion emocional/crecimiento personal), separada de la de docentes (tecnica docente)
- Feedback docente: reto del mes tambien en perfil alumno, adjuntos (evidencia) en comentarios de recurso, y check-in GPS offline via cola de sync
- Cache-busting con ?v= en modulos lazy-loaded (loadModule) y app.js -- un deploy podia dejar corriendo JS viejo aunque index.html ya mostrara la version nueva; mas variantes de letras en generateUsernameVariants antes de caer a numero
- Fix: boton Subir Evidencia no se bloqueaba tras enviar en modo offline (recien se refleja al sincronizar) -- ahora usa un timestamp local instantaneo ademas del check contra la DB
- Fix: hasEvidenceThisWeek no llegaba a renderTutorView (funcion separada de processAndRenderBonus), rompia el panel de bonos
- Evidencia semanal: bloquea el botón cuando ya se subió esta semana (se rehabilita solo la próxima), pide 5 fotos como el informe, y evita que el sync offline reintente para siempre por el constraint de 1-por-semana
- Unifica formato de encabezado en todas las secciones: icono en badge redondeado + titulo, alineando iconos con los del sidebar
- Fix: encabezado Proyectos con icono al revés del resto de secciones
- Unifica generación de username: prueba letras (segundo nombre, segundo apellido) antes de caer a sufijo numérico en TODOS los caminos, no solo en el de creación final
- Fix: import estudiantes cortaba en 1000 filas al chequear duplicados existentes (cap default de PostgREST), dejaba pasar CUI/username realmente duplicados hacia el servidor
- Fix: CUI duplicado DENTRO del mismo lote de import no se detectaba, tiraba error en vez de omitir
- Onboarding: pasos detallados en Subir Proyecto + fix boton Finalizar tapado por mascota; import estudiantes: variantes de usuario en vez de omitir cuando choca con otro alumno real
- Fix: onNextClick del onboarding no corría (driver.js solo lo lee dentro de popover), resume por espera activa en vez de setTimeout fijo, descripción Duelo corregida + paso Centro de Juego
- Fix: onboarding avanza mal al clickear el menú resaltado, H5P vista previa docente, tag versión progresiva v1.0.x
- Bump version tag to v2026.08.28-1520
- Fix: onboarding con 2 tours simultáneos + resume tras reload forzado por H5P
- Bump version tag to v2026.08.28-0841
- Fix: segundo recurso H5P fallaba siempre sin recargar la página
- Bump version tag to v2026.08.28-0818
- Fix raíz: SCORM/HTML5 no renderizaban (Content-Type pisado por Supabase)
- Bump version tag to v2026.08.28-0054
- Fix: constraint faltante para 'html5' + borrado de Storage superficial
- Mostrar versión de build en el logo (login + header)
- Soportar recursos "Aplicación HTML5" genéricos (.zip con index.html)
- Autoalojar h5p-standalone -- reproducción H5P fallaba siempre para alumnos

## 2026-08-27

- Mascota de gemas para estudiantes -- 6 etapas, animada en duelos 1v1
- Afinar accesorios de temporada según feedback visual
- Mascota: humor por inactividad y accesorios de temporada más grandes
- Rediseñar correo de reenganche con la mascota real y estilo de tarjeta
- Agregar modo de prueba a notify-inactive-users
- Catálogo de programas (multi-select) y correos de reenganche 24h/3d
- Corregir desbordamiento horizontal en Docentes (mobile) por dirección larga
- Corregir corte silencioso de 1000 filas en consultas de alumnos
- Mostrar en Alumnos también los establecimientos sin alumnos importados
- Bloquear borrado de establecimiento/alumnos cuando el código está duplicado
- Mostrar quién y por qué se omite en importación de nómina MINEDUC
- Flipcards para Tiempo Activo/WAU, dirección junto al nombre de establecimiento
- Permitir que un establecimiento pertenezca a varios programas
- Rol coordinador, WAU, agrupación por programa, alerta de conflicto al asignar
- Notificar admin cuando docente sube tarea pendiente de aprobación
- Fix 4 reportes reales: bono de tarea sin evidencia nunca sumaba XP; chat IA no pintaba la respuesta en vivo (shadowing de variable); biblioteca compartida no tumba todo si course_feedback falla; modal de foto no se cierra solo en movil
- Fix: el toggle de notificaciones solo miraba el navegador, nunca si el servidor todavia tenia la fila -- ahora se auto-repara sola si se perdio (ej. tras limpiar push_subscriptions)
- Grant faltante en student_duels/student_duel_answers para el rol authenticated

## 2026-08-26

- Duelos: usar id del insert directo en vez de re-query fragil para el push; admin puede ver quien leyo cada aviso y quien respondio cada encuesta
- Avisos ahora mandan push real (antes explicitamente solo in-app, sin push) -- nueva funcion notify-announcement
- Fix real del tour: driver.js llama onNextClick sin argumentos, opts.driver.moveNext() tiraba TypeError silencioso; ahora usa closure a la instancia
- Fix tour: espera a que el contenedor de la vista tenga tamano real (no solo exista vacio) antes de resaltarlo, para que no se vaya a la esquina
- Rediseno Desempeno Docente con paleta Quetzal LMS y filas colapsables (acordeon); mascota arrastrable con mouse/touch
- Unificar info de docentes repetida: una sola tarjeta por docente en Desempeno Docente; dashboard principal solo Top 5 con link al desglose completo
- Fix real: totales agregados (evaluaciones, ratings) usaban arrays sin filtrar cuenta de prueba, aunque el desglose por docente si estaba bien
- Modo Dev (toggle admin) para incluir cuentas de prueba a demanda; filtro tambien en Reportes Academicos; rediseno de tabla Desglose Individual por Docente
- Rediseno de Docentes Mas Activos; fix bug de agrupacion Actividad General (mismatch de tipo en codigo de colegio + docente nunca resolvia su establecimiento real); mas detalle por centro
- Excluir cuentas/establecimiento de prueba tambien del dashboard ejecutivo principal
- Fix boton Actividad (admin-performance.js nunca exportaba a window); fix parseo fecha last_login que marcaba a todos inactivos; excluir cuentas/establecimiento de prueba de todas las metricas admin
- Fix last_login docente nunca se guardaba; badge ACTIVO/INACTIVO real por 3 dias; nuevo reporte de actividad docente; tiempo en plataforma exige interaccion real, no solo pestana abierta
- Fix tour movil: abre/cierra el sidebar automaticamente segun el paso para que driver.js pueda resaltar los items de nav
- Onboarding: reemplaza carrusel de slides por tour guiado con driver.js, cubre todas las secciones para estudiante y docente
- Evaluaciones cuentan por equipo distinto (anti-gaming); banner de reto pasa a verde cuando ya esta completado
- Duelos: boton se actualiza en vivo al aceptar (realtime), revisar retroalimentacion siempre visible, elegir categoria o aleatorio, push al retar/aceptar
- Docente puede editar telefono/cumpleanos; admin puede eliminar encuestas
- Fix: juez SI/NO del reto docente usaba prompt de mascota (falsos rechazos); reto ya muestra tu reflexion enviada en vez de caja en blanco
- Importar docentes por CSV (alta masiva, detecta columnas automaticamente)
- Fix: Docentes no abria (join invalido teachers/evaluations sin FK); color Satisfaccion Positivo pasa de rojo a verde
- Nota CS con IA real por metricas; fix proyectos docente en --; ultima conexion admin; like/feedback en biblioteca compartida de cursos
- Insignias: comentarios/likes en recursos cuentan (Voz Activa, Comentario Destacado)
- Fix boton Reintentar H5P bloqueado; chat IA con memoria real (continua funciona) y menos cortes; notificaciones de reply/like en comentarios
- Notas personales: lista tipo comentarios (append-only) en vez de doc que se sobreescribe
- Comentarios de recurso: like + respuesta anidada; aclarar que la nota personal es privada
- Fix: groups.id es integer, no uuid, en resource_comments.group_id
- Ranking: votos visibles siempre; recursos: notas privadas y comentarios de equipo con filtro anti-groserias; campanita: fix badge no-leidos tras login
- Mascota estudiante: coach educativo y emocional a la vez
- Encuestas: preguntas de escala con emojis de caritas
- Fix: admin recibia avisos/encuestas como destinatario, botones del dashboard desbordaban en movil, tarjetas mal alineadas
- Fix layout de recursos en movil + eliminar avisos enviados
- Fix: SCORM roto por completo -- Supabase Storage sanea HTML publico (CSP sandbox + text/plain)
- Mensaje claro cuando un archivo del paquete supera el limite de Storage
- Fix spam de 401 en ai-proxy cuando la sesion no esta lista + favicon 404
- Muestra al docente como se pondera cada recurso en Ver Notas
- Fix ruido en consola: AbortError de video.play() y errores de red del heartbeat
- Fix push notifications, mensajes cortados de la mascota, resultados de eventos/torneos para admin
- Torneos entre establecimientos: temporadas tipo liga, equipos, quiz grupal por IA
- Encuestas multi-pregunta del admin (opcion multiple, texto libre, escala 1-5)
- Fix: la mascota aparecia antes de iniciar sesion
- Eventos sorpresa para docentes (totalmente separados) + sistema de avisos in-app
- Historial persistente del chat con la mascota + limpia iconos 1B residuales
- Retroalimentacion de duelo, onboarding del Centro de Juego, badges de docente visibles, home=Cursos
- Batch de fixes: login case-insensitive, mascota tapada, H5P trabado/sin nota, notas >100, export sin nombre de colegio
- Fix: spinner de H5P se quedaba pegado tapando el contenido ya cargado
- Panel admin para lanzar/cancelar eventos sorpresa manualmente
- Eventos sorpresa nocturnos: quiz relampago con push notifications reales
- Duelo 1v1: animacion de resultado, tema aleatorio y preguntas segun apuesta
- Fix ai-generate-quiz roto por el hardening del duelo + boton cancelar desafio
- Fix: Buzon de Sugerencias apilaba un modal por cada clic en vez de reusar el abierto
- Fix: badges se re-mostraban en dispositivo nuevo, indicador de reto 1v1 pendiente
- Fix critico: estudiante heredaba la ultima vista de un docente/admin en dispositivos compartidos
- Colores de marca verde quetzal, quita menciones a 1Bot, cita de login mas sutil

## 2026-08-25

- Reemplaza iconos PWA con la mascota quetzal (rebrand a Quetzal LMS)
- Fix fuga de datos: docente veia todos los establecimientos/clases en Contrasenas de Clase
- Fix: lessons.content_url debe aceptar null para recursos tipo quiz
- Constructor de evaluaciones (quiz) en cursos + evaluacion IA de codigo en bloques
- Rebrand a Quetzal LMS, nueva mascota quetzal, modal de satisfaccion por centro
- Fix asset_audits school_id NOT NULL, mascot blocking click area, blinda respuestas del duelo 1v1, resiliencia del SW ante 503
- Build real Desafío 1v1: student challenges a classmate to an AI-generated trivia quiz wagering gems. New student_duels/student_duel_answers tables, a Postgres trigger that settles the duel (transfers gems, awards XP) the moment both players have answered, and an edge function that generates the quiz on accept. Replaces the old "Próximamente" placeholder.
- Limit weekly evidence uploads to one per week (client check + DB unique constraint on teacher+ISO week)
- Fix hardcoded 'Temporada de Enero' label (now uses current month), fix 'Buzón de Sugerencias' throwing ReferenceError (profile-modals.js loads lazily but this sidebar link is always visible before it loads), color unlocked badge icons instead of just tinting the card background, and move the mascot beside the mobile menu button instead of stacking above it so it stops blocking taps.
- Fix badges system being completely dead code: badges.js was loaded lazily (only on Profile visit) and never exposed its functions on window, so checkAllBadges/checkAndAwardBadges were uncallable from anywhere -- zero badges had ever been awarded to anyone. Now loads eagerly and exports to window; backfilled missing badges from existing project data separately. Also fix mobile layout breaking on course cards (buttons overlapping text) and shrink the mascot on small screens so it stops covering card buttons.
- Fix teacher KPI widget showing '0/undefined' (kpi-engine.js loads lazily but the widget could render before it finished loading)
- Add course grading: teachers set weight (points) + bimestre per course, platform auto-distributes weight across resources (graded H5P/SCORM count more than view-only ones), new 'Ver Notas' screen per course, and a CSV export matching the SIRE grade-entry layout (Código Personal, Unidad 1-4, Nota Final, Resultado) since SIRE has no file upload -- this is meant as a reference sheet while entering grades manually.
- Add loading spinner while H5P resource initializes
- Validate H5P dependencies recursively (transitive deps too), not just top-level
- Validate that uploaded .h5p packages include all required libraries before uploading, with a clear error instead of a silently broken player
- Fix H5P intermittently failing to load (retry when H5PStandalone isn't ready yet or Storage 429s transiently) and fix scored sub-interactions inside Interactive Video getting overwritten by later unscored ones (now sums all scored interactions instead of keeping only the last).
- Fix the real cause of 'app resets when I switch tabs': Supabase refires SIGNED_IN on tab focus even for an already-active session, and handleSuccessfulLogin() unconditionally called nav(), which wipes any open modal. Now skips re-running login for the same already-loaded user. Also restore the last view (sessionStorage) after a genuine reload, so a real Chrome tab-discard at least lands back where you were.
- Fix PDF/image upload failing on filenames with invalid Storage characters (colons from timestamps), fix copying a shared course deleting the sidebar (blanket .fixed selector matched it), and fix 'Ver' on monthly reports (unquoted UUID broke the onclick JS).
- Autosave course/resource creation forms so a browser tab reload doesn't lose typed data
- Fix courses-schools embed 400 (missing FK), rename Lecciones nav to Cursos, restrict dev-mode tools to admin only, add unique constraint + upsert to stop duplicate monthly report submissions, and make the general monthly report AI-synthesized instead of a raw concatenation.
- Fix monthly task creation (missing month/year fields caused DB constraint error), fix admin dashboard 400s (missing FK on teacher_monthly_reports broke the PostgREST embed), fill empty dashboard column with the reports card, and fix mascot speech bubble overflowing off-screen after moving to bottom-right.
- Rework Lessons into Platzi-style Courses: sequential locked resources, progress bar, newest-first listing. Existing lessons migrated to single-resource courses (backfilled in DB already).
- Fix evaluations-as-object bug across evaluation dashboard (pending/evaluated counts wrong), restore admin feedback visibility, reposition mascot bottom-right (above mobile menu button), show real submitted state on the monthly report button, and add an admin panel to view/aggregate teacher monthly reports.
- Fix crash after submitting monthly report (wrong modal selector, .modal vs .fixed)
- Restrict teacher feedback text to the project owner/team only (score badge still visible to staff)
- Fix teacher feedback never rendering (PostgREST returns evaluations as a single object, not array, due to the unique constraint on project_id) and add hover tooltips explaining each rubric criterion.
- Shrink oversized project feed cards, show teacher feedback preview on them
- Fix evaluation modal (close button, broken icon/label rendering), add project description/title length validation, silence console.log in production, and restrict evaluation writes to the assigned teacher only.
- Fix ai_evaluations.project_id type to match projects.id (integer, not uuid)
- Allow canceling the change-password modal when opened voluntarily
- Add AI second-opinion evaluation for student projects
- Let teachers change their password from profile
- Fix absolute cache paths breaking subpath deploys; add custom domain clases.yoaprendo.online
- Add tags to lessons for filtering/grouping in shared library
- Group students by grade/section within each school, collapsed by default
- Fix aggressive pulse animation and broken layout on import completion summary
- Allow uploading PDF/video/image files directly instead of requiring external links
- Add lesson editing (metadata/class) and shared library with copy-to-class
- Fix H5P/SCORM CSS not applying (Blob type override) + show detected school address
- fix: quita el filtro accept del input de archivo (Windows no reconocía .h5p en el filtro agrupado)
- fix: paquetes SCORM/H5P se servían como texto crudo, no como HTML
- fix: detecta SCORM real aunque el docente haya elegido H5P
- fix: 'Nuevo Alumno' nunca creaba una cuenta de acceso real
- fix: modal de nuevo alumno -- grado/sección vacíos + columnas inexistentes
- feat: Lecciones fase 2 -- SCORM y H5P con nota automática
- fix: agrega FK lessons.school_code -> schools.code (faltaba para el embed de PostgREST)
- feat: módulo de Lecciones (Fase 1) -- video/PDF/imagen sin nota automática
- fix: chequeo de borrado de establecimiento solo miraba 2 de 8 tablas
- fix: window.removeAssignment nunca existía -- botón de quitar asignación no hacía nada
- fix: mensaje claro al no poder eliminar un establecimiento con datos
- feat: botón 'Eliminar todos' por establecimiento en el listado de alumnos
- feat: borrado masivo de alumnos + arregla cuentas huérfanas al eliminar
- fix: el link de recuperar contraseña entraba directo a la app
- fix: la mascota desaparecía en cada nav() -- barrida junto a los modales
- fix: chat de la mascota fallaba por variables globales sin window.
- feat: mascota rediseñada como guerrero con penacho de quetzal (alusivo a Tecún Umán)

## 2026-08-24

- fix: íconos mostrándose como texto crudo (textContent/innerText -> innerHTML)
- fix: SyntaxError que rompía toda la app tras el reemplazo de emojis
- feat: reemplaza emojis por íconos Font Awesome en toda la UI
- fix: oculta el botón Saltar en el último slide del onboarding
- fix: no pedir cambio de contraseña obligatorio en clases sin contraseña
- fix: verifyOtp rechaza email junto con token_hash en login de alumnos
- feat: la pantalla de login detecta en vivo si la clase pide contraseña
- feat: panel de contraseñas por establecimiento completo + lista real
- feat: contraseña de clase (estilo Kolibri) + arregla login por usuario
- fix: quita animate-pulse de badges de estado permanentes
- fix: banner de reto exagerado + descripciones incompletas
- feat: retos mensuales -- activación automática por mes + evaluación IA
- feat: recuperación de contraseña + mostrar/ocultar contraseña en login
- fix: ReferenceError SCHOOL_SECTORS en modal de editar establecimiento
- fix: extracción de alumnos daba 0 en PDFs sin columna de género
- debug: log texto crudo del PDF cuando la extracción de alumnos da 0 resultados
- fix: importación masiva de alumnos golpeaba el rate limit de signUp
- fix: ReferenceError SUPABASE_ANON_KEY en importación PDF de estudiantes
- feat: implementa creación de establecimientos (faltaba por completo)
- fix: ReferenceError schoolId en listado de establecimientos
- fix: modelo Groq deprecado y ruta absoluta del service worker
- fix: cierra escalación de privilegios, XSS y key hardcodeada de OpenAI

## 2026-01-28

- Add files via upload
- Add files via upload
- cambios

## 2026-01-25

- Add files via upload

## 2026-01-21

- Add files via upload

## 2026-01-20

- Add files via upload
- Add files via upload
- Add files via upload
- Delete 1bot projects directory
- Add files via upload
