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
#   --update    solo actualiza el código y reinicia el servicio
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
for arg in "$@"; do
  case "$arg" in
    --hotspot) HOTSPOT=1 ;;
    --update) UPDATE_ONLY=1 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Corré el instalador con tu usuario normal (no con sudo): va a pedir la contraseña cuando haga falta."
  exit 1
fi

# ---------- 1. Paquetes del sistema ----------
say "Instalando paquetes del sistema"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates avahi-daemon build-essential python3

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  say "Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

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
  sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(command -v node)")"
  sudo systemctl restart "$SERVICE"
  say "Listo: código actualizado y nodo reiniciado."
  exit 0
fi

# ---------- 3. Configuración ----------
if [ ! -f "$NODE_DIR/config.json" ]; then
  say "Configuración del nodo"
  echo "Pegá el TOKEN del nodo (lo da el administrador al registrar el nodo en Quetzal LMS)."
  echo "Si todavía no lo tenés, dejalo vacío y completalo después en $NODE_DIR/config.json"
  read -r -p "Token: " NODE_TOKEN < /dev/tty || NODE_TOKEN=""
  # "|| true": con pipefail, tr termina por SIGPIPE cuando head corta.
  TEACHER_CODE="$(LC_ALL=C tr -dc '0-9' < /dev/urandom | head -c 6 || true)"
  cat > "$NODE_DIR/config.json" <<EOF
{
  "cloudUrl": "https://vyptkxudkmlpyfosppzh.supabase.co",
  "nodeToken": "${NODE_TOKEN:-PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN}",
  "teacherCode": "$TEACHER_CODE",
  "port": 80,
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
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(command -v node)")"

# ---------- 4. Nombre en la red: http://quetzal.local ----------
if [ "$(hostname)" != "quetzal" ]; then
  say "Nombre en la red: quetzal"
  sudo hostnamectl set-hostname quetzal
  sudo sed -i "s/127.0.1.1.*/127.0.1.1\tquetzal/" /etc/hosts || true
fi
sudo systemctl enable --now avahi-daemon

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
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE"
sudo systemctl restart "$SERVICE"

# ---------- 6. Montaje automático de memorias USB ----------
# La versión con escritorio ya las monta sola; la Lite necesita esta regla.
if ! dpkg -s pcmanfm >/dev/null 2>&1; then
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
  sudo nmcli connection add type wifi ifname wlan0 con-name quetzal-hotspot autoconnect yes ssid Quetzal-Escuela \
    mode ap ipv4.method shared wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$WIFI_PASS"
  sudo nmcli connection up quetzal-hotspot
fi

# ---------- Listo ----------
IPS="$(hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -n 3 | tr '\n' ' ' || true)"
say "¡Nodo instalado!"
cat <<EOF

  Abrí en las tablets:   http://quetzal.local
  (si no abre, usá la IP: $(for ip in $IPS; do printf 'http://%s  ' "$ip"; done))

  Código de docente:     $TEACHER_CODE
  (para el botón "Docente" en la pantalla de ingreso; guardalo)
EOF
if [ "$HOTSPOT" -eq 1 ]; then
cat <<EOF

  Red Wi-Fi:             Quetzal-Escuela
  Contraseña:            $WIFI_PASS
  Dirección en esa red:  http://10.42.0.1
EOF
fi
cat <<EOF

  Estado del servicio:   sudo systemctl status $SERVICE
  Sincronizar ahora:     cd $NODE_DIR && node sync.js
  Actualizar el código:  bash $NODE_DIR/install.sh --update

EOF
