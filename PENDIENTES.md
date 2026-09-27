# Pendientes

Lista de tareas abiertas del proyecto. Marcá con `[x]` lo que vayas
completando. Lo de "Urgente" son pasos que solo puede hacer el responsable
del proyecto (necesitan contraseñas o acceso al panel de Supabase).

Última actualización: 26 de septiembre de 2026.

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

- [ ] **Volcar el esquema de producción** (sin esto nadie puede reconstruir la base).
  1. Instalar PostgreSQL (solo se usa `pg_dump`) o abrir Docker Desktop.
  2. Supabase → **Connect** → **Session pooler** → copiar la cadena de conexión.
  3. `$env:SUPABASE_DB_URL = '<cadena>'` y luego `./scripts/dump-schema.ps1`.
  4. Revisar `supabase/schema.sql` (sin datos personales ni secretos) y subirlo al repositorio.

## 🔴 Antes de la primera demo a un colegio

- [x] Perfil docente sin "UNDEFINED"; cuenta establecimientos (no grados) (v1.0.107)
- [x] Singular/plural en contadores ("1 evaluación recibida") (v1.0.107)
- [x] Ranking explica el orden (votos primero, luego score) (v1.0.107)
- [x] Ranking: entre alumnos se ve "Ana L.", no el nombre completo (v1.0.107)
- [x] Crear `colegios@yoaprendo.online`
- [ ] Verificar SPF, DKIM y DMARC de ese correo (mail-tester.com ≥ 9/10) y calentar el dominio 2 semanas
- [x] Correo de contacto y fecha de última revisión en `privacidad.html` (v1.0.108)
- [x] Plantel de demostración creado (`migrations/demo-school.sql`, 27/09/2026). Falta: asignarle una ruta publicada a las 2 clases. Nunca demostrar con un plantel con menores reales.
- [ ] Publicar la página para colegios y enlazarla desde el pie de Quetzal ("Para colegios e instituciones")
- [ ] Nombre legal = DPI = NIT en el acuerdo de piloto y facturas; inscripción SAT / FEL
- [ ] No prometer en demos el nodo escolar ni la importación SIRE hasta probarlos en vivo

## 🟠 Migraciones y funciones de las últimas versiones

Verificá en el SQL Editor que estén corridas, en este orden (todas son
seguras de re-ejecutar):

- [ ] `migrations/duel-played-ids.sql` (v1.0.84)
- [ ] `migrations/teacher-self-service.sql` (v1.0.89)
- [ ] `migrations/duel-rewards-live-gems.sql` (v1.0.91)
- [ ] `migrations/companion-collection.sql` (v1.0.93)
- [ ] `migrations/companion-more.sql` (v1.0.94)
- [ ] `migrations/guardians.sql` (v1.0.98)
- [ ] `migrations/announcements-targeting.sql` (v1.0.99) — reemplaza las reglas de acceso de avisos: después de correrla, probar que un alumno siga viendo los avisos de su clase.
- [ ] `migrations/guardian-consent.sql` (v1.0.100) — **antes** de redesplegar `guardian-portal`.
- [ ] `migrations/impact-metrics.sql` (v1.0.100) — tablero de impacto del admin.
- [ ] `migrations/coordinador-role.sql` (si no la corriste ya) — necesaria antes de la siguiente.
- [ ] `migrations/school-project-visibility.sql` (v1.0.112) — switch de Hall de la Fama por establecimiento y reportes del coordinador.

Redesplegar estas Edge Functions (cambiaron en las últimas versiones):

- [ ] `ai-generate-quiz`, `ai-generate-hangman-word`, `ai-generate-spelling-word`, `ai-generate-debug-steps` (retos sin repetir)
- [ ] `admin-bulk-import-students` (docentes agregan alumnos, usuario con nomenclatura del admin)
- [ ] `ai-proxy` (modo tutor)
- [ ] `notify-announcement` (avisos por colegio o grupo)
- [ ] `notify-guardians` — **Verify JWT ON**
- [ ] `guardian-portal` — **Verify JWT OFF** (redesplegar después de correr `guardian-consent.sql`: ahora registra el consentimiento de padres)

## 🟠 SMS a padres

- [ ] Instalar **SMS Gateway for Android** (proyecto `capcom6/android-sms-gateway`) en el celular con SMS ilimitados. Si no aparece en Play Store, bajar el `.apk` solo desde `github.com/capcom6/android-sms-gateway/releases`.
- [ ] Activar modo **Cloud server** y cargar su usuario y contraseña como secretos `SMSGATE_USER` y `SMSGATE_PASS`.
- [ ] Batería de esa app en **"Sin restricciones"**.
- [ ] Prueba: registrar tu número como padre de un alumno de prueba y tocar "Enviar enlace por SMS". Si falla, revisar el error en el historial del padre.

## 🟡 Paso 1 de la hoja de ruta (ordenar la casa)

- [x] Documentación: README, ARCHITECTURE, SETUP, MIGRATIONS, CONTRIBUTING, CHANGELOG
- [x] Script para volcar el esquema
- [x] Quitar el secreto del repositorio
- [ ] Subir `supabase/schema.sql` (ver Urgente)
- [ ] Crear el **proyecto Supabase de prueba** siguiendo `docs/SETUP.md`
- [ ] Proteger la rama `main` en GitHub (cambios solo por pull request revisado)
- [ ] **Decidir la licencia** (propietaria, código abierto o núcleo abierto) y agregar el archivo `LICENSE`

