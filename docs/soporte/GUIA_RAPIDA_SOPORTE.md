# Guía rápida de soporte

Para **quien atiende dudas** de docentes, estudiantes y administradores de Quetzal. Una página para resolver el 80 % de los casos y saber qué
juntar cuando hay que escalar. Las respuestas listas para el docente están en [`PREGUNTAS_FRECUENTES_DOCENTES.md`](PREGUNTAS_FRECUENTES_DOCENTES.md).

## Reglas

1. **Nunca pidas ni aceptes una contraseña** (ni de docente ni de estudiante) por mensaje. Se restablece, no se comparte.
2. **Nada de datos de menores en el mensaje** (nombre completo, CUI, fotos). Basta: *establecimiento, grado y sección*, o el usuario del estudiante.
3. Responde en **tú**, con **pasos numerados** y **máximo 3 por mensaje**. Dile qué va a ver en pantalla después de cada paso.
4. Si la persona ya intentó algo, **no se lo pidas otra vez**: empieza por lo siguiente.
5. Resuelve primero con la **ayuda de la propia app** (botón **Ayuda** en entrada, pasar lista y subir proyecto): así la persona aprende dónde está.

## Las 5 preguntas para empezar (en este orden)

1. **¿Quién eres y cuál es tu rol?** Docente, estudiante o administrador.
2. **¿En qué pantalla estabas y qué querías hacer?** («Tomar Asistencia, pasar lista», «Subir Proyecto»…).
3. **¿Qué mensaje te salió, exactamente?** Mejor una **captura**. Los avisos de error duran ~6 segundos: si ya desapareció, que lo repita.
4. **¿Con internet o con el servidor de la escuela?** Si la dirección empieza con `http://quetzal.local` (o una IP) es el servidor escolar; si es el sitio de siempre, es Quetzal en línea.
5. **¿Qué dispositivo y navegador?** (Chrome en Android, Safari en iPhone…) y la **versión** de la app: se ve abajo de «Entrar» y en el menú (por ejemplo `v1.0.228`).

## Diagnóstico por síntoma

| Síntoma | Causa más común | Respuesta |
|---|---|---|
| «Usuario o contraseña incorrectos» | Correo sin `@` completo, espacios, o un estudiante usando su propia contraseña en vez de la de su clase | FAQ 1 y 6 |
| La cámara no abre | Permiso, otra app, o dirección `http` del servidor escolar | FAQ 2 (el aviso ya dice cuál de las tres) |
| QR no se lee / «no es de un estudiante de Quetzal» | Sin clase elegida, poca luz, credencial dañada o un QR ajeno | FAQ 3 |
| Mi clase no aparece | Falta la **asignación** (la hace el administrador) | FAQ 4 |
| No me deja publicar el proyecto | Título < 5, descripción < 40, archivo ausente / > 150 MB / no es video ni STL-OBJ-GLB | FAQ 7 (el aviso dice cuál) |
| «Subí y no aparece» | Está en **PENDIENTE** (se sube sola) o no hay internet | FAQ 8 |
| No veo los proyectos de mi clase | Clase sin asignar, o el estudiante aún no publicó | FAQ 9 |
| «Tu sesión venció» | Sesión caducada | Cerrar sesión y entrar otra vez |
| «No tienes permiso para hacer esto» | La clase/escuela no está asignada a esa cuenta, o es una acción de administrador | Verificar la asignación (FAQ 4); si es de administrador, que lo haga él |
| «Esta función todavía no está lista en el sistema» | Falta correr una migración en la base (cosa del administrador del proyecto) | **Escalar** (ver abajo), indicando la pantalla |
| «Hubo un problema en el servidor» | Falla momentánea | Esperar 1 minuto; si sigue, escalar con la hora |
| «Parece que no hay conexión» | Internet o Wi-Fi caído | Pedir que abra otra página; si no abre, es la red |

## Dónde mirar (sin pedirle nada técnico a la persona)

| Qué | Dónde |
|---|---|
| ¿Se guardó lo que hizo? | El **indicador de abajo**: CONECTADO / PENDIENTE / SIN CONEXIÓN. Pasa el cursor (o mantén el dedo) para ver «Sincronizando N acciones…» |
| Estado del **servidor escolar** | En Quetzal en línea: **Servidor de la escuela** (docente) o **Servidores y sincronización** (administrador): En línea, cambios por subir, último sync, versión |
| Dirección del servidor escolar | Tocar el texto del aviso de abajo muestra las direcciones. También `http://quetzal.local/api/node/status` (campos `pending_changes`, `last_sync_at`, `sync_error`) |
| Mensaje técnico original | Los avisos de error guardan el texto original en la **consola** del navegador (F12 → Console, línea «Error original»). Quien da soporte puede pedirlo, pero no hace falta para el 90 % |
| ¿Está corrida una migración? | `migrations/verificar-migraciones.sql` (solo lee) en el SQL Editor, con el administrador del proyecto |

## Pasos de recuperación que casi siempre funcionan (en este orden)

1. **Recargar** la página (en celular: cerrar la pestaña y abrirla).
2. **Cerrar sesión y entrar** de nuevo.
3. Comprobar que **hay internet** (abrir otra página).
4. **No borrar los datos del navegador** si el indicador dice PENDIENTE: ahí está guardado lo que aún no subió.
5. Probar en **otro dispositivo** o navegador (descarta un problema del equipo).

## Qué mandar al escalar (copia y completa)

```
Rol: (docente / estudiante / administrador)
Establecimiento, grado y sección: (sin nombres de menores)
Pantalla y qué quería hacer:
Mensaje exacto (o captura):
Hora aproximada:
¿Quetzal en línea o servidor escolar (dirección)?:
Dispositivo y navegador:
Versión de la app (vX.Y.Z):
Indicador de abajo (CONECTADO / PENDIENTE / SIN CONEXIÓN):
Ya probó: (recargar / salir y entrar / otro dispositivo)
```

Con eso casi nunca hace falta volver a preguntar. Si el aviso en pantalla trae «Detalle para soporte: …», pégalo tal cual.

## Qué NO hacer

- No pedir que **reinstalen**, **borren datos del navegador** ni **restablezcan** nada sin revisar el indicador (se pierde lo pendiente).
- No prometer fechas de arreglo: decir «lo escalé con estos datos».
- No cambiar contraseñas de clase por mensaje: lo hace el **docente de esa clase** o el administrador desde la app.

## Mantener esta guía

- Si agregas o cambias un **mensaje de la app**: el texto vive en **`js/help-messages.js`**; actualiza la tabla de arriba y `TEXTOS_EN_LA_APP.md`.
- Si una pregunta nueva se repite **3 veces**, agrégala a `PREGUNTAS_FRECUENTES_DOCENTES.md` (mantén 10; saca la menos frecuente).
- Una prueba automática (`tests-unit/help-messages.test.mjs`) revisa que la ayuda dentro de la app y estos documentos sigan alineados.
