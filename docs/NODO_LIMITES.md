# Límites conocidos del nodo escolar

Qué aguanta el nodo, qué no hace y cómo medirlo en cada escuela. Léelo antes de prometerle algo a una escuela.

> **Honestidad sobre los números.** Lo único **medido con una Raspberry real en una escuela** es lo que dice el piloto
> (`docs/PILOTO_RURAL.md`): *15 a 20 tablets a la vez, cómodo*. Los demás valores de abajo son **cálculos y
> recomendaciones prudentes**, marcados como tales. La herramienta `school-node/herramientas/prueba-de-carga.mjs`
> permite medir de verdad en cada instalación (sección 3); cuando tengas mediciones reales, anótalas en la tabla 2.

## 1. Capacidad recomendada

| Estudiantes con la app abierta a la vez | Recomendación | Condición |
|---|---|---|
| **Hasta 20** | **Recomendado** (es lo que se probó en el piloto) | Raspberry Pi 4 de 4 GB, router o punto de acceso aparte, microSD de calidad o SSD |
| **21 a 40** | **Probable, hay que medirlo** | Todo lo anterior + SSD por USB + red con router/punto de acceso de buena señal + correr `prueba-de-carga.mjs` con ese número y que dé «BIEN» |
| **Más de 40** | **No recomendado** sin medición previa | Dividir por turnos o por salones; el proyecto parte de una Raspberry por escuela |

«A la vez» significa tablets **con la app abierta y usándola**, no la matrícula. Una escuela de 300 estudiantes con
turnos de 20 está dentro de lo recomendado.

## 2. Por qué esos números (qué limita realmente)

Lo que se sabe del diseño, de menor a mayor importancia práctica:

1. **El Wi-Fi, casi siempre antes que la Raspberry.** El código de la app (JavaScript, CSS y página) pesa 2,3 MB (medido en el repositorio),
   más unas librerías en `vendor/`. Desde esta versión el nodo entrega ese texto **comprimido (gzip): 0,6 MB** (medido). Pero un estudiante que
   abre la app por primera vez (o después de una actualización) la baja completa:
   | Tablets abriendo a la vez | Datos a servir (≈0,6 MB cada una, estimado) | Tiempo con 30 Mbit/s reales de Wi-Fi compartido |
   |---|---|---|
   | 20 | ≈ 12 MB | ≈ 3 s |
   | 40 | ≈ 24 MB | ≈ 6 s |
   Es un **cálculo**; el Wi-Fi real en un salón (paredes, interferencia, tablets viejas) rinde menos. Los videos de los
   cursos pesan mucho más que la app: 20 tablets viendo un video de 100 MB al mismo tiempo mueven 2 GB. **Escalona las
   actividades con video** o usa tablets con los videos ya descargados.
2. **Hotspot propio de la Raspberry (`--hotspot`).** El Wi-Fi integrado de la Raspberry como punto de acceso es lo más
   débil del conjunto: úsalo para **pocas tablets (unas 10 a 15)** o cuando no hay otra opción. Con **router o punto de
   acceso** aparte (la Raspberry por cable) se llega a la capacidad recomendada.
3. **El almacenamiento.** Una microSD barata es lenta para leer muchos videos a la vez y se daña con cortes de luz. Un
   **SSD por USB** (o microSD «high endurance») es la mejora más barata de rendimiento y duración.
4. **Un solo proceso.** El servidor es una sola aplicación de Node: el trabajo de CPU (iniciar sesión con PIN usa un
   cálculo deliberadamente costoso, 150 000 vueltas) se hace de uno en uno. **Muchos estudiantes iniciando sesión en el
   mismo segundo** se forman en fila: si el salón entero entra a la vez, espera unos segundos. Pide que entren **de a
   grupos** o que dejen la sesión abierta (se conserva).
5. **La base es SQLite.** Escribe de a una operación a la vez (modo WAL): cómodo para decenas de estudiantes, no para
   cientos de escrituras por segundo.
6. **Memoria.** 4 GB sobran para el uso normal. Con 2 GB funciona pero no se recomienda con más de ~10 tablets.

**Mediciones propias.** Prueba de la herramienta contra el servidor real **en una PC de desarrollo** (misma máquina, sin
red de por medio, solo la página de entrada y sus archivos): 10, 30 y 60 tablets simuladas abrieron todas sin errores
y en menos de 0,2 s. Eso solo demuestra que el servidor no tiene un cuello de botella de software en lo que se midió; **no
dice nada del Wi-Fi ni de la Raspberry**. La medición válida es la de la sección 3, desde otra computadora hacia la
Raspberry de la escuela.

