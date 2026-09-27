# Paso 3 · Medir el impacto

Los aliados no financian funciones: financian **evidencia de que los
estudiantes aprenden más**. Este documento define qué medimos, cómo, y con
qué calendario.

## 1. Tablero de impacto ✅ (ya en la plataforma)

Menú del admin → **Impacto** (`js/impact.js`, `migrations/impact-metrics.sql`).
Por establecimiento y período, sin nombres:

| Indicador | Qué significa | Para qué sirve |
|---|---|---|
| Estudiantes inscritos | Cuentas activas (sin bajas) | Alcance |
| Estudiantes activos y % | Entraron al menos una vez en el período | Adopción real |
| Minutos por estudiante activo | Tiempo con la app abierta y en uso | Intensidad de uso |
| Lecciones completadas | Recursos de cursos terminados | Avance en contenidos |
| Duelos de conocimiento | Duelos 1v1 terminados | Práctica y motivación |
| Asistencia promedio | Presentes y tardanzas sobre registros con QR | Permanencia escolar |
| Estudiantes con familia registrada | Al menos un padre o encargado cargado | Participación de las familias |
| Tendencia mensual | Activos y lecciones por mes, 6 meses | Uso sostenido en el tiempo |

Botones: **Exportar CSV** y **Copiar resumen para postulaciones** (un párrafo
listo para pegar).

## 2. Prueba de entrada y salida (aprendizaje)

El uso no prueba aprendizaje. Para eso: la misma prueba corta al empezar y al
terminar un período, comparando con un grupo que todavía no usa la plataforma.

### Diseño

| Elemento | Propuesta |
|---|---|
| Área | Una sola por ciclo: pensamiento lógico-matemático o comprensión lectora, alineada al Currículo Nacional Base (CNB) del grado |
| Prueba | 15 a 20 preguntas de opción múltiple, 30 minutos, preparadas con un docente del grado |
| Momentos | Entrada (semana 1) y salida (semana 12 a 16), misma prueba o dos formas equivalentes |
| Grupo de uso | Secciones que usan Quetzal LMS al menos 2 veces por semana |
| Grupo de comparación | Otra sección del mismo grado y escuela que entra a la plataforma **después** del estudio (así nadie se queda sin ella) |
| Resultado principal | Diferencia de mejora entre grupos (puntos promedio y tamaño del efecto) |

### Cómo aplicarla

- **Escuelas con internet o con nodo escolar**: crear un curso "Diagnóstico [área] [grado]" con un recurso de tipo quiz, asignado a los grupos del estudio. Las notas quedan en la plataforma.
- **Sin dispositivos para todos**: versión en papel, y el docente carga los puntajes.
- Siempre: los mismos estudiantes en entrada y salida; registrar ausentes.

### Ética

- Consentimiento de las familias (ver [FORMALIZACION.md](FORMALIZACION.md)).
- La prueba no cuenta para la nota del estudiante.
- Los resultados se reportan agregados por grupo, nunca por nombre.
- El grupo de comparación recibe la plataforma al terminar.

## 3. Calendario sugerido

| Semana | Actividad |
|---|---|
| 1–2 | Elegir área y grado; preparar la prueba con docentes; consentimientos |
| 3 | Prueba de entrada en los dos grupos |
| 3–14 | Uso normal de la plataforma; revisar el tablero cada 2 semanas |
| 15 | Prueba de salida en los dos grupos |
| 16 | Análisis y reporte de una página |

## 4. Reporte de resultados

Una página, con:

1. Contexto: escuelas, grados, número de estudiantes por grupo.
2. Uso: activos, minutos, lecciones (del tablero).
3. Aprendizaje: promedio de entrada y salida por grupo, diferencia de mejora.
4. Voces: 2 o 3 frases de docentes, estudiantes o padres (con permiso).
5. Qué aprendimos y qué cambiamos.

Una universidad (por ejemplo una facultad de educación o de ingeniería) puede
acompañar el análisis: da credibilidad y es requisito frecuente para fondos de
SENACYT.

## 5. Pendiente

- [ ] Correr `migrations/impact-metrics.sql`.
- [ ] Elegir área, grado y escuelas del primer estudio.
- [ ] Preparar la prueba con docentes del grado.
- [ ] Buscar una universidad aliada para el análisis.
