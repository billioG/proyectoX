# Pendientes

Lista de tareas abiertas del proyecto. Marcá con `[x]` lo que vayas
completando. Lo de "Urgente" son pasos que solo puede hacer el responsable
del proyecto (necesitan contraseñas o acceso al panel de Supabase).

Última actualización: 26 de septiembre de 2026.

## 🔴 Urgente

- [ ] **Cambiar el `CRON_SECRET`.** El valor viejo quedó en el historial de git (`migrations/random-events-cron.sql`).
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

Redesplegar estas Edge Functions (cambiaron en las últimas versiones):

- [ ] `ai-generate-quiz`, `ai-generate-hangman-word`, `ai-generate-spelling-word`, `ai-generate-debug-steps` (retos sin repetir)
- [ ] `admin-bulk-import-students` (docentes agregan alumnos, usuario con nomenclatura del admin)
- [ ] `ai-proxy` (modo tutor)
- [ ] `notify-announcement` (avisos por colegio o grupo)
- [ ] `notify-guardians` — **Verify JWT ON**
- [ ] `guardian-portal` — **Verify JWT OFF**

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

- [ ] **Formalizar:** política de privacidad y consentimiento de padres, registro de propiedad intelectual, evaluar figura legal (asociación o empresa).
- [ ] **Medir:** tablero de impacto (estudiantes activos, aprendizaje, asistencia) y una prueba corta de entrada en las escuelas actuales.
- [ ] **Piloto rural:** 3 a 5 escuelas con nodo Raspberry, documentar costos y resultados.
- [ ] **Postular a fondos:** SENACYT/FONACYT con una universidad, HundrED, MIT Solve, UNICEF Venture Fund (requiere licencia abierta), fundaciones locales.
- [ ] **Sumar equipo:** segundo desarrollador o practicantes, con revisión de código y pruebas automáticas.

Detalle en el dossier: https://claude.ai/artifact/BoLjSgRTYwfesywaZaxvEq

## 🔵 Nodo escolar (Raspberry Pi)

- [ ] Correr `migrations/school-nodes.sql`.
- [ ] Desplegar `node-sync` con **Verify JWT OFF**.
- [ ] Registrar el nodo desde la consola (RPC `register_school_node`) e instalar en la Pi según `school-node/README.md`.
- [ ] HTTPS en el nodo (subdominio delegado con deSEC) e instalador de un solo comando (Wi-Fi, `quetzal.local`).
- [ ] Sincronización por USB para escuelas donde el docente no llega a zona con señal.
- [ ] Panel del docente en el nodo: ver registro de ingresos y restablecer PIN.
- [ ] Ocultar en modo nodo lo que necesita la nube (campana, consejos de la mascota).
- [ ] Copiar los videos de la Quetzadex (`course-content/companion-videos/`) al nodo en la sincronización.

## 🔵 Mejoras pendientes de la app

- [ ] PIN personal también en el modo sin conexión de la nube (hoy solo en el nodo).
- [ ] Avisos automáticos a padres (por ejemplo: no asistió, subió su proyecto, logro semanal). Definir cuáles.
- [ ] SQL para renombrar al estándar los usuarios de alumnos creados en pruebas con el formato viejo (`ana.lopez`).
- [ ] Mostrar al admin quién creó cada alumno (columna `created_by`).
- [ ] Pruebas automáticas de interfaz (Playwright) para login, curso, duelo y asistencia.
- [ ] Registro de errores en producción (por ejemplo Sentry, plan gratis).
- [ ] Respaldo periódico de la base fuera de Supabase.
- [ ] Sin conexión fase 2 y 3: paquete de curso en archivo, exportar progreso a archivo, modo aula sin conexión.
