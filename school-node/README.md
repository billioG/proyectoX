# Nodo escolar Quetzal (computadora con Windows o Raspberry Pi)

Sirve Quetzal LMS en la red local de una escuela **sin internet** y se sincroniza
con la nube cuando consigue señal (cable, hotspot del celular o memoria USB).

Los estudiantes se conectan al Wi-Fi del router con su celular o tablet y abren
la dirección del nodo: **http://quetzal.local** (o la IP, por ejemplo
`http://192.168.1.50`). No gastan datos.

## La app real sobre el nodo (desde v1.0.196)

Cuando el nodo ya **sincronizó una vez** con la nube, tus estudiantes y docentes abren la **misma app de siempre**
(no una pantalla aparte) y funciona sin internet:

- **Estudiantes:** entran con su **usuario y la contraseña de la clase** (o solo con el usuario si esa clase no usa
  contraseña), igual que en línea. No hay lista de usuarios. Ven Inicio, Cursos, Perfil, el cofre diario y la
  **Práctica** del Centro de Juego (con preguntas del banco, sin IA). Completar una lección suma +10 XP al instante.
- **Docentes:** entran con su **correo y la misma contraseña de su cuenta** (sin PIN aparte). En cada sincronización la nube
  manda al nodo solo la huella cifrada (bcrypt) de la contraseña de los docentes de esa escuela, así que entran sin internet
  aunque nunca hayan usado esa Raspberry. Si cambian su contraseña en la nube, la nueva llega en la siguiente sincronización.
  Desde ahí **evalúan proyectos** de sus clases (el nodo recalcula el total y la nube lo vuelve a validar), **envían avisos** y
  **crean cursos y recursos** (videos, PDF, imágenes, paquetes SCORM/H5P/HTML5, enlaces y cuestionarios) con la misma pantalla de
  siempre: los archivos se guardan en la Raspberry y los estudiantes los ven al instante. Al sincronizar con internet suben a la nube
  (primero los archivos, directo a Storage con una URL firmada; después el curso y sus recursos) y quedan con la misma dirección.
  Los **comentarios de equipo, «me gusta» y notas privadas** de los recursos también funcionan (con el mismo filtro de lenguaje que la nube) y
  suben al sincronizar; solo los adjuntos de imagen necesitan internet. También **pasan lista** (asistencia por QR o lista; un registro por estudiante y día), **arman equipos** (crear, renombrar, borrar y editar miembros y roles) y ven el **progreso** de práctica de sus clases. Los ids de equipos nuevos usan un rango reservado (1 500 000 000 a 2 099 999 999) para no chocar con los de la nube. «Compartir» manda el curso a la Biblioteca Compartida. Límites: 150 MB por archivo, solo sus propios cursos, y un curso compartido
  se borra en línea (sin internet solo se puede dejar de compartir). Si la nube rechaza un archivo, la barra de estado lo dice y por qué.
- **Proyectos y reacciones (desde v1.0.208):** el estudiante **sube su proyecto** (video o modelo 3D, hasta 150 MB) y **reacciona** a los de sus compañeros con la misma pantalla de siempre. El proyecto aparece al instante y se publica en la nube al sincronizar (mismas reglas: título, descripción, bimestre, su equipo y hasta 5 esperando); las reacciones cuentan al sincronizar. Ya no hace falta el modo anterior para esto.
- **Exámenes, permisos y mascota (desde v1.0.209–211):** los docentes crean **exámenes con hoja de respuestas** (la clave nunca llega a un estudiante), califican y consultan notas, y piden **permisos de asistencia** (quedan pendientes hasta que un administrador los apruebe en línea); los estudiantes ven sus notas y usan su **mascota** (elegir, comprar huevos con gemas, cambiar de compañero, comprar y ponerse accesorios; la nube aplica cada acción al sincronizar con las mismas reglas). Requiere `migrations/node-companion.sql` y `node-sync` completo.
- **Retos Contrarreloj y Ahorcado (desde v1.0.212 y v1.0.213):** el estudiante reta a un compañero de su escuela (con apuesta de gemas), el rival acepta y cada uno juega sus propios problemas de matemática contra el reloj; gana el de más aciertos y, si empatan, el más rápido. El servidor calcula todo y las respuestas nunca llegan al navegador. La nube recalcula y liquida al sincronizar. El Ahorcado usa el banco fijo de palabras (los temas que genera la IA necesitan internet) y gana quien la adivina más rápido. Requiere `migrations/node-timed-math-duel.sql`, `migrations/node-hangman-duel.sql` y `node-sync` completo (14 archivos).
- **Foto de perfil (desde v1.0.220):** estudiantes y docentes cambian su foto con el modal de siempre; se ve al instante, gana el premio de la primera foto y sube a la nube al sincronizar. Requiere `migrations/node-profile-photo.sql` y `node-sync` actualizado.
- **Buzón (desde v1.0.221):** sugerencias y evaluación semanal del docente; suben a la nube al sincronizar. Requiere `migrations/node-feedback.sql` y `node-sync` actualizado.
- **Sincronizar desde la plataforma (desde v1.0.223):** el docente entra a Quetzal desde su computadora con internet, abre «Servidor de la escuela» y ve el estado de la Raspberry (en línea, cambios por subir, avance) y toca «Sincronizar ahora»; no necesita su dirección IP. Requiere `migrations/node-remote-sync.sql` y `node-sync` actualizado.
- **Buzón (desde v1.0.223):** el docente lee las evaluaciones y sugerencias de su clase de forma anónima y el administrador con nombres, también sin internet. Requiere `migrations/feedback-inbox.sql`.
- **Lo que sigue necesitando internet:** los retos de comprensión, ortografía y depuración (necesitan IA para crear su contenido), notificaciones en tiempo real, la tienda y el pase de temporada, el chat de la mascota y el asistente con IA, y adjuntar imágenes a un comentario.
- **Sincronización al conectar (desde v1.0.222):** el servidor revisa cada 15 s si llega a la nube y, en cuanto la tiene (cable a un router con internet, o Wi-Fi), sincroniza solo; la barra de abajo muestra el paso en que va y avisa al terminar. Al conectarlo a otra red su dirección IP cambia: conecta el celular a la MISMA red y abre `http://quetzal.local:8080` o la dirección nueva (toca el texto de la barra para verla).
- **Sincronización:** automática cada 10 minutos cuando hay internet, o a mano con el botón **Sincronizar ahora** del
  aviso de abajo a la izquierda, que también muestra «Sincronizado hace X» o «N cambios por subir».
