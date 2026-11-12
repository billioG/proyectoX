#!/usr/bin/env bash
# Instalador del nodo escolar Quetzal (Raspberry Pi OS, 64 bits).
#
# Uso, en la Raspberry con internet:
#   curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh | bash
# o, si ya clonaste el repositorio:
#   bash ~/quetzal/school-node/install.sh
#
# Opciones:
#   --hotspot   crea una red Wi-Fi propia "Quetzal-Escuela" (escuelas sin router)
#   --chromebook  para una Chromebook con Linux (Crostini): puerto 8080 y sin lo que
#               ChromeOS no permite (nombre quetzal.local, hotspot, montaje USB).
#               Se activa solo si detecta ChromeOS. Solo recomendado para pilotos.
#   --update    solo actualiza el código y reinicia el servicio
#   --auto      sin preguntas: no pide el token (lo toma de QUETZAL_TOKEN o de --token=XXX), hace la primera
#               sincronización, comprueba que todo quedó listo y lo dice en español
#   --token=XXX token del nodo (también: variable QUETZAL_TOKEN)
#   --check     solo revisa si esta computadora sirve (sistema, espacio, memoria, internet) y no instala nada
#   --image     para preparar una microSD MAESTRA que se clona (ver docs/NODO_IMAGEN_MICROSD.md): instala todo pero NO crea
#               config.json ni arranca la primera sincronización; cada nodo se configura al encenderlo por primera vez
#
# Qué hace: instala Node.js, descarga el código, pide el token del nodo,
# genera el código de docente, deja la app en http://quetzal.local (puerto
# 80), la arranca sola al prender y monta sola las memorias USB.
set -euo pipefail

REPO_URL="https://github.com/billioG/proyectoX.git"
APP_DIR="${QUETZAL_DIR:-$HOME/quetzal}"
NODE_DIR="$APP_DIR/school-node"
SERVICE=quetzal-node
HOTSPOT=0
UPDATE_ONLY=0
CHROMEBOOK=0
AUTO=0
CHECK_ONLY=0
IMAGE=0
ARG_TOKEN="${QUETZAL_TOKEN:-}"
# Crostini (Linux de ChromeOS) se detecta solo.
if [ -e /dev/.cros_milestone ] || [ -d /mnt/chromeos ]; then CHROMEBOOK=1; fi
for arg in "$@"; do
  case "$arg" in
    --hotspot) HOTSPOT=1 ;;
    --update) UPDATE_ONLY=1 ;;
    --chromebook) CHROMEBOOK=1 ;;
    --auto) AUTO=1 ;;
    --check) CHECK_ONLY=1 ;;
    --image) IMAGE=1 ;;
    --token=*) ARG_TOKEN="${arg#--token=}" ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }

if [ "$CHROMEBOOK" -eq 1 ] && [ "$HOTSPOT" -eq 1 ]; then
  echo "Una Chromebook no puede crear su propia red Wi-Fi: quita --hotspot y usa un router."
  exit 1
fi
if [ "$CHROMEBOOK" -eq 1 ]; then
  warn "Modo Chromebook: puerto 8080, sin quetzal.local. Úsalo para pilotos; para una escuela se recomienda una Raspberry Pi o una PC."
fi

if [ "$(id -u)" -eq 0 ]; then
  echo "Ejecuta el instalador con tu usuario normal (no con sudo): pedirá la contraseña cuando haga falta."
  exit 1
fi

# ---------- 0. ¿Sirve esta computadora? (falla pronto y en español, antes de instalar nada) ----------
PRE_FAIL=0
pre_ok() { printf '  \033[1;32mOK\033[0m    %s\n' "$1"; }
pre_warn() { printf '  \033[1;33mAVISO\033[0m %s\n' "$1"; }
pre_fail() { printf '  \033[1;31mFALTA\033[0m %s\n' "$1"; PRE_FAIL=1; }
say "Revisando que esta computadora sirva"
case "$(uname -m)" in
  aarch64|arm64|x86_64) pre_ok "Sistema de 64 bits ($(uname -m))" ;;
  *) pre_fail "El sistema es de $(uname -m): se necesita Raspberry Pi OS de 64 bits (en Raspberry Pi Imager elige «Raspberry Pi OS Lite (64-bit)»)." ;;
