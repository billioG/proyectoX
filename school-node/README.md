# Nodo escolar Quetzal (Raspberry Pi)

Sirve Quetzal LMS en la red local de una escuela **sin internet** y se sincroniza
con la nube cuando consigue señal (cable, hotspot del celular o, más adelante, USB).

## Qué hace hoy (etapa 1)

- Sirve la app y los archivos de los cursos (H5P, videos, PDF) a las tablets.
- Login de alumnos con **PIN personal de 4 números** (se crea la primera vez).
  5 intentos fallidos bloquean la cuenta 5 minutos.
- Guarda el progreso en la Raspberry (la mejor nota gana).
- Cada 10 minutos intenta sincronizar: sube progreso, PIN y sesiones; baja
  alumnos, cursos, progreso y los archivos nuevos.

Todavía falta: que la app use el nodo (login con PIN, cursos y progreso),
HTTPS, instalador de un comando y sincronización por USB.

## Requisitos

- Raspberry Pi 4 (4 GB) con Raspberry Pi OS Lite 64-bit.
- Recomendado: SSD por USB en vez de microSD (aguanta mejor los cortes de luz).
- Node.js 20 o superior.

## Instalación (manual, por ahora)

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
nano config.json   # pegar el token del nodo
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

## Seguridad

- El token del nodo solo da acceso a **su** escuela. Si se pierde la Raspberry,
  se revoca con `revoke_school_node` desde el panel admin.
- La llave maestra de Supabase nunca se guarda en la Raspberry.
- Los PIN se guardan con hash PBKDF2 (nunca en texto plano).
