# Endurecimiento de seguridad — noviembre 2026

Revisión de seguridad hecha **solo sobre el repositorio**: el código, las migraciones y el volcado del esquema de producción
(`supabase/schema.sql`, del 29 de septiembre de 2026). **Nada se probó contra tu Supabase real**; las pruebas automáticas
corren cada migración en un PostgreSQL de verdad (con roles `anon`, `authenticated` y `service_role` simulados), y eso es lo
que respalda cada afirmación de aquí. Antes de aplicar en producción: hazlo primero en el proyecto de prueba (`docs/SETUP.md`).

> **Estado real (2026-11-09):** el administrador corrió `migrations/verificar-migraciones.sql` en producción: todo en `true` (la fila de `rls-auth-uid-initplan`
> se corrigió volviendo a correr esa migración al final). **Excepción importante:** las contraseñas de alumnos (§3) estaban solo en la **fase 1**:
> faltaba el secreto `PASSWORD_VAULT_KEY` y la función `staff-student-passwords` no estaba desplegada. El 9/11 se hicieron la **fase 2** (llave, función y cifrado
> de los 15 alumnos con contraseña en texto, `pending: 0`, descifrado comprobado) y se dejó lista la **fase 3**, que es irreversible y se corre con la consulta de
> comprobación de más abajo. Lo anterior del 6/11 («ya se aplicaron todas») no era exacto para ese punto.

## Resumen

| # | Tema | Hallazgo | Qué se entrega | Cuándo aplicar |
|---|---|---|---|---|
| 1 | `security-hardening-2026-10.sql` | Podía dejar la app sin leer alumnos si fallaba a medias; se volvía a abrir al re-ejecutar con columnas nuevas | Versión revisada: transacción, comprobaciones previas, columnas nuevas excluidas | Ya (con las comprobaciones, es seguro) |
| 2 | IA sin tope | Cualquier cuenta podía gastar la cuota de Groq sin límite | `ai-usage-limit.sql` + `ai-proxy` con tope diario por usuario | Ya |
| 3 | `students.password_generated` | La contraseña real, en texto legible | Hash (bcrypt) + cifrado (AES-GCM) en 3 fases | Por fases (ver abajo) |
| 4 | RLS demasiado abierto | 4 escrituras abiertas a cualquiera y 17 lecturas públicas | `security-rls-audit-2026-11.sql` | Ya |
| 4b | Funciones expuestas | 86 de 90 funciones `SECURITY DEFINER` ejecutables sin sesión | `security-function-exposure-2026-11.sql` | Ya, probando el ingreso |
| 5 | `auth.uid()` por fila | 147 de 226 políticas la evalúan una vez por fila | `rls-auth-uid-initplan.sql` | Al final (es rendimiento) |

Todo lo nuevo está en `migrations/` y se agrega al orden de `docs/MIGRATIONS.md` (sección «Orden seguro de lo pendiente»).
`migrations/verificar-migraciones.sql` (solo lee) dice cuáles ya están aplicadas.

## Orden de aplicación

0. **Antes de nada:** corre `migrations/verificar-migraciones.sql` y aplica lo que falte de la fase 1 a 5 de `docs/MIGRATIONS.md`
   (en especial `fix-password-reset-rpc-exposure.sql`, que cierra la toma de cuentas sin sesión). Estas migraciones suponen que
   ya están `fix-is-staff-coordinador.sql`, `guardians.sql` (`can_manage_student`) y `teacher-self-service.sql` (`students.created_by`);
   si falta alguna, las migraciones se detienen sin tocar nada y dicen cuál.
1. `security-hardening-2026-10.sql` (versión revisada). La app debe ser **v1.0.172 o posterior** (hoy es la v1.0.225).
2. `ai-usage-limit.sql` → redesplegar `ai-proxy`.
3. `student-password-hash.sql` → fases de contraseñas (ver §3).
4. `security-rls-audit-2026-11.sql`.
5. `security-function-exposure-2026-11.sql`.
6. `rls-auth-uid-initplan.sql`.

Entre un paso y el siguiente, prueba lo de **«Cómo probar»** de ese paso. Si algo falla, cada paso tiene su **«Deshacer»**.

---

## 1. `security-hardening-2026-10.sql` — revisión

El archivo ya era correcto en lo que hace (quitarle a la app la lectura de contraseña, CUI y código personal; congelar los campos
que un alumno no debe cambiar de su propia fila; cerrar dos funciones a `anon`; 72 índices). Lo que se ajustó es **cómo se aplica**:

- **Atómico (`begin … commit`).** Antes, si fallaba después de quitar el permiso de lectura de `students`, la app quedaba sin poder leer
  alumnos hasta arreglarlo a mano. Ahora todo o nada. *Si falla, ejecuta `rollback;` antes de seguir.*
- **Comprobaciones previas.** Si falta `is_staff()`, `can_manage_student()` o alguna columna que usa el trigger (por ejemplo
  `students.created_by`, que crea `teacher-self-service.sql`), se detiene antes de tocar nada con un mensaje del tipo
  `NO se aplicó nada. Falta: función can_manage_student(uuid) (guardians.sql)`. Sin esto, el trigger habría fallado en
  la primera actualización de un alumno.
- **`lock_timeout` de 10 s:** si otra sesión tiene `students` ocupada, se cancela en vez de dejar esperando a los alumnos.
- **Columnas nuevas fuera del alcance de la app.** La lista de columnas que la app puede leer se calcula al correr el archivo;
  se excluyen `password_hash` y `password_enc`, así que re-ejecutarlo después de la fase 1 de contraseñas **no** las abre.
- **`staff_student_secrets` ya no entrega texto de contraseña** (devuelve la columna en `null`, para no romper a quien la nombre).
  La app nunca la mostró (se buscó en todo `js/`); el CUI y el código personal siguen igual.
- **Verificación ampliada** al final: las dos columnas nuevas deben salir `false`.

**Cómo probar** (después de correrla): entra como un estudiante y como un docente; el docente debe ver su lista de alumnos y el
estudiante su perfil. La última consulta del archivo debe dar `false, false, true, true` (y `false, false` al final si ya aplicaste la fase 1).

