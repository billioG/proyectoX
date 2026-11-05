#!/usr/bin/env bash
# Primer encendido de un nodo clonado desde la imagen maestra (lo ejecuta el servicio quetzal-firstboot, como root).
#
# Lee /boot/firmware/quetzal.txt (la partición que se ve desde cualquier computadora al meter la microSD):
#     TOKEN=el-token-del-nodo
#     WIFI_SSID=NombreDeLaRed        (opcional)
#     WIFI_PASS=ClaveDeLaRed         (opcional)
# y deja el nodo listo: crea config.json (token + código de docente nuevo), regenera las llaves SSH, conecta el Wi-Fi si se
# indicó y arranca el servicio. Escribe el código de docente en quetzal-codigo-docente.txt (junto a quetzal.txt).
# Después borra el token de quetzal.txt y no vuelve a correr.
#
# Variables solo para pruebas: QUETZAL_BOOT_DIR, QUETZAL_NODE_DIR, QUETZAL_STATE_DIR, QUETZAL_USER, SYSTEMCTL, NODE_BIN, SKIP_CHOWN.
set -uo pipefail

BOOT="${QUETZAL_BOOT_DIR:-}"
if [ -z "$BOOT" ]; then if [ -d /boot/firmware ]; then BOOT=/boot/firmware; else BOOT=/boot; fi; fi
USER_NAME="${QUETZAL_USER:-$(stat -c %U /home/* 2>/dev/null | grep -v '^root$' | head -n1)}"
NODE_DIR="${QUETZAL_NODE_DIR:-/home/${USER_NAME}/quetzal/school-node}"
STATE="${QUETZAL_STATE_DIR:-/var/lib/quetzal}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
NODE_BIN="${NODE_BIN:-$(command -v node || echo /usr/bin/node)}"
SETTINGS="$BOOT/quetzal.txt"
CODE_FILE="$BOOT/quetzal-codigo-docente.txt"
log() { echo "[quetzal-firstboot] $*"; }

mkdir -p "$STATE"
if [ -f "$STATE/firstboot.done" ]; then log "ya se hizo el primer encendido"; exit 0; fi
[ -d "$NODE_DIR" ] || { log "no existe $NODE_DIR: la imagen no tiene instalado el nodo"; exit 1; }

# Lee CLAVE=valor sin ejecutar nada del archivo (nada de «source»): quita \r, comillas y espacios de los bordes.
get() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$SETTINGS" 2>/dev/null | head -n1 | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']\s*$//' -e 's/[[:space:]]*$//'; }

TOKEN=""; WIFI_SSID=""; WIFI_PASS=""
if [ -f "$SETTINGS" ]; then TOKEN="$(get TOKEN)"; WIFI_SSID="$(get WIFI_SSID)"; WIFI_PASS="$(get WIFI_PASS)"; else log "no hay $SETTINGS: se instala sin token (se pega después en Quetzal, botón Docente)"; fi
if [ "$TOKEN" = "(ya usado)" ]; then TOKEN=""; fi
if [ -n "$TOKEN" ] && ! printf '%s' "$TOKEN" | grep -Eq '^[A-Za-z0-9._~+=/-]{8,200}$'; then log "el TOKEN de quetzal.txt tiene caracteres raros: se ignora (revisa que no tenga espacios ni comillas)"; TOKEN=""; fi

# 1. Llaves SSH propias (la imagen maestra no las lleva: si no, todos los nodos tendrían las mismas).
if ! ls /etc/ssh/ssh_host_*_key >/dev/null 2>&1 && command -v ssh-keygen >/dev/null 2>&1; then ssh-keygen -A >/dev/null 2>&1 && log "llaves SSH generadas"; fi

# 2. Wi-Fi (opcional). Con cable de red no hace falta.
if [ -n "$WIFI_SSID" ] && command -v nmcli >/dev/null 2>&1; then
  if [ -n "$WIFI_PASS" ]; then nmcli device wifi connect "$WIFI_SSID" password "$WIFI_PASS" >/dev/null 2>&1 && log "Wi-Fi conectado: $WIFI_SSID" || log "no se pudo conectar al Wi-Fi $WIFI_SSID (revisa nombre y clave; el nodo funciona igual por cable)"
  else nmcli device wifi connect "$WIFI_SSID" >/dev/null 2>&1 || log "no se pudo conectar al Wi-Fi $WIFI_SSID"; fi
fi

# 3. config.json nuevo, con un código de docente propio de ESTE nodo.
if [ ! -f "$NODE_DIR/config.json" ]; then
  CODE="$(LC_ALL=C tr -dc '0-9' < /dev/urandom | head -c 6 || true)"
  PORT=80
  Q_TOKEN="${TOKEN:-PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN}" Q_CODE="$CODE" Q_PORT="$PORT" Q_FILE="$NODE_DIR/config.json" "$NODE_BIN" -e '
    const fs = require("fs");
    fs.writeFileSync(process.env.Q_FILE, JSON.stringify({
      cloudUrl: "https://vyptkxudkmlpyfosppzh.supabase.co", nodeToken: process.env.Q_TOKEN, teacherCode: process.env.Q_CODE,
      port: Number(process.env.Q_PORT), syncEveryMinutes: 10, dataDir: "./data",
    }, null, 2));
  ' || { log "no se pudo crear config.json"; exit 1; }
  chmod 600 "$NODE_DIR/config.json"
  [ -n "${SKIP_CHOWN:-}" ] || chown "$USER_NAME":"$USER_NAME" "$NODE_DIR/config.json" 2>/dev/null || true
  printf 'Código de docente de este nodo: %s\r\n(es el que se escribe en el botón "Docente" de la pantalla de ingreso; guárdalo)\r\n' "$CODE" > "$CODE_FILE" 2>/dev/null || true
  log "config.json creado (token: $([ -n "$TOKEN" ] && echo sí || echo 'no, pendiente'))"
fi

# 4. El token ya está en config.json: no se deja a la vista en la partición que se lee desde cualquier computadora.
if [ -n "$TOKEN" ] && [ -f "$SETTINGS" ]; then sed -i 's/^\([[:space:]]*TOKEN[[:space:]]*=\).*/\1(ya usado)/' "$SETTINGS" 2>/dev/null || true; fi
if [ -n "$WIFI_PASS" ] && [ -f "$SETTINGS" ]; then sed -i 's/^\([[:space:]]*WIFI_PASS[[:space:]]*=\).*/\1(ya usado)/' "$SETTINGS" 2>/dev/null || true; fi

# 5. Arrancar el servicio y marcar como hecho.
"$SYSTEMCTL" restart quetzal-node 2>/dev/null || log "no se pudo arrancar quetzal-node (sudo systemctl status quetzal-node)"
touch "$STATE/firstboot.done"
log "primer encendido terminado"
