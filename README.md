# Quetzal LMS

Plataforma educativa gamificada para escuelas de Guatemala, pensada para
funcionar también en comunidades rurales **sin internet**.

- **Estudiantes**: cursos (PDF, video, H5P, SCORM, quizzes), proyectos STEAM, 5 juegos de duelo 1 contra 1, ligas semanales, pase de temporada y la Quetzadex: 11 mascotas (10 de fauna guatemalteca y el panda de la Temporada 2) con datos reales.
- **Docentes**: asistencia con QR (o lista rápida donde no hay cámara), evaluación de proyectos con apoyo de IA, cursos, exámenes con hoja de respuestas, alta de alumnos y clubes, avisos a estudiantes y padres.
- **Administración**: establecimientos, docentes, importación de nóminas del SIRE, tableros de asistencia y resultados, avisos segmentados, servidores escolares y una bitácora de seguridad (quién hizo qué y cuándo).
- **Padres de familia**: avisos por SMS o notificación en el celular, con un portal personal sin necesidad de cuenta.
- **Sin conexión**: la app funciona en la tablet sin señal y, con un **nodo escolar en Raspberry Pi**, toda la escuela trabaja sin internet y sincroniza cuando hay señal. Con el kit de router + Raspberry, los estudiantes abren **`quetzal.local`** desde cualquier dispositivo ([docs/NODO_KIT_ROUTER.md](docs/NODO_KIT_ROUTER.md)). Sin internet **no** funcionan el asistente con IA, los retos de comprensión, ortografía y depuración, la tienda, el pase de temporada ni el chat de la mascota (detalle en [school-node/README.md](school-node/README.md)).
- **Lo que está probado y lo que no**: el nodo se ha medido en una escuela real con **15 a 20 tablets a la vez** (piloto). Con más tablets, el servidor de nombres del kit de router y la imagen de microSD **no se han probado todavía en hardware real** (ver [docs/NODO_LIMITES.md](docs/NODO_LIMITES.md)).

