# Preguntas frecuentes de docentes (las 10 más comunes)

Respuestas cortas y con pasos. Las mismas respuestas básicas están dentro de la app, en el botón **Ayuda** de cada pantalla
(texto en `js/help-messages.js`). Si un caso no está aquí, ver [`GUIA_RAPIDA_SOPORTE.md`](GUIA_RAPIDA_SOPORTE.md).

> Cómo se eligieron: son los problemas que salen de recorrer las tres acciones del primer día (entrar, pasar lista, proyectos) y de los avisos de
> error que la app puede mostrar. **No vienen de estadísticas de uso**: cuando haya consultas reales, se reordenan con las más repetidas.

---

### 1. No puedo entrar: dice «Usuario o contraseña incorrectos»
- **Docentes:** escribe tu **correo completo** (con `@`) y tu contraseña. Revisa espacios de más y que no esté activada la tecla de mayúsculas.
- Toca **«¿Olvidaste tu contraseña?»**: te llega un enlace al correo (mira también «correo no deseado»).
- Si dice que **el correo no está confirmado**, toca el enlace del correo que te enviamos al crear la cuenta.
- Si dice **«Demasiados intentos»**, espera unos minutos y vuelve a intentar.
- Si el administrador acaba de crear tu cuenta y no llega nada, avísale: tiene que revisar que escribió bien tu correo.

### 2. La cámara no abre cuando quiero pasar lista
Según lo que diga el aviso:
- **«Falta el permiso»:** toca el candado junto a la dirección de la página → permite la **cámara** → recarga.
- **«Está en uso por otra aplicación»:** cierra la otra app (videollamada, cámara) o reinicia el navegador.
- **«No tiene una cámara»:** usa otro celular o tablet.
- **«El navegador no deja usar la cámara en esta dirección»:** estás en una dirección **«http»** (el servidor de la escuela, `quetzal.local`). El navegador solo
  permite la cámara con **candado (https)**. Entra a **Quetzal en línea** con internet para pasar lista. Si no se puede, consulta a tu administrador (hoy la pantalla registra la asistencia con el QR de la credencial).

### 3. Mostré el QR y no pasó nada (o dice «Ese código QR no es de un estudiante de Quetzal»)
- Primero **elige tu clase** en **Equipo en Aula**; sin eso no se registra (la app lo avisa).
- Acerca el QR, con **buena luz** y sin brillo; que llene casi todo el cuadro de la cámara.
- Si el aviso dice que **no es de un estudiante de Quetzal**, el código no es de una credencial de Quetzal: imprime las credenciales desde **Impresión · Credenciales QR**.
- Si la credencial está dañada o manchada, **reimprímela**.
- Un mismo QR no se vuelve a leer en 5 segundos, y el mismo día no se duplica: no pasa nada si lo repites.

### 4. Mi clase no aparece en «Equipo en Aula»
Tu cuenta todavía **no tiene esa clase asignada**. Solo el administrador puede asignarla.
- Mándale: tu **nombre**, el **establecimiento**, el **grado** y la **sección**.
- Cuando te la asigne, **cierra sesión y vuelve a entrar** (o recarga la página).

### 5. Hoy no hubo clase (feriado, actividad). ¿Cómo lo registro?
1. En **Tomar Asistencia**, tarjeta **Suspensiones**.
2. Elige si es **un equipo** o **todo el establecimiento** y escribe el **motivo** (por ejemplo: «Feriado»).
3. Queda como **solicitud pendiente**: la aprueba el administrador.
- Mientras esté suspendida, tu clase aparece marcada como **SUSPENDIDO** en la lista.

### 6. Un estudiante no puede entrar
- El estudiante entra con su **usuario (sin `@`)** y la **contraseña de su clase**, no una personal.
- Tú la ves y la puedes cambiar en **Gestionar Estudiantes → Contraseñas de Clase** (solo de tus clases). Si la clase está configurada **sin contraseña**, entra solo con el usuario.
- Si el aviso dice que la cuenta **egresó** o fue **dada de baja**, ya no tiene acceso: es decisión del establecimiento.
- Si dice «Demasiados intentos», que espere unos minutos (el límite protege las cuentas).

### 7. Un estudiante no puede subir su proyecto
El aviso dice **exactamente qué falta**:
- **Título:** mínimo 5 caracteres.
- **Descripción:** mínimo 40 caracteres (qué problema resuelve y qué materiales usó).
- **Archivo:** un **video** o un **modelo 3D** (STL, OBJ o GLB), de **hasta 150 MB**. Si pesa más, que grabe menos tiempo o baje la calidad de la cámara.
- Si es de **equipo**, debe elegir el equipo en la lista (si no aparece ninguno, el equipo no está creado: **Gestionar Equipos**).

### 8. Subí algo (asistencia o proyecto) y no lo veo
Mira el **indicador de abajo**:
- **PENDIENTE:** todavía se está subiendo. Espera y no cierres sesión.
- **SIN CONEXIÓN:** no hay internet; se sube solo cuando vuelva.
- **CONECTADO** y aun así no aparece: recarga la página. Un proyecto aparece en **Inicio** y, si es nuevo, el docente lo evalúa en **Evaluar Proyectos**.
- Si lleva **horas** en PENDIENTE con internet, **no borres los datos del navegador** (ahí está guardado lo pendiente) y avisa a soporte.

### 9. ¿Cómo evalúo un proyecto? ¿Por qué no veo los de mi clase?
1. Menú → **Evaluar Proyectos**.
2. Abre el proyecto, califica con la rúbrica y escribe tu comentario.
- Solo ves y evalúas los proyectos de **las clases que tienes asignadas**. Si falta una clase, es la pregunta 4.
- Si el estudiante aún no lo publicó (ver pregunta 8), no aparece.

### 10. No hay internet en la escuela. ¿Puedo trabajar?
- **Con el servidor escolar** (dirección tipo `http://quetzal.local`, la del cartel): sí. Estudiantes y docentes entran, hay cursos, se suben proyectos y se evalúan, aunque no haya internet.
  Todo se sincroniza solo cuando el servidor tiene internet; el aviso de abajo a la izquierda lo muestra. Docentes: **Servidor de la escuela** muestra si ya sincronizó.
- **Con Quetzal en línea sin internet:** puedes seguir un rato; la asistencia y los proyectos quedan guardados en el dispositivo y se suben al volver la señal (indicador **SIN CONEXIÓN → PENDIENTE → CONECTADO**).
- **Limitaciones sin internet:** no hay asistente con IA ni notificaciones; y en el servidor escolar **no se puede usar la cámara** (pregunta 2).
- Si ya entraste antes en ese dispositivo, la pantalla de entrada ofrece **elegir tu cuenta guardada**.