**Deshacer:** es de solo-endurecer; para volver atrás sería devolver `grant select on public.students to authenticated;` y quitar el
trigger (`drop trigger trg_guard_student_self_update on public.students;`). No hace falta salvo emergencia.

## 2. Límite diario de IA — `ai-proxy`

- **Contador:** `ai_usage_daily` (RLS sin políticas: nadie lo toca desde la app) y `ai_usage_take(usuario, tipo, tope, costo)`,
  **atómica** (60 llamadas simultáneas con tope 10 permiten exactamente 10, probado) y solo ejecutable por `service_role`.
  El día cambia a la medianoche de **Guatemala**, no en UTC.
- **En `ai-proxy`:** se cuenta **antes** de llamar al modelo. Dos cuentas aparte: las preguntas de la persona (`chat`) y las frases cortas
  automáticas de la mascota (`short`), para que éstas no se coman las preguntas del estudiante.

  | Rol | Preguntas por día | Frases automáticas por día |
  |---|---|---|
  | Estudiante | 30 | 60 |
  | Docente / coordinador | 100 | 60 |
  | Administrador | 300 | 120 |
  | Rol no reconocido | 10 | 10 |

- **El rol sale de la base** (`students` / `teachers.role`), nunca de lo que manda el navegador.
- **Cambiar los topes sin redesplegar:** secretos de las Edge Functions `AI_DAILY_STUDENT_CHAT`, `AI_DAILY_DOCENTE_CHAT`,
  `AI_DAILY_COORDINADOR_CHAT`, `AI_DAILY_ADMIN_CHAT`, y los `…_SHORT`. `0` = sin acceso. Solo valen enteros; un valor inválido
  se ignora (queda el de fábrica) y el máximo aceptado es 5000.
- **Qué ve la persona al llegar al tope:** HTTP 429 con `{ error: "Ya usaste todas tus preguntas de hoy al asistente. Vuelve mañana.",
  code: "daily_limit" }` (la app lo muestra tal cual); la frase automática de la mascota simplemente no aparece.
- **Si no se pudo contar** (la base no responde): 503 y **no se llama al modelo** (sin contador no hay tope). Si **falta correr el SQL**,
  `ai-proxy` sigue respondiendo sin tope y deja un aviso en sus registros: por eso se puede desplegar en cualquier orden, pero conviene
  correr el SQL primero.
- **No cubre** las otras funciones de IA (`ai-generate-*`, `ai-evaluate-*`, `generate-team-match-quiz`): se llaman desde pantallas con
  flujos acotados (retos, evaluaciones) y siguen con su límite de tokens. Si más adelante se quiere, se reutiliza `ai_usage_take`
  agregando un valor al `check` de `bucket`.

**Cómo probar:** `AI_DAILY_STUDENT_CHAT=2` como secreto, entra como estudiante y haz 3 preguntas al asistente: la 3.ª debe responder el
mensaje de límite; mañana (o `delete from ai_usage_daily;` en el proyecto de prueba) vuelve a funcionar. Revisa en la tabla:
`select * from ai_usage_daily order by day desc limit 10;`.

**Deshacer:** redesplegar el `ai-proxy` anterior (ignora la tabla). Las tablas y la función pueden quedarse.

## 3. `students.password_generated` — hash + cifrado

**Por qué un hash solo no alcanza.** Un hash no se puede revertir, y el personal necesita a veces *ver o imprimir* la contraseña. Entonces
cada contraseña se guarda dos veces, para dos usos distintos:

| Columna | Qué es | Para qué | Quién la usa |
|---|---|---|---|
| `password_hash` | bcrypt (pgcrypto), con sal propia | Comparar al iniciar sesión | `student_password_ok()` (solo `service_role`), llamada por `student-login` |
| `password_enc` | AES-256-GCM, atado al id del alumno | Mostrar / imprimir | Solo la función `staff-student-passwords`, con la llave `PASSWORD_VAULT_KEY` que **no está en la base** |

Quien lea la base (o una copia de seguridad) ve un hash y un texto cifrado inútiles sin la llave. Un cifrado copiado a la fila de otro
alumno no se descifra (el id del alumno va como dato autenticado). Ninguna de las dos columnas se puede leer desde la app.

### Las tres fases

**Fase 1 — SQL (aditiva, no borra nada).** `student-password-hash.sql`. Crea las columnas y funciones y llena `password_hash` de lo que
ya existe **por lotes** (bcrypt es lento a propósito). Repite hasta que `sin_hash` dé 0:

```sql
select public.backfill_student_password_hashes(300);   -- repetir hasta que devuelva 0
```

**Fase 2 — Edge Functions y secreto.**
1. Genera la llave y guárdala como secreto **y en tu gestor de contraseñas** (si se pierde, los cifrados no se recuperan):
   `openssl rand -base64 32` → secreto `PASSWORD_VAULT_KEY`.
2. Despliega `student-login`, `admin-bulk-import-students` y la **nueva** `staff-student-passwords` (**Verify JWT ON**).
   La importación y el inicio de sesión funcionan antes y después de la migración (si la migración no está, usan el texto antiguo);
   la importación, sin llave, deja el texto como antes en vez de perder la contraseña.
3. Como **administrador**, cifra lo que ya existe (repite hasta `pending: 0`):
   ```js
   // en la consola del navegador, con la sesión del administrador:
   const { data: { session } } = await _supabase.auth.getSession();
   const r = await fetch(`${SUPABASE_URL}/functions/v1/staff-student-passwords`, { method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
     body: JSON.stringify({ action: 'backfill', batch: 200 }) });
   console.log(await r.json());   // { encrypted: 200, pending: 1234 } ... hasta pending: 0
   ```

**Antes de la fase 3, comprobar (solo lee):** `select count(*) as alumnos, count(*) filter (where password_generated is not null and password_generated <> '') as con_texto_legible, count(*) filter (where password_hash is not null) as con_hash, count(*) filter (where password_enc is not null) as con_cifrado, count(*) filter (where password_generated is not null and password_generated <> '' and (password_hash is null or password_enc is null)) as faltan from public.students;` — `faltan` debe ser 0.

