#!/usr/bin/env bash
# Activa HTTPS en el nodo escolar (para que la cámara de los celulares pueda pasar lista).
#
#   bash ~/quetzal/school-node/https-setup.sh            crea la CA de la escuela (una sola vez) y el certificado del nodo
#   bash ~/quetzal/school-node/https-setup.sh --renovar  vuelve a crear SOLO el certificado del nodo (mismo CA: los dispositivos no repiten nada)
#
# Qué deja:
#   ~/quetzal-ca-privada/ca.key          clave PRIVADA de la CA. Fuera de data/ a propósito: guárdala (copia en tu memoria USB) y no la compartas.
#   ~/quetzal/school-node/data/ca/quetzal-ca.crt   certificado PÚBLICO de la CA: lo descargan los dispositivos en http://quetzal.local/node-ca.crt
#   ~/quetzal/school-node/data/ca/server.crt|key   certificado del nodo (quetzal.local + sus IP), firmado por la CA; el nodo los usa para HTTPS en el puerto 443
# Es seguro repetirlo. No cambia nada del http actual: si algo falla, borra data/ca/server.* y reinicia (el nodo vuelve a solo http).
set -euo pipefail

APP_DIR="${QUETZAL_DIR:-$HOME/quetzal}"
NODE_DIR="$APP_DIR/school-node"
CA_DIR="$NODE_DIR/data/ca"
PRIV_DIR="$HOME/quetzal-ca-privada"
SERVICE=quetzal-node
RENEW=0; [ "${1:-}" = "--renovar" ] && RENEW=1

say() { printf '\n==> %s\n' "$1"; }
[ -d "$NODE_DIR" ] || { echo "No encuentro $NODE_DIR. ¿Está instalado el nodo? (bash install.sh)"; exit 1; }
command -v openssl >/dev/null || { echo "Falta openssl: sudo apt install -y openssl"; exit 1; }

mkdir -p "$CA_DIR" "$PRIV_DIR"; chmod 700 "$PRIV_DIR"

# ---------- 1. CA de la escuela (10 años, una sola vez) ----------
if [ ! -f "$PRIV_DIR/ca.key" ] || [ ! -f "$CA_DIR/quetzal-ca.crt" ]; then
  [ "$RENEW" -eq 1 ] && { echo "No hay CA todavía: corre sin --renovar."; exit 1; }
  say "Creando la CA de la escuela"
  openssl genrsa -out "$PRIV_DIR/ca.key" 4096
  chmod 600 "$PRIV_DIR/ca.key"
  openssl req -x509 -new -nodes -key "$PRIV_DIR/ca.key" -sha256 -days 3650 \
    -subj "/CN=Quetzal - CA de la escuela/O=Quetzal LMS" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$CA_DIR/quetzal-ca.crt"
else
  say "La CA ya existe: se reutiliza"
fi

# ---------- 2. Certificado del nodo (~2 años: los celulares no aceptan más de ~825 días) ----------
say "Creando el certificado del nodo"
HOST="$(hostname)"
SAN="DNS:quetzal.local,DNS:${HOST}.local,DNS:localhost,IP:127.0.0.1"
for ip in $(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'); do SAN="$SAN,IP:$ip"; done
echo "Nombres e IP incluidos: $SAN"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
openssl genrsa -out "$TMP/server.key" 2048
openssl req -new -key "$TMP/server.key" -subj "/CN=quetzal.local/O=Quetzal LMS" -out "$TMP/server.csr"
printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$SAN" > "$TMP/ext.cnf"
openssl x509 -req -in "$TMP/server.csr" -CA "$CA_DIR/quetzal-ca.crt" -CAkey "$PRIV_DIR/ca.key" -CAcreateserial -CAserial "$PRIV_DIR/ca.srl" \
  -days 730 -sha256 -extfile "$TMP/ext.cnf" -out "$TMP/server.crt"
install -m 600 "$TMP/server.key" "$CA_DIR/server.key"
install -m 644 "$TMP/server.crt" "$CA_DIR/server.crt"
chmod 644 "$CA_DIR/quetzal-ca.crt"

# ---------- 3. Reiniciar el nodo ----------
say "Reiniciando el nodo"
sudo systemctl restart "$SERVICE"
sleep 3
if curl -fsS --max-time 8 --cacert "$CA_DIR/quetzal-ca.crt" --resolve quetzal.local:443:127.0.0.1 https://quetzal.local/api/node/status >/dev/null; then
  echo "HTTPS funciona: https://quetzal.local"
else
  echo "El nodo no respondió por HTTPS. Mira: sudo journalctl -u $SERVICE -n 30 --no-pager"
  exit 1
fi

cat <<EOF

LISTO. Siguientes pasos:
  1. Copia ~/quetzal-ca-privada/ca.key a tu memoria USB y guárdala (no se comparte).
  2. En cada celular/tablet: abre http://quetzal.local/node-ca.crt, instala el certificado
     (la app lo explica en Asistencia → «Configurar este dispositivo para usar la cámara»).
  3. Luego abre https://quetzal.local en ese dispositivo y prueba Tomar Asistencia.
Dentro de ~2 años: bash $NODE_DIR/https-setup.sh --renovar
EOF
