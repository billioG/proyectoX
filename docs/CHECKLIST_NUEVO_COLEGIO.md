# Checklist de infraestructura para un colegio nuevo

Para marcar con la escuela, de principio a fin. Imprímelo o cópialo por colegio. Cada punto tiene un **responsable**
(quién lo hace) y una **forma de comprobarlo** (cómo sabes que quedó).

Datos del colegio: nombre _______________  código _______  fecha _______  quién instaló _______________

## A. Antes de ir (con el colegio y desde Quetzal en línea)

- [ ] **Compromiso del colegio:** una persona de contacto, un docente encargado y un salón/espacio donde dejar el equipo
      (seco, ventilado, con enchufe fijo y protegido).
- [ ] **Estudiantes y clases cargados** en Quetzal en línea: escuela creada con su código, docentes asignados a sus
      grados y secciones, estudiantes activos. *Se comprueba:* en Quetzal, el docente ve sus clases y estudiantes.
- [ ] **Cada clase tiene contraseña de clase** (el instalador lo recuerda al final; los estudiantes la necesitan).
- [ ] **Nodo registrado** en el panel de administración (Servidores). *Se comprueba:* aparece en la lista y se puede copiar
      su **token** (64 letras y números). No compartas el token por chats públicos.
- [ ] **Migraciones y funciones de la nube al día** (las hace el dueño del proyecto; ver `docs/MIGRATIONS.md`).
      *Se comprueba:* todas las filas de `docs/MIGRATIONS.md` están ejecutadas y la función `node-sync` está desplegada
      con **todos** sus archivos (hoy son 15 en `supabase/functions/node-sync/`, recontado el 12/11/2026) y Verify JWT en OFF.
- [ ] **Cursos asignados** a los grados de la escuela (para que se descarguen al nodo).

## B. Equipo

- [ ] Raspberry Pi 4 (**4 GB**), fuente oficial 5 V 3 A, caja con ventilación.
- [ ] **microSD de 32 GB o más, de marca y «high endurance»** (o SSD por USB, que es mejor). Una microSD de repuesto
      grabada con la misma imagen.
- [ ] **Router o punto de acceso** de la escuela con cable de red a la Raspberry (preferible al hotspot propio; el
      hotspot sirve para pocas tablets, ver `docs/NODO_LIMITES.md`).
- [ ] Cable de red, regleta con protección; **UPS o regulador** si la luz de la zona es inestable.
- [ ] Memoria USB de **16 GB o más** (para el respaldo y para llevar contenido sin internet).
- [ ] Tablets o celulares de los estudiantes cargados y con el navegador actualizado (Chrome recomendado).

## C. Instalación (elige una vía)

**Vía 1 — Imagen de microSD** (`docs/NODO_IMAGEN_MICROSD.md`)

- [ ] Imagen grabada; `quetzal.txt` con el token (y el Wi-Fi si aplica); Raspberry encendida y 3 minutos de espera.
- [ ] `http://quetzal.local` abre desde otra computadora. *Se comprueba:* aparece la pantalla de ingreso.
- [ ] **Código de docente** leído de `quetzal-codigo-docente.txt` y guardado en un lugar seguro.

**Vía 2 — Instalador** (`school-node/README.md`)

- [ ] `bash install.sh --check` dice «Todo en orden».
- [ ] `curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash -s -- --auto --token=TOKEN`
      termina con **TODO LISTO** (y no con «FALTA algo»).
- [ ] Código de docente anotado.

## D. Red

- [ ] **Router del kit preparado** (IP reservada **y** DNS apuntando a la Raspberry): `docs/NODO_KIT_ROUTER.md`. *Se comprueba:*
      `http://quetzal.local/api/node/status` muestra `dns.clients` mayor que 0 y `quetzal.local` abre en una tablet con Android viejo.
- [ ] **IP de la Raspberry reservada en el router** (reserva DHCP por dirección MAC). *Se comprueba:* tras reiniciar el
      router, la Raspberry conserva la IP.
- [ ] `http://quetzal.local` abre desde una tablet Android y desde un celular; si alguna no abre, anotar la IP
      (`http://IP`) como respaldo. Sin cámara (HTTP), **Tomar Asistencia** usa la lista rápida; HTTPS es opcional
      (`school-node/https-setup.sh`, sin probar en una Raspberry real).