**Fase 3 — SQL (la única irreversible).** `student-password-drop-plaintext.sql`. Se **niega a correr** mientras alguna contraseña no tenga
hash **y** cifrado (dice cuántas faltan). Cuando corre, deja `password_generated` vacío (la columna se conserva). **Haz antes una copia
de seguridad de la base** (Supabase → Database → Backups) y prueba la sección «Cómo probar».

### Mostrar o imprimir una contraseña (para la interfaz)
`window.fetchStudentPasswords(ids)` (en `js/utils.js`) devuelve un `Map` id → contraseña (o `null` si no tienes permiso sobre ese alumno
o aún no está cifrada). Solo lo entrega el servidor para alumnos que quien llama puede administrar (admin, o docente asignado a la clase).
**Hoy ninguna pantalla muestra `password_generated`** (se buscó en todo `js/`), así que no hubo nada que cambiar en la interfaz; el ayudante
queda listo para la pantalla de «carta de credenciales» que se agregue. Cada consulta deja una línea en los registros de la función
(quién y cuántos alumnos; nunca las contraseñas).

### Importante
- **La contraseña de CLASE** (`class_passwords.password`, la compartida por sección) sigue en texto: se muestra a los docentes por diseño y
  es lo que usan los alumnos para entrar. Es la **misma situación**; si se quiere el mismo trato, se repetiría este diseño sobre esa tabla (no se hizo: la
  pantalla de clases la lee directamente y habría que rediseñarla).
- **Cambiar la llave** invalida los cifrados existentes: guardar la llave anterior hasta volver a cifrar. El prefijo `v1.` del formato permite
  introducir otra versión sin tocar lo guardado.
- **Restablecer la contraseña de un alumno** en la interfaz actual no pasa por `set_student_password` (no hay pantalla que la cambie); la función existe y
  deja hash + cifrado y ningún texto.

**Cómo probar:** (1) después de la fase 1: un alumno con contraseña propia entra igual. (2) Después de la fase 2: importa 1 alumno de prueba;
`select password_generated, left(password_hash, 4), left(password_enc, 3) from students where username = '…';` debe dar `null | $2a$ | v1.`;
entra con ese alumno. (3) Como docente asignado, `await fetchStudentPasswords(['<id>'])` devuelve la contraseña; como docente de **otra** clase, `null`.
(4) Antes de la fase 3: `select count(*) from students where password_generated <> '' and (password_hash is null or password_enc is null);` debe dar 0.

**Deshacer fase 1/2:** quitar las funciones nuevas y redesplegar las versiones anteriores de las 2 Edge Functions (nada se borró). **Fase 3 no se deshace**
salvo restaurando la copia de seguridad: por eso la guarda.

## 4. Políticas RLS peligrosas — `security-rls-audit-2026-11.sql`

Método: se analizó `supabase/schema.sql` (99 tablas, todas con RLS; 226 políticas) buscando `using/with check (true)` y roles `public`/`anon`, y se buscó cada
tabla en `js/`, `supabase/functions/` y `school-node/` para saber si algo la usa.

**A. Escrituras abiertas a cualquiera (incluso sin sesión) — cerradas**

| Tabla | Política | Riesgo | Cambio |
|---|---|---|---|
| `notifications` | `Anyone can insert notifications` | Mandar avisos falsos a la campanita de cualquiera (phishing) | Se quita (ningún código la usa; las funciones de la base no pasan por RLS) |
| `teacher_notifications` | `teacher_notifications_insert_authenticated` | Igual, a docentes | Se quita |
| `teacher_badges` | `Inserción de insignias`, `Sistema puede otorgar insignias` | Darle insignias a cualquier docente | Se reemplazan por una: solo uno mismo o el personal (`js/badges.js` la usa) |

**B. Lecturas abiertas a todo el mundo (incluso sin sesión) — restringidas**

- Solo **personal** (`is_staff()`): `evaluation_scores`, `votes`, `likes`, `user_badges` (la app no las lee), y `weekly_evidence` (evidencias semanales de los
  docentes), `dynamic_kpis`, `kpi_tasks`, `seasonal_milestones` (indicadores de bonos): solo las usan pantallas de docentes y administradores.
- Solo **con sesión** (`authenticated`, mismo contenido): `badges`, `system_config`, `project_likes`, `class_weekly_topics`, `cosmetic_items`,
  `tournament_seasons`, `tournament_teams`, `tournament_team_members`, `tournament_matches`.

**Qué cambia para una persona:** nada con sesión iniciada, salvo que un estudiante ya no puede leer las evidencias semanales ni los indicadores de
bono de los docentes (que la app nunca le mostró).

**Cómo probar:** como estudiante: Inicio, Centro de Juego, Torneos, perfil e insignias cargan. Como docente: Reportes (evidencia semanal) y, si eres administrador, «Bonos».
Desde la consola sin sesión: `await fetch(SUPABASE_URL + '/rest/v1/weekly_evidence?select=*', { headers: { apikey: SUPABASE_ANON_KEY } }).then(r => r.json())` debe devolver `[]`
(antes devolvía las evidencias de los docentes). La última consulta del archivo debe devolver **0 filas**.

**Deshacer:** por política: `alter policy "<nombre>" on public.<tabla> to public using (true);` (lecturas), o `create policy … for insert with check (true);` (escrituras; no recomendado).

### 4b. Funciones `SECURITY DEFINER` abiertas a `anon` — `security-function-exposure-2026-11.sql`

En Supabase toda función nueva queda ejecutable sin sesión por el permiso `EXECUTE` de `PUBLIC` y los permisos por defecto. En el volcado, **86 de 90**
funciones `SECURITY DEFINER` lo eran. Con chequeo de `auth.uid()` son inofensivas, pero depender de que cada una lo tenga es lo que falló con
`admin_reset_user_password`. La migración quita `EXECUTE` a `PUBLIC` y `anon` de **todas** salvo `resolve_login_mode_by_username` y `get_class_login_mode`
(las dos que la pantalla de ingreso llama antes de tener sesión; se verificó en `js/auth.js`). Conserva lo que ya tenían `authenticated` y `service_role`,
y las funciones nuevas tampoco quedan abiertas por defecto. Las Edge Functions (service role), el nodo escolar y el Portal de padres no cambian.

