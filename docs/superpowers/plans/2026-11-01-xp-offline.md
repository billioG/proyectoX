# XP sin internet en el nodo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los estudiantes del nodo ganan XP (lecciones, proyectos, cofre diario) sin internet, lo ven en su Perfil y la nube lo valida y suma al sincronizar; las lecciones dan 10 XP también con internet.

**Architecture:** La nube es la única que escribe XP/gemas (disparador SQL + función `service_role`). `node-sync` valida eventos de cofre (`xp.ts`, lógica pura) y devuelve `xp_total/gems/daily_chest_last_claimed` por estudiante. El nodo guarda eventos pendientes (`xp_events_local`) y muestra base + pendientes.

**Tech Stack:** SQL (Supabase), Deno/TS (lógica pura importable en Node 22), Node ESM + better-sqlite3, JS vanilla, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-xp-offline-design.md` (autoridad).

## Global Constraints

- Tuteo en todo texto visible; commits en prosa normal con trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Se edita en `C:\Users\billi\Downloads\proyectoX-main\proyectoX-main` y se copia a `C:\Users\billi\px-push`; rama `feat/xp-offline`. NO `git push` sin confirmar con AskUserQuestion.
- Espejo `supabase-functions/node-sync/` idéntico a `supabase/functions/node-sync/`; `xp.ts` con sintaxis TS borrable (Node 22 lo importa).
- Constantes: `XP_PER_LESSON = 10`; premios del cofre `{20 XP/5 gemas, 50/15, 100/50}`; nivel = `floor(XP/500)+1`; XP total = proyectos×50 + votos×10 + suma de notas + insignias×100 + `students.xp` (los proyectos son los del estudiante o de sus equipos).
- Pruebas SQLite: Node 20 (`PATH=/c/Users/billi/AppData/Local/nvm/v20.19.0:$PATH node --test tests-unit/`); `.ts`: Node 22 (`/v22.23.3`, `node --test "tests-unit/*.test.mjs"`); pantalla: `PW_CHANNEL=chrome npx playwright test --workers=1`. No lanzar dos suites a la vez.
- Cada push sube versión (4 sitios de `index.html` + `CACHE_NAME`) con entrada en `CHANGELOG.md`; `npm run css` al agregar clases Tailwind.

## Review Focus

1. La misma lección completada dos veces (o desde nodo e internet) paga 10 XP una sola vez (Task 2 SQL, Task 4 nodo).
2. Cofre: dos eventos el mismo día, fecha futura o premio inventado no suman (Task 1, Task 2).
3. Ningún cliente gana permiso de escribir `xp/gems` (Task 2).
4. Tras sincronizar no se cuenta dos veces el XP pendiente (Task 4).
5. Un pull sin `xp_total` (función vieja) no rompe el Perfil ni el cofre del nodo (Task 4/5).

---

### Task 1: Lógica pura de XP (`xp.ts`)

**Files:** Create `supabase/functions/node-sync/xp.ts` (+ espejo en `supabase-functions/node-sync/`); Test `tests-unit/node-sync-xp.test.mjs` (Node 22)

**Interfaces — Produces:**
`export const XP_PER_LESSON = 10;`
`export const CHEST_PRIZES: ReadonlyArray<{ xp: number; gems: number }>` (3 premios);
`export function validateXpEvent(ev: { kind?: unknown; student_id?: unknown; ref?: unknown; xp?: unknown; gems?: unknown }, ctx: { studentIds: Set<string>; today: string }): { ok: true; event: { student_id: string; ref: string; xp: number; gems: number } } | { ok: false; error: string }` — solo `kind === 'chest'`, estudiante del nodo, `ref` fecha `YYYY-MM-DD` válida, no posterior a `ctx.today` ni anterior a 3 días, y `(xp, gems)` ∈ `CHEST_PRIZES`;
`export function computeStudentXp(input: { students: Array<{ id: string; xp?: number | null; gems?: number | null }>; projects: Array<{ id: string; user_id: string; group_id: number | null; score: number | null; votes: number | null }>; memberships: Array<{ group_id: number; student_id: string }>; badgeCounts: Map<string, number> }): Map<string, { xp_total: number; gems: number }>`.

- [ ] **Step 1: Failing tests** (estilo de `node-sync-projects.test.mjs`, `skip` en Node 20): `validateXpEvent acepta un cofre válido de hoy y de ayer`; `rechaza: tipo desconocido, estudiante ajeno, fecha futura, fecha de hace 4 días, fecha mal formada, premio inventado (xp 999), xp válido con gemas que no corresponden`; `computeStudentXp: proyectos×50 + votos×10 + notas + insignias×100 + xp bonus` con un caso numérico a mano (p. ej. 2 proyectos, votos 3, notas 80+70, 1 insignia, xp 40 → 100+30+150+100+40 = 420); `un proyecto de equipo cuenta para cada miembro y un proyecto propio con group_id propio no se cuenta dos veces`; `gems sin dato = 0`.
- [ ] **Step 2: Run** `node --test tests-unit/node-sync-xp.test.mjs` (Node 22). Expected: FAIL (`xp.ts` no existe).
- [ ] **Step 3: Implement** `xp.ts` y copiar al espejo. Run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(nube): lógica pura de XP y validación del cofre del nodo`.

