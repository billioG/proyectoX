# Pasos manuales para el responsable

Auditoría del 9 de noviembre de 2026. **Actualización del mismo día:** el administrador ya aplicó las filas 1 a 20 y las funciones de la sección 2; quedan la fila 21 (opcional, ya aplicada según los buckets), la actualización de los nodos, y la fase 3 de contraseñas. Estos pasos **solo los puede hacer quien tiene acceso al panel de Supabase**: el repositorio
no puede consultar producción. No se aplica nada a ciegas: primero se mide qué falta y después se corre solo eso.

## 0. Averiguar qué falta (solo lee)

1. Supabase → **SQL Editor** → pega completo `migrations/verificar-migraciones.sql` → Run.
2. Devuelve una fila por comprobación. Las filas con `aplicada = false` son las que faltan. Una migración con varias filas está aplicada
   cuando **todas** dan `true`.
3. Pega el resultado completo al equipo (o a Claude) para marcar `PENDIENTES.md` con datos reales.

Lo que el verificador **no** puede ver (hay que mirarlo a mano):

```sql
-- storage-hardening.sql / storage-private-buckets.sql: los 4 buckets deben tener tipos limitados; después del paso 2, public = false
select id, public, allowed_mime_types is not null as tipos_limitados
from storage.buckets
where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence');

-- storage-hardening.sql: debe existir la lectura única para usuarios con sesión y NO la pública del bucket de comentarios
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('private_media_select_authenticated', 'comment_attachments_public_read');
```

## 1. Orden de las migraciones que falten

Corre **solo las que dieron `false`**, de arriba abajo; todas se pueden volver a ejecutar sin dañar. Cada una va con lo que hay que hacer
después. El SQL exacto es el contenido del archivo con ese nombre en `migrations/` (pégalo completo en el SQL Editor).

| Orden | Archivo | Requiere antes | Después |
|---|---|---|---|
| 1 | `fix-password-reset-rpc-exposure.sql` (**crítica**) | — | Nada |
| 2 | `fix-students-and-notifications-rls.sql` | 1 | Probar: un alumno ve a sus compañeros |
| 3 | `fix-students-rls-recursion.sql` | 2 | Nada |
| 4 | `fix-votes-and-evaluations-exposure.sql` | 1 a 3, `project-votes-server-side.sql` | Nada |
| 5 | `fix-is-staff-coordinador.sql` | `coordinador-role.sql` | Nada |
| 6 | `fix-coordinator-own-schools.sql` | `school-project-visibility.sql` | Nada |
| 7 | `fix-cross-school-public-projects.sql` | 1 a 4 | Nada |
| 8 | `fix-toggle-project-like-integer.sql` | — | Nada |
| 9 | `sync-queue-idempotency.sql`, `student-pin-cloud.sql` (requiere `school-nodes.sql`), `hangman-word-bank.sql` (requiere `duel-facts.sql`), `timed-math-word-problems.sql` (requiere `student-timed-math-duels.sql`), `companion-panda.sql` (requiere `companion-more.sql`) | las indicadas | Nada |
| 10 | `duel-per-player-content.sql` | los 5 retos, `audit-fixes-duels-chest.sql` | **Después** redesplegar `ai-generate-quiz`, `ai-generate-hangman-word`, `ai-generate-spelling-word`, `ai-generate-debug-steps` (**Verify JWT ON**) y `notify-duel` |
| 11 | `project-reactions.sql` → `project-reactions-ranking-count.sql` → `project-reaction-notifications.sql` (no correr `project-reactions-likes-only.sql`, está reemplazada) | cada una la anterior | **Después** redesplegar `notify-reaction` (**Verify JWT ON**) |
| 12 | `project-thumbnails.sql`, `exams.sql`, `practice-progress.sql` | los 5 retos y `coordinador-role.sql` | Nada |
| 13 | `course-resource-weights.sql` | `lessons.sql`, `courses.sql` | Nada |
| 14 | `school-branding.sql` (completa) | — | **Después** redesplegar `node-sync` |
| 15 | `node-manage.sql` | `school-nodes.sql` | Nada (no cambia `node-sync`) |
| 16 | `node-remote-update.sql` | `school-nodes.sql` | **Después** redesplegar `node-sync` (`index.ts`, `validators.ts`) |
| 17 | `guardian-portal-token.sql` | `guardians.sql` | **Después** redesplegar `guardian-portal` (**Verify JWT OFF**; `index.ts`, `portal-guard.ts`) |
| 18 | `storage-hardening.sql` | — | **Después** redesplegar `node-sync` (`media.ts`) y actualizar cada nodo |
| 19 | `feedback-inbox.sql` (volver a correr completa) | `school-nodes.sql` | Volver a correr `rls-auth-uid-initplan.sql` (la verificación lo marca `false` si quedan políticas con `auth.uid()` sin envolver; sale de esta migración) |
| 20 | `push-sub-role-staff.sql` | `push-sub-role.sql` | Recargar la app y pulsar «Activar notificaciones push» como administrador |
| 21 (opcional, al final) | `storage-private-buckets.sql` | 18 y la app **v1.0.246 o posterior** publicada | Probar que las fotos y los videos se ven con sesión. Se deshace con las líneas comentadas del propio archivo |

Las filas 14 a 19 salen del estado «sin aplicar» de `docs/MIGRATIONS.md`; las demás, de las casillas que ya tenía `PENDIENTES.md`
y que el verificador comprueba.

## 2. Edge Functions: cuándo redesplegar y con qué JWT

Se publican **después** de la migración de la que dependen (la función llama a objetos de la base por nombre).