**Cómo probar (es la que más hay que probar):** cierra sesión y entra como **estudiante** (usuario + contraseña de clase) y como **docente**; la pantalla de ingreso debe seguir
mostrando si la clase pide contraseña. Con sesión, recorre Inicio, Cursos, un duelo y Asistencia. Si algo da `permission denied for function X`, esa función se abre a `anon`
**solo si de verdad se llama antes de iniciar sesión**: súmala a `v_anon_allowed` del archivo (o `grant execute on function public.X(...) to anon;` de emergencia).

### Propuestas que NO se aplicaron (necesitan decisión y prueba con la interfaz)

| Política | Qué pasa hoy | Por qué no se aplicó | Propuesta |
|---|---|---|---|
| `evaluations_select_authenticated` | Cualquier usuario con sesión (incluso un estudiante de otra escuela) lee **todas** las evaluaciones y su retroalimentación | La pantalla de evaluaciones y el ranking las leen de varias formas | Dejar leer solo: el personal, el dueño del proyecto y los miembros de su equipo (`projects.user_id` / `group_members`); probar Evaluación, Ranking y Perfil |
| `groups_select_authenticated`, `group_members_select_authenticated` | Un estudiante ve los equipos de otras escuelas | Equipos y Torneos los cruzan | Restringir a la misma escuela, o al personal y a la propia clase |
| `teacher_assignments_select_authenticated` | Un estudiante ve quién enseña en cada clase de todas las escuelas | Varias pantallas lo consultan | Restringir al personal y a la propia clase |
| `student_badges_select_authenticated`, `lessons`/`courses_select_authenticated` | Lectura global con sesión | Hay políticas restrictivas encima (`lesson-audience.sql`, visibilidad de proyectos) | Revisar con el mismo método |
| `tournament_matches` | Las preguntas del partido viajan en la fila | La migración `tournaments.sql` ya usa permisos por columna | Verificar con la consulta de abajo que `questions` no sea legible por la app |
| Funciones `SECURITY INVOKER` con permiso a `anon` | Dependen de RLS (no son puertas abiertas) | — | Opcional: mismo recorrido |
| Límite diario de las demás funciones de IA | Sin tope diario | Ver §2 | Reutilizar `ai_usage_take` |

Consulta de apoyo (solo lectura): ¿qué columnas de `tournament_matches` puede leer la app?
`select column_name, has_column_privilege('authenticated','public.tournament_matches',column_name,'SELECT') from information_schema.columns where table_schema='public' and table_name='tournament_matches';`

## 5. `auth.uid()` → `(select auth.uid())` — `rls-auth-uid-initplan.sql`

Una política que escribe `auth.uid() = user_id` llama a la función **una vez por cada fila** que revisa; envuelta en `(select auth.uid())` Postgres la calcula
**una vez por consulta**. En el volcado, **147 de 226 políticas** la llamaban sin envolver. El resultado de cada consulta es idéntico; cambia el tiempo.

En vez de reescribir a mano 147 políticas, la migración recorre `pg_policies` y reescribe, **con el mismo texto que Postgres ya tiene** (el que usa `pg_dump`),
`auth.uid()`, `auth.role()`, `auth.jwt()`, `is_staff()` e `is_admin()` dentro de `USING` y `WITH CHECK`, sin tocar rol, comando ni nombre.
Se probó que: no queda ninguna sin envolver; las filas visibles de un estudiante y de un docente son las mismas antes y después; un estudiante sigue sin poder
insertar a nombre de otro; la segunda ejecución no cambia nada. Si una política no se puede reescribir, se salta y se avisa con su nombre (no cancela las demás).

**Cuándo:** es rendimiento, no seguridad: corre **al final** y con calma. **Cómo probar:** las mismas pruebas por rol (§4). Para medir:
`explain analyze select * from public.<tabla grande>;` antes y después: debe aparecer `InitPlan` y bajar el tiempo en tablas grandes.

**Deshacer:** no hace falta (mismo resultado). Para volver al texto anterior habría que restaurar las políticas desde `supabase/schema.sql`.

---

## Cómo correr las pruebas automáticas

```bash
node --test tests-unit/ai-usage-limit.test.mjs tests-unit/student-password-sql.test.mjs tests-unit/security-rls-sql.test.mjs tests-unit/migrations-docs.test.mjs tests-unit/edge-errors.test.mjs
```

Con **Node 22** (importan TypeScript) y los binarios de PostgreSQL (`PG_BIN`); las pruebas de PostgreSQL se omiten en la CI de GitHub y corren en la máquina de desarrollo.
Cubren: contador de IA atómico y sus permisos; hash y verificación de contraseñas; cifrado y descifrado (llave, atado al alumno, manipulación);
la guarda de la fase 3; la transacción y las comprobaciones previas del endurecimiento; las políticas abiertas antes y después; las funciones expuestas
antes y después; y `auth.uid()` envuelto sin cambiar lo que ve cada rol.

## Lo que NO se pudo verificar desde el repositorio

- El comportamiento real contra **tu** Supabase (versión de Postgres, extensiones, funciones y políticas que existan hoy en producción y no estén en el volcado del 29 de septiembre).
  Por eso cada migración se salta lo que no existe y se detiene antes de tocar nada si le falta algo del que depende.
- Que `pgcrypto` esté en el esquema `extensions` (es lo normal en Supabase; las migraciones lo crean si falta con `create extension if not exists`).
- El flujo de la fase 2 desde el **editor del panel**: la función `staff-student-passwords` importa `../_shared/vault.ts` y `../_shared/http.ts`; con la CLI funciona, para el editor usa
  `node scripts/exportar-funciones.mjs <carpeta> staff-student-passwords` (copia esos módulos dentro de la función). No se ha probado en producción.