- **Modo anterior (PIN y panel del nodo):** sigue disponible en **`/?modo=pin`** (o con el enlace «Docente» del aviso):
  restablecer PIN de un estudiante, desbloquear, sincronizar por USB y ver ingresos.
- **Cuándo se activa:** solo si la réplica ya tiene a los estudiantes **y todas las clases con estudiantes activos tienen
  contraseña de clase conocida**. Si alguna clase no la tiene, el nodo se queda en el modo anterior para que nadie pierda
  el acceso. Antes de la primera sincronización también funciona el modo anterior.

**Una Raspberry por escuela:** cada servidor queda atado a UNA escuela por su token y su base de datos se reemplaza con los datos de esa escuela al sincronizar. Un docente que trabaja en dos escuelas necesita un servidor para cada una; no se debe cambiar el token de un servidor para usarlo en otra escuela (se perdería lo hecho sin internet que no se haya sincronizado).

**Archivos y fotos:** los videos, PDF, imágenes y paquetes H5P/SCORM de los cursos se sirven desde el propio nodo (carpeta
`data/content`, que baja la sincronización): hasta que `pending.files` de `/api/node/status` llegue a 0, esos archivos aún
no están y no se verán sin internet. Las **fotos de perfil** se descargan al sincronizar (`data/photos`). Si una foto aún
no se descargó, se ve el ícono de siempre.

**Lo que no funciona sin internet:** la IA (evaluar con IA, generar preguntas), los retos que usan IA (comprensión, ortografía y depuración), anuncios push, avisos
a padres y encuestas. Esas pantallas salen vacías, sin errores. La **racha diaria** no sube sin internet
(la calcula la nube al sincronizar). Un docente no puede borrar ni editar un aviso sin internet.

Lo que se hace sin internet se guarda en el nodo (en una «bandeja de salida») y se sube al sincronizar; si algo no se
puede aplicar en la nube (por ejemplo una evaluación de un proyecto que no es de la clase del docente), se descarta sin
trabar el resto de la sincronización.

## Qué hace el modo anterior (PIN) y el panel del nodo

- Sirve la app y los archivos de los cursos (H5P, videos, PDF) a las tablets.
- Login de alumnos con **PIN personal de 4 números** (se crea la primera vez).
  5 intentos fallidos bloquean la cuenta 5 minutos.
- Guarda el progreso en la Raspberry (la mejor nota gana).
- Cada 10 minutos intenta sincronizar: sube progreso, PIN y sesiones; baja
  alumnos, cursos, progreso y los archivos nuevos.

- **Sincronización por memoria USB** para escuelas donde la Raspberry nunca
  consigue internet (ver abajo).
- **Panel del docente** sin internet: botón "Docente" en la pantalla de ingreso,
  con el código de docente del nodo. Muestra quién entró y desde qué tablet,
  permite **restablecer el PIN** de un alumno que lo olvidó y **desbloquear** a
  quien falló 5 veces. El PIN restablecido también se sincroniza con la nube.
- **Proyectos de los estudiantes:** además de Cursos, el estudiante ve **Subir proyecto**: sube un video o modelo 3D
  (hasta 150 MB) al nodo por el Wi-Fi de la escuela y, cuando el nodo tiene internet, se publica solo en la nube
  (ver "Proyectos de los estudiantes" abajo).
- En el modo anterior se oculta lo que necesita internet (asistente con IA) y el header muestra el nombre de la escuela.
  Con la app real activa (arriba) ya no se oculta nada: lo que no puede funcionar sin internet sale vacío.

> **Sin internet, la app sigue arrancando.** El nodo entrega `index.html` con las librerías de CDN
> reemplazadas por copias locales de `vendor/cdn/` (`school-node/offline-assets.js`).

## Instalación de un doble clic (lo más automático)

**Windows.** Copia la carpeta `school-node` (o el instalador que te dieron) a la PC, pon el token de la escuela en un archivo `token.txt` junto a `instalar-todo-windows.cmd` (una línea; copia `token.txt.ejemplo`) y dale **doble clic** a `instalar-todo-windows.cmd`. Acepta el permiso de administrador una sola vez. Hace solo: instalar o actualizar, abrir el firewall, arrancar con Windows, evitar que la PC se duerma, **primera sincronización**, esperar a que bajen los cursos, **comprobar que la app normal quedó activa**, guardar `C:\Quetzal\Resumen-instalacion.txt` (dirección, código de docente y pendientes; solo lo abren administradores) y abrir el cartel. Si algo falta lo dice con la palabra **FALTA**. Sin `token.txt` instala igual y avisa.

**Raspberry desde Windows (sin monitor ni teclado).** Con la Raspberry por cable al router y SSH habilitado, dale doble clic a `instalar-raspberry-por-ssh.cmd`: pide el usuario y la contraseña de la Raspberry, entra por SSH, instala con `--auto` y abre el cartel. Parámetros: `-Servidor 192.168.x.x` si `quetzal.local` no responde.

**Raspberry directo.** `curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | QUETZAL_TOKEN='XXXX' bash -s -- --auto`

Lo que **no** puede hacer ningún instalador: reservar la IP en el router, imprimir el cartel, ponerles contraseña a las clases y que cada docente cree su PIN (con internet). Quedan listados en el resumen.

## Instalación en una computadora con Windows 10/11

```
Router Wi-Fi ──cable── Computadora (nodo Quetzal)
   │                         └─ cuando hay internet: sincroniza con la nube
   └── Wi-Fi ── celulares y tablets de los estudiantes
```

1. Conectar la computadora al router (mejor por **cable**).
2. Descargar `school-node/instalar-windows.cmd` y `school-node/install-windows.ps1`
   (en la misma carpeta) y hacer doble clic en `instalar-windows.cmd`. Pide permiso
   de administrador.
3. Pegar el **token del nodo** cuando lo pida (ver "Obtener el token del nodo"). Si todavía no lo tienes,
   presiona Enter y pégalo después **sin editar archivos**: abre Quetzal en la computadora → botón **Docente**
   → código de docente → pega el token → **Guardar y sincronizar**.

