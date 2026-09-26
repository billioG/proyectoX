# Cómo colaborar en Quetzal LMS

Gracias por sumarte. Quetzal LMS lo usan estudiantes y docentes de escuelas de
Guatemala, muchas rurales y con poca conectividad. Un error en producción
puede dejar a una clase sin poder trabajar, así que estas reglas existen para
cuidar a esas escuelas.

Primero leé [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y seguí
[docs/SETUP.md](docs/SETUP.md) para tener tu propia copia de prueba.

## Reglas de oro

1. **Nunca desarrolles contra la base de producción.** Usá tu proyecto Supabase de prueba.
2. **Nunca subas secretos.** Ni claves, ni tokens, ni `CRON_SECRET`, ni la cadena de conexión de la base. Si ves uno en el repositorio, avisá.
3. **Datos de menores.** No copies datos reales de alumnos a tu computadora ni a capturas públicas. Lo que se comparte fuera de la app no lleva nombres completos.
4. **La seguridad vive en el servidor.** Gemas, XP, notas, rachas y premios se calculan en Postgres o en Edge Functions. El navegador nunca decide cuánto gana alguien.
5. **Tiene que funcionar sin internet.** Antes de agregar algo, pensá qué pasa en una tablet sin señal o en el nodo escolar.

## Flujo de trabajo

1. Creá una rama desde `main`: `feature/nombre-corto` o `fix/nombre-corto`.
2. Hacé cambios pequeños y enfocados.
3. Abrí un *pull request* hacia `main` completando la plantilla.
4. Otra persona lo revisa. Nadie publica en `main` sin revisión.
5. La CI de GitHub tiene que pasar en verde.

Los mensajes de commit van en inglés, en modo imperativo y con la versión al
final cuando corresponde: `Fix scrolling in arena overlays on phones (v1.0.96)`.

## Publicar una versión nueva

Cada cambio que llega a los usuarios sube la versión. Si no, los teléfonos
siguen mostrando la versión vieja guardada en caché.

1. En `index.html`, cambiá `1.0.X` por `1.0.Y` (aparece **4 veces**).
2. En `service-worker.js`, cambiá `CACHE_NAME = 'projectx-v1.0.X'`.
3. Si tocaste clases de Tailwind, recompilá `css/tailwind.css` (la CI lo verifica):

```bash
npx -y tailwindcss@3.4.17 -c tailwind.config.js -i css/tailwind.src.css -o css/tailwind.css --minify
```

4. Agregá una línea en [CHANGELOG.md](CHANGELOG.md).

## Convenciones del código

### JavaScript (`js/`)
- No hay framework ni build. Cada archivo es un módulo ES; las funciones que usan los `onclick` del HTML se exponen en `window` (`window.nombreFuncion = function nombreFuncion() {}`).
- Los módulos de cada pantalla se cargan bajo demanda: registrá los nuevos en `MODULE_MAP` de `js/main.js`.
- **Todo texto que venga de la base o del usuario pasa por `window.sanitizeInput()`** (contenido) o `window.sanitizeAttr()` (atributos) antes de ir a `innerHTML`.
- Supabase devuelve como máximo 1000 filas: para listas grandes usá `window.fetchAllRows()`.
- Fechas de "hoy" siempre en hora de Guatemala: `toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })`.
- Comentarios en español, explicando el **porqué** (qué problema real resuelve), no el qué.
- Textos de la interfaz en español de Guatemala (voseo: "tocá", "elegí").

### Base de datos (`migrations/`)
Ver las reglas completas en [docs/MIGRATIONS.md](docs/MIGRATIONS.md). En corto: seguras de re-ejecutar, no destructivas, RLS en toda tabla nueva, permisos mínimos, funciones con privilegios como `security definer` + `set search_path = public`, sin secretos.

### Edge Functions (`supabase/functions/`)
- Cada función existe **dos veces e idéntica**: `supabase/functions/<nombre>/index.ts` y `supabase-functions/<nombre>/index.ts`. Editá una y copiala a la otra; la CI falla si difieren.
- Validá el usuario con su JWT (`auth.getUser()`) y decidí el rol consultando las tablas, nunca por lo que manda el cliente.
- Usá la *service role* solo dentro de la función, después de validar permisos.
- Respetá `ALLOWED_ORIGINS`.
- Anotá en el encabezado si la función va con **Verify JWT ON u OFF**.
- Modelos de IA con razonamiento (Groq `gpt-oss`): usá `reasoning_effort: 'low'` y un `max_tokens` holgado, porque el razonamiento cuenta dentro del límite.

## Antes de pedir revisión

- [ ] Probé el cambio en mi proyecto de prueba, como estudiante y como docente (y admin si aplica).
- [ ] Probé en ancho de celular (375 px).
- [ ] Probé qué pasa sin internet, si el cambio toca algo que el alumno usa en clase.
- [ ] Todo texto dinámico pasa por `sanitizeInput` / `sanitizeAttr`.
- [ ] Si agregué una migración: es re-ejecutable, tiene RLS y está al final de `docs/MIGRATIONS.md`.
- [ ] Si toqué una Edge Function: está copiada a `supabase-functions/`.
- [ ] Subí la versión y actualicé `CHANGELOG.md`.
- [ ] No hay secretos ni datos personales en el diff.

## Licencia

El proyecto todavía no tiene licencia definida. Hasta que exista, todo el
código es propiedad de su autor (Billy Gómez) y al contribuir aceptás que tu
aporte pasa a formar parte del proyecto bajo la licencia que se defina.