- Que alguna pantalla use una política o función que aquí se cierra y que el código revisado no muestre (por eso las pruebas por rol y el apartado «Deshacer»).

## 7. XSS y política de contenido (CSP) — v1.0.245

**Qué se revisó.** Un escaneo de las plantillas HTML de `js/` buscó datos que escribe un usuario y entran a `innerHTML` sin escape (238 candidatos; la mayoría eran falsos positivos: constantes, números, textos de la propia app). Se corrigieron los reales:

| Dónde | Riesgo |
|---|---|
| `feed-ui.js` — título del proyecto en `data-title="…"` | Lo escribe un **estudiante**; unas comillas rompían el atributo y ejecutaban código en el navegador de quien viera el feed |
| `lessons.js` — `content_url` y `attachment_url` en `iframe`/`video`/`img`/`a` | Un `javascript:` o unas comillas en la dirección ejecutaban código en el alumno que abre la lección |
| `profile.js` — teléfono del docente dentro de un `onclick` | Entraba a una cadena de JavaScript; ahora solo pasan dígitos y signos de teléfono |
| Fotos de perfil (`src`), nombres, correos, usuarios, nombres y descripciones de tareas | Sin escape en 10+ pantallas; ahora `sanitizeInput` / `sanitizeAttr` / `safeUrl` |

`js/safe-html.js` trae `safeUrl()` (solo `http(s)`, `blob:`, imágenes `data:` y rutas relativas; rechaza `javascript:`, `data:text/html`, `vbscript:` y esquemas escondidos con tabuladores) y se usa como `window.safeUrl`.

**CSP.** `index.html` lleva una política por `<meta>` (GitHub Pages no deja poner cabeceras): cierra `object`, `<base>`, formularios hacia otros sitios, scripts de cualquier sitio que no sea la app, jsDelivr o cdnjs, y (desde v1.0.260) todo script en línea.
**Límites, dichos con franqueza:**

- **Actualización v1.0.260: `script-src` ya NO lleva `'unsafe-inline'`.** La CSP bloquea ahora cualquier `<script>` con código en línea y cualquier `onclick="…"` nativo. Como la app tiene ~700 botones con `onclick`, no se reescribieron uno a uno: `js/safe-handlers.js` los ejecuta con un **intérprete mínimo** (sin `eval` ni `new Function`) que solo entiende el subconjunto de JavaScript que esos atributos usan, y que **solo puede llamar a las funciones de `js/handler-allowlist.js`**, una lista generada (`node scripts/handlers-audit.mjs --write`) con las funciones que los botones de la propia app ya llaman. Qué cambia frente a un XSS: un `onclick="fetch(…)"`, `eval(…)`, `document.cookie`, `innerHTML = …`, `import(…)` o `window.open(…)` inyectado **no se ejecuta** (queda un aviso `[manejadores] bloqueado` en la consola). **Límite que sigue vigente:** un atacante que logre inyectar marcado todavía puede hacer que un botón suyo llame a una función de esa lista (es como si la persona tocara ese botón de la propia interfaz; esas funciones validan permisos contra el servidor). Por eso el escape de arriba sigue siendo la defensa principal y la CSP es la segunda barrera. Los scripts en línea de `index.html` pasaron a `js/boot.js` (cargador de librerías, silenciador de consola, atajos de desarrollo) y `js/version.js`. Es normal ver en la consola, una vez por botón tocado, el aviso del navegador «Executing inline event handler violates the following Content Security Policy…»: significa que el navegador NO ejecutó el atributo y lo ejecutó el intérprete. **Para agregar un `onclick` nuevo** basta escribirlo como siempre; si llama a una función que ningún otro botón llamaba, corre `node scripts/handlers-audit.mjs --write` (la prueba `tests-unit/csp-handlers.test.mjs` falla hasta que lo hagas, y rechaza handlers que el intérprete no entiende: funciones `async`, `function`, plantillas con comillas invertidas, `new`, etc.; en ese caso conviene llamar a una función con nombre).
- `connect-src` e `img-src` quedan abiertos (`https:`/`http:`) porque la app habla con Supabase, con la Raspberry por `http` en la red local y carga recursos de cursos de cualquier sitio. Por eso la CSP **no impide exfiltrar datos** si hubiera un XSS.
- `frame-ancestors` (anti-clickjacking) no funciona por `<meta>`; hace falta una cabecera (por ejemplo, Cloudflare delante del dominio).

**Pruebas.** `tests-unit/safe-html.test.mjs` (escapes, esquemas peligrosos, que las plantillas corregidas no vuelvan al código y que la CSP conserve sus cierres) y `tests/csp.spec.js` (con la CSP activa: la pantalla de entrada y ocho vistas con sesión de docente no disparan ningún bloqueo). El resto de las pruebas de navegador usan `bypassCSP` porque las esperas `waitForFunction` de Playwright evalúan texto como código.

## 8. Fotos, videos y evidencias de personas (almacenamiento) — v1.0.246

**Hallazgo.** Los buckets `profile-photos`, `project-videos`, `comment-attachments` y `teacher-evidence` eran públicos y, al menos en `comment-attachments`, con una política de lectura sin rol (`comment_attachments_public_read`): cualquiera con la clave pública del HTML podía **listar** todos los archivos sin iniciar sesión. Tampoco había límite de tipos (se podía subir HTML o SVG con scripts). Las políticas de los demás buckets se crearon desde el panel y **no están en el repositorio**; por eso la migración las busca en `pg_policies` en vez de suponerlas.

**Qué se entrega, en dos pasos que se pueden aplicar por separado:**

| Paso | Archivo | Efecto |
|---|---|---|
| 1 | `migrations/storage-hardening.sql` | Cierra el listado sin sesión y limita los tipos de archivo. Las direcciones guardadas siguen abriendo igual |
| 2 | `migrations/storage-private-buckets.sql` | Hace privados los 4 buckets. Sin sesión nada se abre; con sesión, cada foto o video se muestra con una dirección **firmada que vence a las 2 horas** |

