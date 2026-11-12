# Cloudflare delante de `clases.yoaprendo.online` — paso a paso

Objetivo: que el sitio mande las cabeceras de seguridad que GitHub Pages no permite (anti-clickjacking, `nosniff`, HSTS, etc.; razones en
`docs/SEGURIDAD_2026-11.md` §10). **No cambia la app ni el código**: solo pone un proxy gratuito delante. Tiempo estimado: 40 minutos, más la espera del DNS.

Lo escribió Claude el 12/11/2026 mirando el DNS real de `yoaprendo.online`; los pasos 1 a 4 los hace una persona con acceso a Namecheap y a la cuenta de
Cloudflare (nadie más debería tener esas contraseñas).

## Lo que hay hoy (medido el 12/11/2026)

| Qué | Valor | Dónde se administra |
|---|---|---|
| Registrador y DNS | Namecheap (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`) | Namecheap → Domain List → `yoaprendo.online` → Advanced DNS |
| `clases.yoaprendo.online` | CNAME → `billiog.github.io` (GitHub Pages; archivo `CNAME` del repositorio) | DNS |
| `www.yoaprendo.online` | CNAME → `billiog.github.io` | DNS |
| `yoaprendo.online` (raíz) | 3 registros A: `185.199.108.153`, `185.199.109.153`, `185.199.110.153` (GitHub Pages; **hay otro sitio publicado ahí**) y probablemente un cuarto `185.199.111.153` | DNS |
| Correo | MX a `mx1.privateemail.com` y `mx2.privateemail.com` (prioridad 10) y `inbound-smtp.us-east-1.amazonaws.com` (prioridad 10) | DNS |
| SPF | TXT `v=spf1 include:spf.privateemail.com ~all` | DNS |
| DMARC | TXT en `_dmarc`: `v=DMARC1; p=none; pct=100; rua=mailto:contact@yoaprendo.online; aspf=r; adkim=r` | DNS |
| Verificación de Google | TXT `google-site-verification=-kZV8uupT0fr3f0NWc_O1F8ELizOLNHfOmskWr8wVmc` | DNS |

Lo que **no** se ve desde fuera y hay que sacar de Namecheap: las claves **DKIM** del correo (suelen llamarse `default._domainkey`, `selector1._domainkey`…),
cualquier registro de Amazon SES (`_amazonses`, CNAME de verificación) y cualquier otro TXT/CNAME que alguien haya puesto. **Si se pierde uno, el correo de
`yoaprendo.online` puede dejar de llegar o caer en spam.** Por eso el paso 1 es copiar todo.

> **Alcance:** cambiar los *nameservers* mueve **todo el dominio** `yoaprendo.online` (la raíz, `www`, `clases` y el correo), no solo `clases`. Cloudflare solo
> permite poner el proxy a un subdominio suelto en planes de pago. Por eso se hace con cuidado y se deja **sin proxy** (nube gris) todo lo que no sea `clases`.

## Antes de empezar (5 minutos)

1. Elegir una hora tranquila (un sábado o por la tarde, no en horario de clases): hay un lapso corto en que algunos dispositivos todavía ven los nameservers viejos.
2. Tener a mano: acceso a Namecheap, un correo para crear la cuenta de Cloudflare y activar la verificación en dos pasos en las dos.
3. Para volver atrás en cualquier momento: en Namecheap, *Nameservers → Namecheap BasicDNS*. Los registros viejos siguen ahí mientras no los borres.

## Paso 1 — Copiar los registros actuales

1. Namecheap → *Domain List* → **Manage** de `yoaprendo.online` → pestaña **Advanced DNS**.
2. Hacer una captura de pantalla de **toda** la lista de registros (y guardarla fuera del repositorio; no subirla a GitHub).
3. Comprobar que aparecen, como mínimo: los 3-4 A de la raíz, los CNAME `www` y `clases`, los MX, el TXT de SPF, el TXT de Google y el TXT de `_dmarc`.
   Si hay algo más (DKIM, SES), anotarlo también.

## Paso 2 — Crear el sitio en Cloudflare

1. Entrar en <https://dash.cloudflare.com> → **Add a domain** → `yoaprendo.online` → plan **Free**.
2. Cloudflare escanea y **importa** los registros que encuentra. **No confiar en el escaneo**: comparar uno por uno con la captura del paso 1 y agregar a mano los que falten.
3. Dejar cada registro así:

| Registro | Modo de proxy |
|---|---|
| `clases` (CNAME → `billiog.github.io`) | **Proxied** (nube naranja) |
| `www` y raíz (los A y CNAME a GitHub Pages) | **DNS only** (nube gris) por ahora; se pueden pasar a naranja después si se quieren las mismas cabeceras |
| MX, TXT (SPF, DMARC, Google, DKIM), CNAME de SES o de correo | **DNS only** (siempre; el correo no pasa por proxy) |

4. Cloudflare muestra dos nameservers (por ejemplo `xxxx.ns.cloudflare.com`). Copiarlos.

## Paso 3 — Cambiar los nameservers en Namecheap

1. Namecheap → `yoaprendo.online` → **Domain** → *Nameservers* → **Custom DNS** → pegar los dos de Cloudflare → ✔.
2. Esperar (normalmente entre 5 minutos y 2 horas). Cloudflare manda un correo cuando el dominio queda *Active*.
3. Mientras tanto no tocar nada más. Si el correo se llega a probar antes de tiempo, puede tardar.

## Paso 4 — Ajustes de Cloudflare (cuando esté *Active*)

1. **SSL/TLS → Overview**: modo **Full (strict)**. (Con *Flexible* el sitio entra en un bucle de redirecciones con GitHub Pages.)
2. **SSL/TLS → Edge Certificates**: **Always Use HTTPS** activado. No activar HSTS aquí (se manda con la regla de abajo, sin `preload`).
3. **Rules → Transform Rules → Modify Response Header → Create rule** (nombre: «Cabeceras de seguridad»):
   - *When*: **Hostname** *equals* `clases.yoaprendo.online`.
   - *Then*: **Set static** para cada fila:

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), geolocation=(self), microphone=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=31536000` |

   La cámara (QR de asistencia, escáner de exámenes) y la ubicación (reportes, bonos de visita) se siguen pudiendo usar. Sin `includeSubDomains` ni `preload`.
4. **Caching → Configuration**: dejar *Browser Cache TTL* en **Respect Existing Headers**. **No** crear reglas de «Cache Everything» para `index.html` ni
   `service-worker.js` (la versión nueva tiene que verse en cuanto se publica).
5. **Speed → Optimization**: desactivar *Rocket Loader*, *Auto Minify* y *Mirage* si aparecen (reescriben el JavaScript y rompen los hashes de integridad de las librerías).
   Dejar **Always Online** desactivado.

## Paso 5 — Verificar

Desde cualquier computadora con Node 18 o superior, en la carpeta del repositorio:

```bash
node scripts/verificar-cabeceras.mjs
```

Debe decir **OK** en las cinco cabeceras y `servidor: cloudflare`. Si falta alguna, revisar la regla del paso 4.3. Después, probar a mano:

1. Entrar como docente y como estudiante (con la ventana de incógnito, para no usar la caché).
2. Recargar la app dos veces y confirmar que la versión que se ve es la última.
3. Abrir la cámara de asistencia y el escáner de exámenes.
4. Abrir un reporte que pida la ubicación.
5. Subir un proyecto con video y jugar un duelo.
6. **Correo:** mandar un mensaje de prueba **desde y hacia** una dirección `@yoaprendo.online` y revisar que llegue (y que no caiga en spam).
7. Abrir `https://yoaprendo.online` y `https://www.yoaprendo.online` (el otro sitio) y confirmar que cargan.

## Si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| El sitio da «Too many redirects» | SSL/TLS en *Full (strict)* (no *Flexible*) |
| Error 525/526 | Esperar unos minutos a que GitHub Pages emita el certificado; en GitHub → Settings → Pages, desmarcar y volver a marcar *Enforce HTTPS* |
| Falla la cámara o la ubicación | Revisar que la regla `Permissions-Policy` conserve `camera=(self)` y `geolocation=(self)` |
| No llega el correo | Falta un registro DKIM/MX/TXT: compararlo con la captura de Namecheap y agregarlo en Cloudflare **sin proxy** |
| Cualquier otro problema grave | Pasar `clases` a nube gris (*DNS only*) apaga el proxy y las cabeceras al instante; o volver a *BasicDNS* en Namecheap |

## Qué NO cubre

- No hace que la CSP bloquee `fetch`/`connect` hacia otros sitios (la app habla con Supabase, con la Raspberry en la red local por `http` y con recursos de cursos de cualquier sitio).
- No afecta al servidor escolar (red local) ni a las Edge Functions de Supabase (otro dominio).
- Sin Cloudflare, el sitio sigue funcionando igual: esto es una capa extra, no un requisito.

Cuando esté hecho: marcar en `PENDIENTES.md` el punto de cabeceras y anotar la fecha en `docs/SEGURIDAD_2026-11.md` §10.