El instalador deja todo en `C:\Quetzal`:

| Carpeta / archivo | Qué es |
|---|---|
| `app\` | el código (se reemplaza al actualizar) |
| `node\` | Node.js 22 propio y portátil (no toca otro Node.js de la computadora) |
| `config.json` | token, código de docente y puerto; solo lo leen administradores |
| `data\` | base de datos y archivos de cursos (no se borra al actualizar) |
| `logs\nodo.log` | registro del nodo |

Además: abre el puerto (80, u 8080 si está ocupado) en el firewall **solo para la
red local**, crea la tarea programada "Quetzal - Nodo escolar" (arranca sola al
prender la computadora, aunque nadie inicie sesión, y se reinicia si falla), evita
que la computadora se suspenda enchufada y pone en el escritorio dos accesos:
**Quetzal (nodo escolar)** y **Quetzal - Cartel para estudiantes** (dirección y QR
para imprimir; también en `http://IP-DEL-NODO/cartel`).

- Ver el código de docente o cambiar el nombre de la dirección: doble clic en `abrir-configuracion-windows.cmd`
  (abre `config.json` en el Bloc de notas con permiso de administrador).
- Actualizar: doble clic en `actualizar-windows.cmd` (o `instalar-windows.cmd -Update`)
- Quitar: doble clic en `desinstalar-windows.cmd` (o `instalar-windows.cmd -Uninstall`; conserva `C:\Quetzal\data`; con
  `-BorrarDatos` también lo borra).

**Nombre de la dirección:** por defecto `http://quetzal.local`. Para cambiarlo
(por ejemplo a `http://ada.local`), editar `"hostName": "ada"` en
`C:\Quetzal\config.json` y reiniciar la computadora (solo letras, números y
guion). El nombre lo publica el propio nodo por mDNS, sin tocar el router:
funciona en iPhone y en la mayoría de Android recientes; si algún celular no lo
encuentra, usar la IP del cartel. El cartel (`/cartel`) siempre muestra el
nombre y la IP de respaldo.

**Router:** reservar la IP de la computadora (reserva DHCP / "IP fija" en el panel
del router), así la dirección del cartel no cambia. Si el router tiene "aislamiento
de clientes" o "AP isolation", desactivarlo en la red de los estudiantes, si no
los celulares no ven la computadora. Un router doméstico aguanta bien 20-30
celulares a la vez; para más, usar un punto de acceso de mejor calidad.

**Memoria USB en Windows:** el nodo busca la carpeta `QUETZAL` en la raíz de las
unidades D: a Z:.

## Chromebook (solo para pilotos)

Se puede usar una Chromebook que tenga **Linux** activado (Configuración →
Opciones para desarrolladores → Linux; en Chromebooks administradas por la escuela
suele estar bloqueado). En la terminal de Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash
```

Detecta ChromeOS solo y usa el puerto **8080**, sin `quetzal.local`. Al final
indica los 3 pasos que se hacen en ChromeOS: reenviar el puerto 8080 (Linux →
Reenvío de puertos), reservar la IP de la Chromebook en el router y evitar que se
suspenda enchufada. Los celulares entran por `http://IP-DE-LA-CHROMEBOOK:8080`.

Limitaciones: el servidor solo corre mientras Linux está abierto (tras reiniciar
hay que abrir la app Terminal), no puede crear su propia red Wi-Fi y la memoria
USB hay que compartirla con Linux desde Archivos. Para una escuela, una
Raspberry Pi o una PC con Windows es más estable.

## Instalación en Raspberry Pi (un comando)

En la Raspberry, con internet (Raspberry Pi OS 64 bits, con o sin escritorio):

```bash
curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash
```

Pide el **token del nodo** (ver "Obtener el token del nodo") y al final muestra:

- la dirección para las tablets: **http://quetzal.local** (o la IP);
- el **código de docente** (guárdalo: es para el panel del docente).

Escuelas **sin router**: agrega `--hotspot` y la Raspberry crea su propia red
Wi-Fi "Quetzal-Escuela" (muestra la contraseña al final):

```bash
curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash -s -- --hotspot
```

Actualizar el código más adelante: `bash ~/quetzal/school-node/install.sh --update`

Antes de instalar, `bash install.sh --check` **solo revisa** si la computadora sirve (sistema de 64 bits, 2 GB libres,
memoria, internet) y dice qué falta, sin instalar nada. El instalador hace esa misma revisión al empezar y se detiene con
un mensaje claro si algo no sirve. Lo más corto, sin preguntas: `... | bash -s -- --auto --token=TOKEN`.

**Muchas Raspberries:** en vez de instalar una por una, prepara una **imagen de microSD** y cópiala; cada nodo solo
necesita su token en un archivo de texto: `docs/NODO_IMAGEN_MICROSD.md` (`install.sh --image`, `imagen/prepare-image.sh`).

**Respaldo.** El instalador deja un **respaldo diario** de la base (`data/backups`, 14 días, con copia a la USB si hay una
conectada). A mano: `node backup.js`; restaurar: `node backup.js --restore ARCHIVO` con el servicio detenido. Guía completa:
`docs/NODO_RESPALDO.md`. **Capacidad y límites:** `docs/NODO_LIMITES.md` (prueba de carga en
`herramientas/prueba-de-carga.mjs`). **Colegio nuevo:** `docs/CHECKLIST_NUEVO_COLEGIO.md`.

> **Sobre HTTPS.** El nodo funciona por HTTP dentro de la red de la escuela.
> Todo lo que usan los alumnos en el nodo (cursos, PIN, progreso) funciona así.
> HTTPS solo haría falta para funciones del navegador que lo exigen (modo sin
> conexión dentro de la tablet, cámara); requiere un subdominio con
> certificado y queda para una etapa siguiente.

## Instalar o actualizar por SSH (Raspberry Pi)

Sirve para instalar o actualizar el nodo **sin teclado ni pantalla en la Raspberry**, desde tu computadora.

**1. Activa SSH en la Raspberry** (una vez). Con Raspberry Pi Imager, en «Configuración avanzada» marca *Habilitar SSH* y
pon usuario y contraseña. O con pantalla: `sudo raspi-config` → *Interface Options* → *SSH* → *Enable*.

**2. Conéctate** desde tu computadora (en la misma red que la Raspberry, o por Internet con una VPN):