esac
FREE_MB="$(df -Pm "$HOME" | awk 'NR==2 {print $4}')"
if [ "${FREE_MB:-0}" -ge 2048 ]; then pre_ok "Espacio libre: ${FREE_MB} MB"; else pre_fail "Solo hay ${FREE_MB:-0} MB libres; se necesitan al menos 2048 MB (mejor 8 GB o más para los videos de los cursos)."; fi
MEM_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "${MEM_MB:-0}" -ge 1800 ]; then pre_ok "Memoria: ${MEM_MB} MB"; elif [ "${MEM_MB:-0}" -ge 900 ]; then pre_warn "Memoria: ${MEM_MB} MB. Funciona para pocos estudiantes a la vez; se recomienda una Raspberry Pi de 4 GB."; else pre_warn "No se pudo leer la memoria o es menor de 1 GB."; fi
if curl -fsS --max-time 15 -o /dev/null https://github.com 2>/dev/null; then pre_ok "Internet (GitHub)"; else pre_fail "No hay internet: el instalador descarga el código y Node.js. Conecta el cable de red o el Wi-Fi y vuelve a ejecutarlo."; fi
if [ "$PRE_FAIL" -eq 1 ]; then echo; echo "Resuelve lo marcado FALTA y vuelve a ejecutar el instalador."; exit 1; fi
if [ "$CHECK_ONLY" -eq 1 ]; then say "Todo en orden: esta computadora sirve para el nodo."; exit 0; fi

# ---------- 1. Paquetes del sistema ----------
say "Instalando paquetes del sistema"
sudo apt-get update -y
PACKAGES="git curl ca-certificates build-essential python3"
[ "$CHROMEBOOK" -eq 1 ] || PACKAGES="$PACKAGES avahi-daemon"
sudo apt-get install -y $PACKAGES

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  say "Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# ---------- Wi-Fi listo para usarse (la página /wifi del nodo lo necesita) ----------
# Una Raspberry nueva trae el Wi-Fi bloqueado hasta fijar el país; sin esto «Buscar redes» no encuentra nada. Si no aplica (otro Linux), se ignora.
if command -v raspi-config >/dev/null 2>&1; then sudo raspi-config nonint do_wifi_country GT >/dev/null 2>&1 || true; fi
if command -v rfkill >/dev/null 2>&1; then sudo rfkill unblock wifi >/dev/null 2>&1 || true; fi

# Respaldo diario de la base (data/backups, 14 días; copia a la USB si hay una conectada). Ver docs/NODO_RESPALDO.md.
# Se instala también con --update, para que los nodos que ya estaban instalados lo reciban.
install_backup_timer() {
sudo tee "/etc/systemd/system/quetzal-backup.service" >/dev/null <<EOF
[Unit]
Description=Respaldo diario de la base del nodo Quetzal

[Service]
Type=oneshot
WorkingDirectory=$NODE_DIR
ExecStart=$(command -v node) backup.js --keep 14 --usb-if-present
User=$USER
EOF
sudo tee "/etc/systemd/system/quetzal-backup.timer" >/dev/null <<'EOF'
[Unit]
Description=Respaldo diario del nodo Quetzal

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now quetzal-backup.timer
}

# ---------- 2. Código ----------
if [ -d "$APP_DIR/.git" ]; then
  say "Actualizando el código en $APP_DIR"
  git -C "$APP_DIR" pull --ff-only
else
  say "Descargando el código en $APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
cd "$NODE_DIR"
npm install --omit=dev --no-audit --no-fund

if [ "$UPDATE_ONLY" -eq 1 ]; then
  install_backup_timer
  [ "$CHROMEBOOK" -eq 1 ] || sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(command -v node)")"
  sudo systemctl restart "$SERVICE"
  say "Listo: código actualizado y nodo reiniciado."
  if [ "$AUTO" -eq 1 ]; then
    say "Verificación (puede tardar varios minutos)"
    node "$NODE_DIR/primera-sincronizacion.js" || true
  fi
  exit 0
fi

# ---------- 3. Configuración ----------
if [ "$IMAGE" -eq 1 ]; then
  TEACHER_CODE="(se genera al encender cada nodo)"
  say "Modo imagen: no se crea config.json (lo crea quetzal-firstboot al encender cada nodo)"
