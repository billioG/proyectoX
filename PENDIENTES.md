# Pendientes

Lista de tareas abiertas del proyecto. Marcá con `[x]` lo que vayas
completando. Lo de "Urgente" son pasos que solo puede hacer el responsable
del proyecto (necesitan contraseñas o acceso al panel de Supabase).

Última actualización: 9 de noviembre de 2026.

**Método de la auditoría (9/11/2026):** lectura cruzada de `migrations/` (153 archivos), `docs/MIGRATIONS.md`, `docs/SEGURIDAD_2026-11.md`,
`PENDIENTES.md` y `migrations/verificar-migraciones.sql`, más el código de `js/` y `supabase/functions/`. **No se consultó Supabase:** este
repositorio no puede ver producción. Lo marcado como hecho tiene una de dos pruebas: está en el repositorio y probado, o lo **confirmó el
administrador** (6/11: seguridad y rendimiento de noviembre ya aplicados). Lo demás es «por verificar»: pega `migrations/verificar-migraciones.sql`
(solo lee) en el SQL Editor y corre solo las filas con `aplicada = false`. Pasos exactos en orden: [docs/PASOS_MANUALES.md](docs/PASOS_MANUALES.md).

## 🔴 Urgente

- [x] **Cambiar el `CRON_SECRET`.** Hecho el 27/09/2026: secreto nuevo y las 3 tareas (`trigger-random-event`, `settle-random-event`, `notify-inactive-users-daily`) respondiendo 200. El valor viejo quedó en el historial de git (`migrations/random-events-cron.sql`).
  1. Generar uno nuevo (`openssl rand -hex 24`).
  2. Supabase → Edge Functions → Secrets → reemplazar `CRON_SECRET`.
  3. SQL Editor → reprogramar las tareas con el valor nuevo (mismo nombre = se actualizan):
     ```sql
     select cron.schedule('trigger-random-event', '* * * * *', $$
       select net.http_post(
         url := 'https://vyptkxudkmlpyfosppzh.supabase.co/functions/v1/trigger-random-event',
         headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'NUEVO_SECRETO'),
         body := '{}'::jsonb);
     $$);
     select cron.schedule('settle-random-event', '* * * * *', $$
       select net.http_post(
         url := 'https://vyptkxudkmlpyfosppzh.supabase.co/functions/v1/settle-random-event',
         headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'NUEVO_SECRETO'),
         body := '{}'::jsonb);
     $$);
     ```
  4. Si `notify-inactive-users` está programada desde el panel, actualizarle el secreto también.

- [x] **Volcar el esquema de producción.** Hecho el 29/09/2026 (`supabase/schema.sql`, servidor PostgreSQL 17.6). Revisado: sin filas de datos, sin emails ni secretos -- solo estructura. Recordá volver a correr `dump-schema.ps1` después de migraciones grandes para no dejarlo desactualizado.

## 🔴 Antes de la primera demo a un colegio

- [x] Perfil docente sin "UNDEFINED"; cuenta establecimientos (no grados) (v1.0.107)
- [x] Singular/plural en contadores ("1 evaluación recibida") (v1.0.107)
- [x] Ranking explica el orden (votos primero, luego score) (v1.0.107)
- [x] Ranking: entre alumnos se ve "Ana L.", no el nombre completo (v1.0.107)
- [x] Crear `colegios@yoaprendo.online`
- [x] Verificar SPF, DKIM y DMARC de ese correo
- [x] Correo de contacto y fecha de última revisión en `privacidad.html` (v1.0.108)
- [x] Plantel de demostración creado (`migrations/demo-school.sql`, 27/09/2026). Falta: asignarle una ruta publicada a las 2 clases. Nunca demostrar con un plantel con menores reales.
- [x] Publicar la página para colegios y enlazarla desde el pie de Quetzal (`colegios.html`, v1.0.129)
- [ ] No prometer en demos el nodo escolar ni la importación SIRE hasta probarlos en vivo. Guion y lista de comprobación: `docs/ENSAYO_DEMO.md`.

## 🔴 Seguridad -- auditoría 21/10/2026 y noviembre 2026

Detalle, orden y pruebas en `docs/SEGURIDAD_2026-11.md`.

