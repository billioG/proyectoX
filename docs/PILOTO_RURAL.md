# Paso 4 · Piloto rural sin internet

Demostrar que Quetzal LMS funciona en escuelas **sin conectividad**, con el
nodo escolar en Raspberry Pi, y documentar costos y resultados reales. Es la
evidencia más fuerte para MINEDUC, UNICEF y fundaciones.

## Objetivos

1. Que 3 a 5 escuelas rurales usen la plataforma al menos 2 veces por semana durante un semestre, sin internet en la escuela.
2. Medir aprendizaje con la prueba de entrada y salida ([MEDICION_IMPACTO.md](MEDICION_IMPACTO.md)).
3. Conocer el **costo real por estudiante al año**.
4. Registrar qué falla (energía, equipos, sincronización, capacitación) y cómo se resolvió.

## Cómo elegir las escuelas

| Criterio | Por qué |
|---|---|
| Sin internet estable en la escuela | Es el caso que queremos probar |
| Director y al menos un docente con interés | Sin compromiso local el piloto no se sostiene |
| Energía eléctrica al menos parte del día (o plan solar) | El nodo y las tablets necesitan carga |
| Docente que viaja a una zona con señal al menos una vez por semana | Para sincronizar el nodo (o por USB) |
| 15 a 40 estudiantes en los grados del piloto | Un nodo atiende cómodo a 15–20 tablets a la vez (lo único medido en una escuela real; más de 20 no se ha probado, ver `docs/NODO_LIMITES.md`) |
| Acceso razonable para visitas de acompañamiento | Soporte en persona el primer mes |

Incluir, si se puede, una escuela con electricidad inestable para probar el
kit solar.

## Equipo por escuela

Precios aproximados en dólares (septiembre de 2026); **verificar precios
locales** antes de presupuestar.

| Componente | Cantidad | Costo aproximado |
|---|---|---|
| Raspberry Pi 4 (4 GB) | 1 | US$ 60 – 75 |
| Tarjeta microSD 64 GB (clase A1 o A2) | 1 | US$ 10 – 15 |
| Fuente oficial USB-C y case con ventilador | 1 | US$ 20 – 25 |
| Router Wi-Fi básico (si la escuela no tiene) | 1 | US$ 25 – 35 |
| **Subtotal nodo** | | **US$ 115 – 150** |
| Kit solar (panel 50–100 W, batería, controlador) — solo si no hay energía estable | 1 | US$ 100 – 180 |
| Tablets Android de 8–10" (si la escuela no tiene) | 10 – 20 | US$ 80 – 130 c/u |
| Memoria USB para sincronizar sin señal | 1 | US$ 8 |

Costos que no son equipo: transporte para instalación y visitas, capacitación
docente (2 sesiones de medio día), recarga de datos del docente para
sincronizar, y el tiempo de acompañamiento.

## Calendario (un semestre)

| Mes | Actividad |
|---|---|
| 0 | Selección de escuelas, convenio con el director, consentimientos de familias ([PRIVACIDAD_Y_CONSENTIMIENTO.md](PRIVACIDAD_Y_CONSENTIMIENTO.md)) |
| 1 | Instalar el nodo (`school-node/README.md`), cargar cursos, dar a cada clase su contraseña de clase; capacitación 1; prueba de entrada. Preparar el router del kit (`docs/NODO_KIT_ROUTER.md`) si se usa el kit |
| 1–2 | Visita semanal o llamada; resolver problemas; registrar incidentes |
| 3 | Capacitación 2 (uso avanzado: juegos, tema de la semana, avisos a padres por SMS) |
| 3–5 | Uso normal; sincronización semanal; revisar el tablero de impacto |
| 6 | Prueba de salida; entrevistas cortas a docentes, estudiantes y padres; reporte |

## Roles

| Rol | Responsabilidades |
|---|---|
| Coordinación del piloto | Relación con escuelas, calendario, reporte final |
| Soporte técnico | Instalación, sincronización, resolver fallas |
| Docente enlace (uno por escuela) | Usar la plataforma con su grupo, sincronizar el nodo, avisar problemas |
| Director | Autorizar, facilitar horarios y espacio para el equipo |

## Qué registrar

- Semanal: estudiantes activos, sesiones, lecciones, sincronizaciones hechas (tablero de impacto y registros del nodo).
- Incidentes: fecha, qué pasó (energía, equipo, software, capacitación), cómo se resolvió y cuánto tardó.
- Costos reales: equipo, transporte, datos, horas de acompañamiento.

## Criterios de éxito

| Indicador | Meta |
|---|---|
| Estudiantes activos cada semana | 70 % o más de los inscritos |
| Uso por estudiante activo | 60 minutos o más por semana |
| Sincronización | Al menos una vez por semana en cada escuela |
| Continuidad | Ninguna escuela más de 2 semanas sin poder usar la plataforma |
| Aprendizaje | Mejora del grupo de uso mayor que la del grupo de comparación |
| Costo | Costo por estudiante al año calculado y documentado |

## Riesgos y cómo reducirlos

| Riesgo | Mitigación |
|---|---|
| Cortes de energía | Kit solar o batería; el nodo guarda todo en la tarjeta y retoma solo |
| Tarjeta microSD dañada | Tarjeta de repuesto con la imagen lista; sincronizar seguido para no perder progreso |
| El docente no llega a zona con señal | Sincronización por memoria USB (ya existe, `school-node/usb-sync.js`; **falta probarla con una Raspberry real**, ver `PENDIENTES.md`) |
| Tablets compartidas entre alumnos | Cada estudiante entra con su usuario y la contraseña de su clase (los docentes, con su contraseña de siempre) |
| Tablets Android 11 o anterior no abren `quetzal.local` | Kit de router preparado (`docs/NODO_KIT_ROUTER.md`) o usar la IP del cartel; el servidor de nombres del kit no se ha probado todavía con tablets reales |
| Un nodo no se actualiza por tener cambios locales | Desde v1.0.266 «Actualizar servidores» los guarda aparte y sigue |
| Rotación del docente | Capacitar a dos personas por escuela |
| Robo o daño del equipo | Guardar el nodo con llave; acta de entrega al director |

## Pendiente antes de empezar

- [ ] Completar el nodo escolar (ver sección "Nodo escolar" de `PENDIENTES.md`). Ya existen el instalador de un comando, la sincronización por USB y HTTPS opcional; la sincronización por USB y el HTTPS **no se han probado en una Raspberry real** (hay que probarlos).
- [ ] Probar el kit de router (`docs/NODO_KIT_ROUTER.md`, sección 3) con un router y tablets reales, incluida una con Android 11 o anterior.
- [ ] Probar la imagen de tarjeta microSD (`docs/NODO_IMAGEN_MICROSD.md`, sección 4) en una Raspberry real; los scripts solo se han probado con simulación.
- [ ] Presupuesto final con precios locales.
- [ ] Elegir escuelas y firmar convenios.
