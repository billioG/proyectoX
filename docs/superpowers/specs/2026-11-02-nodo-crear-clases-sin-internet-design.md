# Nodo escolar: crear cursos y recursos sin internet — diseño

Fecha: 2026-11-02. Estado: **propuesto, pendiente de aprobación**.

## Qué se quiere (palabras del docente)

El docente, en el aula y **sin internet**, crea clases con los recursos que tiene en su computadora (videos, PDF, paquetes) y sus
estudiantes las ven en el momento. Cuando la Raspberry vuelve a tener internet, esas clases **se suben a la nube** y pueden ir al
**catálogo general de Quetzal** (Biblioteca Compartida). Lo que se haga con internet baja al nodo para usarlo sin internet.
Misma pantalla de siempre, sin pasos ni contraseñas nuevos. Excluido: IA y notificaciones.

## Cómo funciona hoy (en la app, con internet)

1. El docente crea un curso (`courses.insert`, `created_by` = su id) y le agrega recursos (`lessons.insert`).
2. Cada recurso con archivo se sube desde el navegador a Storage `course-content`, ruta `lessons/<lessonId>/<archivo>` (los paquetes
   ZIP se descomprimen en el navegador y suben archivo por archivo). El `content_url` guardado es la URL pública del bucket.
3. «Compartir» es solo `courses.is_shared = true` (Biblioteca Compartida). No hay aprobación de por medio.
4. La nube lo permite a personal (`is_staff()`) para insertar, y al autor o admin para editar y borrar.

## Diseño

**Idea central:** el nodo hace de Supabase para la app (igual que ya hace con tablas y RPC). Los IDs y la ruta del archivo los pone el
navegador, así que **la URL del recurso es la misma antes y después de subirlo a la nube**: no hay que reescribir nada.

1. **Almacenamiento en el nodo.** Nuevo punto `/storage/v1/object/course-content/<ruta>` (subir, listar, borrar) que usa la app tal cual.
   Solo docentes con sesión; solo rutas `lessons/<uuid>/<archivo>` con nombre limpio; tipos de archivo permitidos (los mismos que acepta la app);
   tope por archivo y chequeo de espacio libre en disco. Se guarda donde ya viven los archivos descargados (`/content/...`) y se marca como
   «pendiente de subir».
2. **Cursos y lecciones escribibles en la capa local.** `courses` y `lessons` aceptan insertar/editar/borrar para el docente **sobre lo suyo**
   (`created_by` = él, clase de su escuela asignada). Cada cambio entra a la bandeja de salida (`rest_outbox`), como ya pasa con avisos y evaluaciones.
   Se mantiene el filtro de contenido de la app y el tope de 100 puntos por bimestre es solo aviso, igual que en línea.
3. **Subida a la nube (en la sincronización).** Orden estricto: (a) archivos pendientes, directo a Storage con URL firmada que da `node-sync`
   (mismo mecanismo ya probado con los videos de proyectos: la llave de la nube nunca está en el nodo); (b) cuando todos los archivos de un
   recurso llegaron, se envían el curso y sus lecciones. Reintentos con espera creciente; un recurso que falla no frena a los demás.
4. **Validación en la nube (`node-sync`, módulo nuevo `content.ts`).** La nube no confía en el nodo: el docente debe estar asignado a esa
   escuela, el curso/lección debe ser suyo, `content_type` permitido, `content_path` y archivos solo dentro de `lessons/<uuid>/`, tamaños dentro
   del límite, upsert por `id` (repetir un envío no duplica). Editar o borrar solo lo creado por ese docente.
5. **Compartir al catálogo general.** Es el interruptor `is_shared` de siempre: se cambia offline y se sube igual que cualquier edición.
6. **De la nube al nodo.** Ya funciona (cursos, lecciones, archivos). Si un curso se edita en la nube y en el nodo a la vez, **gana lo que llegue
   último a la nube** para los campos editados por el docente en el nodo; se avisa en el estado del nodo cuando algo se rechaza.
7. **Estado visible.** La barra ya dice «N cambios por subir»; se agrega «N archivos por subir» y el motivo si la nube rechazó algo, en español.

## Lo que NO entra en esta primera versión

- Editar o borrar cursos de otros docentes o del catálogo general.
- Calificaciones y reportes derivados (van en el punto «asistencia, grupos y reportes»).
- Comentarios/notas de los recursos (punto aparte).
- Conflictos fino-a-fino: no hay fusión de campos, solo «último gana».

## Riesgos y decisiones abiertas

- **Límite de tamaño por archivo en Supabase** (depende del plan; hoy los videos de proyecto llegan a 150 MB). Propuesta: tope de **150 MB por archivo**
  en el nodo, igual que los proyectos, y un aviso claro si la nube lo rechaza.
- **Espacio en la tarjeta SD.** Se avisa cuando queda poco y no se acepta una subida que no cabe.
- **Seguridad de la subida.** Rutas validadas (sin `..`), nombres limpios, tipos permitidos, y los paquetes HTML/SCORM se sirven como hasta ahora
  (en iframe aislado) para que un paquete malicioso de un docente no robe la sesión de otros.
- **Un docente sin internet que borra un curso compartido** que otras escuelas ya usan: en la primera versión el borrado de cursos compartidos
  se hace **solo en línea**; sin internet solo puede dejar de compartirlo.

## Pruebas

Subida y rutas peligrosas (`..`, nombres raros, tipos no permitidos, archivo gigante, disco lleno); permisos (docente de otra escuela, estudiante);
bandeja de salida y orden archivo-antes-que-fila; reintentos y no duplicar; validador de la nube con los mismos casos; un recorrido completo en
Playwright (el docente crea un curso con un PDF sin internet, el estudiante lo abre, se sincroniza y el curso queda en la nube).

## Orden de construcción

1. Subida de archivos al nodo (endpoint + disco + pruebas).
2. `courses`/`lessons` escribibles con política y bandeja de salida.
3. `content.ts` en la nube + subida de archivos y filas en la sincronización.
4. Estado visible y mensajes; recorrido completo; documentación y guías.