**Cómo funciona en la app.** En la base se sigue guardando la dirección pública de siempre (no hay que migrar datos). `js/private-media.js` mira cada `<img>`, `<video>`, `<audio>`, `<source>`, `<iframe>` y `<a>` que aparece en la página; si apunta a uno de esos buckets, la cambia por una dirección firmada (en lotes, una llamada por bucket). Si firmar falla, deja la original, que sirve mientras el bucket sea público; por eso la app nueva funciona con los buckets públicos **y** privados. El visor 3D pide su archivo con `window.resolveMediaUrl`. El service worker no guarda en el dispositivo las direcciones firmadas (una tablet compartida no conserva fotos de menores).

**Límites, dichos con franqueza:**

- Quien tiene sesión (cualquier estudiante o docente) puede listar y firmar los archivos de esos buckets; es lo que permite ver las fotos de los compañeros y los proyectos del feed. Se cerró lo anónimo, no lo interno. Restringir por clase exigiría cambiar cómo se nombran los archivos.
- **Servidor escolar:** no tiene la llave de la nube ni sesión de Supabase. Desde la v1.0.247 pide las firmas a `node-sync` (acción `sign_media`: solo archivos de la escuela del nodo, 40 por pedido, 2 h): descarga las fotos de perfil firmadas para guardarlas en el nodo, y la ruta `/node-media` redirige al navegador de la red local a la dirección firmada cuando hay internet (videos de proyectos, adjuntos). Sin internet siguen viéndose las fotos ya descargadas y, desde la v1.0.248, los videos y modelos 3D de los proyectos de **la propia escuela** (el nodo los guarda al sincronizar, con topes; ver `school-node/README.md`); los de otras escuelas y los adjuntos de comentarios necesitan internet. **Hay que redesplegar `node-sync` (`index.ts` y `media.ts`) y actualizar cada nodo** (`install.sh --update` o el botón «Actualizar servidores»).
- El bucket `course-content` (cursos del docente) sigue público a propósito: no es contenido de menores, y los cursos se ven sin internet.
- Una dirección firmada que alguien copie sirve hasta que venza (2 h).
- Nada de esto se probó contra tu Supabase real; el paso 2 trae su «Deshacer».

**Pruebas.** `tests-unit/private-media.test.mjs`: reconocimiento de direcciones, firma en lotes, memoria con renovación, caída a la dirección original, descarga con nombre y el contenido de las dos migraciones.

## 9. Verificación del repositorio y del CI — 9 de noviembre de 2026

Revisión hecha leyendo el código y corriendo las pruebas y las herramientas del CI en local. **No se consultó producción**: que las migraciones estén
aplicadas lo confirmó el administrador (6/11) y se comprueba con `migrations/verificar-migraciones.sql`.

### Lo que el documento marca como «código listo»

| Tema | Qué se comprobó en el código | Pruebas |
|---|---|---|
| Tope diario de IA | `ai-proxy` llama a `ai_usage_take` **antes** del modelo; 429 `daily_limit`; 503 si no se pudo contar; el rol sale de la base. La función y la tabla solo las ejecuta `service_role` (`revoke … from public, anon, authenticated`) | `tests-unit/ai-usage-limit.test.mjs` |
| Contraseñas de alumnos (3 fases) | Fase 1 `student-password-hash.sql` (hash bcrypt + cifrado, columnas sin `select` para la app, `student_password_ok` y `set_student_password` solo `service_role`); fase 2 `student-login`, `admin-bulk-import-students` y `staff-student-passwords` (cifra con `PASSWORD_VAULT_KEY`, descifra solo con permiso `can_manage_student`, registra quién pidió ver contraseñas); fase 3 `student-password-drop-plaintext.sql` se niega si falta algún hash o cifrado | `tests-unit/student-password-sql.test.mjs` |
| `auth.uid()` envuelto | `rls-auth-uid-initplan.sql` reescribe las políticas en `select`; la prueba comprueba que no queda ninguna sin envolver y que cada rol ve las mismas filas | `tests-unit/security-rls-sql.test.mjs` |
| Funciones expuestas | `security-function-exposure-2026-11.sql` quita `EXECUTE` a `PUBLIC` y `anon` salvo las 2 del ingreso y conserva `authenticated`/`service_role` | `tests-unit/security-rls-sql.test.mjs` |

Limitaciones que siguen: `student-login` conserva un respaldo con el texto antiguo mientras la función `student_password_ok` no exista (por diseño, para
no dejar a nadie fuera durante las fases); tras la fase 3 ese respaldo ya no coincide con nada.

### Funciones con Verify JWT OFF: con qué se protege cada una

| Función | Protección en el código | Observación |
|---|---|---|
| `guardian-portal` | Token personal de 32 caracteres, vence a los 180 días (`portal-guard.ts`), límite de intentos inválidos por IP | — |
| `node-sync` | Token del nodo (`x-node-token`, solo se guarda su hash en `school_nodes`) | La subida por USB usa su propia autorización (ver `index.ts`) |
| `student-login` | Límite de intentos por IP (`login_rate_limit`), contraseña de clase y personal, magic link de una sola vez | — |
| `trigger-random-event`, `settle-random-event`, `notify-inactive-users` | Cabecera `x-cron-secret` contra `CRON_SECRET` (401 si no coincide) | Compara con `!==` (no en tiempo constante): riesgo bajo, anotado |
| `serve-scorm-entry` | **Sin autenticación**: devuelve cualquier `.html` del bucket `course-content` | Es público a propósito (los cursos se ven sin sesión y sin internet) y solo lee ese bucket; el HTML de un paquete SCORM ejecuta sus scripts por diseño. No sirve para leer los buckets de personas |

### CI (`.github/workflows/ci.yml`)

Las últimas 40 ejecuciones en `main` salían en rojo. Causas y qué se hizo:

