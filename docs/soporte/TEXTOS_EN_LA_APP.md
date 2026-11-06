# Textos de ayuda y de error dentro de la app

Qué se cambió para que la persona **no necesite escribirle a soporte**, cómo escribir mensajes nuevos y qué falta. Todo el texto nuevo vive en un solo archivo:
**`js/help-messages.js`**.

## 1. Cómo escribir un mensaje de la app (guía de estilo)

1. **Dos partes:** *qué pasó* + *qué hacer*. «No hay conexión. Revisa tu internet y vuelve a intentar.»
2. **Habla de tú** y sin culpar: «Falta el título», no «Ingresaste mal el título».
3. **Sé específico:** «La descripción tiene 12 caracteres y necesita 40», no «Completa todos los campos».
4. **Sin jerga ni códigos:** nada de «RLS», «JWT», «42501», «PGRST202». Si hace falta el detalle técnico para soporte, va aparte («Detalle para soporte: …») y recortado.
5. **Dos frases como máximo** en un aviso; lo largo va en la ayuda de la pantalla.
6. **Di si se perdió algo.** En asistencia y proyectos: «Quedó guardado y se subirá solo». Es lo que más tranquiliza.
7. Los avisos de error se ven **6 segundos**: que quepa en una lectura.

## 2. Lo que ya está hecho

### Ayuda dentro de la pantalla (botón «Ayuda»)
| Dónde | Botón | Tema (`HELP_TOPICS`) |
|---|---|---|
| Pantalla de entrada | «¿Necesitas ayuda para entrar?» | `ingreso` |
| Tomar Asistencia | «Ayuda» (junto a «ACTIVO») | `asistencia` |
| Subir Proyecto | «¿Cómo subo mi proyecto?» | `proyecto` |
| (para usar en cualquier botón) | `window.openHelp('sincronizacion')` | `sincronizacion` (qué significa CONECTADO / PENDIENTE / SIN CONEXIÓN) |

Cada tema trae pasos numerados, consejos y los 2–3 problemas más comunes con su solución. Se cierra con la X, tocando fuera o con Escape.

### Avisos de error más claros
| Situación | Antes | Ahora |
|---|---|---|
| Cámara no abre (asistencia) | «Error de cámara» | Dice **por qué** (permiso, otra app, sin cámara, o dirección `http` del servidor escolar) y qué hacer |
| Código QR ajeno | (nada; fallaba en silencio) | «Ese código QR no es de un estudiante de Quetzal. Usa las credenciales impresas…» (un aviso cada 4 s, no uno por cuadro) |
| Se lee un QR sin elegir clase | Se registraba con datos vacíos | «Primero elige tu clase en «Equipo en Aula»» |
| Asistencia registrada | «Asistencia registrada (Pendiente Sync)» | «Asistencia registrada»; sin internet: «…Se subirá sola cuando vuelva el internet» |
| Subir proyecto con algo faltante | «Completa todos los campos» | Dice **cuál** falta y cuánto (título, descripción con conteo, archivo, formato, tamaño) |
| Proyecto guardado | «Proyecto guardado (Pendiente Sync)» | «Proyecto guardado. Aparecerá en Inicio cuando termine de sincronizar (mira el indicador de abajo).» |
| Error al guardar proyecto | «Error al guardar proyecto» | Según la causa: sin conexión (**quedó guardado**), archivo pesado, sin permiso… |
| Entrar con datos malos | `Invalid login credentials` (inglés) | «Usuario o contraseña incorrectos. Docentes: tu correo completo… Estudiantes: tu usuario y la contraseña de tu clase…» |
| Cambiar / recuperar contraseña | Texto técnico | Mensaje en español según la causa |

Además, **todo** aviso de error de la app pasa por `friendlyErrorText` (la tabla de `js/help-messages.js`): los textos técnicos de la base de datos y de la red
(«violates row-level security», «Failed to fetch», «duplicate key»…) se cambian por una frase clara. Lo que ya estaba escrito en español para personas se deja igual.

## 3. Pendiente (propuesto, no hecho)

| Propuesta | Por qué | Esfuerzo |
|---|---|---|
| **Pasar lista sin cámara** (tocar al estudiante en la lista) | Hoy la única forma es el QR. Sin cámara (servidor escolar `http`, celular sin cámara) el docente se queda sin opción. **Es una decisión de producto**: el QR es la prueba de presencia; un botón manual la debilita. Si se decide, que quede **registrado como «manual»** | Medio |
| ~110 avisos que muestran `err.message` tal cual (`lessons.js` 15, `students.js` 10, `companion.js` 9, `random-events.js` 7, `teachers.js` 7…) | La tabla general ya cambia los técnicos conocidos; los demás se ven como «Algo no salió bien» solo si pasan por `friendlyError` con su contexto | Bajo por pantalla: usar `window.friendlyError(err, 'contexto')` |
| ~35 mensajes «Error al …» sin causa | Decir qué hacer, como en asistencia y proyectos | Bajo |
| Botón **Ayuda** en *Evaluar Proyectos*, *Cursos* y *Gestionar Estudiantes* | Son las siguientes pantallas del docente | Bajo: agregar un tema a `HELP_TOPICS` y un botón |
| Mensajes de **pantalla vacía** («No hay nada aquí») con la acción que sigue | Un docente nuevo ve listas vacías sin saber por qué | Bajo |
| Ordenar las 10 preguntas con **consultas reales** | Hoy salen de recorrer los flujos | — |

## 3 bis. Cómo agregar un tema de ayuda o un mensaje

1. **Tema de ayuda:** en `HELP_TOPICS` (`js/help-messages.js`) agrega `{ title, icon, steps, tips?, problems }` y un botón `onclick="window.openHelp('mi-tema')"`.
2. **Mensaje de error de una pantalla:** `const f = window.friendlyError(err, 'attendance' | 'upload' | 'login' | …); showToast('… ' + f.message, 'error')`.
   Un contexto nuevo se agrega en `friendlyError` (reglas por contexto) y en el diccionario de mensajes genéricos.
3. **Validación de un formulario:** una función pura como `validateProjectForm` que devuelva el primer problema o `null`.
4. Corre `node --test tests-unit/help-messages.test.mjs` y actualiza esta página y la **Guía rápida de soporte**.

## 4. Cómo se prueba
`tests-unit/help-messages.test.mjs` (Node, sin navegador) revisa: cada error conocido → su mensaje; que un mensaje técnico o en inglés **nunca** llegue a la persona; los textos de validación; que la ayuda no
rompa con caracteres especiales (se escapan); que los temas que mencionan estos documentos existan; y que las pantallas usen el módulo.