```bash
ssh TU_USUARIO@quetzal.local      # o con la IP: ssh TU_USUARIO@192.168.1.50
```

Windows 10/11 ya trae `ssh` en PowerShell. La primera vez pregunta «Are you sure...»: escribe `yes`.

**3a. Primera instalación** (la Raspberry necesita internet; pide el **token del nodo**, ver «Obtener el token del nodo»):

```bash
curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash
```

Con red Wi-Fi propia (escuelas sin router) agrega `-s -- --hotspot` al final. El instalador es interactivo y
funciona igual por SSH. Al terminar muestra la dirección para las tablets y el **código de docente**: guárdalos.

**3b. Actualizar un nodo ya instalado** (conserva estudiantes, progreso y configuración):

```bash
bash ~/quetzal/school-node/install.sh --update
```

Baja el código de GitHub, instala dependencias y reinicia el servicio. **Ojo:** el código viene de la rama `main` de
GitHub, así que una función nueva solo llega al nodo cuando ya está publicada allí.

**4. Comprueba que quedó bien:**

```bash
sudo systemctl status quetzal-node --no-pager      # debe decir "active (running)"
journalctl -u quetzal-node -n 30 --no-pager        # últimas líneas del registro
curl -s http://localhost/api/node/status           # {"node":true,"rest":true,...}
```

En `api/node/status`: `"rest": true` significa que la app real ya está activa; `"rest": false` es normal antes de la
primera sincronización o si alguna clase no tiene contraseña de clase (el nodo sigue en el modo anterior).
`pending_changes` son los cambios que faltan por subir a la nube.

**5. Primera sincronización tras actualizar:** espera 10 minutos o entra a `http://IP-DEL-NODO/?modo=pin` → **Docente** →
**Sincronizar ahora**. Después abre `http://IP-DEL-NODO` desde una tablet y prueba entrar.

> **No uses `node sync.js` a mano con el nodo encendido** para sincronizar: es otro proceso y el servidor seguiría
> mostrando los datos anteriores hasta reiniciarlo (`sudo systemctl restart quetzal-node`). Usa el botón **Sincronizar ahora**.

**Ojo con dónde ejecutas cada cosa:** `ssh ...` se ejecuta en **tu computadora**; todo lo que sigue (`bash ~/quetzal/...`,
`curl ...`, `sudo ...`) se ejecuta **dentro de la Raspberry**, ya conectado. Si falla algo al conectar (huella cambiada,
«Connection refused», no sabes la IP), ver «Solución de problemas» más abajo.

**Antes de actualizar, en la nube** (una vez por versión, si la nota de versión lo pide): ejecutar las migraciones nuevas en
el SQL Editor de Supabase y volver a desplegar la función `node-sync` con **todos** sus archivos
(`index.ts`, `tables.ts`, `practice.ts`, `completions.ts`, `announcements.ts`, `evaluations.ts`, `projects.ts`, `xp.ts`,
`reactions.ts`) y **Verify JWT en OFF**. Ver `docs/MIGRATIONS.md`.

Un nodo con **Windows** se actualiza con `actualizar-windows.cmd` (no necesita SSH).

## Instalar una escuela nueva: orden recomendado

1. **Con internet.** Conecta la Raspberry (o la PC con Windows) a una red **con salida a internet** y haz la instalación
   (Windows: `instalar-windows.cmd`; Raspberry: el comando de «Instalación en Raspberry Pi», por SSH si no tienes pantalla).
2. **Reserva una IP fija** para el nodo en el router (ver «No sé la IP del nodo»).
3. **Primera sincronización, con internet.** Entra a `http://IP-DEL-NODO/?modo=pin` → **Docente** → código de docente →
   **Sincronizar ahora**. Espera a que termine.
4. **Comprueba que bajó todo:** abre `http://IP-DEL-NODO/api/node/status` en el navegador y mira:
   - `"rest": true` → la app real ya está activa. Si es `false`, todavía no sincronizó, o alguna clase no tiene contraseña de
     clase (ver «Cuándo se activa»).
   - `pending.files = 0` → todos los archivos de los cursos ya están en el nodo. **Si es mayor que 0, esos archivos no se
     verán sin internet.** Espera con internet a que llegue a 0.
   - `pending_changes = 0` y `sync_error` vacío → no queda nada por subir.
5. **Sincroniza una vez con internet** para que el nodo reciba a los docentes: ya no hace falta crear ningún PIN, entran con su
   correo y su contraseña de siempre. (En la nube debe estar corrida `migrations/teacher-node-password.sql`.)
6. **Desconecta el internet** (deja solo la red de la escuela) y prueba desde una tablet: un estudiante (usuario y contraseña de
   la clase) con un curso y un video, y un docente (correo y contraseña de su cuenta).
7. **Fotos de perfil:** se descargan en cada sincronización; aparecen después de la primera sincronización con internet.
8. **Imprime el cartel** (`http://IP-DEL-NODO/cartel`) desde esa red: si cambias de router, la dirección cambia y hay que
   imprimirlo otra vez.

## Kit de router + Raspberry (el docente solo enchufa)

Desde v1.0.265 el nodo trae un servidor de nombres (`dns.js`): si el router del kit entrega la IP de la Raspberry como DNS, `quetzal.local` abre en **cualquier** dispositivo (también Android 11 o anterior, que no entiende mDNS) y, sin internet, el nodo contesta las comprobaciones de «¿hay internet?» de los celulares. El router se prepara una sola vez: **`docs/NODO_KIT_ROUTER.md`**. Sin preparar el router no cambia nada. Con `--hotspot`, la red propia ya resuelve `quetzal.local`.

## Conectar la Raspberry a Wi-Fi

**Lo más fácil (desde v1.0.206): la página `/wifi`.** En el servidor abre `http://IP-DEL-SERVIDOR/wifi` (o toca **Wi-Fi** en la barra de estado), entra con tu
correo y contraseña de docente, toca **Buscar redes**, elige la tuya, escribe la clave y **Conectar**. Si la clave es mala lo dice y no guarda nada. Si estás
usando el servidor por su propio Wi-Fi, al cambiar de red perderás esa página: vuelve a abrirla con la dirección nueva. El instalador deja el país del Wi-Fi
en GT y lo desbloquea (sin eso las Raspberry nuevas no encienden el Wi-Fi). Lo de abajo es la forma manual por SSH.

