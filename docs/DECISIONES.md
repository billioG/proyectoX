# Decisiones de arquitectura

Registro corto (ADR ligero) de las decisiones que más condicionan el código. Cada una tiene **contexto**, **decisión** y
**consecuencias**, para que quien llegue nuevo sepa por qué las cosas son así y cuándo vale la pena cambiarlas.

**Cómo agregar una:** copia el formato de abajo, usa el siguiente número y no borres las anteriores: si una decisión cambia,
márcala `Reemplazada por ADR-0NN` y escribe la nueva. Una decisión cabe en media pantalla; si necesita más, enlaza a un documento.

Estados: `Vigente` · `Reemplazada` · `Propuesta`. Las decisiones 001 a 003 y 010 a 012 se tomaron el 2026-11-05; las demás son anteriores y se
registran hoy a partir de lo que dice el código y los documentos del repositorio.

| # | Decisión | Estado |
|---|---|---|
| 001 | Las Edge Functions viven solo en `supabase/functions/` | Vigente |
| 002 | Formato único de error: `{ "error": "…" }` | Vigente |
| 003 | `js/` se reorganiza partiendo módulos, no moviendo carpetas | Vigente (plan; nada partido aún) |
| 004 | Sin paso de compilación para el JavaScript | Vigente |
| 005 | Migraciones manuales, re-ejecutables y con orden documentado | Vigente |
| 006 | Seguridad en la base: RLS, permisos por columna y funciones `SECURITY DEFINER` | Vigente |
| 007 | El nodo escolar corre la app real sobre una capa compatible con Supabase | Vigente |
| 008 | `node-sync` en módulos TypeScript puros y probables | Vigente |
| 009 | Buzón: el docente lee sin saber quién escribió | Vigente |
| 010 | Contraseñas de alumnos: hash para entrar, cifrado (llave fuera de la base) para mostrar | Vigente (código listo; falta aplicar) |
| 011 | Funciones `SECURITY DEFINER` cerradas a `anon` por defecto | Vigente (código listo; falta aplicar) |
| 012 | Tope diario de IA por usuario, contado en la base antes de llamar al modelo | Vigente (código listo; falta aplicar) |

---

## ADR-001 · Las Edge Functions viven solo en `supabase/functions/`
**Estado:** Vigente · 2026-11-05 (reemplaza la regla «dos copias idénticas»)

**Contexto.** Cada función existía dos veces: `supabase/functions/<nombre>/` y una carpeta espejo `supabase-functions/<nombre>/`
(41 archivos). Lo único que las mantenía iguales era una tarea de la CI que comparaba byte a byte, y toda edición exigía copiar a
mano. En paquetes descargados fuera de git llegó a haber una copia atrasada de la otra. Las pruebas ya importaban de `supabase/functions`,
que además es la ruta estándar de la CLI de Supabase.

**Decisión.** La única fuente es `supabase/functions/`. Se eliminó `supabase-functions/`. La CI ya no compara copias: falla si la
carpeta vuelve a aparecer. Para pegar funciones en el editor del panel de Supabase (que solo ve los archivos de cada función) se
usa `node scripts/exportar-funciones.mjs <carpeta> [función…]`, que genera una subcarpeta por función y avisa si pasa de 16
archivos.

**Consecuencias.** Un solo lugar que editar. El espejo ya no hay que mantenerlo ni verificarlo. Quien tenía un flujo de «copiar de
`supabase-functions/`» debe usar el script. Los planes viejos de `docs/superpowers/plans/` aún mencionan el espejo: son históricos.

## ADR-002 · Formato único de error: `{ "error": "…" }`
**Estado:** Vigente · 2026-11-05

**Contexto.** Las 28 funciones definían cada una su propio ayudante `json()`. Revisadas, todas devolvían ya los errores con la
clave `error` (172 respuestas literales), algunas con `message` de detalle; solo `serve-scorm-entry` responde texto plano porque
sirve HTML a un iframe.

**Decisión.** Todo 4xx/5xx es `{ "error": "texto corto en español" }`, con `code` (identificador estable) y `message` (detalle
técnico, nunca una traza) opcionales. El módulo `supabase/functions/_shared/http.ts` (`errorResponse`, `internalError`,
`jsonResponse`, `toErrorMessage`) lo codifica. Una prueba (`tests-unit/edge-errors.test.mjs`) revisa estáticamente que todas
las funciones lo cumplan, y la CI la corre.