### Task 2: Migración SQL `migrations/xp-events.sql`

**Files:** Create `migrations/xp-events.sql`; añadir fila a `docs/MIGRATIONS.md`.

- [ ] **Step 1: Write** (sin prueba automática: no hay Supabase local; se declara en el ledger): tabla `public.xp_events (id bigint generated always as identity primary key, student_id uuid not null, kind text not null check (kind in ('lesson','chest')), ref text not null, xp int not null default 0, gems int not null default 0, created_at timestamptz not null default now(), unique (student_id, kind, ref))` con `enable row level security` y sin políticas; revocar todo a `anon, authenticated`; función disparadora `public.award_lesson_xp()` `security definer set search_path = public` que, cuando `new.status = 'completed'` y (`tg_op = 'INSERT'` o `old.status is distinct from 'completed'`), hace `insert into xp_events (student_id, kind, ref, xp) values (new.student_id, 'lesson', new.lesson_id::text, 10) on conflict do nothing` y **solo si insertó** (`if found`) `update students set xp = coalesce(xp,0) + 10 where id = new.student_id`; trigger `after insert or update of status on public.lesson_completions`; función `public.apply_node_chest(p_student uuid, p_date date, p_xp int, p_gems int) returns boolean` `security definer`, ejecutable solo por `service_role` (`revoke all ... from public, anon, authenticated; grant execute ... to service_role`): valida premio ∈ {(20,5),(50,15),(100,50)}, `p_date <= current_date` y `>= current_date - 3`, `daily_chest_last_claimed is null or < p_date`, inserta el evento `('chest', p_date::text)` y si se insertó actualiza `xp`, `gems` y `daily_chest_last_claimed` del estudiante y devuelve `true`, si no `false`. Idempotente (`create or replace`, `drop trigger if exists`). Comentarios en tuteo/español neutro.
- [ ] **Step 2: Self-review del SQL** contra Review Focus 1–3 (leer el archivo completo y comprobar: ningún `grant` a authenticated; el `update students` está en funciones definer; nombres de columna reales de `lesson_completions` según `migrations/lessons.sql`). Expected: sin hallazgos.
- [ ] **Step 3: Commit** `feat(nube): migración de eventos de XP (lecciones y cofre del nodo)`.

### Task 3: Cableado de `node-sync` (`index.ts`)

**Files:** Modify `supabase/functions/node-sync/index.ts` (+ espejo)

**Interfaces — Consumes:** `validateXpEvent`, `computeStudentXp`, `XP_PER_LESSON` (Task 1); `apply_node_chest` (Task 2). **Produces:** cada alumno del pull trae `xp_total`, `gems`, `daily_chest_last_claimed`; respuesta con `applied.xp_events: string[]` (claves `"<student_id>|<ref>"` aceptadas o ya aplicadas) y `xp_errors: [{ student_id, ref, error }]`.