Hazlo con el cable todavía conectado y tu sesión SSH abierta, así no pierdes el acceso si algo sale mal.

```bash
sudo raspi-config nonint do_wifi_country GT      # el país del Wi-Fi (sin esto puede quedar bloqueado)
sudo rfkill unblock wifi
nmcli -v                                         # si muestra versión, usa NetworkManager (Raspberry Pi OS reciente)
sudo nmcli device wifi rescan
sudo nmcli device wifi list                      # debe aparecer el nombre (SSID) de tu red
sudo nmcli device wifi connect "NOMBRE_DEL_WIFI" password "CLAVE_DEL_WIFI"
```

Si el último comando falla con **`802-11-wireless-security.key-mgmt: property is missing`**, no es la clave: `nmcli` no pudo
saber el tipo de seguridad (lista desactualizada o red que no ve). Crea la conexión diciéndole el tipo:

```bash
sudo nmcli connection add type wifi ifname wlan0 con-name "NOMBRE_DEL_WIFI" ssid "NOMBRE_DEL_WIFI" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "CLAVE_DEL_WIFI"
sudo nmcli connection up "NOMBRE_DEL_WIFI"
```

Para una red **oculta** agrega `802-11-wireless.hidden yes` al primer comando. Si `nmcli` no existe (versión antigua),
usa `sudo raspi-config` → *System Options* → *Wireless LAN*.

Comprueba con `nmcli device status` (`wlan0` debe decir `connected`) y `hostname -I` (verás una IP por cada conexión).

Para saber:
- **La IP del Wi-Fi no es la del cable.** Cada interfaz tiene su propia IP y su propia **MAC**: si reservaste una IP fija para
  el cable, reserva otra con la MAC del Wi-Fi (`ip link show wlan0`).
- **Banda:** una Raspberry Pi 4 usa 2,4 y 5 GHz; un Pi 3 o Zero solo 2,4 GHz. Con un hotspot de celular usa 2,4 GHz.
- **Cada router tiene su propia red.** Al cambiar de router la IP cambia (por ejemplo de `192.168.0.x` a `192.168.3.x`).
  Las direcciones que terminan en `.1` (como `192.168.3.1`) suelen ser **el router**, no la Raspberry.
- **Sin router en la escuela:** el instalador puede crear su propia red «Quetzal-Escuela» con `--hotspot`.

## Detener o desactivar el nodo en Windows

Abre PowerShell **como administrador** (el nodo corre como la tarea programada «Quetzal - Nodo escolar»):

```powershell
Stop-ScheduledTask -TaskName "Quetzal - Nodo escolar"        # detenerlo ahora (vuelve al reiniciar la PC)
Disable-ScheduledTask -TaskName "Quetzal - Nodo escolar"     # que no arranque más al prender la PC
Enable-ScheduledTask -TaskName "Quetzal - Nodo escolar"      # volver a permitirlo
Start-ScheduledTask -TaskName "Quetzal - Nodo escolar"       # arrancarlo
```

Para comprobar que quedó detenido: `Invoke-RestMethod http://localhost/api/node/status` debe fallar con «No es posible conectar
con el servidor remoto». **Antes de detenerlo** mira `pending_changes`: si es mayor que 0, sincroniza primero. Quitarlo del todo:
`desinstalar-windows.cmd` (conserva `C:\Quetzal\data`).

Si en la misma red hay **dos nodos** (una PC con Windows y una Raspberry), los dos intentan llamarse `quetzal.local`: deja uno
detenido o cambia `"hostName"` en uno de los `config.json`.