- [x] **Verificado el 9/11/2026** (el administrador corrió `verificar-migraciones.sql` en Supabase): fases 1 a 5, nodo escolar, `ai-usage-limit`, `student-password-hash` (fase 1), `security-rls-audit-2026-11`, `security-function-exposure-2026-11`, `performance-2026-11` y `random-event-settle-atomic` dan `true`. `rls-auth-uid-initplan` dio `false` por 2 políticas de `feedback-inbox`; se volvió a correr y quedó en `true`. También confirmado el 6/11: `ai-proxy` con tope diario.
- [x] Las migraciones de las fases 1 a 5 (`fix-*`, `sync-queue-idempotency`, `student-pin-cloud`, `hangman-word-bank`, `timed-math-word-problems`, `companion-panda`, `course-resource-weights`, `practice-progress`) dan `true` en el verificador del 9/11/2026.
- [x] Fase 4 (`duel-per-player-content`, `project-reactions*`, `project-reaction-notifications`, `project-thumbnails`, `exams`) también `true` el 9/11/2026.
- [x] Migraciones 125 a 131 (`school-branding`, `node-manage`, `node-remote-update`, `guardian-portal-token`, `storage-hardening`, `push-sub-role-staff`) **aplicadas el 9/11/2026 y verificadas el 10/11** (`verificar-migraciones.sql` con la fase 9: todo `true`); los 4 buckets están privados (`storage-private-buckets`). `node-sync` y `guardian-portal` redesplegadas (esta última con la CLI: el editor del panel le había dado el nombre aleatorio `bright-responder`, ya borrado), nodos actualizados y portal de padres probado con un enlace real.
- [x] Contraseñas de alumnos, **fase 2**: función `staff-student-passwords` desplegada, secreto `PASSWORD_VAULT_KEY` creado el 9/11/2026 (con copia que el administrador debe guardar en su gestor de contraseñas) y cifrado hecho (`pending: 0`; de 27 alumnos, 15 tenían contraseña en texto y los 15 tienen hash y cifrado). Probado: `fetchStudentPasswords` devuelve la contraseña descifrada.
- [x] Contraseñas de alumnos, **fase 3** confirmada el 9/11/2026: `con_texto_legible = 0` y `con_cifrado = 15`. La llave `PASSWORD_VAULT_KEY` quedó guardada por el administrador en su gestor de contraseñas y se borró la copia de la carpeta de descargas (10/11).
- [ ] Siguiente rotación de la llave `PASSWORD_VAULT_KEY`: si se cambia, hay que volver a cifrar (la anterior invalida lo cifrado); no hacerlo sin un plan (ver `docs/SEGURIDAD_2026-11.md`, §3).
- [ ] Decidir si las otras funciones de IA (`ai-generate-*`, `ai-evaluate-*`) también llevan tope diario (`ai_usage_take` ya sirve).
- [ ] Decidir las propuestas de seguridad que no se aplicaron (evaluaciones, equipos y asignaciones visibles entre escuelas): tabla al final del §4 de `docs/SEGURIDAD_2026-11.md`.
- [x] Integridad (SRI) de las librerías de CDN (v1.0.258, 10/11/2026): ver `docs/SEGURIDAD_2026-11.md`, §10.
- [x] **Límite de frecuencia de las funciones `notify-*`** (10/11/2026): migración `rate-limits.sql` corrida por el administrador y las 5 funciones (`notify-duel`, `notify-announcement`, `notify-rock-pending`, `notify-reaction`, `notify-guardians`) redesplegadas con la CLI. Falta confirmar las filas 770 y 771 del verificador. Detalle: `docs/SEGURIDAD_2026-11.md` §11.
- [ ] **Bitácora de seguridad** (código listo, 10/11/2026): correr `migrations/security-audit-log.sql` y redesplegar las 6 Edge Functions que registran (pasos en `docs/PASOS_MANUALES.md`; detalle en `docs/SEGURIDAD_2026-11.md` §12). La pantalla «Bitácora de seguridad» del administrador está en la v1.0.259.
- [ ] Cabeceras de seguridad (`frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS): el sitio no manda ninguna porque lo sirve GitHub Pages; hace falta poner Cloudflare delante (pasos en §10; requiere cambiar los *nameservers*).
- [x] Quitar `unsafe-inline` de `script-src` (10/11/2026, v1.0.260): los `onclick` los ejecuta un intérprete con lista permitida (`js/safe-handlers.js`, §7 del documento de seguridad). Falta confirmar en producción, tras recargar la app dos veces, que los botones responden y que la consola no muestra `[manejadores] bloqueado` en el uso normal.
- [ ] Confirmar el plan de Supabase antes de sumar colegios: el gratuito admite 200 conexiones en tiempo real a la vez (≈ 200 alumnos conectados), 500 MB de base, 5 GB de transferencia al mes y se pausa tras 7 días sin uso. Para clientes pagando: plan Pro.
- [x] `@supabase/supabase-js` fijado a `2.118.0` en las 29 Edge Functions (9/11/2026); se aplica en cada función cuando se vuelva a desplegar. Una prueba impide volver a importar sin versión exacta.
- [x] `@playwright/test` subido a 1.65.0 (PR #5, 10/11/2026): sin alertas de `npm audit` en las herramientas de desarrollo.
- [x] CI de `main` en verde (10/11/2026, incluidos «Migraciones» con PostgreSQL 17, gitleaks y Deno).
- [x] Protección de `main` activa desde el 9/11/2026: solo por pull request, 0 aprobaciones (una sola persona), 6 chequeos obligatorios (Sintaxis JS, Pruebas unitarias, Tipos de Deno, gitleaks, Migraciones, tailwind), sin push forzado ni borrado. Al sumar equipo: pedir 1 aprobación (`CONTRIBUTING.md`).
- [x] Dependabot al día (10/11/2026): fusionadas `checkout` 7, Playwright 1.65 y, en un solo PR, `setup-node` 7, `upload-artifact` 7 y `setup-deno` 2; cerradas con motivo `tailwindcss` 4, `better-sqlite3` 13 y `bcryptjs` 3 (cambios mayores que no se adoptan sin probar: el CSS compilado y el servidor escolar).
- [x] Retos repetidos (9 y 10/11/2026): v1.0.255 (un toque, un reto) y v1.0.256 («Revancha» una sola vez). Falta aplicar la **migración `duel-one-open-pair.sql`** en Supabase (candado en la base, v1.0.257): cancela los pendientes repetidos que existan y evita nuevos. Ver `docs/PASOS_MANUALES.md`.
- [x] Retos repetidos «pendientes» y duelos de Ahorcado activos repetidos revisados (11/11/2026): el verificador ya no muestra duplicados, así que el candado `duel-one-open-pair.sql` quedó aplicado completo.

## 🟠 Migraciones y funciones de las últimas versiones

Verificá en el SQL Editor que estén corridas, en este orden (todas son
seguras de re-ejecutar):

- [x] `migrations/duel-played-ids.sql` (v1.0.84)
- [x] `migrations/teacher-self-service.sql` (v1.0.89)
- [x] `migrations/duel-rewards-live-gems.sql` (v1.0.91)
- [x] `migrations/companion-collection.sql` (v1.0.93)
- [x] `migrations/companion-more.sql` (v1.0.94)
- [x] `migrations/guardians.sql` (v1.0.98)
- [x] `migrations/announcements-targeting.sql` (v1.0.99) — reemplaza las reglas de acceso de avisos: después de correrla, probar que un alumno siga viendo los avisos de su clase.
- [x] `migrations/guardian-consent.sql` (v1.0.100) — **antes** de redesplegar `guardian-portal`.
- [x] `migrations/impact-metrics.sql` (v1.0.100) — tablero de impacto del admin.
- [x] `migrations/coordinador-role.sql` (si no la corriste ya) — necesaria antes de la siguiente.
- [x] `migrations/school-project-visibility.sql` (v1.0.112) — switch de Hall de la Fama por establecimiento y reportes del coordinador.
- [x] `migrations/season-pass.sql` (si no la corriste ya) — necesaria antes de la siguiente.
- [x] `migrations/season-pass-companion-reward.sql` (v1.0.116) — el pase de temporada regala una mascota gratis en el nivel 18.
- [x] `migrations/guardian-paper-consent.sql` (v1.0.118) — consentimiento firmado en papel, registrado por el docente/admin.
- [x] `migrations/coordinator-see-announcements.sql` — el coordinador ve los avisos de sus docentes y del admin (solo de su establecimiento), sin importar a quién iban dirigidos.
- [x] `migrations/lesson-audience.sql` (v1.0.121) — recursos "solo docentes" en los cursos, invisibles para alumnos.
- [x] `migrations/hangman-word-bank.sql` (v1.0.123) — requiere `migrations/duel-facts.sql` ya corrida. Categoría "Vida silvestre de Guatemala" en Ahorcado, banco fijo de 20 palabras.
- [x] `migrations/timed-math-word-problems.sql` (v1.0.125) — requiere `migrations/student-timed-math-duels.sql` ya corrida. Contrarreloj: los problemas de 4to grado en adelante salen como mini-historia con contexto real (misma cuenta, mismo número).
- [x] `migrations/sync-queue-idempotency.sql` (v1.0.127) — junta evaluar proyecto en una sola función atómica y agrega `client_ref` a `tutor_attendance` para que un reintento de la cola offline no duplique el check-in.
- Las migraciones de los puntos anteriores que antes tenían casilla propia (`fix-is-staff-coordinador`, `project-reactions*`, `practice-progress`, `duel-per-player-content`, `exams`, `project-thumbnails`, `project-reaction-notifications`) están ahora en «Seguridad» arriba.

Redesplegar estas Edge Functions (cambiaron en las últimas versiones):

- [ ] `notify-reaction` (nueva, v1.0.153) — **Verify JWT ON**; push al dueño/equipo del proyecto (sin nombre de quien reaccionó, máx. 1 cada 10 min por persona)
- [ ] `notify-duel` (v1.0.164) — solo cambió el nombre del juego en el aviso ("Comprensión Lectora").
- [ ] `ai-generate-quiz`, `ai-generate-hangman-word`, `ai-generate-spelling-word`, `ai-generate-debug-steps` (v1.0.163) — generan contenido distinto para cada jugador y alimentan el modo Práctica (`ai-generate-quiz` ahora es Comprensión Lectora: texto + preguntas, **redesplegar también en v1.0.164**). **Correr primero `duel-per-player-content.sql`** y después redesplegar las 4 (si se despliegan antes, siguen funcionando como antes: mismo contenido para los dos).
- [x] `ai-generate-quiz`, `ai-generate-hangman-word`, `ai-generate-spelling-word`, `ai-generate-debug-steps` (versión anterior, retos sin repetir)
- [x] `admin-bulk-import-students` (docentes agregan alumnos, usuario con nomenclatura del admin)
- [x] `ai-proxy` (modo tutor)
- [x] `notify-announcement` (avisos por colegio o grupo)
- [x] `trigger-random-event` — **Verify JWT OFF** (protegida con `CRON_SECRET`; desde v1.0.124 manda `target: 'random-event'` en el push para que el clic navegue al quiz)
- [x] `notify-guardians` — **Verify JWT ON**
- [x] `guardian-portal` — **Verify JWT OFF** (redesplegar después de correr `guardian-consent.sql`: ahora registra el consentimiento de padres; desde v1.0.118 también guarda `consent_method: 'portal'`)

## 🟠 SMS a padres

- [x] Instalar **SMS Gateway for Android** y activar Cloud server (`SMSGATE_USER`/`SMSGATE_PASS`). Funcionando.

## 🟡 Paso 1 de la hoja de ruta (ordenar la casa)

- [x] Documentación: README, ARCHITECTURE, SETUP, MIGRATIONS, CONTRIBUTING, CHANGELOG
- [x] Script para volcar el esquema
- [x] Quitar el secreto del repositorio
- [x] Subir `supabase/schema.sql` (ver Urgente, 29/09/2026)
- [ ] Crear el **proyecto Supabase de prueba** siguiendo `docs/SETUP.md`
- [ ] Proteger la rama `main` en GitHub (cambios solo por pull request): pasos y comando en `CONTRIBUTING.md`, «Protección de la rama `main`». Antes, que la CI esté en verde.
- [x] **Licencia decidida el 9/11/2026:** todos los derechos reservados (Copyright, ver `LICENSE`); MIT descartada por ahora. Si un fondo exige código abierto, se reevalúa (cambiar a MIT es solo reemplazar `LICENSE`, el README y `package.json`).
- [x] Autoría de `icon-192.png`/`icon-512.png`: confirmada como identidad de Quetzal LMS / Yo Aprendo (11/11/2026). Auditoría del resto de ilustraciones hecha el 11/11/2026 (`docs/AUDITORIA_ILUSTRACIONES.md`). Quedan: que el titular confirme que el panda se dibujó desde cero y anotar la versión y el enlace al `LICENSE` de `vendor/h5p-standalone/`.

## 🟡 Hoja de ruta de gestión (fuera del repositorio)

La hoja de ruta de gestión (formalización legal, medición con universidades, piloto rural, postulaciones a fondos y equipo) y las tareas fiscales se llevan **fuera de este repositorio público**. En el repositorio quedan las guías técnicas: `docs/PRIVACIDAD_Y_CONSENTIMIENTO.md`, `docs/MEDICION_IMPACTO.md` y `docs/PILOTO_RURAL.md`.

## 🔵 Nodo escolar (Raspberry Pi o computadora con Windows)

- [x] Correr `migrations/school-nodes.sql`.
- [x] Desplegar `node-sync` con **Verify JWT OFF**.
- [ ] Registrar el nodo desde la consola (RPC `register_school_node`) e instalar en la Pi según `school-node/README.md`.
- [x] Instalador de un solo comando (`school-node/install.sh`: Node.js, servicio, `http://quetzal.local`, código de docente, montaje USB, Wi-Fi propia con `--hotspot`).
- [ ] Probar el instalador en una Raspberry real.
- [x] Instalador para Windows 10/11 (`school-node/instalar-windows.cmd`): Node.js 22 portátil, tarea programada al arrancar, firewall solo red local, `C:\Quetzal`, cartel con QR en `/cartel`.
- [ ] Probar el instalador de Windows en una computadora real con router y 20+ celulares (se validó la sintaxis, la descarga de Node.js y el servidor con datos fuera del código; no se ejecutó completo porque cambia la configuración del equipo).
- [ ] Llevar al nodo exámenes, asistencia y juegos (hoy sin internet solo funcionan Cursos).
- [ ] HTTPS en el nodo (subdominio con certificado). No bloquea el piloto: el nodo funciona por HTTP en la red de la escuela.
- [x] Sincronización por USB para escuelas donde el docente no llega a zona con señal (`school-node/usb-sync.js` + menú **Nodo escolar (USB)**).
- [x] Redesplegar `node-sync` (**Verify JWT OFF**) para activar la sincronización por USB.
- [ ] Probar la USB con una Raspberry real (en la versión Lite, instalar la regla de montaje del README).
- [x] Panel del docente en el nodo: ingresos, restablecer PIN, desbloquear, estado de sincronización.
- [x] Ocultar en modo nodo lo que necesita la nube (avisos, asistente con IA, perfil).
- [x] Subir proyectos desde el nodo (video o modelo 3D, individual o de equipo, publicación automática al sincronizar): v1.0.188.
- [ ] **Probar la subida de proyectos con la nube real**: volver a publicar `node-sync` (`--no-verify-jwt`), confirmar el límite de archivo de Storage (≥ 150 MB) y subir un video corto desde un celular en un nodo; el cableado de `supabase/functions/node-sync/index.ts` solo se probó con una nube simulada y la lógica pura, y `deno check` lo corre el CI.
- [x] Inicio del estudiante en el nodo con las fichas de proyectos de su clase (sin videos): v1.0.191.
- [ ] **Probar el Inicio del nodo con la nube real**: volver a publicar `node-sync` (con `projects.ts`), sincronizar y comprobar que aparecen las fichas aprobadas de la clase; la consulta de `index.ts` solo se probó con la lógica pura.
- [ ] Videos y modelos 3D de los compañeros en el nodo (hoy solo fichas).
- [x] XP sin internet en el nodo (lecciones, proyectos, cofre diario) y +10 XP por lección también con internet: v1.0.193.
- [ ] **Probar el XP con la nube real**: ejecutar `migrations/xp-events.sql`, volver a publicar `node-sync` (con `xp.ts`), completar una lección y abrir el cofre en un nodo, sincronizar y comprobar que el XP y las gemas suben una sola vez; ni el SQL ni la consulta de `index.ts` se pudieron probar de forma automática.
- [ ] XP retroactivo por las lecciones ya completadas antes de v1.0.193 (hoy no se paga).
- [ ] Gemas por lecciones, tienda, insignias, retos y ranking en el nodo (hoy el Perfil del nodo solo muestra XP, nivel y gemas).
- [x] Reacciones a proyectos sin internet en el nodo (5 reacciones, una por proyecto, la nube cuenta los votos): v1.0.194.
- [ ] **Probar las reacciones con la nube real**: ejecutar `migrations/node-reactions.sql`, volver a publicar `node-sync` (con `reactions.ts`), reaccionar en un nodo, sincronizar y comprobar que el voto sube una sola vez y que llega el aviso al dueño; el SQL sí se probó en PostgreSQL real, la consulta de `index.ts` no.
- [ ] Notificación push de reacciones desde el nodo (hoy solo el aviso de la campana al sincronizar).
- [x] Evaluar proyectos sin internet con PIN personal del docente: v1.0.195.
- [ ] **Probar la evaluación con la nube real**: ejecutar `migrations/node-evaluations.sql`, volver a publicar `node-sync` (con `evaluations.ts`), crear el PIN de un docente, evaluar un proyecto, sincronizar y comprobar la nota y la observación en la nube; el SQL sí se probó en PostgreSQL real, la consulta de `index.ts` no.
- [ ] Panel del docente sin internet: **avisos** a la clase y **crear cursos y lecciones** (siguientes entregas).
- [ ] Insignias por nota y aviso al estudiante cuando se evalúa desde el nodo (hoy solo con internet).
- [ ] Fotos como proyecto (en la nube y en el nodo a la vez): hoy un proyecto es video o modelo 3D.
- [ ] Aprobación del docente antes de publicar los proyectos del nodo (hoy se publican solos, igual que en la nube).
- [ ] Subir proyectos por memoria USB en escuelas que nunca tienen internet.
- [ ] Llevar al nodo exámenes, asistencia y juegos (hoy sin internet funcionan Cursos y Subir proyecto).
- [ ] Videos de la Quetzadex en el nodo: hoy el modo nodo solo muestra Cursos y Subir proyecto (sin Centro de Juego), así que no aplica hasta llevar los juegos al nodo.

## 🔵 Mejoras pendientes de la app

- [ ] Decidir el contraste del texto blanco sobre el verde de marca (`#00C853` = 2,2:1) en botones `btn-primary-tw` y `bg-primary`, y sobre `bg-amber-500` / `bg-emerald-500`: son legibles pero por debajo de AA. Opciones: botones con `--primary-dark` (`#009624`, 3,9:1, solo en tema claro) o texto oscuro.
- [ ] Revisar el tema claro en cada sección con sesión iniciada (v1.0.169 y v1.0.170 oscurecieron `text-slate-400` con CSS en `index.html`, bloque `#light-contrast`). Si algún panel oscuro hecho con CSS propio quedó con el texto muy oscuro, agregar su clase a la lista de superficies oscuras de ese bloque.
- [ ] Medir otra vez en PageSpeed Insights (móvil) después de v1.0.168: antes 64 (FCP 5,4 s, LCP 6,0 s). Si sigue bajo, siguiente paso: minificar `js/*.js` con un paso de build y quitar CSS no usado de `css/tailwind.css`.
- [x] PIN personal también en el modo sin conexión de la nube (v1.0.131). Requiere correr `migrations/student-pin-cloud.sql`.
- [ ] Avisos automáticos a padres (por ejemplo: no asistió, subió su proyecto, logro semanal). Definir cuáles.
- [ ] SQL para renombrar al estándar los usuarios de alumnos creados en pruebas con el formato viejo (`ana.lopez`).
- [ ] Mostrar al admin quién creó cada alumno (columna `created_by`).
- [ ] Pruebas automáticas de interfaz (Playwright) para login, curso, duelo y asistencia.
- [ ] Registro de errores en producción (por ejemplo Sentry, plan gratis).
- [ ] Respaldo periódico de la base fuera de Supabase.
- [ ] Sin conexión fase 2 y 3: paquete de curso en archivo, exportar progreso a archivo, modo aula sin conexión.
