# Paso 6 · Sumar personas al equipo

Hoy el proyecto depende de una sola persona. Este documento explica a quién
sumar, cómo recibirlo en su primera semana y con qué tareas empezar sin
riesgo para las escuelas.

## A quién sumar primero

| Rol | Por qué | Dedicación | Cómo conseguirlo |
|---|---|---|---|
| Desarrollador/a JavaScript | Quitar la dependencia de una sola persona; revisar código | Medio tiempo | Practicantes de ingeniería en sistemas (universidades), voluntariado, fondo del piloto |
| Docente asesor/a | Contenido alineado al CNB, pruebas de entrada y salida, capacitaciones | Pocas horas por semana | Docentes que ya usan la plataforma |
| Coordinación del piloto | Escuelas, visitas, reportes, relación con aliados | Medio tiempo durante el piloto | Presupuesto del piloto |

Con estudiantes practicantes: pedir a la universidad un convenio de práctica
supervisada, y que firmen la cesión de derechos de lo que aporten
([FORMALIZACION.md](FORMALIZACION.md)).

## Accesos: lo mínimo necesario

| Acceso | Desarrollador nuevo | Responsable del proyecto |
|---|---|---|
| Repositorio en GitHub | Sí (pull requests, sin publicar directo en `main`) | Sí |
| Proyecto Supabase **de prueba** | Sí | Sí |
| Proyecto Supabase de **producción** | No | Sí |
| Secretos (Groq, VAPID, SMS, `CRON_SECRET`) | No | Sí |
| Datos reales de estudiantes | No | Sí |

## Primera semana

| Día | Actividad | Resultado |
|---|---|---|
| 1 | Leer `README.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`. Usar la app de producción con una cuenta de prueba como estudiante y como docente | Entiende qué hace la plataforma y para quién |
| 2 | Levantar su copia con `docs/SETUP.md` y su propio proyecto Supabase de prueba | App corriendo en su computadora |
| 3 | Correr las pruebas (`npm install`, `npm test`); recorrer `js/main.js`, `js/auth.js` y un juego (`js/duels.js`) | Sabe dónde está cada cosa |
| 4 | Primera tarea chica de la lista de abajo | Primer pull request |
| 5 | Revisión del pull request con el responsable; conversación sobre seguridad (RLS, datos de menores) | Primer cambio aprobado |

## Primeras tareas (sin riesgo, alto valor)

Tareas acotadas para aprender el proyecto. Cada una es un pull request.

- [ ] **Pruebas de humo nuevas**: una prueba por pantalla pública más (por ejemplo, que el formulario de login muestre un error claro con usuario vacío).
- [ ] **Accesibilidad**: revisar que botones con solo ícono tengan `title` o `aria-label` (empezar por `js/students.js`).
- [ ] **Limpieza**: `js/pdf-processor-new.js` parece no usarse; confirmarlo y proponer quitarlo.
- [ ] **Scripts viejos**: revisar `scripts/fix-*.js` y `scripts/*.py` (arreglos de una sola vez) y documentar o archivar.
- [ ] **Estados vacíos**: pantallas que muestran solo un spinner si falla la red; agregar un mensaje con "Reintentar".
- [ ] **Traducción de errores**: mensajes técnicos de Supabase que llegan al usuario tal cual; mapearlos a texto claro.
- [ ] **Documentar** una Edge Function por semana con un ejemplo de llamada en su encabezado.

Tareas medianas, después del primer mes:

- [ ] Sincronización del nodo escolar por memoria USB.
- [ ] Pruebas de interfaz con sesión iniciada (necesitan usuarios de prueba en el proyecto de prueba).
- [ ] Pasar las migraciones a la CLI de Supabase con fecha en el nombre.
- [ ] Registro de errores en producción (por ejemplo Sentry, plan gratis).

## Cómo trabajamos

- Todo cambio entra por **pull request** revisado por otra persona, con la plantilla completa.
- Las **pruebas de humo** y la **CI** tienen que pasar en verde.
- Una conversación semanal corta (30 minutos): qué se hizo, qué bloquea, qué sigue. `PENDIENTES.md` es la lista común.
- Las decisiones importantes (seguridad, datos, arquitectura) se anotan en el pull request o en `docs/`.

## Pruebas automáticas

```bash
npm install
npm test
```

En Windows, si el navegador que descarga Playwright no abre, usar el Chrome
instalado:

```powershell
$env:PW_CHANNEL = 'chrome'; npm test
```

Las pruebas (`tests/smoke.spec.js`) no inician sesión ni tocan datos: abren la
app, la política de privacidad y el portal de padres en un celular y una
computadora simulados, y verifican que no haya errores, que el modo sin
conexión se instale y que la versión coincida con la del caché. Corren solas
en GitHub en cada cambio (`.github/workflows/smoke-tests.yml`).
