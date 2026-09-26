# Quetzal LMS

Plataforma educativa gamificada para escuelas de Guatemala, pensada para
funcionar también en comunidades rurales **sin internet**.

- **Estudiantes**: cursos (PDF, video, H5P, SCORM, quizzes), proyectos STEAM, 5 juegos de duelo 1 contra 1, ligas semanales, pase de temporada y la Quetzadex: 10 mascotas de fauna guatemalteca con datos reales.
- **Docentes**: asistencia con QR, evaluación de proyectos con apoyo de IA, cursos, alta de alumnos y clubes, avisos a estudiantes y padres.
- **Administración**: establecimientos, docentes, importación de nóminas del SIRE, tableros de asistencia y resultados, avisos segmentados.
- **Padres de familia**: avisos por SMS o notificación en el celular, con un portal personal sin necesidad de cuenta.
- **Sin conexión**: la app funciona en la tablet sin señal y, con un **nodo escolar en Raspberry Pi**, toda la escuela trabaja sin internet y sincroniza cuando hay señal.

En producción: [clases.yoaprendo.online](https://clases.yoaprendo.online)

## Tecnología

| Parte | Tecnología |
|---|---|
| Aplicación | JavaScript (módulos ES, sin framework), Tailwind CSS, PWA |
| Datos, login y archivos | [Supabase](https://supabase.com): Postgres con reglas por fila, Auth, Storage, Realtime |
| Lógica de servidor | 27 Edge Functions en Deno |
| IA | Groq (quizzes, tutor, evaluaciones) |
| Nodo escolar | Node.js + SQLite en Raspberry Pi 4 |
| Hosting | GitHub Pages |

## Documentación

| Documento | Para qué |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Cómo está armado el sistema: módulos, roles, seguridad, sin conexión |
| [docs/SETUP.md](docs/SETUP.md) | Instalar una copia de prueba completa |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | Base de datos: orden de migraciones y reglas |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Reglas para colaborar y publicar versiones |
| [CHANGELOG.md](CHANGELOG.md) | Historial de cambios |
| [PENDIENTES.md](PENDIENTES.md) | Tareas abiertas y pasos manuales pendientes |
| [docs/METRICAS_ADMIN.md](docs/METRICAS_ADMIN.md) | Cómo se calculan las métricas del panel de administración |
| [MANUAL_DE_USUARIO.md](MANUAL_DE_USUARIO.md) | Uso para docentes y administración |
| [school-node/README.md](school-node/README.md) | Instalar el nodo escolar en una Raspberry Pi |

## Empezar rápido

```bash
git clone https://github.com/billioG/proyectoX.git
cd proyectoX
npx -y http-server -p 8080 -c-1
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
supabase/functions/   Edge Functions (espejo idéntico en supabase-functions/)
school-node/          Servidor del nodo escolar para Raspberry Pi
scripts/              Utilidades (volcado del esquema, arreglos puntuales)
docs/                 Documentación técnica
```

## Autor y licencia

Proyecto creado por Billy Gómez (Guatemala). Todavía no tiene licencia
definida: hasta entonces, todos los derechos están reservados por su autor.
