# Ensayo de demo a un colegio

Guion y lista de comprobación para presentar Quetzal LMS a un colegio o cliente. Está pensado para ensayarlo **una vez completo, sin público**, el día
anterior, con el plantel de demostración (datos inventados). Dura unos 20 minutos de presentación.

> **Regla de oro:** nunca se demuestra con un plantel que tenga menores reales. Se usa solo el plantel `DEMO-QUETZAL`
> («Colegio Demostración Quetzal», de `migrations/demo-school.sql`). No se muestra ninguna contraseña de clase en pantalla ni en materiales.

## 1. Una semana antes

- [ ] El CI de `main` está en verde (pestaña *Actions* de GitHub) y la versión publicada es la última (`clases.yoaprendo.online`, pie de página).
- [ ] `migrations/verificar-migraciones.sql` pegado en el SQL Editor: **todas las filas en `true`** (incluida la fase 9 y los índices de retos 760 a 764 si ya corriste `duel-one-open-pair.sql`).
- [ ] El plantel de demostración existe. Si no: crear el docente de demo desde la app (admin → Docentes) y correr `migrations/demo-school.sql` con tu contraseña de clase puesta en `v_class_password` (el script se niega a correr con la de ejemplo).
- [ ] **Asignar una ruta o curso publicado a las 2 clases del plantel demo** (era lo que faltaba): sin eso la sección de Cursos sale vacía.
- [ ] Tener a mano, **en tu gestor de contraseñas** y no en pantalla: usuario y contraseña del docente de demo, usuarios de 2 alumnos de demo y la contraseña de clase.
- [ ] Probar que un alumno de demo entra con usuario y contraseña de clase, y que el docente de demo entra con su correo.
- [ ] Revisar en la pestaña de **Impacto** del admin que el plantel demo no aparece en las cifras reales (queda fuera a propósito).

## 2. El día anterior: ensayo completo

Haz el guion de abajo entero, con el cronómetro, en el mismo equipo y la misma red que usarás. Anota lo que tarde más de lo esperado.

- [ ] Internet estable; **plan B**: hotspot del celular listo. La app necesita internet (el nodo escolar no se demuestra, ver sección 5).
- [ ] Navegador: **Chrome o Edge**. En Brave las notificaciones push pueden dar error si no activas «Use Google services for push messaging».
- [ ] Ventana privada o perfil limpio, para que no salgan sesiones o datos tuyos.
- [ ] Recarga la app dos veces para tomar la última versión (service worker) y sube el zoom si se proyecta.
- [ ] Una sola sesión por rol, en pestañas o navegadores distintos (alumno 1, alumno 2, docente, admin) para mostrar los duelos de punta a punta.

## 3. Guion de 20 minutos

| Min | Rol | Qué se muestra | Qué decir (idea) |
|---|---|---|---|
| 0–2 | — | Página para colegios (`colegios.html`) y la política de privacidad | Qué es, para quién, y cómo se cuidan los datos de menores |
| 2–6 | Estudiante 1 | Inicio, **Cursos** (un recurso: video, PDF o quiz), progreso y **Perfil** (nivel, gemas, mascota) | El alumno avanza a su ritmo; los premios los calcula el servidor, no el navegador |
| 6–11 | Estudiante 1 y 2 | **Centro de Juego**: un reto 1 contra 1 (Ahorcado o Contrarreloj) de punta a punta, y la **Práctica** solo | Juego con apuesta de gemas; el rival juega cuando pueda; también hay práctica sin rival |
| 11–13 | Estudiante | **Quetzadex** (mascotas de fauna guatemalteca con datos reales) y **Ranking** | Aprender jugando; el ranking explica su orden y no muestra apellidos completos |
| 13–17 | Docente | **Asistencia** (lista rápida y, si hay HTTPS, QR), **Evaluación de un proyecto** (rúbrica + apoyo de IA como segunda opinión), **Avisos** a la clase | Lo que ahorra tiempo al docente |
| 17–19 | Docente | **Padres**: ficha del alumno y envío del enlace del Portal de padres; abrir el enlace en ventana privada | Los padres ven avisos sin crear cuenta; consentimiento con fecha |
| 19–20 | Admin | **Impacto**: uso, lecciones, retos, asistencia, familias y tendencia (con datos del plantel demo) | Cifras para reportes y postulaciones, sin nombres |

Antes de cada bloque, ten abierta la pestaña del rol que toca, para no perder tiempo iniciando sesión en vivo.

## 4. Preguntas que suelen hacer

- **¿Dónde se guardan los datos de los niños?** En Supabase (Postgres con reglas por fila); la IA solo recibe el primer nombre; ver `privacidad.html`.
- **¿Y si no hay internet en la escuela?** Existe el nodo escolar, pero **no se promete** en la demo (sección 5).
- **¿Quién ve las contraseñas de los alumnos?** Ya no están en texto: se guardan con hash y cifrado; solo el personal autorizado puede verlas (`docs/SEGURIDAD_2026-11.md`, §3).
- **¿Cuánto cuesta / quién lo mantiene?** Responde solo con lo que ya esté acordado por escrito; no improvises cifras.

## 5. Qué NO mostrar ni prometer

- **El nodo escolar (Raspberry Pi)**: el instalador todavía no se probó en una Raspberry real ni en Windows con 20 o más celulares (`PENDIENTES.md`).
- **La importación de nóminas del SIRE** (PDF): no se ha probado en vivo con datos reales.
- **Notificaciones push** como parte central: dependen del navegador de cada persona.
- **Cifras de impacto** que no vengan de datos reales de un piloto.
- Cualquier dato de una escuela real o de menores reales.

## 6. Si algo falla en vivo

| Síntoma | Qué hacer |
|---|---|
| Pantalla en blanco o versión vieja | Recarga dos veces (Ctrl+Shift+R); si sigue, abre una ventana privada |
| Un alumno no entra | Revisa el usuario (minúsculas) y la contraseña de clase; ten un segundo alumno de demo listo |
| Un reto «tarda» | Espera; no toques varias veces (la app ya evita retos repetidos). Si quedó uno pendiente, «Cancelar» |
| Sin internet | Hotspot del celular; si no, muestra capturas o el video de la demo y retoma después |
| Error en una pantalla | Sigue con el guion; anótalo y envía una captura con la consola (F12) para arreglarlo después |

## 7. Después de la demo

- [ ] Anota las preguntas que no supiste responder y los tropiezos.
- [ ] Si el cliente quiere probar con alumnos reales: primero **consentimiento** (`docs/PRIVACIDAD_Y_CONSENTIMIENTO.md`), convenio con la escuela y un plantel nuevo; **no** con el plantel demo.
- [ ] Quita datos de prueba que hayas creado durante la demo (`migrations/demo-school-remove.sql` quita todo el plantel demo; no lo corras si lo vas a reutilizar).