- [ ] Si usa **hotspot** (`--hotspot`): anotada la contraseña que se mostró al final.
- [ ] **Cartel con QR** impreso (`http://quetzal.local/cartel`) y pegado en el salón.
- [ ] El router **no tiene aislamiento de clientes** (las tablets deben ver a la Raspberry).

## E. Sincronización y datos

- [ ] **Primera sincronización terminada.** *Se comprueba:* el chip de estado del nodo dice sincronizado, o en Quetzal
      → «Servidor de la escuela» aparece **En línea** y `pending_changes` en 0.
- [ ] **Cursos y archivos descargados.** *Se comprueba:* `http://quetzal.local/api/node/status` con `pending.files` en `0`.
- [ ] Un **estudiante de prueba** entra con su usuario y la **contraseña de su clase**, abre un curso con video/PDF **sin
      internet** (desconectando el router del internet) y termina una lección. *Se comprueba:* `"rest": true` en
      `/api/node/status` (si es `false`, falta la primera sincronización o alguna clase no tiene contraseña de clase).
- [ ] Cada **docente** entra al nodo con su **correo y la misma contraseña** de Quetzal en línea (sin PIN aparte; el nodo la
      recibe cifrada al sincronizar con internet). *Se comprueba:* entra sin internet.
- [ ] Lo que **no** funciona sin internet se explicó al docente: asistente con IA, retos de comprensión, ortografía y
      depuración, tienda, pase de temporada y chat de la mascota.
- [ ] Se probó **sincronizar desde Quetzal en línea** (botón «Sincronizar ahora» en «Servidor de la escuela»).

## F. Respaldo y seguridad

- [ ] **Respaldo diario activo:** `systemctl list-timers quetzal-backup.timer` muestra la próxima ejecución
      (`docs/NODO_RESPALDO.md`). Se hizo un respaldo a mano y `node backup.js --list` lo muestra.
- [ ] **Memoria USB** conectada; se vio una copia en `quetzal-respaldos/`.
- [ ] **Contraseña de administrador de la Raspberry cambiada** (`passwd`) y guardada por el proyecto, no por el colegio.
- [ ] El **token y el código de docente** se entregaron solo al responsable. *No* están en carteles ni en chats.
- [ ] Una persona del colegio sabe: encender/apagar bien (`sudo poweroff`, no desenchufar), a quién llamar y qué hacer si
      se va la luz.

## G. Capacidad

- [ ] **Prueba de carga** desde otra computadora con el número de tablets que usará la escuela
      (`docs/NODO_LIMITES.md`, sección 3): veredicto «BIEN». Anotada en la tabla de mediciones.
- [ ] Lo único medido en una escuela real son **15 a 20 tablets a la vez**; con más no hay medición real.
- [ ] Si superan **20 tablets a la vez**: SSD por USB, router/punto de acceso por cable y escalonar los videos.
- [ ] `vcgencmd get_throttled` da `0x0` durante una clase real.

## H. Capacitación y entrega

- [ ] Los docentes ingresaron al nodo, vieron «Servidor de la escuela» y «Buzón de la clase».
- [ ] El docente encargado sabe: sincronizar, qué significa «sin internet» y a quién escribir.
- [ ] **Acta de entrega** firmada: equipo, serie, token entregado a ___, fecha.
- [ ] Datos de contacto del soporte entregados por escrito.

## I. Mantenimiento (agendar al entregar)

| Cuándo | Qué | Hecho |
|---|---|---|
| Cada semana | Mirar «Servidor de la escuela» en Quetzal: En línea, sin errores, `pending_changes` bajo | |
| Cada mes | Llevarse una copia del respaldo (USB) y revisar espacio libre (`df -h /`) | |
| Cada trimestre | **Prueba de restauración** en una Raspberry de prueba (`docs/NODO_RESPALDO.md`, sección 6). Anotar fecha y resultado: | |
| Con cada versión nueva | «Actualizar servidores» (administrador, en la plataforma) o `bash ~/quetzal/school-node/install.sh --update` (conserva estudiantes y configuración; desde v1.0.266 tolera cambios locales en el programa) | |
| Cada año | Cambiar la microSD por una nueva (las microSD se desgastan) | |

Firmas: instalador _______________   responsable del colegio _______________