**Consecuencias.** El cliente puede confiar en `data.error`. Las funciones nuevas usan el helper; **las 28 existentes no se
migraron** (ya cumplen el contrato y no se pudo probar un redespliegue masivo), así que se pasan al helper cuando se toquen por
otra razón. El helper es un import fuera de la carpeta de la función: con la CLI funciona; para el editor del panel, el script
de exportación lo copia dentro de la función. **Esa ruta del editor del panel no se ha probado todavía en producción.**

## ADR-003 · `js/` se reorganiza partiendo módulos, no moviendo carpetas
**Estado:** Vigente como plan · 2026-11-05

**Contexto.** `js/` tiene ~85 archivos planos y 37 000 líneas; `lessons.js` solo tiene 3 700 (12 secciones con encabezado propio).
Los módulos son scripts clásicos cargados por demanda con `MODULE_MAP`, así que mover un archivo exige tocar `MODULE_MAP`, la
caché del service worker, `index.html` y las pruebas (un descuido en la lista del service worker impide instalarlo).

**Decisión.** Primero partir los módulos grandes por sus secciones existentes (mismo directorio, una parte por versión);
subcarpetas solo por dominio completo y en versiones aparte. Un archivo nuevo no pasa de ~1 500 líneas. El código muerto se
borra. `tests-unit/js-inventory.test.mjs` protege el proceso: lo que el service worker lista existe, todo módulo lo carga alguien,
la versión coincide. Detalle en `docs/ARCHITECTURE.md`, «Plan de reorganización de `js/`».

**Consecuencias.** Hecho: se borraron 5 módulos huérfanos (v1.0.225) y se agregó la guardia. **Pendiente: partir `lessons.js`
y los demás** (cada uno en su versión, con una pasada de Playwright de esa pantalla).

## ADR-004 · Sin paso de compilación para el JavaScript
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** La app se publica en GitHub Pages desde el repositorio, la mantiene muy poca gente y debe poder editarse y subirse
sin herramientas. **Decisión.** Lo que está en `js/` es lo que se publica; el único paso de build es Tailwind
(`css/tailwind.src.css` → `css/tailwind.css`, verificado en la CI). **Consecuencias.** Cero fricción para publicar, pero sin
minificación ni empaquetado (la medición de PageSpeed lo señala en `PENDIENTES.md`) y sin módulos ES entre pantallas: las
funciones se exponen en `window`. Cambiar esto es una decisión grande (ver ADR-003).

## ADR-005 · Migraciones manuales, re-ejecutables y con orden documentado
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** Las tablas base se crearon desde el panel antes de guardar migraciones, así que `migrations/` no crea la base desde
cero; se corren a mano en el SQL Editor de producción. **Decisión.** Cada migración es re-ejecutable, no destructiva, con RLS y
permisos mínimos, y está en la tabla de `docs/MIGRATIONS.md` (una prueba falla si falta). El estado real de producción se averigua con
`migrations/verificar-migraciones.sql` (solo lee), y el orden seguro de lo pendiente está en `docs/MIGRATIONS.md`.
**Consecuencias.** No hay historial de «qué corrió en producción» fuera de esa verificación; las casillas de `PENDIENTES.md`
envejecen. Cuando el proyecto adopte la CLI de Supabase las migraciones pasarán a `supabase/migrations/` con prefijo de fecha.

## ADR-006 · Seguridad en la base: RLS, permisos por columna y funciones `SECURITY DEFINER`
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** El navegador usa la clave pública y habla directo con Postgres; tuvo hallazgos de seguridad reales (escalación de
privilegios, funciones expuestas a `anon`). **Decisión.** RLS en toda tabla; a `authenticated` se le revoca todo y se le devuelve solo
una lista de columnas (gemas, XP, racha y notas no se escriben desde el navegador); lo que necesita privilegios va en funciones
`SECURITY DEFINER` con `search_path` fijo; el rol se decide siempre en el servidor. **Consecuencias.** Cada tabla o columna
nueva exige revisar sus permisos (ver `migrations/security-hardening-2026-10.sql` y `docs/MIGRATIONS.md`); una política mal escrita
puede romper la lectura (pasó con `students`, ver `fix-students-rls-recursion.sql`).

## ADR-007 · El nodo escolar corre la app real sobre una capa compatible con Supabase
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** Mantener una segunda app «sin internet» duplicaría pantallas y reglas. **Decisión.** `school-node/` sirve la misma app
y emula la API de Supabase que usa (`/rest/v1`, `/auth/v1`, funciones) sobre SQLite, con las reglas de acceso reescritas en código
(`school-node/rest/policies.js`) y una sincronización por colas con la nube (`node-sync`). Detalle en `docs/NODO_APP_REAL_INFORME.md`.
**Consecuencias.** Paridad de funciones con un costo: cada tabla nueva de la nube necesita su esquema, su política y su sincronización en el
nodo, y una prueba que compare ambos. Sin internet no hay IA ni notificaciones. Capacidad y límites: `docs/NODO_LIMITES.md`.

