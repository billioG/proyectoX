# Capa local compatible con Supabase en el nodo escolar (prueba de concepto)

Estado: diseño aprobado en conversación (2026-11-01); el usuario pidió empezar a implementar. Ajustes pedidos al arrancar: login idéntico al de línea (sin listar usuarios) y Práctica del Centro de Juego offline.

## Objetivo
Que la **app real** (las mismas pantallas y el mismo código que se usan con internet) funcione en el nodo escolar sin
internet: lo que se ve en línea se ve offline, todo se guarda en el nodo y se sincroniza con la nube de forma
automática (cada 10 minutos cuando hay internet) o con el botón «Sincronizar ahora». Hoy el nodo tiene pantallas
copiadas por función (Inicio, Perfil, cofre, reacciones, evaluar), lo que duplica la app y nunca será «lo mismo».

## Hechos medidos (código actual)
- La app crea **un solo cliente** de Supabase en `js/config.js` (`supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`).
- 70 archivos usan Supabase: 81 tablas distintas (539 consultas), 66 RPC, 24 Edge Functions, ~76 consultas con
  relaciones anidadas, 8 canales realtime y 24 usos de Storage. Métodos más usados: `eq`, `select`, `order`, `rpc`,
  `insert`, `update`, `single`, `in`, `maybeSingle`, `delete`, `getSession`, `match`, `limit`, `gte`, `upsert`.
- La app ya tiene mecanismos offline (`SyncManager`, `fetchWithCache`, `enterOfflineSession`), pensados para un solo
  dispositivo; el nodo es el servidor compartido de la escuela.

## Decisiones tomadas con el usuario
- Camino: **capa local compatible con Supabase** (el nodo responde con el mismo «idioma» y la app real corre encima).
- La prueba de concepto cubre **estudiante y docente**: Inicio, Cursos, Perfil, avance de lecciones, y del docente
  Evaluar proyectos y Avisos. Crear cursos y subir proyectos con archivos son la fase siguiente.
- Sincronización automática + botón; las pantallas copiadas no se borran hasta que la real las cubra.
- **Login idéntico al de línea y sin listar a nadie** (el nodo ya no muestra la lista de estudiantes ni los PIN de
  4 números): se usa la **pantalla de entrada real** (`login-username` / `login-password`).
- **Centro de Juego → Práctica** debe funcionar offline (es solo código y datos del navegador; lo único que toca la
  nube es registrar el avance con la RPC `log_practice`, que se emula). La IA y lo que la necesita no.

## Diseño
1. **Endpoints compatibles** en el servidor del nodo: `/rest/v1/<tabla>` (PostgREST: select con columnas y
   relaciones anidadas, `eq/neq/in/gte/lte/or/not/is/contains`, `order`, `limit/range`, `single/maybeSingle`,
   `count`, `insert/upsert/update/delete` con `Prefer: return=representation`), `/rest/v1/rpc/<función>`,
   `/auth/v1/...` (sesión) y más adelante `/storage/v1`. Realtime y Edge Functions de IA/push no existen offline.
2. **Almacén genérico:** SQLite con las filas de cada tabla réplica con los **mismos nombres de tabla y columna que la
   nube** (una fila por registro en JSON + clave primaria). Las consultas se evalúan en memoria sobre las filas de la
   escuela (tamaño de una escuela). Un mapa de relaciones (clave foránea) explica los `select` anidados. Una lista
   **permitida** de tablas y columnas: lo que no está en la lista no se sirve ni se baja (nunca PIN, contraseñas,
   correos, hashes).
3. **Reglas de acceso locales (RLS en código)** por tabla y rol, según el uid del JWT: un estudiante ve lo suyo y lo
   de su clase; un docente lo de sus clases asignadas. Todo lo demás, vacío o 403.
4. **Entrada = el login real de la app, sin lista de usuarios.** El nodo implementa lo que el login real llama:
   - **Estudiantes:** `POST /functions/v1/student-login { username, password }` y `/auth/v1/verify` (el mismo
     intercambio de `token_hash` por sesión), más las RPC `resolve_login_mode_by_username` y `get_class_login_mode`.
     La contraseña es la **contraseña de la clase**; si el docente la desactivó en línea, esa clase entra solo con el
     usuario (igual que en línea). La nube baja por clase un **verificador** (sal + hash PBKDF2 calculado en la
     función con la contraseña real; nunca la contraseña) y el nodo lo comprueba localmente.
   - **Docentes:** el mismo formulario con correo y, como contraseña, su **PIN para entrar sin internet** (punto 5);
     `POST /auth/v1/token?grant_type=password`.
   - Intentos limitados por usuario y por IP con bloqueo, y mensajes que no revelan si el usuario existe.
   - La sesión es un **JWT firmado por el nodo** (`sub` = uuid, `role: authenticated`), en el almacenamiento donde
     `supabase-js` la espera: `getSession()` funciona. En modo nodo, `config.js` apunta el cliente al propio nodo y
     se retira la pantalla de selección propia del nodo.