## Solución de problemas

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| `ssh`: **REMOTE HOST IDENTIFICATION HAS CHANGED** | Windows recuerda la huella de otra máquina que antes tenía esa IP (o la Raspberry se reinstaló). | Comprueba que es tu nodo: abre `http://IP/api/node/status` y mira en el router que la MAC y el nombre son los de la Raspberry (MAC que empiece por `B8:27:EB`, `DC:A6:32`, `E4:5F:01`, `D8:3A:DD` o `2C:CF:67`). Si coinciden, `ssh-keygen -R IP` y vuelve a conectar (`yes`). Si no coinciden, **no entres**: esa IP la tomó otro equipo. |
| `ssh`: **Connection refused** (puerto 22) | Ese equipo no tiene SSH encendido. Un nodo en **Windows** tampoco lo tiene. | Windows: se actualiza con `actualizar-windows.cmd`, sin SSH. Raspberry **sin monitor ni teclado**: saca la tarjeta SD, y en la unidad `bootfs` crea un archivo vacío llamado exactamente `ssh`; al encender, SSH queda activo. |
| Al ejecutar `bash ~/quetzal/...` en PowerShell sale «WSL ... execvpe(/bin/bash) failed» | Ejecutaste el comando **en tu computadora Windows**, no en la Raspberry. | Primero entra con `ssh quetzal@IP`; los comandos de `install.sh` se ejecutan **ya dentro** de la Raspberry. |
| No sé la IP del nodo | Cambió al cambiar de router, o tomó otra. | `ping quetzal.local` (muestra la IP), `arp -a`, o la lista de dispositivos/DHCP del router (nombre `quetzal` o `raspberrypi`). `http://IP/cartel` muestra la dirección y un QR. **Reserva una IP fija** para la MAC del nodo en el router (reserva DHCP / «IP estática») y desactiva el «aislamiento de clientes» (AP isolation), o las tablets no lo ven. |
| `nmcli`: `key-mgmt: property is missing` | `nmcli` no pudo saber el tipo de seguridad de la red. | Ver «Conectar la Raspberry a Wi-Fi» (crear la conexión indicando `wpa-psk`). |
| **No puedo entrar por SSH usando el Wi-Fi** | Tu PC está en otra red que la IP del Wi-Fi de la Raspberry, o el router/hotspot tiene **aislamiento de clientes** (los equipos no se ven entre sí). | Conecta tu PC a **la misma red** y prueba `ping IP-DEL-WIFI`. Si no responde estando en la misma red, desactiva el aislamiento. Para administrar, usa el cable cuando puedas; el Wi-Fi es para las tablets. `quetzal.local` solo se resuelve dentro de la misma red. |
| **Sincronizar dice «no hay conexión a internet»** teniendo cable y Wi-Fi conectados | La Raspberry manda el internet por la conexión que **no tiene salida**. | `ip route` (la línea `default via ... dev ...` con menor `metric` es la que usa) y `ping -c 2 -I eth0 8.8.8.8` / `ping -c 2 -I wlan0 8.8.8.8` (el que responde tiene internet). Deja **una sola conexión** con internet para sincronizar (`sudo nmcli connection down "Wired connection 1"`), o sube la prioridad de la buena (`sudo nmcli connection modify "NOMBRE" ipv4.route-metric 700`). Si el `ping` a `8.8.8.8` funciona pero `github.com` no, es el DNS: `sudo nmcli connection modify "NOMBRE" ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes` y `sudo nmcli connection up "NOMBRE"`. |
| `api/node/status` dice `"rest": false` | Aún no sincronizó, o alguna clase de estudiantes activos **no tiene contraseña de clase**. | Sincroniza con internet. Si sigue en `false`, revisa en la app (admin/docente) que **todas** las clases tengan contraseña de clase: mientras una no la tenga, el nodo usa el modo anterior (PIN) para toda la escuela. |
| Los **recursos de los cursos** (video, PDF, H5P) no cargan sin internet | Versiones anteriores a **v1.0.198** los pedían a la nube. O los archivos aún no se descargaron. | Actualiza (`bash ~/quetzal/school-node/install.sh --update`). Mira `pending.files` en `api/node/status`: debe ser `0`; si no, sincroniza con internet hasta que llegue a 0. |
| Al comentar sale «No tienes permiso, avisa al administrador» | Versiones anteriores a v1.0.198 mostraban ese texto. Los comentarios y notas **no existen sin internet**. | Actualiza: ahora dice «Esto no está disponible sin internet». Comenta cuando el nodo tenga internet. Lo mismo con subir proyecto y reaccionar, que de momento solo funcionan en `/?modo=pin`. |
| La **foto de perfil** no se ve | Las fotos se descargan en la sincronización; sin ella se ve el ícono. | Sincroniza **con internet** (v1.0.198 o posterior) y recarga la app. |
| El **docente** entra con «credenciales inválidas» | Escribió una contraseña distinta a la de su cuenta, o el nodo todavía no recibió su huella. | Debe usar **su correo y la contraseña con que entra a Quetzal en línea**. En la nube debe estar corrida `migrations/teacher-node-password.sql` y desplegado `node-sync` completo. Un docente que no esté **asignado a una clase de esa escuela** no entra. Sincroniza con internet y revisa en la Raspberry: `cd ~/quetzal/school-node && node -e "const D=require('better-sqlite3');const db=new D('data/node.db',{readonly:true});console.log('con contraseña:',db.prepare('select count(*) n from rest_teacher_logins where bcrypt is not null').get().n,'| docentes:',db.prepare('select count(*) n from rest_rows where tbl=?').get('teachers').n)"`. Si «con contraseña» es 0, la nube no mandó las huellas (falta la migración o el despliegue); si «docentes» es 0, ese docente no tiene clases asignadas en esa escuela. |
| `quetzal.local` no abre en tablets con Android viejo (sí con la IP) | Android 11 o anterior no entiende mDNS: le pregunta el nombre al DNS que da el router. | Prepara el router del kit para que entregue la IP de la Raspberry como DNS (`docs/NODO_KIT_ROUTER.md`). Se comprueba en `/api/node/status`: `dns.clients` mayor que 0. |
| Fecha u hora incorrecta tras un apagón | La Raspberry no tiene reloj propio y sin internet puede desfasarse. | Cuando vuelva el internet se corrige sola. Mientras tanto afecta el día del cofre diario y la fecha de los avisos. |

## Requisitos

- Raspberry Pi 4 (4 GB) con Raspberry Pi OS Lite 64-bit.
- Recomendado: SSD por USB en vez de microSD (aguanta mejor los cortes de luz).
- Node.js 22 (el instalador lo instala; con Node 20 las pruebas con TypeScript se omiten).

## Instalación manual (si no se puede usar el instalador)

```bash
# 1. Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Código
git clone https://github.com/billioG/proyectoX.git ~/quetzal
cd ~/quetzal/school-node
npm install --omit=dev

# 3. Configuración
cp config.example.json config.json
nano config.json   # pegar el token del nodo y elegir un teacherCode (6 a 12 números)
```

### Obtener el token del nodo

1. Correr `migrations/school-nodes.sql` en Supabase y deployar la edge function
   `node-sync` con **Verify JWT en OFF**.
2. Entrar a la app como **admin** → menú **Registrar nodo escolar** → elegir el establecimiento →
   **Registrar nodo escolar**. (Sin la pantalla, también se puede desde la consola del navegador con
   `window._supabase.rpc('register_school_node', { p_school: 'CODIGO', p_name: 'Nombre' })`.)
3. Copiar el **token** con el botón **Copiar token**: se muestra **una sola vez** (en la base solo queda su
   hash). Pegarlo cuando el instalador pida `Token:`, o después en el propio nodo: botón **Docente** →
   código de docente → **Guardar y sincronizar** (el nodo lo guarda en `config.json` y sincroniza).

Desde la misma pantalla se ve cada nodo registrado (cuándo se sincronizó por última vez) y se puede
**revocar** si se pierde la computadora.

### Probar

```bash
node sync.js      # sincronización a mano (necesita internet)
node server.js    # abrir http://IP-DE-LA-RASPBERRY:8080 desde una tablet
```

### Dejarlo corriendo siempre (systemd)

```bash
sudo tee /etc/systemd/system/quetzal-node.service >/dev/null <<'EOF'
[Unit]
Description=Nodo escolar Quetzal
After=network.target

[Service]
WorkingDirectory=/home/pi/quetzal/school-node
ExecStart=/usr/bin/node server.js
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now quetzal-node
```

## Sincronizar por memoria USB (sin internet en la escuela)

Sirve también para la **primera carga** de una Raspberry que nunca tuvo
internet: basta con el token del nodo en `config.json`.

1. En una memoria USB, crear una carpeta llamada **`QUETZAL`**.
2. **En la escuela:** conectarla a la Raspberry. En menos de un minuto aparecen
   `de-la-escuela-XXXXXXXX.json` y `estado-XXXXXXXX.txt`. Cuando el estado dice
   **"YA PUEDES SACAR LA USB"**, sacarla.
