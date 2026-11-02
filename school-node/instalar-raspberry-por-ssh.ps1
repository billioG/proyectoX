# Instala (o actualiza) el nodo escolar Quetzal en una Raspberry Pi desde esta computadora, por SSH.
# Hace por ti: comprobar que la Raspberry responde, entrar por SSH, instalar con --auto (primera sincronización incluida)
# y abrir el cartel. Lo único que pide es el usuario de la Raspberry y su contraseña (la pide SSH, no queda guardada).
#
#   -Servidor   nombre o IP de la Raspberry (por defecto quetzal.local)
#   -Usuario    usuario de la Raspberry (el que elegiste en el Imager)
#   -Token      token del nodo (si no, se lee de la variable QUETZAL_TOKEN o de token.txt junto a este archivo)
param(
  [string]$Servidor = 'quetzal.local',
  [string]$Usuario = '',
  [string]$Token = ''
)
$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n==> $m" -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  Warn 'Este Windows no tiene el cliente SSH. Actívalo en: Configuración > Aplicaciones > Características opcionales > Agregar una característica > Cliente OpenSSH. Luego vuelve a ejecutar este archivo.'
  exit 1
}

# Token: parámetro, variable o token.txt
if (-not $Token -and $env:QUETZAL_TOKEN) { $Token = $env:QUETZAL_TOKEN }
if (-not $Token) {
  $f = Join-Path $PSScriptRoot 'token.txt'
  if (Test-Path $f) {
    $line = Get-Content $f | Where-Object { $_.Trim() -and -not $_.TrimStart().StartsWith('#') } | Select-Object -First 1
    if ($line -and ([string]$line).Trim() -notmatch '^PEGAR') { $Token = ([string]$line).Trim(); Say "Token leído de $f" }
  }
}
if ($Token -and $Token -notmatch '^[A-Za-z0-9_.=-]{16,200}$') {
  Warn 'El token tiene caracteres raros (solo letras, números, guion, punto y signo igual). Revisa que lo copiaste completo y sin espacios.'
  exit 1
}
if (-not $Token) { Warn 'No hay token: se instala igual, y después lo pegas en Quetzal (botón Docente) o pones token.txt junto a este archivo y vuelves a ejecutar.' }

if (-not $Usuario) {
  $Usuario = Read-Host 'Usuario de la Raspberry (el que elegiste en el Imager)'
  if (-not $Usuario) { Warn 'Falta el usuario.'; exit 1 }
}

Say "Buscando la Raspberry ($Servidor)"
$reach = Test-NetConnection -ComputerName $Servidor -Port 22 -WarningAction SilentlyContinue
if (-not $reach.TcpTestSucceeded) {
  Warn "No responde el puerto SSH (22) en $Servidor."
  Warn '  - ¿Está prendida, con el cable al router, y esta computadora en la misma red?'
  Warn '  - ¿Se preparó la tarjeta con "Habilitar SSH" en el Imager? Si no: saca la tarjeta y crea en la unidad bootfs un archivo vacío llamado ssh.'
  Warn '  - Prueba con la IP en lugar del nombre:  instalar-raspberry-por-ssh.cmd -Servidor 192.168.x.x'
  exit 1
}

Say 'Instalando en la Raspberry (pedirá su contraseña; puede tardar de 10 a 30 minutos)'
$url = 'https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh'
$envToken = if ($Token) { "QUETZAL_TOKEN='$Token' " } else { '' }
$remote = "curl -fsSL $url | ${envToken}bash -s -- --auto"
# accept-new: confía en una Raspberry NUEVA sin preguntar, pero SE NIEGA si su huella cambió (protege contra suplantación).
ssh -t -o StrictHostKeyChecking=accept-new "$Usuario@$Servidor" $remote
$rc = $LASTEXITCODE
if ($rc -eq 255) {
  Warn 'No se pudo conectar por SSH. Si el aviso dice "REMOTE HOST IDENTIFICATION HAS CHANGED", esa dirección la tiene ahora otro equipo o la tarjeta se reinstaló:'
  Warn "  comprueba que es tu Raspberry (http://$Servidor/api/node/status y la MAC en el router) y, solo si lo es, ejecuta: ssh-keygen -R $Servidor"
  exit 1
}
if ($rc -ne 0) { Warn "La instalación terminó con un aviso (código $rc). Lee los mensajes de arriba."; exit $rc }

Say 'Listo. Abriendo el cartel para imprimir'
Start-Process "http://$Servidor/cartel"
