# Endurecimiento de seguridad — noviembre 2026

Revisión de seguridad hecha **solo sobre el repositorio**: el código, las migraciones y el volcado del esquema de producción
(`supabase/schema.sql`, del 29 de septiembre de 2026). **Nada se probó contra tu Supabase real**; las pruebas automáticas
corren cada migración en un PostgreSQL de verdad (con roles `anon`, `authenticated` y `service_role` simulados), y eso es lo
que respalda cada afirmación de aquí. Antes de aplicar en producción: hazlo primero en el proyecto de prueba (`docs/SETUP.md`).

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