| Trabajo | Causa | Qué se hizo |
|---|---|---|
| Tipos de Edge Functions (Deno) | 3 funciones con errores de tipos reales (`ai-generate-quiz`, `admin-set-class-password`, `notify-duel`), independientes de la versión de `supabase-js` | Anotaciones de tipos (sin cambiar lo que hacen); `supabase-js` fijado a `2.118.0` en las 29 funciones y una prueba (`tests-unit/edge-imports-pinned.test.mjs`) que falla si se vuelve a importar sin versión exacta |
| Escaneo de secretos (gitleaks) | 4 alertas, todas la llave **anon** pública (en `js/config.js`/`padres.html` y su historial). La excepción usaba `[[allowlists]]`, que gitleaks 8.21 ignora | Excepción reescrita en `[allowlist]` y limitada al payload `anon` de este proyecto (una llave `service_role` sigue detectándose: probado). Ahora bloquea el CI. Historial limpio: 509 commits, 0 hallazgos |
| `css/tailwind.css` al día | El CI regeneraba con `npx -y tailwindcss@3.4.17` (dependencias sueltas) y el resultado no coincidía con lo generado en local | Usa `npm ci` y la versión fijada por `package-lock.json` (en local, el archivo versionado coincide byte a byte) |
| `npm audit` | Herramientas de desarrollo con 6 alertas | `npm audit fix` (sin `--force`) arregló las transitivas; queda 1 alta de Playwright (<1.55.1) que exige subir el ejecutor de pruebas de versión mayor: el trabajo de desarrollo solo informa. El del servidor escolar (producción) da 0 y **bloquea** |

**No verificado:** que el CI de GitHub quede verde (no se puede ejecutar desde aquí); los pasos se reprodujeron con las mismas versiones (Deno 1.46.3,
gitleaks 8.21.2, tailwind 3.4.17 desde el lock). Las Edge Functions desplegadas **no cambian** hasta que se redespliegue cada una.

## 10. Integridad de las librerías de CDN y cabeceras de seguridad — v1.0.258

### Integridad (SRI) — hecha

Las 13 librerías que la página carga de jsDelivr y cdnjs llevan su hash `sha384` (`integrity`): supabase-js y Font Awesome en las etiquetas de `index.html`;
JSZip, driver.js, PDF.js, jsQR y confetti en el cargador `window.loadLib`; los 5 archivos de three.js en `js/model-viewer.js`. Si una CDN cambiara un archivo
(compromiso de la CDN o del paquete), el navegador lo rechaza y no lo ejecuta. Detalles:

- `driver.js` estaba en `@1` (versión flotante: el contenido podía cambiar solo); ahora está fijado a `1.11.0`, que es lo que ya se servía. **No se puede verificar la integridad de algo que cambia**, por eso una prueba (`tests-unit/sri.test.mjs`) falla si una librería de CDN vuelve a usar una versión flotante.
- `scripts/sri-hashes.mjs` calcula los hashes desde las CDN y, con `--check`, avisa si una CDN ya no sirve lo mismo (trabajo informativo del CI). La fuente de verdad es `scripts/sri-hashes.json`; `tests-unit/sri.test.mjs` comprueba que `index.html` y `model-viewer.js` llevan exactamente esos valores.
- `tests/sri.spec.js` prueba con **Chrome real y las CDN reales** que cada hash es aceptado y que un hash equivocado se **bloquea** (la protección funciona de verdad).
- **Servidor escolar:** usa copias locales de `vendor/` que no siempre son byte a byte las de la CDN (la de driver.js es de otra versión 1.x), así que el nodo quita los atributos de integridad de su `index.html` (`school-node/offline-assets.js`).
- **Para subir la versión de una librería:** cambia la URL en `scripts/sri-hashes.mjs`, regenera (`node scripts/sri-hashes.mjs > scripts/sri-hashes.json`), copia el hash nuevo a `index.html` / `model-viewer.js` y actualiza `service-worker.js` y `vendor/cdn/` si aplica.
- **Límites:** el worker de PDF.js (`pdf.worker.min.js`) y las tipografías se cargan desde dentro de otra librería y no llevan integridad; Google Fonts (CSS dinámico por navegador) tampoco puede llevarla.

### Cabeceras de seguridad — falta, y requiere un cambio en el DNS