| Fecha | Escuela / equipo | Red | Tablets simuladas | Abrir (95 %) | Errores | Veredicto |
|---|---|---|---|---|---|---|
| *(anota aquí tus mediciones)* | | | | | | |

## 3. Cómo medir en una escuela (10 minutos)

Desde **otra computadora conectada a la misma red** que la Raspberry (no desde la Raspberry misma):

```bash
node school-node/herramientas/prueba-de-carga.mjs --url http://quetzal.local --alumnos 20 --segundos 60
```

Sube el número (`--alumnos 30`, `40`) hasta que el veredicto deje de ser «BIEN». Lee la línea «Abrir la app»: si el 95 %
tarda más de 15 s, ese número ya es mucho para esa red. La prueba **no inicia sesión ni toca datos de estudiantes**;
simula la apertura de la app y las consultas de estado.

Para medir durante una clase real, desde la Raspberry (SSH): `top` (uso de CPU y memoria), `vcgencmd get_throttled`
(`0x0` es bien; otro valor es falta de energía o calentamiento) y `df -h /` (espacio).

## 4. Límites de funcionamiento (no de capacidad)

| Tema | Límite | Detalle |
|---|---|---|
| Proyectos de estudiantes | **150 MB** por archivo; **5 pendientes** por estudiante | Video o modelo 3D; el nodo rechaza si queda **menos de 2 GB libres** (`minFreeDiskMB`) |
| Videos de proyectos de la propia escuela (copia local) | **150 MB** por archivo, **3 GB** en total, **8 archivos** por sincronización (los más nuevos primero) | Se bajan al sincronizar para verse sin internet (`projectMirrorMaxFileMB`, `projectMirrorMaxMB`, `projectMirrorPerRun`); no entran en el respaldo; los de otras escuelas solo se ven con internet |
| Proyectos ya subidos a la nube | Se borran del nodo a los **7 días** (`keepSyncedProjectDays`) | Para no llenar el disco |
| Sincronización | Cada **10 minutos** con internet (`syncEveryMinutes`) y al detectar internet | Los cambios de ese intervalo se pierden si la tarjeta se daña antes de subir (ver `docs/NODO_RESPALDO.md`) |
| Sin internet | **IA y notificaciones no funcionan** | Todo lo demás de la plataforma sí (`school-node/README.md`) |
| Comentarios con imagen adjunta, algunos catálogos | Requieren internet | Mensaje claro en pantalla |
| Reloj | La Raspberry **no tiene reloj propio** | Tras un apagón sin internet la hora puede desfasarse (afecta el cofre diario y fechas de avisos); se corrige sola con internet |
| Código de docente | **5 intentos** fallidos bloquean 5 minutos | Protección contra adivinar el código |
| Cursos y videos | Ocupan disco | El instalador exige **2 GB libres** como mínimo; planifica **32 GB o más** según cuántos cursos con video baje la escuela |
| Dirección del nodo | `quetzal.local` funciona en la mayoría de tablets Android modernas y iPhone | Algunas Android viejas no resuelven `.local`: usar la IP (reservada en el router) |
| Una Raspberry por escuela | Dos nodos en la misma red chocan en el nombre `quetzal` | Cambiar `hostName` en `config.json` si fuera necesario |
| HTTPS | El nodo sirve por HTTP | Suficiente para la red local; funciones que exigen HTTPS (cámara) no están disponibles |
| Cortes de luz | La base resiste cortes (WAL), pero **cada corte brusco de energía acerca el daño de la microSD** | Usar regulador/UPS o SSD |

## 5. Señales de que el nodo está pasado

- Abrir la app tarda más de 10 s o hay tablets que no cargan: revisa Wi-Fi antes que Raspberry (acerca la tablet al router).
- `vcgencmd get_throttled` distinto de `0x0`: fuente de poder insuficiente (usar la oficial de 5V 3A) o calor.
- Disco casi lleno (`df -h /`): borra cursos que no se usan o pasa a una tarjeta más grande.
- Muchos «pendientes» que no bajan (`pending_changes` en el chip de estado): problema de internet, no de capacidad.

## 6. Qué hacer si una escuela supera el límite

1. Medir (sección 3) antes de cambiar nada.
2. Pasar a router/punto de acceso por cable + SSD si todavía no lo tiene.
3. Escalonar: entradas por grupos, videos por turnos, videos descargados previamente.
4. Solo entonces considerar un segundo nodo en otro salón con **su propia** red; se registra como un nodo aparte en el
   panel (decisión de arquitectura: hoy el proyecto parte de **una Raspberry por escuela**).
