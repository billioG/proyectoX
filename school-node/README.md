# Nodo escolar Quetzal (computadora con Windows o Raspberry Pi)

Sirve Quetzal LMS en la red local de una escuela **sin internet** y se sincroniza
con la nube cuando consigue señal (cable, hotspot del celular o memoria USB).

Los estudiantes se conectan al Wi-Fi del router con su celular o tablet y abren
la dirección del nodo: **http://quetzal.local** (o la IP, por ejemplo
`http://192.168.1.50`). No gastan datos.

## Qué hace hoy (etapa 1)

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
- En modo nodo se oculta lo que necesita internet (avisos, asistente con IA,
  perfil) y el header muestra el nombre de la escuela.

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
3. Pegar el **token del nodo** cuando lo pida (ver "Obtener el token del nodo").

El instalador deja todo en `C:\Quetzal`:

| Carpeta / archivo | Qué es |
|---|---|
| `app\` | el código (se reemplaza al actualizar) |
| `node\` | Node.js 22 propio y portátil (no toca otro Node.js de la computadora) |
| `config.json` | token, código de docente y puerto; solo lo leen administradores |
| `data\` | base de datos y archivos de cursos (no se borra al actualizar) |
| `logs
odo.log` | registro del nodo |

Además: abre el puerto (80, u 8080 si está ocupado) en el firewall **solo para la
red local**, crea la tarea programada "Quetzal - Nodo escolar" (arranca sola al
prender la computadora, aunque nadie inicie sesión, y se reinicia si falla), evita
que la computadora se suspenda enchufada y pone en el escritorio dos accesos:
**Quetzal (nodo escolar)** y **Quetzal - Cartel para estudiantes** (dirección y QR
para imprimir; también en `http://IP-DEL-NODO/cartel`).

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

## Requisitos

- Raspberry Pi 4 (4 GB) con Raspberry Pi OS Lite 64-bit.
- Recomendado: SSD por USB en vez de microSD (aguanta mejor los cortes de luz).
- Node.js 20 o superior.

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
2. Entrar a la app como **admin**, abrir la consola del navegador (F12) y correr:

```js
await window._supabase.rpc('register_school_node', { p_school: 'CODIGO_ESCUELA', p_name: 'Nombre del nodo' })
```

3. Copiar el `token` que devuelve (se muestra **una sola vez**) a `config.json`.

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

## Seguridad

- El token del nodo solo da acceso a **su** escuela. Si se pierde la Raspberry,
  se revoca con `revoke_school_node` desde el panel admin.
- La llave maestra de Supabase nunca se guarda en la Raspberry.
- Los PIN se guardan con hash PBKDF2 (nunca en texto plano).