- [ ] **Step 1: Implement** (sin prueba automática): leer `push.xp_events` (también por USB); validar con `validateXpEvent` (`today` en Guatemala = fecha UTC−6); para cada válido llamar `admin.rpc('apply_node_chest', {...})` (`true` y `false` por duplicado cuentan como aplicado; error de RPC → `xp_errors`); **después** del push, consultar por trozos `students(id, xp, gems, daily_chest_last_claimed)`, `projects(id, user_id, group_id, score, votes)` (por `user_id` y por `group_id` de los equipos de la escuela, deduplicando por `id`) y `student_badges(student_id)` (contar), calcular con `computeStudentXp` y completar cada alumno de `students` con `xp_total`, `gems`, `daily_chest_last_claimed`; si esas consultas fallan, no tumbar el sync (campos ausentes). Actualizar el comentario de cabecera. Copiar al espejo y verificar `diff -r`.
- [ ] **Step 2: Run** `node --test "tests-unit/*.test.mjs"` (Node 22). Expected: 0 fallos.
- [ ] **Step 3: Commit** `feat(nube): node-sync recibe cofres del nodo y entrega el XP total`.

### Task 4: Nodo — eventos, base de XP y sincronización

**Files:** Modify `school-node/db.js`, `school-node/sync.js` (`buildPush`, `applyPull`); Create `school-node/xp.js`; Test `tests-unit/node-xp-store.test.mjs` (Node 20)

**Interfaces — Produces:** tabla `xp_events_local (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, kind TEXT, ref TEXT, xp INTEGER, gems INTEGER, created_at TEXT, UNIQUE (student_id, kind, ref))`;
`export function createXpStore(db, { now = Date.now, random = Math.random } = {})` → `{ recordLesson(studentId, lessonId): boolean, summary(student): { xp_total, gems, xp_pending, gems_pending, xp, level, level_xp, chest_available, today }, claimChest(student): { xp, gems, msg }, pendingChests(): Array<{ kind: 'chest', student_id, ref, xp, gems }> , clearSent(pushedEvents, pushedCompletions): void }` (`claimChest` lanza `Error` con `status = 409` y mensaje «Ya reclamaste el cofre de hoy.» si ya hay cofre hoy; `xp = xp_total + xp_pending`; `level = floor(xp/500)+1`; `level_xp = xp % 500`);
`buildPush` agrega `xp_events: store.pendingChests()`; `applyPull` guarda `xp_total/gems/daily_chest_last_claimed` dentro de `students.extra` y llama `clearSent`.

- [ ] **Step 1: Failing tests** (`skip` sin SQLite): `recordLesson crea el evento solo la primera vez que la lección pasa a completada` (segunda llamada devuelve false); `summary suma la base de la nube y los pendientes`; `claimChest da uno de los tres premios, lo registra y un segundo intento el mismo día lanza 409` (usar `random` fijo y `now` fijo; hora Guatemala = UTC−6, probar que a las 03:00 UTC aún es el día anterior); `no hay cofre disponible si daily_chest_last_claimed de la nube es hoy`; `buildPush incluye solo los cofres pendientes`; `applyPull con pushed borra los eventos enviados y guarda la nueva base: el XP mostrado no se cuenta dos veces` (Review Focus 4); `un pull sin xp_total conserva el XP de la base anterior` (Review Focus 5).
- [ ] **Step 2: Run** Node 20. Expected: FAIL.
- [ ] **Step 3: Implement** tabla, `xp.js`, cambios en `sync.js` (el `extra` conserva los valores previos de `xp_total/gems/daily_chest_last_claimed` si el pull no los trae), y el USB (`buildPush`/`applyPull` ya compartidos).
- [ ] **Step 4: Run** tests de la tarea + suite completa Node 20. Expected: 0 fallos.
- [ ] **Step 5: Commit** `feat(nodo): eventos de XP pendientes y base de XP de la nube`.

### Task 5: Nodo — rutas HTTP (`/api/xp`, `/api/chest`, XP por lección)

**Files:** Modify `school-node/server.js`; Test `tests-unit/node-xp-api.test.mjs` (Node 20); extender `tests-unit/helpers/start-node.mjs` (opción `xp: { [studentId]: { xp_total, gems, daily_chest_last_claimed } }` que escribe en `students.extra`)

**Interfaces — Produces:** `GET /api/xp` → `200 summary` (401 sin sesión); `POST /api/chest` → `200 { xp, gems, msg }` o `409 { error }`; `POST /api/completions` responde `{ ok: true, xp: 10 }` cuando la lección pasa a completada por primera vez y `{ ok: true }` si no.

