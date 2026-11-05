#!/usr/bin/env bash
# Deja esta Raspberry lista para COPIARLA como imagen maestra de microSD (ver docs/NODO_IMAGEN_MICROSD.md).
#
# Antes: instalada con   bash ~/quetzal/school-node/install.sh --image
# Uso:   bash ~/quetzal/school-node/imagen/prepare-image.sh --yes   y apagar con  sudo poweroff
#
# BORRA de esta Raspberry: config.json y data/ (token, estudiantes, PIN), las redes Wi-Fi guardadas, las llaves SSH, el
# historial y los registros. Si la estás usando en una escuela, NO lo ejecutes aquí: hazlo en una Raspberry de preparación.
set -euo pipefail

[ "${1:-}" = "--yes" ] || { echo "Esto borra los datos de ESTA Raspberry para poder clonarla. Si estás seguro: bash $0 --yes"; exit 1; }
[ "$(id -u)" -ne 0 ] || { echo "Ejecútalo con tu usuario normal (no con sudo): pedirá la contraseña cuando haga falta."; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(dirname "$HERE")"
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
[ -f "$NODE_DIR/server.js" ] || { echo "No encuentro el nodo en $NODE_DIR"; exit 1; }
systemctl list-unit-files quetzal-node.service >/dev/null 2>&1 || { echo "Falta instalar el nodo con: bash $NODE_DIR/install.sh --image"; exit 1; }

say "Instalando el servicio de primer encendido"
sudo install -m 755 "$HERE/quetzal-firstboot.sh" /usr/local/sbin/quetzal-firstboot
sudo tee /etc/systemd/system/quetzal-firstboot.service >/dev/null <<EOF
[Unit]
Description=Primer encendido del nodo Quetzal (token, código de docente, llaves SSH)
After=local-fs.target NetworkManager.service
Before=quetzal-node.service ssh.service sshd.service
ConditionPathExists=!/var/lib/quetzal/firstboot.done

[Service]
Type=oneshot
Environment=QUETZAL_USER=$USER
ExecStart=/usr/local/sbin/quetzal-firstboot
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable quetzal-firstboot.service

say "Plantilla de configuración en la partición de arranque"
BOOT=/boot/firmware; [ -d "$BOOT" ] || BOOT=/boot
sudo tee "$BOOT/quetzal.txt" >/dev/null <<'EOF'
# Configuración de ESTE nodo. Se lee una sola vez, en el primer encendido; después el token se borra de aquí.
# Pega el token que da el panel de administración de Quetzal (Servidores) al registrar el nodo, SIN comillas ni espacios.
TOKEN=
# Wi-Fi de la escuela (opcional: con cable de red no hace falta).
WIFI_SSID=
WIFI_PASS=
EOF

say "Limpiando lo que no debe copiarse a otras escuelas"
sudo systemctl stop quetzal-node quetzal-backup.timer 2>/dev/null || true
sudo rm -rf "$NODE_DIR/data" "$NODE_DIR/config.json"
sudo rm -rf /var/lib/quetzal
sudo rm -f /etc/NetworkManager/system-connections/* 2>/dev/null || true   # claves de las redes Wi-Fi que se usaron al preparar
sudo rm -f /etc/ssh/ssh_host_* 2>/dev/null || true                         # cada nodo genera las suyas en el primer encendido
sudo truncate -s 0 /etc/machine-id 2>/dev/null || true
sudo journalctl --rotate >/dev/null 2>&1 || true; sudo journalctl --vacuum-time=1s >/dev/null 2>&1 || true
sudo apt-get clean
sudo rm -rf /var/log/*.log /var/log/*.[0-9] /var/log/*.gz /tmp/* 2>/dev/null || true
history -c 2>/dev/null || true; rm -f "$HOME/.bash_history" "$HOME/.node_repl_history" "$HOME/.npm/_logs/"* 2>/dev/null || true
sync

say "Listo. Ahora apaga con:  sudo poweroff   y saca la microSD para copiarla (docs/NODO_IMAGEN_MICROSD.md)."
echo "NO vuelvas a encender esta microSD antes de copiarla: en el primer encendido crearía las llaves y el código de ESTE nodo."