| Función | Verify JWT | Cuándo |
|---|---|---|
| `node-sync` (toda la carpeta `supabase/functions/node-sync/`) | **OFF** | Después de los pasos 14, 16 y 18 (una sola vez, al final de esos tres) |
| `guardian-portal` (`index.ts`, `portal-guard.ts`) | **OFF** | Después del paso 17 |
| `ai-generate-quiz`, `-hangman-word`, `-spelling-word`, `-debug-steps`, `notify-duel` | ON | Después del paso 10 |
| `notify-reaction` | ON | Después del paso 11 |

Para pegar una función en el editor del panel: `node scripts/exportar-funciones.mjs <carpeta> <nombre>`.

## 3. Nodos escolares

Después de redesplegar `node-sync`, cada nodo se actualiza con `bash ~/quetzal/school-node/install.sh --update` o con el botón
«Actualizar servidores» de la plataforma (requiere el paso 16).

## 3a. Candado de retos repetidos (v1.0.257)

Correr `duel-one-open-pair.sql` en el SQL Editor **después** de publicar la v1.0.257 (o antes: la app vieja solo vería el error en inglés del candado). Cancela los retos pendientes repetidos entre la misma pareja (conserva el más antiguo; no borra nada) y crea un índice único por juego. Si algún juego tiene retos **activos** repetidos, avisa con un NOTICE y no crea ese índice; se revisan a mano y se vuelve a correr. Al final debe mostrar 5 filas (`*_one_open_pair`). Después, `verificar-migraciones.sql` debe dar `true` en las filas 760 a 764.

## 3a-bis. Límite de frecuencia de las funciones `notify-*` (v. 10/11/2026)

> **Hecho el 10/11/2026:** migración corrida y las 5 funciones redesplegadas (CLI). Queda confirmar las filas 770 y 771 del verificador.

1. Correr `migrations/rate-limits.sql` en el SQL Editor (crea `rate_limits` y `rate_limit_take`; al final debe mostrar 1 fila).
2. **Después** redesplegar las 5 funciones (**Verify JWT ON** todas): `notify-duel`, `notify-announcement`, `notify-rock-pending`, `notify-reaction` y `notify-guardians`. Con la CLI: `npx supabase functions deploy <nombre> --use-api --yes --project-ref vyptkxudkmlpyfosppzh`; ahora cada una importa `_shared/rate-limit.ts` (la CLI lo incluye solo; para el editor del panel usa `node scripts/exportar-funciones.mjs <carpeta> <nombre>`).
3. Topes por defecto (por persona): retos 60/hora y 4 por reto y tipo cada 10 min; avisos 30/hora y 3 por aviso/hora; tareas de docentes 20/hora; reacciones 120/hora; envíos a familias 60/hora. Se cambian sin redesplegar con los secretos `RATE_NOTIFY_DUEL_PER_HOUR`, `RATE_NOTIFY_DUEL_ITEM_PER_10MIN`, `RATE_NOTIFY_ANNOUNCEMENT_PER_HOUR`, `RATE_NOTIFY_ANNOUNCEMENT_ITEM_PER_HOUR`, `RATE_NOTIFY_ROCK_PER_HOUR`, `RATE_NOTIFY_REACTION_PER_HOUR` y `RATE_NOTIFY_GUARDIANS_PER_HOUR`.
4. Si se pasa el tope, la función responde 429 («Demasiados avisos seguidos…») y no envía nada. Si la migración aún no está, las funciones dejan pasar y lo avisan en sus registros; `notify-guardians` (SMS, cuesta dinero) responde 503 si la base no puede contar.

## 3a-ter. Bitácora de seguridad (10/11/2026)

1. Correr `migrations/security-audit-log.sql` en el SQL Editor (al final muestra `triggers_auditoria = 6` y `triggers_solo_agregar = 2`).
2. **Después** redesplegar las 6 Edge Functions que registran quién pidió cada acción: `admin-create-teacher`, `admin-delete-students`, `admin-force-delete-school`, `admin-set-class-password`, `admin-bulk-import-students` y `staff-student-passwords` (todas **Verify JWT ON**). Con la CLI: `npx supabase functions deploy <nombre> --use-api --yes --project-ref vyptkxudkmlpyfosppzh`. Si no se redesplegan, siguen funcionando igual pero sin registrar.
3. Ver la bitácora: en la app, menú del administrador → **Bitácora de seguridad** (desde la v1.0.259) o, en el SQL Editor: `select created_at, actor_role, action, target_type, target_id, school_code, details, source from public.security_audit_log order by id desc limit 100;`
4. La bitácora **no se puede modificar ni borrar** (ni siquiera con `service_role`); vaciarla exigiría quitar a propósito los triggers `trg_security_audit_*`.

## 3b. Lección: crea las Edge Functions con la CLI, no desde el editor del panel

El editor del panel le pone un nombre aleatorio a una función nueva (`guardian-portal` quedó como `bright-responder` y `padres.html` recibía 404). Para una función **nueva**, usa `npx supabase functions deploy <nombre> --use-api --project-ref <ref>` (con `--no-verify-jwt` en las de JWT OFF). Para una que ya existe, el panel sirve para pegar código. Comprobación rápida de que todas responden por su nombre: llamar a `/functions/v1/<nombre>` y ver que no dé 404.

## 4. Qué NO hay que hacer

- No correr `project-reactions-likes-only.sql` (reemplazada).
- No correr `student-password-drop-plaintext.sql` si no está confirmado que **todas** las contraseñas tienen hash y cifrado (se niega sola).
- No correr `demo-school.sql` en un plantel con menores reales.
- No cambiar `js/config.js` ni subir secretos.