En producción: [clases.yoaprendo.online](https://clases.yoaprendo.online)

## Tecnología

| Parte | Tecnología |
|---|---|
| Aplicación | JavaScript (módulos ES, sin framework), Tailwind CSS, PWA |
| Datos, login y archivos | [Supabase](https://supabase.com): Postgres con reglas por fila, Auth, Storage, Realtime |
| Lógica de servidor | 29 Edge Functions en Deno |
| IA | Groq (quizzes, tutor, evaluaciones) |
| Nodo escolar | Node.js + SQLite en Raspberry Pi 4 |
| Hosting | GitHub Pages (la guía para poner Cloudflare delante y añadir cabeceras de seguridad está en [docs/CLOUDFLARE_PASO_A_PASO.md](docs/CLOUDFLARE_PASO_A_PASO.md); aún no está aplicada) |
| Seguridad del navegador | Política de contenido (CSP) sin `'unsafe-inline'` en scripts desde v1.0.260; los botones los ejecuta `js/safe-handlers.js` con una lista de funciones permitidas |

## Documentación

| Documento | Para qué |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Cómo está armado el sistema: módulos, roles, seguridad, sin conexión |
| [docs/SETUP.md](docs/SETUP.md) | Instalar una copia de prueba completa |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | Base de datos: orden de migraciones y reglas |
| [docs/PASOS_MANUALES.md](docs/PASOS_MANUALES.md) | Qué corre a mano el responsable en Supabase, en orden, y qué Edge Function redesplegar |
| [docs/ENSAYO_DEMO.md](docs/ENSAYO_DEMO.md) | Guion de 20 minutos y lista de comprobación para presentar la plataforma a un colegio |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Reglas para colaborar y publicar versiones |
| [CHANGELOG.md](CHANGELOG.md) | Historial de cambios |
| [PENDIENTES.md](PENDIENTES.md) | Tareas abiertas y pasos manuales pendientes |
| [docs/PRIVACIDAD_Y_CONSENTIMIENTO.md](docs/PRIVACIDAD_Y_CONSENTIMIENTO.md) | Cómo se tratan los datos de menores y modelo de consentimiento en papel |
| [docs/MEDICION_IMPACTO.md](docs/MEDICION_IMPACTO.md) | Tablero de impacto y prueba de entrada y salida |
| [docs/PILOTO_RURAL.md](docs/PILOTO_RURAL.md) | Protocolo del piloto en escuelas sin internet |
| [docs/NODO_KIT_ROUTER.md](docs/NODO_KIT_ROUTER.md) | Kit de router + Raspberry: que `quetzal.local` abra en cualquier dispositivo (se prepara una vez) |
| [docs/NODO_LIMITES.md](docs/NODO_LIMITES.md) | Qué aguanta el nodo escolar y qué no (lo medido y lo estimado) |
| [docs/NODO_IMAGEN_MICROSD.md](docs/NODO_IMAGEN_MICROSD.md), [docs/NODO_RESPALDO.md](docs/NODO_RESPALDO.md), [docs/CHECKLIST_NUEVO_COLEGIO.md](docs/CHECKLIST_NUEVO_COLEGIO.md) | Imagen de microSD, respaldo y restauración, y lista para instalar un colegio nuevo |
| [docs/NODO_APP_REAL_INFORME.md](docs/NODO_APP_REAL_INFORME.md) | Informe de la app real sobre el nodo (foto del 1/11/2026 con nota de actualización) |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Rendimiento, peticiones por pantalla y límites actuales |
| [docs/SEGURIDAD_2026-11.md](docs/SEGURIDAD_2026-11.md) | Revisión de seguridad de noviembre de 2026: política de contenido (CSP) y bitácora de seguridad |
| [docs/CLOUDFLARE_PASO_A_PASO.md](docs/CLOUDFLARE_PASO_A_PASO.md) | Cloudflare delante del dominio para las cabeceras de seguridad |
| [docs/AUDITORIA_ILUSTRACIONES.md](docs/AUDITORIA_ILUSTRACIONES.md) | De dónde sale cada imagen y sonido de la app |
| [docs/soporte/](docs/soporte/README.md) | Kit de onboarding del docente, 10 preguntas frecuentes y guía rápida de soporte |
| [privacidad.html](privacidad.html) | Política de privacidad |
| [docs/METRICAS_ADMIN.md](docs/METRICAS_ADMIN.md) | Cómo se calculan las métricas del panel de administración |
| [MANUAL_DE_USUARIO.md](MANUAL_DE_USUARIO.md) | Uso para docentes y administración |
| [school-node/README.md](school-node/README.md) | Instalar y actualizar el nodo escolar (Windows o Raspberry Pi, también por SSH; la actualización tolera cambios locales desde v1.0.266) y cómo funciona la app sin internet |

## Empezar rápido

```bash
git clone https://github.com/billioG/proyectoX.git
cd proyectoX
npm install
npm run serve
```

Eso sirve la aplicación en `http://localhost:8080`, pero conectada a la base
configurada en `js/config.js`. Para desarrollar necesitás tu propio proyecto
de Supabase de prueba: seguí [docs/SETUP.md](docs/SETUP.md).

## Estructura

```
index.html            Aplicación (una sola página)
padres.html           Portal de padres
service-worker.js     Caché sin conexión y notificaciones push
js/                   Módulos de la aplicación
css/                  Tailwind (fuente y compilado) y estilos propios
migrations/           Cambios de base de datos (SQL)
supabase/functions/   Edge Functions (única fuente; _shared/ = módulos comunes)
school-node/          Servidor del nodo escolar para Raspberry Pi
scripts/              Utilidades (volcado del esquema, arreglos puntuales)
docs/                 Documentación técnica
```

## Autor y licencia

Proyecto creado por Billy Abraham Gómez Sac (Guatemala).

Copyright (c) 2026 Billy Abraham Gómez Sac. **Todos los derechos reservados** (ver [LICENSE](LICENSE)). Que el código sea visible en
GitHub no es una licencia de uso. Las librerías de terceros conservan sus licencias: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Para pedir permiso: colegios@yoaprendo.online