- [ ] **Step 1: Failing tests**: `sin sesión: /api/xp y /api/chest dan 401`; `completar una lección da +10 una sola vez y /api/xp lo suma`; `el cofre se abre una vez al día (409 el segundo) y suma al XP`; `un estudiante no ve el XP de otro` (la ruta usa la sesión); `con base de la nube, /api/xp suma base + pendientes`.
- [ ] **Step 2: Run** Node 20. Expected: FAIL.
- [ ] **Step 3: Implement** rutas con `createXpStore`; `/api/completions` detecta la transición a completada (fila previa con `status` distinto de `completed`).
- [ ] **Step 4: Run** tests de la tarea + suite completa Node 20. Expected: 0 fallos.
- [ ] **Step 5: Commit** `feat(nodo): /api/xp, cofre diario y XP por lección`.

### Task 6: Pantalla — cofre, Perfil con XP y aviso «+10 XP»

**Files:** Modify `js/gamification.js` (cofre en nodo), `js/node-profile.js` (nivel, rango, barra, gemas), `js/lessons.js` (aviso), `js/node-feed.js` (dispara `checkDailyChest`), `css/tailwind.css` (`npm run css`); Test `tests/node-projects.spec.js` (reemplaza la parte del cofre de la prueba «sin cofre diario»: ahora el cofre SÍ sale en el nodo cuando no se reclamó y no llama a Supabase; el latido sigue sin llamar)

**Interfaces — Consumes:** `GET /api/xp`, `POST /api/chest`, `POST /api/completions` (Task 5).

- [ ] **Step 1: Failing tests (Playwright, clic real)**: (a) `en el nodo el cofre aparece, se abre con un clic, suma XP y no vuelve a salir hoy` — tocar el cofre, ver `+N XP`, `/api/xp` refleja el XP, recargar y no aparece; (b) `el Perfil del nodo muestra nivel, rango, XP y gemas` (con base sembrada: xp_total 420, gems 12 → «Nivel 1», «420 XP»…; tras completar una lección por la API, «430 XP»); (c) `completar una lección en el nodo muestra +10 XP`; (d) el latido sigue sin llamar a la nube. Estos tests reemplazan/ajustan los de v1.0.192.
- [ ] **Step 2: Run** Playwright. Expected: FAIL.
- [ ] **Step 3: Implement** — `checkDailyChest`/`showDailyChestModal` en nodo: consultar `/api/xp` (`chest_available`) y mostrar el modal; `openChest` en nodo usa `POST /api/chest` en lugar del RPC (misma animación, sin `initGamification`); `node-profile.js` agrega la tarjeta de nivel (rango por `level` con la misma tabla de `gamification.js`); `lessons.js`: mostrar «+10 XP» (toast) cuando `POST /api/completions` responde `xp` y, con internet, cuando una lección pasa a completada por primera vez en esa sesión; `node-feed.js` llama `window.checkDailyChest?.()` tras dibujar; `npm run css`.
- [ ] **Step 4: Run** Playwright completo + suite Node 20. Expected: 0 fallos.
- [ ] **Step 5: Commit** `feat(nodo): cofre diario, XP en el Perfil y aviso +10 XP`.

### Task 7: Documentación y versión

**Files:** `CHANGELOG.md`, `school-node/README.md`, `PENDIENTES.md`, `docs/MIGRATIONS.md`, `index.html` (4 sitios) + `service-worker.js` → v1.0.193, spec (estado implementado)

- [ ] **Step 1:** Entrada de CHANGELOG (qué gana XP, +10 por lección también con internet, cofre sorteado en el nodo y validado por la nube, **orden de despliegue: migración SQL → publicar `node-sync` con `xp.ts` → actualizar el nodo**, límites); README del nodo; PENDIENTES (prueba real con la nube, XP retroactivo, gemas/tienda/insignias en el nodo, ranking); subir versión.
- [ ] **Step 2: Run** suites Node 20, Node 22 y Playwright completo; comprobar espejo por blobs. Expected: 0 fallos.
- [ ] **Step 3: Commit** `docs/nodo: XP sin internet (v1.0.193)`.
