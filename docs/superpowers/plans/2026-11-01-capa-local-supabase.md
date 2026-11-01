# Capa local compatible con Supabase (prueba de concepto) — Plan de implementación

> Ejecución nativa por tareas con pruebas primero (superpowers:executing-plans). Spec autoritativo:
> `docs/superpowers/specs/2026-11-01-capa-local-supabase-design.md`. Es grande: se entrega por etapas y cada etapa se
> verifica con la app real en el navegador.

**Meta de la etapa F1:** con el nodo sin internet, la app REAL (login real sin lista de usuarios, Inicio, Cursos,
Perfil, Centro de Juego → Práctica) funciona sobre una capa que habla el «idioma» de Supabase.

## Global Constraints
- Tuteo en todo texto visible; commits normales con trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Se edita en `C:\Users\billi\Downloads\proyectoX-main\proyectoX-main`, se copia a `C:\Users\billi\px-push` (rama
  `feat/capa-local-supabase`). NO `git push` sin confirmar con AskUserQuestion.
- Nunca se sirve ni se baja una columna fuera de la lista permitida (PIN, contraseñas, correos, hashes).
- Pruebas SQLite con Node 20; `.ts` con Node 22; pantalla con `PW_CHANNEL=chrome npx playwright test --workers=1`.
- Espejo `supabase-functions/` idéntico a `supabase/functions/`.

## Review Focus
1. Un estudiante no lee filas de otra clase ni columnas sensibles por ninguna consulta, incluidas las anidadas.
2. Una escritura sin regla en la nube se rechaza de forma definitiva y no se aplica.
3. La sesión del nodo no sirve en la nube y no se puede fabricar desde el navegador.
4. El login del nodo no revela qué usuarios existen y limita los intentos.
5. La app real muestra Inicio, Cursos, Perfil y Práctica offline con los mismos datos que en línea.

## Tareas (F1)
1. **Analizador de consultas PostgREST** (`school-node/rest/query.js`): select con relaciones anidadas, filtros
   (`eq neq gt gte lt lte like ilike in is cs not or and`), `order`, `limit/offset`, cabeceras (`single`, `count`,
   `head`, `Prefer`), cuerpo de `insert/upsert/update/delete/rpc`.
2. **Motor** (`school-node/rest/engine.js`): evalúa lo analizado sobre un proveedor de filas, con mapa de relaciones.
3. **Almacén** réplica + bandeja de salida en SQLite (`school-node/rest/store.js`).
4. **Políticas** (lista permitida + reglas de acceso por rol) y **rutas HTTP** `/rest/v1`.
5. **Entrada**: JWT del nodo, `student-login`, `verify`, `token`, RPC `resolve_login_mode_by_username` y
   `get_class_login_mode`, límites de intentos.
6. **Nube**: bloque genérico `tables` en `node-sync` (lista permitida y alcance por escuela, verificadores de
   contraseña de clase) + migración del PIN de nodo del docente.
7. **Nodo**: aplicar `tables` a la réplica, subir la bandeja, funciones de la nube para aplicar cada tipo de cambio.
8. **App**: `config.js` en modo nodo, retirar el login propio del nodo, RPC emuladas (`log_practice`, etc.),
   Playwright con el flujo real.
9. **Informe de esfuerzo** (y F2: docente con Evaluar y Avisos).
