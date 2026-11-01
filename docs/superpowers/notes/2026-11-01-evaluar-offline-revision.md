# Revisión final de «Evaluar proyectos sin internet» (rama `feat/evaluar-nodo`, aparcada)

Estado: la rama **no se sube**. El rumbo cambió a una capa local compatible con Supabase para que la app real corra
en el nodo (ver el spec de la prueba de concepto). Estos hallazgos se guardan porque describen reglas de seguridad que
la nueva capa también deberá cumplir. Revisor: Opus. 0 críticos, 4 importantes, 8 menores.

## Importantes
1. **El código compartido permite suplantar a cualquier docente.** Con el código de docente se restablece el PIN de
   una docente, se crea uno nuevo y se evalúa en su nombre; la nube lo acepta porque está asignada. Nada marca el
   origen. Arreglo: que crear el PIN no dependa del secreto compartido (código de un solo uso por docente generado en
   la nube) y guardar `source='node'` y `node_id` en lo que viene de un nodo.
2. **Restablecer el PIN no cierra las sesiones abiertas** (8 h) y no existe «cerrar sesión» en el servidor.
3. **El bloqueo global del código** lo puede provocar un estudiante (5 códigos malos) y deja bloqueados al
   administrador y a los docentes sin PIN, con mensajes engañosos.
4. **El video del proyecto desaparece al publicarse** (`c:<id>` no recuerda su copia local) y **los modelos 3D** se
   muestran como video (`model3d` frente a `model`).

## Menores
Fuerza bruta del PIN sin límite por IP; evaluaciones con `node_ref` que se reintentan para siempre si el proyecto
local se borra; un rechazo definitivo borra la evaluación sin avisar; pruebas SQL negativas sin comprobar el mensaje;
campo de nota vacío = 0; consultas del Inicio sin preparar una sola vez; `GET /api/teachers` expone el uuid de Supabase.

## Qué conservar para la capa nueva
- La nube valida cada cambio que llega de un nodo con funciones `security definer` solo para `service_role`
  (`apply_node_evaluation`, `apply_node_reaction`, `apply_node_chest`): esas reglas se reutilizan.
- Las pruebas contra un PostgreSQL desechable (`tests-unit/helpers/temp-postgres.mjs`).
- La identidad del docente en el nodo es un problema abierto: el PIN personal necesita un alta que no dependa de un
  código compartido.