## 🟡 Hoja de ruta (pasos 2 a 6)

### Paso 2 · Formalizar — guía: `docs/FORMALIZACION.md`
- [x] Política de privacidad (`privacidad.html`), enlazada desde el login y el Portal de padres
- [x] Consentimiento de padres en el portal, con fecha y versión; sin avisos a quien no acepta
- [x] La IA recibe solo el primer nombre
- [x] Poner el **correo de contacto** en `privacidad.html` (`colegios@yoaprendo.online`)
- [ ] Revisar la política con un abogado (lista de preguntas en la guía)
- [ ] Registrar el software y la marca en el Registro de la Propiedad Intelectual
- [ ] Elegir figura legal (asociación, empresa o ambas)
- [ ] Convenio simple con cada escuela; consentimiento en papel donde no haya celular (modelo en la guía)

### Paso 3 · Medir — guía: `docs/MEDICION_IMPACTO.md`
- [x] Tablero de impacto del admin (menú **Impacto**): uso, lecciones, duelos, asistencia, familias, tendencia; CSV y resumen para postulaciones
- [ ] Elegir área y grado para la prueba de entrada y salida y prepararla con docentes
- [ ] Buscar una universidad aliada para el análisis

### Paso 4 · Piloto rural — protocolo: `docs/PILOTO_RURAL.md`
- [x] Protocolo: criterios de escuelas, equipo y costos, calendario, roles, riesgos, criterios de éxito
- [ ] Terminar el nodo escolar (ver sección "Nodo escolar")
- [ ] Imagen de tarjeta microSD lista para copiar
- [ ] Presupuesto con precios locales; elegir escuelas y firmar convenios

### Paso 5 · Postular — kit: `docs/fondos/KIT_POSTULACION.md`
- [x] Resumen de una página, respuestas tipo, guion de 10 diapositivas, presupuesto modelo, convocatorias y lista de control
- [ ] Completar las cifras con el tablero de impacto y la formación/experiencia del equipo
- [ ] Video de 2 minutos y cartas de apoyo de directores
- [ ] Postular (SENACYT con universidad, HundrED, MIT Solve, UNICEF Venture Fund si la licencia es abierta, fundaciones locales)

### Paso 6 · Sumar equipo — guía: `docs/EQUIPO.md`
- [x] Plan de primera semana, accesos mínimos y lista de primeras tareas
- [x] Pruebas de humo automáticas (`npm test`, 12 pruebas en celular y computadora) que corren en GitHub en cada cambio
- [ ] Convenio de práctica con una universidad o convocatoria de voluntariado
- [ ] Reunión semanal corta con quien se sume

Detalle en el dossier: https://claude.ai/artifact/BoLjSgRTYwfesywaZaxvEq

## 🔵 Nodo escolar (Raspberry Pi)

- [ ] Correr `migrations/school-nodes.sql`.
- [ ] Desplegar `node-sync` con **Verify JWT OFF**.
- [ ] Registrar el nodo desde la consola (RPC `register_school_node`) e instalar en la Pi según `school-node/README.md`.
- [x] Instalador de un solo comando (`school-node/install.sh`: Node.js, servicio, `http://quetzal.local`, código de docente, montaje USB, Wi-Fi propia con `--hotspot`).
- [ ] Probar el instalador en una Raspberry real.
- [ ] HTTPS en el nodo (subdominio con certificado). No bloquea el piloto: el nodo funciona por HTTP en la red de la escuela.
- [x] Sincronización por USB para escuelas donde el docente no llega a zona con señal (`school-node/usb-sync.js` + menú **Nodo escolar (USB)**).
- [ ] Redesplegar `node-sync` (**Verify JWT OFF**) para activar la sincronización por USB.
- [ ] Probar la USB con una Raspberry real (en la versión Lite, instalar la regla de montaje del README).
- [x] Panel del docente en el nodo: ingresos, restablecer PIN, desbloquear, estado de sincronización.
- [x] Ocultar en modo nodo lo que necesita la nube (avisos, asistente con IA, perfil).
- [ ] Videos de la Quetzadex en el nodo: hoy el modo nodo solo muestra Cursos (sin Centro de Juego), así que no aplica hasta llevar los juegos al nodo.

## 🔵 Mejoras pendientes de la app

- [ ] PIN personal también en el modo sin conexión de la nube (hoy solo en el nodo).
- [ ] Avisos automáticos a padres (por ejemplo: no asistió, subió su proyecto, logro semanal). Definir cuáles.
- [ ] SQL para renombrar al estándar los usuarios de alumnos creados en pruebas con el formato viejo (`ana.lopez`).
- [ ] Mostrar al admin quién creó cada alumno (columna `created_by`).
- [ ] Pruebas automáticas de interfaz (Playwright) para login, curso, duelo y asistencia.
- [ ] Registro de errores en producción (por ejemplo Sentry, plan gratis).
- [ ] Respaldo periódico de la base fuera de Supabase.
- [ ] Sin conexión fase 2 y 3: paquete de curso en archivo, exportar progreso a archivo, modo aula sin conexión.