3. **En una computadora con internet** (Chrome o Edge): entrar a Quetzal LMS
   como docente de esa escuela o admin → menú **Nodo escolar (USB)** → **Elegir
   la carpeta QUETZAL**. La app sube el avance de los alumnos y copia a la USB la
   respuesta y los archivos de cursos que falten (carpeta `archivos/`).
4. **De vuelta en la escuela:** conectar la USB. La Raspberry aplica todo y lo
   confirma en `estado-XXXXXXXX.txt`.

Seguridad: la USB **no** lleva el token del nodo, y los datos de alumnos que
vuelven (`para-la-escuela-….json`) van **cifrados**: solo esa Raspberry los
puede leer (llave en `data/usb-key.pem`, que nunca sale de la Raspberry). Solo
un docente asignado a la escuela del nodo, o un admin, puede sincronizarlo.

### Montaje automático de la USB (Raspberry Pi OS Lite)

La versión con escritorio monta las memorias sola en `/media/<usuario>/`. En
la versión **Lite** hace falta esta regla (una sola vez):

```bash
sudo tee /etc/udev/rules.d/99-quetzal-usb.rules >/dev/null <<'EOF'
ACTION=="add", SUBSYSTEMS=="usb", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", RUN{program}+="/usr/bin/systemd-mount --no-block --automount=yes --collect $devnode /media/quetzal-usb"
EOF
sudo udevadm control --reload-rules
```

El nodo busca la carpeta `QUETZAL` en `/media`, `/mnt` y `/run/media` (en Windows, en D: a Z:). Para
otra ruta, definir la variable de entorno `QUETZAL_USB_DIR`.

## Proyectos de los estudiantes

- El estudiante entra con su PIN → **Subir proyecto** → título, descripción (40 caracteres o más), bimestre, equipo
  (o individual) y un archivo: video (`mp4 mov m4v webm 3gp avi mkv`) o modelo 3D (`stl obj glb`), de hasta 150 MB.
  Se guarda en `dataDir/projects/` y aparece en **Mis proyectos** como «Guardado en la escuela».
- Con internet, cada sincronización (cada 10 minutos o **Sincronizar ahora**) sube los pendientes: el archivo va
  directo a Supabase Storage con una URL firmada y la función `node-sync` crea el proyecto (se publica solo, igual
  que en la nube; el docente puede eliminarlo desde la app). Si falla, el motivo queda en español en «Mis
  proyectos» y en el recuadro «Proyectos de estudiantes» del panel del docente, y se reintenta sin volver a subir
  el archivo.
- **Hace falta volver a publicar la función `node-sync`** (con `--no-verify-jwt`) y que el límite de archivo de
  Supabase Storage sea de 150 MB o más.
- Opciones en `config.json` (todas opcionales): `maxPendingProjects` (5 por estudiante), `minFreeDiskMB` (2048: se
  rechaza si quedaría menos libre), `keepSyncedProjectDays` (7: se borra la copia local de lo ya subido).
- **Videos y modelos 3D de los proyectos de TU escuela, sin internet (desde la v1.0.248).** Al sincronizar, el nodo baja a `data/project-mirror/` los videos de los proyectos de los estudiantes de esta escuela, los más nuevos primero, con la firma que le da `node-sync` (los buckets de la nube son privados). Topes: `projectMirrorMaxFileMB` (150 MB por archivo), `projectMirrorMaxMB` (3072 MB en total), `projectMirrorPerRun` (8 archivos por sincronización) y nunca deja menos disco libre que `minFreeDiskMB`. Lo que ya no existe en la nube se borra del disco. Los proyectos de **otras** escuelas no se copian: solo se ven con internet. Esta carpeta NO entra en los respaldos (se puede volver a bajar).
- Aún no incluye: fotos como proyecto, aprobación previa del docente ni subida por USB.

### Docentes: PIN personal y evaluar proyectos

- El pull baja los docentes de la escuela con sus clases asignadas (sin correos ni contraseñas). En «Soy docente»
  cada uno entra con su **PIN de 6 números**, guardado solo en el nodo (hash y sal); la primera vez lo crea con el
  código de docente del nodo (`teacherCode`). 5 intentos fallidos bloquean 5 minutos. Quien administra el nodo
  puede restablecer el PIN de un docente en el panel de administración (código compartido).
- El docente ve solo los proyectos de sus clases (de la nube y los guardados en el nodo) y evalúa con los 5 criterios
  de 0 a 20. La evaluación pendiente (`evaluations_local`) se manda al sincronizar; la nube exige docente asignado,
  proyecto de la escuela del nodo, notas enteras y recalcula el total. Solo se borra cuando la nube la confirma o la
  rechaza de forma definitiva. El estudiante ve nota y observación al instante en su Inicio.
- El video guardado en el nodo se ve desde la pantalla del docente (`GET /api/teacher/project-file/:id`, con `Range`).
- Hace falta, en este orden: ejecutar `migrations/node-evaluations.sql` en Supabase, volver a publicar `node-sync`
  (subiendo también `evaluations.ts`) y actualizar el nodo. Con la función anterior el nodo conserva lo evaluado.

### Reacciones a proyectos

- En el Inicio, cada tarjeta de la nube tiene el botón de reacción con las cinco reacciones de la app (una por
  proyecto; la misma la quita, otra la cambia). Solo se reacciona a lo que el estudiante ve en su Inicio.
- La nube cuenta los votos (solo ❤️ y ⭐). El nodo guarda la reacción **final** de cada par estudiante-proyecto
  (`reactions_local`; `null` = la quitó) y la base que bajó la última sincronización (`cloud_reactions`); el número
  mostrado es el de la nube corregido por todo lo pendiente del nodo. `POST /api/projects/:id/react` (404 si el
  proyecto no está en su Inicio, 400 si la reacción no es válida).
- Al sincronizar se mandan las reacciones finales; la nube las aplica con `apply_node_reaction` (misma escuela, sin
  duplicar). Una reacción pendiente solo se borra cuando la nube la confirma o la rechaza de forma definitiva; con
  un error pasajero o una función anterior se reintenta en el próximo sync.
