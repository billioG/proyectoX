# Instalar Quetzal LMS

Guía para levantar una copia **de prueba** completa: base de datos, funciones
de servidor y la aplicación. Nadie debería desarrollar contra la base de
producción: tiene datos reales de menores de edad.

Tiempo estimado: 1 a 2 horas la primera vez.

## 1. Requisitos

| Herramienta | Para qué | Cómo obtenerla |
|---|---|---|
| Git | Clonar el repositorio | git-scm.com |
| Node.js 18 o superior | Servidor local, Tailwind, CLI de Supabase | nodejs.org |
| Cuenta de Supabase | Base de datos, login, archivos, funciones | supabase.com (plan gratis) |
| Cuenta de Groq | IA (quizzes, tutor, evaluaciones) | console.groq.com (tiene plan gratis) |
| Deno (opcional) | Revisar tipos de las funciones como la CI | deno.land |
| PostgreSQL 15+ o Docker (opcional) | Volcar el esquema de producción | postgresql.org / docker.com |

```bash
git clone https://github.com/billioG/proyectoX.git
cd proyectoX
```

## 2. Crear el proyecto de prueba en Supabase

1. En supabase.com, **New project**. Anotá el *Project ref* (la parte `xxxx` de `https://xxxx.supabase.co`), la URL y la clave `anon` (Project Settings → API).
2. Database → Extensions: activá **pg_cron** y **pg_net** (los usan los eventos sorpresa).
3. Authentication → Providers → Email: dejalo activo. Los alumnos usan correos internos `usuario@estudiante.edu.gt` creados por las funciones de administración, así que conviene **desactivar "Confirm email"**.

## 3. Crear la base de datos

La base **no** se puede armar solo con `migrations/` (ver
[MIGRATIONS.md](MIGRATIONS.md)): las tablas principales se crearon antes de
que existieran las migraciones.

**Opción recomendada: desde el esquema de producción.**

1. El responsable del proyecto corre `./scripts/dump-schema.ps1` contra producción y sube `supabase/schema.sql` al repositorio (solo esquema, sin datos).
2. En el proyecto de prueba: SQL Editor → pegar `supabase/schema.sql` completo → Run.

Si `supabase/schema.sql` todavía no existe en el repositorio, pedíselo al
responsable del proyecto antes de seguir.

## 4. Archivos (Storage)

Creá estos buckets en Storage:

| Bucket | Uso | Público |
|---|---|---|
| `course-content` | Recursos de cursos (PDF, video, H5P, SCORM) y videos de la Quetzadex | Sí |
| `project-videos` | Videos de proyectos de alumnos | Revisar en producción |
| `teacher-evidence` | Evidencias de tareas de docentes | Revisar en producción |
| `comment-attachments` | Adjuntos en comentarios de lecciones | Revisar en producción |

Copiá las políticas de cada bucket desde producción (Storage → Policies).

## 5. Primer administrador

1. Authentication → Users → **Add user** con tu correo y una contraseña.
2. Copiá su *User UID* y, en el SQL Editor:

```sql
insert into public.teachers (id, full_name, email, role)
values ('<USER_UID>', 'Tu Nombre', 'tu@correo.com', 'admin');
```

Si la tabla `teachers` pide más columnas obligatorias, el error lo dice.

## 6. Secretos de las funciones

Project Settings → Edge Functions → **Secrets**. `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen cargados.

| Secreto | Para qué | Cómo generarlo |
|---|---|---|
| `GROQ_API_KEY` | Toda la IA | console.groq.com → API Keys |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Notificaciones push | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Contacto de las push | `mailto:tu@correo.com` |
| `CRON_SECRET` | Protege las tareas programadas | 48 caracteres al azar, por ejemplo `openssl rand -hex 24` |
| `RESEND_API_KEY` / `REENGAGEMENT_FROM_EMAIL` | Correos de reenganche (opcional) | resend.com |
| `SMSGATE_USER` / `SMSGATE_PASS` / `SMSGATE_URL` | SMS a padres (opcional) | App "SMS Gateway for Android" en modo nube; ver sección 10 |

La clave pública VAPID también está escrita en el cliente
(`js/random-events.js` y `padres.html`): si generás un par nuevo, cambiala ahí
en tu copia local.

## 7. Desplegar las funciones

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

La mayoría usa la sesión del usuario (**Verify JWT: ON**):

```bash
for f in admin-bulk-import-students admin-create-teacher admin-delete-students \
  admin-force-delete-school admin-set-class-password ai-proxy ai-generate-quiz \
  ai-generate-hangman-word ai-generate-spelling-word ai-generate-debug-steps \
  ai-evaluate-project ai-evaluate-mblock ai-generate-general-report \
  generate-team-match-quiz submit-team-match-answer submit-event-answer \
  notify-duel notify-announcement notify-rock-pending notify-guardians; do
  npx supabase functions deploy $f
done
```

Estas se llaman sin sesión (**Verify JWT: OFF**); se protegen solas con un
token o un secreto:

```bash
for f in student-login guardian-portal serve-scorm-entry node-sync \
  trigger-random-event settle-random-event notify-inactive-users; do
  npx supabase functions deploy $f --no-verify-jwt
done
```

**Orígenes permitidos.** Cada función solo acepta llamadas desde
`https://clases.yoaprendo.online` y `https://billiog.github.io` (constante
`ALLOWED_ORIGINS`). Para probar en tu computadora, agregá temporalmente
`http://localhost:8080` en tu copia y **no** lo subas.

## 8. Tareas programadas

`migrations/random-events-cron.sql` programa los eventos sorpresa. Antes de
correrlo en el SQL Editor reemplazá:

- `https://vyptkxudkmlpyfosppzh.supabase.co` por la URL de tu proyecto.
- `<CRON_SECRET>` por el valor del secreto `CRON_SECRET`.

No subas ese archivo con los valores reemplazados.

## 9. Correr la aplicación

1. En tu copia local, `js/config.js`: poné `SUPABASE_URL` y `SUPABASE_ANON_KEY` de tu proyecto de prueba (y en `padres.html` si vas a probar el portal). **No subas este cambio.**
2. Si cambiaste estilos:

```bash
npx -y tailwindcss@3.4.17 -c tailwind.config.js -i css/tailwind.src.css -o css/tailwind.css --minify
```

3. Serví la carpeta con cualquier servidor estático:

```bash
npx -y http-server -p 8080 -c-1
```

4. Abrí `http://localhost:8080`. El service worker funciona en `localhost`. Si ves una versión vieja, en DevTools → Application → Service Workers → *Unregister* y recargá.

## 10. Opcionales

- **Nodo escolar (Raspberry Pi)**: `school-node/README.md`.
- **SMS a padres**: instalar "SMS Gateway for Android" (proyecto `capcom6/android-sms-gateway`) en un celular con plan de SMS, activar *Cloud server* y cargar su usuario y contraseña como `SMSGATE_USER` y `SMSGATE_PASS`.

## 11. Producción

- La aplicación se publica con **GitHub Pages** desde la rama `main` (dominio `clases.yoaprendo.online`).
- Las funciones se despliegan a mano con la CLI (sección 7) contra el proyecto de producción.
- Las migraciones se corren a mano en el SQL Editor de producción, en el orden de [MIGRATIONS.md](MIGRATIONS.md).
- Antes de publicar, seguí la lista de [CONTRIBUTING.md](../CONTRIBUTING.md).