Medido el 10/11/2026 (`curl -sI https://clases.yoaprendo.online/`): el sitio lo sirve GitHub Pages directamente (`Server: GitHub.com`) y **no manda ninguna cabecera de seguridad** (ni `X-Frame-Options`/`frame-ancestors`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy`, ni `Strict-Transport-Security`). GitHub Pages no permite configurarlas; la CSP de `index.html` por `<meta>` no puede dar `frame-ancestors` (§7). La salida es poner un proxy delante (Cloudflare, plan gratuito):

1. Crear la cuenta en Cloudflare, agregar `yoaprendo.online` y cambiar los *nameservers* en el registrador. (**Antes**, anotar los registros DNS actuales, en especial los de correo SPF/DKIM/DMARC de `colegios@yoaprendo.online`; que sigan igual y **sin proxy** los de correo.)
2. El registro de `clases` (CNAME a `billiog.github.io`) en modo *proxied* (nube naranja). En SSL/TLS: modo **Full (strict)**; activar «Always Use HTTPS».
3. *Rules → Transform Rules → Modify Response Header*, para el nombre `clases.yoaprendo.online`, agregar:

| Cabecera | Valor | Para qué |
|---|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'` | Nadie puede incrustar la app en otro sitio (clickjacking). Conviene empezar solo con esta directiva |
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina tipos de archivo |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Menos datos en el `Referer` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=()` | La cámara se usa para el QR de asistencia y el escáner de exámenes, por eso `camera=(self)` |
| `Strict-Transport-Security` | `max-age=31536000` | Sin `includeSubDomains` ni `preload` hasta confirmar que ningún subdominio necesita http |

4. **Caché:** dejar que Cloudflare respete las cabeceras de GitHub Pages (`Cache-Control: max-age=600`); no usar «Cache Everything» para el HTML (el service worker y el número de versión dependen de que `index.html` y `service-worker.js` se vean nuevos cuando se publica).
5. Comprobar: `curl -sI https://clases.yoaprendo.online/` debe mostrar las cabeceras; probar el ingreso, un duelo, la cámara de asistencia y la subida de un proyecto. Para volver atrás, poner el registro en «DNS only» (nube gris).

**No afecta** al servidor escolar (red local, http/https propio) ni a las Edge Functions (otro dominio).

## 11. Límite de frecuencia en las funciones `notify-*` — 10/11/2026

**Hallazgo.** Las 5 funciones que mandan notificaciones (`notify-duel`, `notify-announcement`, `notify-rock-pending`, `notify-reaction`, `notify-guardians`) solo exigían una sesión válida. Una cuenta (hay miles de estudiantes) podía llamarlas en bucle y llenar de avisos el teléfono de un compañero o de la administración; en `notify-guardians`, además, gastar SMS. `notify-reaction` ya tenía su propio tope (1 aviso cada 10 min por pareja).

**Qué se entrega.** `migrations/rate-limits.sql` (tabla `rate_limits` sin políticas y `rate_limit_take`, atómica y solo para `service_role`; probada con PostgreSQL real, incluidas 24 llamadas simultáneas con tope 10 → pasan exactamente 10) y `supabase/functions/_shared/rate-limit.ts` (`enforceRate`), usado por las 5 funciones justo después de validar la sesión y antes de tocar datos. Dos niveles: **por persona** y, donde hay un recurso, **por recurso** (por reto y tipo de aviso; por aviso), que se comprueba después de verificar que la persona es participante o dueña.

| Función | Por persona | Por recurso |
|---|---|---|
| `notify-duel` | 60 / hora | 4 cada 10 min por reto y tipo |
| `notify-announcement` | 30 / hora | 3 / hora por aviso |
| `notify-rock-pending` | 20 / hora | — |
| `notify-reaction` | 120 / hora | (el suyo: 1 cada 10 min por pareja) |
| `notify-guardians` | 60 / hora | — |

Los topes se cambian con secretos (`RATE_NOTIFY_*`, ver `docs/PASOS_MANUALES.md`). Al pasarse: HTTP 429 con `{ error, code: "rate_limited" }` y `Retry-After`. **Si falla el contador:** los avisos push dejan pasar (no perder notificaciones legítimas por una caída) y `notify-guardians` responde 503 (los SMS cuestan dinero). Si falta la migración, todas dejan pasar y avisan en sus registros, así que el orden de despliegue no rompe nada.

**Límites, dichos con franqueza.** Es un tope por cuenta, no por persona real: quien tenga muchas cuentas multiplica el tope (el ingreso ya tiene su propio límite por IP). No cubre `notify-inactive-users`, `trigger-random-event` ni `settle-random-event` (se llaman con un secreto de cron, no con sesión). Las ventanas son fijas (empiezan en la primera llamada): en el borde de dos ventanas alguien puede enviar hasta el doble de golpe.

## 12. Bitácora de seguridad — 10/11/2026

**Hallazgo.** Si alguien eliminaba alumnos, creaba un docente, cambiaba un rol o la contraseña de una clase, no quedaba rastro consultable (solo los registros efímeros de las Edge Functions). Sin eso no se puede responder «¿quién lo hizo y cuándo?» ni investigar un incidente.

**Qué se entrega** (`migrations/security-audit-log.sql`, `supabase/functions/_shared/audit.ts`):

| Pieza | Qué hace |
|---|---|
| `security_audit_log` | Tabla de **solo agregar**: un trigger impide `UPDATE`, `DELETE` y `TRUNCATE` (también al `service_role`). La app no puede insertar; **solo un administrador la lee** (política RLS) |
| `log_security_event` | La única forma de escribir; solo `service_role` y funciones de la base. **Quita llaves que parezcan secretos** (password, token, clave, hash, cui…) y recorta lo enorme |
| Triggers | `teacher_created/deleted/role_changed`, `students_deleted` (una fila por sentencia: cuántos, de qué colegios y una muestra de ids), `school_deleted`, `school_node_registered/revoked/deleted`, `guardian_portal_link_regenerated`, `class_password_changed`. Registran quién fue (`auth.uid()`); **no guardan contraseñas, enlaces ni nombres de menores** |
| Edge Functions | `admin-create-teacher`, `admin-delete-students`, `admin-force-delete-school`, `admin-set-class-password`, `admin-bulk-import-students` y `staff-student-passwords` (revelar y cifrar contraseñas) dejan constancia de **quién las pidió**. Como usan service role, los triggers no las ven (sin sesión): así no se duplica |
| Reinicios de contraseña | `admin_reset_user_password` y `reset_password_via_admin` (ya existían) ahora registran `user_password_reset` |
| `get_security_audit_log` y pantalla | Lectura paginada para administradores. En la app: menú del administrador → **Bitácora de seguridad** (`js/audit-log.js`; filtro por acción y «Ver más antiguas»; todo texto escapado; probada en navegador y con pruebas unitarias) |

**Probado con PostgreSQL real:** cada acción deja una fila con quién fue; no aparece ningún secreto ni nombre de menor; sin sesión los triggers no registran; la tabla no se puede modificar, borrar ni vaciar ni por el dueño; `anon`/`authenticated` no pueden escribir; un docente no ve filas ni ejecuta la lectura; el filtro de secretos de `log_security_event` (con una prueba de mutación: sin el filtro, la prueba falla).

**Límites, dichos con franqueza.**
- Registra lo que pasa **por la aplicación y sus funciones**. Un cambio hecho directamente en el **SQL Editor de Supabase** no tiene sesión y no queda en la bitácora (los triggers la ignoran a propósito, para no duplicar lo de las Edge Functions); quien tiene acceso al panel de Supabase puede hacer cualquier cosa. Para eso sirven los *Logs* propios de Supabase, no esta bitácora.
- Un superusuario de la base podría quitar los triggers: la bitácora protege contra cuentas de la app y contra errores, no contra quien administra la base.
- No registra lecturas (quién vio qué), salvo la revelación de contraseñas; ni los ingresos fallidos (eso lo limita `login_rate_limit`).
- Crece sin límite (son pocas filas: solo acciones sensibles). Si algún día pesa, se archiva por año con una migración, no a mano.