## ADR-008 · `node-sync` en módulos TypeScript puros y probables
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** La función `node-sync` crece con cada módulo que se lleva al nodo, y el editor del panel admite 16 archivos por función.
**Decisión.** La validación vive en módulos TypeScript puros (sin Deno ni base de datos: `validators.ts`, `duels.ts`, `xp.ts`…) que se
prueban con Node 22; `index.ts` solo cablea. Al llegar al límite se fusionan módulos (hoy son 14). **Consecuencias.** La lógica
se prueba sin Supabase; el cableado de `index.ts` solo se prueba contra una nube simulada y con `deno check` en la CI, por eso
`PENDIENTES.md` sigue pidiendo pruebas con la nube real.

## ADR-009 · Buzón: el docente lee sin saber quién escribió
**Estado:** Vigente · registrada 2026-11-05

**Contexto.** Los estudiantes escriben sugerencias y evalúan al docente; si el docente puede leer las tablas, ve el estudiante de cada fila.
**Decisión.** El docente no lee `student_suggestions` ni `teacher_ratings` directamente: usa `get_feedback_inbox` y `get_my_ratings`, que no
devuelven identificadores ni nombres. El administrador ve todo con nombres; el coordinador conserva su acceso a las evaluaciones de sus
docentes. **Consecuencias.** El anonimato lo garantiza la base, no la pantalla; el nodo replica la misma regla (`policies.js`).
Abierto: el coordinador sigue viendo quién escribió si consulta la base directamente.

## ADR-010 · Contraseñas de alumnos: hash para entrar, cifrado para mostrar
**Estado:** Vigente (código listo; falta aplicar) · 2026-11-05

**Contexto.** `students.password_generated` guardaba la contraseña real en texto; cualquier lectura de esa columna entregaba todas las cuentas. Pero el personal a veces
necesita verla o imprimirla, y un hash no se puede revertir. **Decisión.** Dos columnas: `password_hash` (bcrypt, lo que compara el inicio de sesión) y `password_enc`
(AES-256-GCM, atado al id del alumno, con una llave `PASSWORD_VAULT_KEY` que vive solo en los secretos de las Edge Functions). Solo la función `staff-student-passwords` descifra, y solo
para quien la base dice que puede administrar a ese alumno. Se aplica en 3 fases, la última (borrar el texto) con una guarda que se niega si falta algo.
**Consecuencias.** Un volcado de la base ya no entrega contraseñas. Perder la llave pierde los cifrados (guardarla en un gestor de contraseñas). La contraseña de CLASE
sigue en texto por diseño (se muestra a los docentes): queda como deuda. Detalle: `docs/SEGURIDAD_2026-11.md`.

## ADR-011 · Funciones `SECURITY DEFINER` cerradas a `anon` por defecto
**Estado:** Vigente (código listo; falta aplicar) · 2026-11-05

**Contexto.** En Supabase toda función nueva es ejecutable sin sesión; 86 de 90 funciones `SECURITY DEFINER` del volcado lo eran, y confiar en que cada una valide `auth.uid()` ya falló una vez
(`fix-password-reset-rpc-exposure.sql`). **Decisión.** `anon` solo ejecuta las dos funciones del ingreso (`resolve_login_mode_by_username`, `get_class_login_mode`); todo lo demás exige sesión, y las funciones
nuevas nacen cerradas. **Consecuencias.** Una función nueva que deba llamarse sin sesión hay que abrirla a propósito (y agregarla a la lista de la migración). Si una pantalla da
`permission denied for function`, es una función que se llamaba sin sesión y no se había detectado.

## ADR-012 · Tope diario de IA por usuario, contado en la base
**Estado:** Vigente (código listo; falta aplicar) · 2026-11-05

**Contexto.** `ai-proxy` solo pedía una sesión válida; cualquier cuenta podía gastar la cuota del proveedor sin límite. **Decisión.** Un contador atómico en la base
(`ai_usage_take`, solo `service_role`) se descuenta **antes** de llamar al modelo, por usuario, día de Guatemala y tipo (preguntas de la persona / frases automáticas de la mascota), con topes por rol
(estudiante 30, docente 100, administrador 300 por día) cambiables con secretos. Sin contador (falla de la base) no se llama al modelo; sin la migración, se deja pasar con un aviso en los registros.
**Consecuencias.** Un estudiante muy activo puede llegar al tope en una clase (ajustable con `AI_DAILY_STUDENT_CHAT`). Las otras funciones de IA aún no tienen tope diario.