elif [ ! -f "$NODE_DIR/config.json" ]; then
  say "Configuración del nodo"
  if [ -n "$ARG_TOKEN" ]; then
    NODE_TOKEN="$ARG_TOKEN"
  elif [ "$AUTO" -eq 1 ]; then
    NODE_TOKEN=""
    warn "Sin token: se instala igual; pégalo después en Quetzal (botón Docente) o vuelve a ejecutar con QUETZAL_TOKEN."
  else
    echo "Pega el TOKEN del nodo (lo da el administrador al registrar el nodo en Quetzal LMS)."
    echo "Si todavía no lo tienes, déjalo vacío: después lo pegas en Quetzal, botón Docente."
    read -r -p "Token: " NODE_TOKEN < /dev/tty || NODE_TOKEN=""
  fi
  # "|| true": con pipefail, tr termina por SIGPIPE cuando head corta.
  TEACHER_CODE="$(LC_ALL=C tr -dc '0-9' < /dev/urandom | head -c 6 || true)"
  PORT=80
  [ "$CHROMEBOOK" -eq 1 ] && PORT=8080
  cat > "$NODE_DIR/config.json" <<EOF
{
  "cloudUrl": "https://vyptkxudkmlpyfosppzh.supabase.co",
  "nodeToken": "${NODE_TOKEN:-PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN}",
  "teacherCode": "$TEACHER_CODE",
  "port": $PORT,
  "syncEveryMinutes": 10,
  "dataDir": "./data"
}
EOF
  chmod 600 "$NODE_DIR/config.json"
else
  TEACHER_CODE="$(node -p "require('$NODE_DIR/config.json').teacherCode || '(ver config.json)'")"
  warn "Ya existía config.json: se conserva."
fi

# Puerto 80 sin correr como root (así la dirección no lleva ":8080").
[ "$CHROMEBOOK" -eq 1 ] || sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(command -v node)")"

# ---------- 4. Nombre en la red: http://quetzal.local ----------
if [ "$CHROMEBOOK" -eq 0 ] && [ "$(hostname)" != "quetzal" ]; then
  say "Nombre en la red: quetzal"
  sudo hostnamectl set-hostname quetzal
  sudo sed -i "s/127.0.1.1.*/127.0.1.1\tquetzal/" /etc/hosts || true
fi
[ "$CHROMEBOOK" -eq 1 ] || sudo systemctl enable --now avahi-daemon

# ---------- 5. Servicio que arranca solo ----------
say "Servicio $SERVICE"
sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<EOF
[Unit]
Description=Nodo escolar Quetzal
After=network.target

[Service]
WorkingDirectory=$NODE_DIR
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=5
User=$USER

[Install]
WantedBy=multi-user.target
EOF
install_backup_timer
if [ "$IMAGE" -eq 1 ]; then
  sudo systemctl enable "$SERVICE"   # arranca solo cuando exista config.json (lo crea firstboot)
else
  sudo systemctl enable --now "$SERVICE"
  sudo systemctl restart "$SERVICE"
fi

# ---------- 6. Montaje automático de memorias USB ----------
# La versión con escritorio ya las monta sola; la Lite necesita esta regla.
if [ "$CHROMEBOOK" -eq 0 ] && ! dpkg -s pcmanfm >/dev/null 2>&1; then
  say "Montaje automático de memorias USB"
  sudo tee /etc/udev/rules.d/99-quetzal-usb.rules >/dev/null <<'EOF'
ACTION=="add", SUBSYSTEMS=="usb", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", RUN{program}+="/usr/bin/systemd-mount --no-block --automount=yes --collect $devnode /media/quetzal-usb"
EOF
  sudo udevadm control --reload-rules
fi

# ---------- 7. Red Wi-Fi propia (opcional) ----------
if [ "$HOTSPOT" -eq 1 ]; then
  say "Red Wi-Fi propia: Quetzal-Escuela"
  WIFI_PASS="$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 10 || true)"
  sudo nmcli connection delete quetzal-hotspot >/dev/null 2>&1 || true
  # En la red propia el DNS es el de NetworkManager: se le enseña el nombre, para los Android que no entienden mDNS.
  sudo mkdir -p /etc/NetworkManager/dnsmasq-shared.d
  printf 'address=/quetzal.local/10.42.0.1