- Hace falta, en este orden: ejecutar `migrations/node-reactions.sql` en Supabase, volver a publicar `node-sync`
  (subiendo también `reactions.ts`) y actualizar el nodo. Sin push desde el nodo.

### XP del estudiante

- Ganan XP al completar lecciones (+10 una sola vez), con el cofre diario (el nodo sortea 20, 50 o 100 XP y sus
  gemas) y al publicarse sus proyectos (50 XP más la nota, calculado por la nube).
- La nube es la única que escribe XP y gemas. El nodo guarda la **base** que bajó la última sincronización
  (`xp_total`, `gems`, `daily_chest_last_claimed`, dentro de `students.extra`) y los **eventos pendientes**
  (`xp_events_local`). `GET /api/xp` suma ambos; al sincronizar se envían los cofres, la nube los valida (un cofre
  por día, solo premios válidos, fecha de hasta 14 días atrás). Un cofre pendiente solo se borra cuando la nube lo
  confirma o lo rechaza de forma definitiva; con un error pasajero o una función anterior se reintenta en el próximo
  sync. El día cambia en hora de Guatemala (UTC-6). El nodo solo acepta progreso de lecciones de los cursos de la
  clase del estudiante.
- Hace falta, en este orden: ejecutar `migrations/xp-events.sql` en Supabase, volver a publicar `node-sync`
  (subiendo también `xp.ts`) y actualizar el nodo. Con la función anterior el Perfil parte de 0 XP.
- Un administrador de la computadora de la escuela podría forzar siempre el premio mayor del cofre: la nube solo
  puede comprobar que sea un premio válido y uno por día.

### Inicio del estudiante (proyectos de la clase)

- Cada sincronización baja las **fichas** de los proyectos de la escuela (los 300 más recientes: título, autor,
  equipo, bimestre, nota; nunca el video ni su ruta) a la tabla `cloud_projects`. También llegan por USB si el
  paquete las trae.
- `GET /api/feed` entrega al estudiante los proyectos **aprobados** de su mismo grado y sección, los suyos y los
  de su equipo; la retroalimentación del docente solo la ve el dueño y su equipo. Primero van los proyectos propios
  guardados en el nodo que todavía no aparecen en la nube.
- Los videos y modelos 3D de otras personas requieren internet. Las reacciones sí se pueden dar sin internet
  (ver «Reacciones a proyectos»); los votos los cuenta la nube.
- Hace falta volver a publicar `node-sync` (subiendo también `projects.ts`); si la función es la anterior, el
  Inicio muestra solo los proyectos propios guardados aquí.

## HTTPS y cámara para pasar lista (desde v1.0.250)

La cámara del navegador solo funciona en HTTPS. Mientras el nodo no lo tenga, **Tomar Asistencia** usa la **lista rápida** (sin cámara, misma cola offline).

Activarlo (una sola vez por escuela, por SSH en la Raspberry, después de actualizar el nodo):

```bash
bash ~/quetzal/school-node/install.sh --update
bash ~/quetzal/school-node/https-setup.sh
```

`https-setup.sh` crea la CA de la escuela y el certificado de `quetzal.local` (y las IP del nodo), y reinicia el nodo. Deja:
- `~/quetzal-ca-privada/ca.key`: clave privada de la CA. **Cópiala a tu USB y no la compartas.**
- `data/ca/quetzal-ca.crt`: certificado público; los dispositivos lo descargan en `http://quetzal.local/node-ca.crt`.
- `data/ca/server.crt` y `server.key`: los usa el nodo para HTTPS en el puerto 443 (`httpsPort` en config.json lo cambia). Sin esos archivos el nodo sigue solo con http; si el HTTPS falla, el http no se toca.

Cada dispositivo debe instalar el certificado una vez (la app lo guía en Asistencia → «Configurar este dispositivo para usar la cámara») y luego abrir `https://quetzal.local`. El certificado del nodo dura ~2 años: `bash ~/quetzal/school-node/https-setup.sh --renovar` lo repite sin que los dispositivos tengan que instalar nada otra vez.

**Redirección y nombre fijo (desde v1.0.251):** con HTTPS activo, quien escribe `quetzal.local` pasa solo a `https://quetzal.local`. El certificado es del **nombre**, así que sigue valiendo aunque el router le cambie la IP al nodo (avahi vuelve a anunciar el nombre solo). Reglas:
- Por **IP** (`http://192.168...`) no se redirige: se queda en http (lista rápida, sin cámara).
- `/node-ca.crt` siempre se entrega por http, para poder instalar el certificado.
- Solo se redirigen las peticiones GET/HEAD.
- Un dispositivo **sin** el certificado instalado verá un aviso de seguridad al entrar por el nombre. Para ese caso existe **`http://quetzal.local/acceso`** (nunca se redirige): ofrece «Descargar el certificado» (con cámara) o «Entrar sin cámara» (`/?http=1`; guarda la cookie `px_http=1` y ese dispositivo se queda en http con la lista rápida de asistencia). `/?http=0` lo deshace. El cartel imprime esa dirección.
- Para apagar la redirección para todos: `"httpsRedirect": false` en config.json y reiniciar.
- Para que la IP tampoco cambie, reserva una IP fija para el nodo en el router (opcional; el nombre ya no la necesita).
- El cartel (`/cartel`) y el aviso al arrancar usan `https://quetzal.local`.

Pendiente: la prueba en una Raspberry real.

## Seguridad

- El token del nodo solo da acceso a **su** escuela. Si se pierde la Raspberry,
  se revoca con `revoke_school_node` desde el panel admin.
- La llave maestra de Supabase nunca se guarda en la Raspberry.
- Los PIN se guardan con hash PBKDF2 (nunca en texto plano).
- **Contraseña de clase:** al nodo solo baja un verificador (hash PBKDF2 con sal), nunca la contraseña. Aun así, el archivo
  de la base del nodo (`data/node.db`) debe quedar bajo llave: con un archivo copiado se podría intentar adivinar una
  contraseña de clase corta sin conexión.
- **Contraseña de docente:** en el nodo solo vive su huella bcrypt (la misma que ya guarda la nube) y la huella del correo, no el correo ni la contraseña.
- **Sesión del nodo:** un token firmado con un secreto que solo existe en ese nodo; no sirve en la nube. 10 intentos fallidos
  por IP o por usuario en 5 minutos bloquean el ingreso un rato.