5. **Docentes — PIN que se crea EN LÍNEA (corrige la debilidad del código compartido):** el docente fija «PIN para
   entrar sin internet» en su perfil de la app con internet (RPC propia); la nube guarda hash y sal y los baja al
   nodo como ya se hace con los PIN de estudiantes. Sin código compartido para crear PIN, y el origen de cada cambio
   queda marcado (`source = 'node'`, `node_id`). Un docente que nunca fijó su PIN no entra al nodo.
6. **Bajada genérica:** `node-sync` agrega un bloque `tables` con las filas de cada tabla de la lista permitida,
   filtradas a la escuela del nodo con una regla escrita por tabla en la nube. Se reemplaza solo si viene.
7. **Subida genérica:** las escrituras hechas en el nodo quedan en una **bandeja de salida** (tabla, operación,
   datos, uid, fecha). Al sincronizar, la nube aplica cada una con la función de reglas de ese tipo de cambio
   (`security definer`, solo `service_role`, ya existen varias: progreso, XP, reacciones, evaluaciones). Una
   operación sin regla en la nube se rechaza de forma definitiva y queda registrada, nunca se aplica a ciegas.
8. **RPC emuladas** en el nodo para lo que la prueba cubre (`sync_save_evaluation`, `react_to_project`,
   `claim_daily_chest`, `record_active_heartbeat`, etc.); la lógica de mis endpoints actuales se reutiliza.
9. **Sincronización:** automática cada 10 minutos con internet (ya existe), botón «Sincronizar ahora» para el
   estudiante y el docente, y un aviso «sincronizado hace X» / «pendiente de subir N».

## Entrega por fases
- **F1 (estudiante, lectura):** motor de consultas, almacén, bajada genérica, sesión, `config.js`. Inicio, Cursos y
  Perfil con el código real; avance de lecciones se guarda y sube.
- **F2 (docente):** login con PIN creado en línea, Evaluar proyectos y Avisos con las pantallas reales, y la
  sincronización de lo que hagan.
- **F3 (informe):** esfuerzo medido (tablas, RPC y reglas emuladas, consultas que faltaron) y qué no se puede offline.

## Centro de Juego: Práctica
Incluida en F1: `practice.js` y `practice-bank.js` no usan la nube; el avance se registra con `log_practice` (y se
lee con `get_my_practice_progress`), RPC que el nodo emula guardando en su base y subiendo por la bandeja
(idempotente por `client_ref`). Retos entre jugadores (tiempo real), IA y generadores con IA quedan fuera.

## Fuera de alcance de la prueba de concepto
Crear cursos y lecciones, subir proyectos con archivos (Storage), retos en tiempo real, IA, notificaciones push,
exámenes, SCORM. No se borra ninguna pantalla copiada hasta que la real las cubra.

## Riesgos
- Imitar PostgREST fielmente: una consulta rara fallará hasta que se añada; el informe las lista.
- Duplicar las reglas de acceso (RLS) en el nodo es lo más delicado: lista permitida estricta, pruebas negativas por
  tabla, nunca columnas sensibles.
- Los docentes deben haber fijado su PIN en línea una vez.
- Mucha superficie: la prueba de concepto mide el esfuerzo; ampliar a toda la app es una decisión posterior.

## Review Focus
1. Un estudiante no lee filas de otra clase ni columnas sensibles por ninguna consulta, incluidas las anidadas.
2. Una escritura sin regla en la nube se rechaza de forma definitiva y no se aplica.
3. La sesión del nodo no sirve en la nube (y viceversa) y no se puede fabricar desde el navegador.
4. El PIN del docente no se puede crear ni restablecer con un secreto compartido, y el login del nodo no revela
   qué usuarios existen.
5. La app real, sin tocar sus pantallas, muestra Inicio, Cursos y Perfil offline con los mismos datos que en línea.