' | sudo tee /etc/NetworkManager/dnsmasq-shared.d/quetzal.conf >/dev/null
  sudo nmcli connection add type wifi ifname wlan0 con-name quetzal-hotspot autoconnect yes ssid Quetzal-Escuela \
    mode ap ipv4.method shared wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$WIFI_PASS"
  sudo nmcli connection up quetzal-hotspot
fi

# ---------- Verificación (con --auto) ----------
CHECK_RC=-1
if [ "$AUTO" -eq 1 ]; then
  say "Primera sincronización y verificación (puede tardar varios minutos)"
  CHECK_RC=0
  node "$NODE_DIR/primera-sincronizacion.js" || CHECK_RC=$?
fi

# ---------- Listo ----------
IPS="$(hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -n 3 | tr '\n' ' ' || true)"
say "¡Nodo instalado!"
if [ "$CHROMEBOOK" -eq 1 ]; then
cat <<EOF

  FALTAN 3 PASOS EN LA CHROMEBOOK (fuera de esta terminal):

  1. Abrir el puerto:  Configuración -> Opciones para desarrolladores -> Linux
     -> Reenvío de puertos -> Agregar: puerto 8080, TCP, nombre "Quetzal".
  2. Ver la IP de la Chromebook:  Configuración -> Red -> (tu Wi-Fi o cable)
     -> IP. Reservarla en el router para que no cambie.
  3. Que no se duerma:  Configuración -> Dispositivo -> Energía -> con el cargador
     puesto, "Mantener la pantalla encendida" y "Suspender al cerrar la tapa" apagado.

  Abre en los celulares: http://IP-DE-LA-CHROMEBOOK:8080
  (la IP que muestra la Red de ChromeOS, no la de esta terminal)

  Código de docente:     $TEACHER_CODE
  (para el botón "Docente" en la pantalla de ingreso; guárdalo)

  Importante: el servidor solo corre mientras Linux esté abierto. Después de
  reiniciar la Chromebook, abre la app "Terminal" para que arranque.
  Memoria USB: en Archivos, clic derecho a la USB -> "Compartir con Linux".
EOF
else
cat <<EOF

  Abre en las tablets:   http://quetzal.local
  (si no abre, usa la IP: $(for ip in $IPS; do printf 'http://%s  ' "$ip"; done))

  Código de docente:     $TEACHER_CODE
  (para el botón "Docente" en la pantalla de ingreso; guárdalo)
EOF
fi
if [ "$HOTSPOT" -eq 1 ]; then
cat <<EOF

  Red Wi-Fi:             Quetzal-Escuela
  Contraseña:            $WIFI_PASS
  Dirección en esa red:  http://10.42.0.1
EOF
fi
if [ "$CHECK_RC" -eq 0 ]; then
  printf '\n  \033[1;32mTODO LISTO\033[0m: la aplicación normal está activa y los cursos están en el servidor.\n'
elif [ "$CHECK_RC" -gt 0 ]; then
  printf '\n  \033[1;33mFALTA algo\033[0m: lee los mensajes FALTA de arriba y vuelve a ejecutar el instalador cuando lo resuelvas.\n'
fi
if [ "$AUTO" -eq 1 ]; then
cat <<EOF

  Falta hacer a mano (el instalador no puede):
    1. Preparar el router del kit una sola vez (IP reservada y DNS apuntando a la Raspberry): docs/NODO_KIT_ROUTER.md.
    2. Imprimir el cartel con el QR: http://quetzal.local/cartel
    3. Comprobar en Quetzal que TODAS las clases tengan contraseña de clase.
    4. Cada docente crea, con internet, su PIN de 6 números en su Perfil.
EOF
fi
cat <<EOF

  Estado del servicio:   sudo systemctl status $SERVICE
  Respaldo de la base:   cd $NODE_DIR && node backup.js   (cada noche se hace solo; ver docs/NODO_RESPALDO.md)
  Sincronizar ahora:     cd $NODE_DIR && node sync.js
  Actualizar el código:  bash $NODE_DIR/install.sh --update

EOF
