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
- **Docentes:** entran con su **correo y un PIN de 6 números** que fijaron **una vez con internet**, en su Perfil
  (tarjeta «PIN para entrar sin internet»). Desde ahí **evalúan proyectos** de sus clases (el nodo recalcula el total y la
  nube lo vuelve a validar) y **envían avisos** a sus grupos. Un docente que nunca fijó su PIN no entra por aquí.
- **Sincronización:** automática cada 10 minutos cuando hay internet, o a mano con el botón **Sincronizar ahora** del
  aviso de abajo a la izquierda, que también muestra «Sincronizado hace X» o «N cambios por subir».
- **Modo anterior (PIN y panel del nodo):** sigue disponible en **`/?modo=pin`** (o con el enlace «Docente» del aviso):
  restablecer PIN de un estudiante, desbloquear, sincronizar por USB y ver ingresos.
- **Cuándo se activa:** solo si la réplica ya tiene a los estudiantes **y todas las clases con estudiantes activos tienen
  contraseña de clase conocida**. Si alguna clase no la tiene, el nodo se queda en el modo anterior para que nadie pierda
  el acceso. Antes de la primera sincronización también funciona el modo anterior.

**Archivos y fotos:** los videos, PDF, imágenes y paquetes H5P/SCORM de los cursos se sirven desde el propio nodo (carpeta
`data/content`, que baja la sincronización): hasta que `pending.files` de `/api/node/status` llegue a 0, esos archivos aún
no están y no se verán sin internet. Las **fotos de perfil** se descargan al sincronizar (`data/photos`). Si una foto aún
no se descargó, se ve el ícono de siempre.

**Lo que no funciona sin internet:** la IA (evaluar con IA, generar preguntas), retos 1v1, mascota, anuncios push, avisos
a padres, encuestas, asistencia y exámenes. Esas pantallas salen vacías, sin errores. La **racha diaria** no sube sin internet
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
5. **Cada docente fija su PIN, con internet,** en su Perfil (tarjeta «PIN para entrar sin internet»), y se sincroniza otra vez
   para que el nodo lo reciba.
6. **Desconecta el internet** (deja solo la red de la escuela) y prueba desde una tablet: un estudiante (usuario y contraseña de
   la clase) con un curso y un video, y un docente (correo y PIN).
7. **Fotos de perfil:** se descargan en cada sincronización; aparecen después de la primera sincronización con internet.
8. **Imprime el cartel** (`http://IP-DEL-NODO/cartel`) desde esa red: si cambias de router, la dirección cambia y hay que
   imprimirlo otra vez.

## Conectar la Raspberry a Wi-Fi

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
| El **docente** entra con «credenciales inválidas» | No fijó su PIN, o el nodo todavía no lo recibió. | Debe fijarlo **con internet** en su Perfil (tarjeta «PIN para entrar sin internet»), con **correo y ese PIN** (no la contraseña de su cuenta), y sincronizar. En la nube deben estar corridos `migrations/teacher-node-pin.sql` y desplegado `node-sync` con todos sus archivos. Un administrador que no esté **asignado a una clase de esa escuela** no entra por aquí. Para ver qué recibió el nodo: `cd ~/quetzal/school-node && node -e "const D=require('better-sqlite3');const db=new D('data/node.db',{readonly:true});console.log('entradas de docentes:',db.prepare('select count(*) n from rest_teacher_logins').get().n,'| docentes:',db.prepare('select count(*) n from rest_rows where tbl=?').get('teachers').n)"`. Si «entradas de docentes» es 0, la nube no envió los PIN; si «docentes» es 0, ese docente no tiene clases asignadas en esa escuela. |
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

## Seguridad

- El token del nodo solo da acceso a **su** escuela. Si se pierde la Raspberry,
  se revoca con `revoke_school_node` desde el panel admin.
- La llave maestra de Supabase nunca se guarda en la Raspberry.
- Los PIN se guardan con hash PBKDF2 (nunca en texto plano).
- **Contraseña de clase:** al nodo solo baja un verificador (hash PBKDF2 con sal), nunca la contraseña. Aun así, el archivo
  de la base del nodo (`data/node.db`) debe quedar bajo llave: con un archivo copiado se podría intentar adivinar una
  contraseña de clase corta sin conexión.
- **PIN de docente:** se fija en línea (el servidor solo guarda hash y sal) y en el nodo solo vive la huella del correo, no el correo.
- **Sesión del nodo:** un token firmado con un secreto que solo existe en ese nodo; no sirve en la nube. 10 intentos fallidos
  por IP o por usuario en 5 minutos bloquean el ingreso un rato.

