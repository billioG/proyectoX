# Instalador del nodo escolar Quetzal para Windows 10/11.
#
# Convierte una computadora de la escuela en el servidor de Quetzal:
# los estudiantes se conectan al Wi-Fi del router con su celular y abren
# la dirección que muestra este instalador. Cuando la computadora tiene
# internet, el nodo se sincroniza solo con la nube (cada 10 minutos).
#
# Uso: clic derecho en instalar-windows.cmd -> "Ejecutar como administrador".
# O en PowerShell como administrador:
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1
#
# Opciones:
#   -Update      solo actualiza el código y reinicia el nodo
#   -Uninstall   quita el arranque automático y la regla del firewall
#                (los datos quedan en C:\Quetzal\data; agrega -BorrarDatos para borrarlos)
#   -Token XXX   token del nodo (si no, lo pregunta)
#   -Port N      puerto (por defecto 80; si está ocupado usa 8080)
#
# Qué hace: descarga su propio Node.js 22 (portátil, en C:\Quetzal\node),
# descarga el código en C:\Quetzal\app,
# crea C:\Quetzal\config.json (token + código de docente), abre el puerto
# en el firewall solo para la red local, deja el nodo arrancando solo al
# prender la computadora y evita que se suspenda mientras está enchufada.
param(
  [switch]$Update,
  [switch]$Uninstall,
  [switch]$BorrarDatos,
  [string]$Token = '',
  [int]$Port = 0
)
$ErrorActionPreference = 'Stop'

$Root = if ($env:QUETZAL_ROOT) { $env:QUETZAL_ROOT } else { 'C:\Quetzal' }
$AppDir = Join-Path $Root 'app'
$NodeDir = Join-Path $AppDir 'school-node'
$DataDir = Join-Path $Root 'data'
$LogDir = Join-Path $Root 'logs'
$ConfigFile = Join-Path $Root 'config.json'
$Launcher = Join-Path $Root 'iniciar-nodo.cmd'
$TaskName = 'Quetzal - Nodo escolar'
$FwRule = 'Quetzal LMS (nodo escolar)'
$ZipUrl = 'https://codeload.github.com/billioG/proyectoX/zip/refs/heads/main'

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host $msg -ForegroundColor Yellow }

# ---------- 0. Permisos de administrador ----------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Warn 'Hace falta abrirlo como administrador. Se va a pedir permiso...'
  $argList = @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($Update) { $argList += '-Update' }
  if ($Uninstall) { $argList += '-Uninstall' }
  if ($BorrarDatos) { $argList += '-BorrarDatos' }
  if ($Token) { $argList += @('-Token', $Token) }
  if ($Port) { $argList += @('-Port', $Port) }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit
}

function Stop-Node {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  # Si quedó vivo el node.exe hijo, se cierra (solo el que corre el server.js de C:\Quetzal).
  $serverJs = Join-Path $NodeDir 'server.js'
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverJs) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ---------- Desinstalar ----------
if ($Uninstall) {
  Say 'Quitando el nodo escolar'
  Stop-Node
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $FwRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  foreach ($d in @($AppDir, (Join-Path $Root 'node'))) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
  if ($BorrarDatos) {
    Warn 'Borrando también la configuración y los datos sin sincronizar.'
    Remove-Item -Recurse -Force $Root -ErrorAction SilentlyContinue
  } else {
    Write-Host "Los datos y la configuración quedan en $Root (bórralos a mano si ya no los necesitas)."
  }
  Say 'Listo.'
  exit
}

# ---------- 1. Node.js propio (portátil) ----------
# El nodo trae su propio Node.js 22 en C:\Quetzal\node: no toca el Node.js que
# tenga instalado la computadora y SQLite usa binarios ya compilados para esa
# versión (con otra versión haría falta Visual Studio para compilarlo).
$NodeHome = Join-Path $Root 'node'
$NodeExe = Join-Path $NodeHome 'node.exe'
$NpmCmd = Join-Path $NodeHome 'npm.cmd'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $Root, $DataDir, $LogDir | Out-Null
if (-not (Test-Path $NodeExe)) {
  Say 'Descargando Node.js 22 (portátil)'
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $rel = (Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing) |
    Where-Object { $_.version -like 'v22.*' -and $_.files -contains "win-$arch-zip" } | Select-Object -First 1
  if (-not $rel) { throw 'No se encontró Node.js 22 para descargar.' }
  $nodeTmp = Join-Path $env:TEMP ("quetzal-node-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $nodeTmp | Out-Null
  try {
    $name = "node-$($rel.version)-win-$arch"
    $zip = Join-Path $nodeTmp "$name.zip"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$($rel.version)/$name.zip" -OutFile $zip -UseBasicParsing
    # Se comprueba la huella publicada por nodejs.org antes de usarlo.
    $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$($rel.version)/SHASUMS256.txt" -UseBasicParsing).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match " $name\.zip$" } | ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if (-not $expected -or $actual -ne $expected.ToLower()) { throw 'La descarga de Node.js no coincide con la huella oficial.' }
    Expand-Archive -Path $zip -DestinationPath $nodeTmp -Force
    if (Test-Path $NodeHome) { Remove-Item -Recurse -Force $NodeHome }
    Move-Item -Path (Join-Path $nodeTmp $name) -Destination $NodeHome
  } finally {
    Remove-Item -Recurse -Force $nodeTmp -ErrorAction SilentlyContinue
  }
}
$env:Path = "$NodeHome;$env:Path"
Write-Host "Node.js $(& $NodeExe -v) en $NodeExe"

# ---------- 2. Código ----------
Say "Descargando el código en $AppDir"
$tmp = Join-Path $env:TEMP ("quetzal-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'quetzal.zip'
  Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -Path $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'school-node\server.js') } | Select-Object -First 1
  if (-not $src) { throw 'El archivo descargado no trae school-node\server.js.' }
  Stop-Node
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  Move-Item -Path $src.FullName -Destination $AppDir
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Say 'Instalando dependencias del nodo'
Push-Location $NodeDir
try {
  & $NpmCmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install falló (revisa la conexión a internet).' }
} finally { Pop-Location }

# ---------- 3. Configuración ----------
function Test-PortFree([int]$p) {
  -not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}
function New-TeacherCode {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 8
  $rng.GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_ % 10 })
}

if (-not (Test-Path $ConfigFile)) {
  Say 'Configuración del nodo'
  if (-not $Token) {
    Write-Host 'Pega el TOKEN del nodo (lo da el administrador al registrar el nodo en Quetzal LMS).'
    Write-Host "Si todavía no lo tienes, déjalo vacío y complétalo después en $ConfigFile"
    $Token = Read-Host 'Token'
  }
  if (-not $Port) { $Port = if (Test-PortFree 80) { 80 } else { 8080 } }
  $cfg = [ordered]@{
    cloudUrl         = 'https://vyptkxudkmlpyfosppzh.supabase.co'
    nodeToken        = if ($Token.Trim()) { $Token.Trim() } else { 'PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN' }
    teacherCode      = New-TeacherCode
    port             = $Port
    syncEveryMinutes = 10
    dataDir          = './data'
  }
  # Sin BOM: Node lo lee igual, pero así queda limpio.
  [IO.File]::WriteAllText($ConfigFile, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  # Solo administradores y el sistema pueden leer el token y el código de docente.
  icacls $ConfigFile /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
} else {
  Warn "Ya existía $ConfigFile : se conserva."
}
$cfgNow = Get-Content $ConfigFile -Raw | ConvertFrom-Json
$Port = [int]$cfgNow.port
$TeacherCode = $cfgNow.teacherCode

# ---------- 4. Arranque automático ----------
Say 'Arranque automático al prender la computadora'
$launcherText = @"
@echo off
rem Lo ejecuta la tarea programada "$TaskName". No hace falta abrirlo a mano.
set QUETZAL_CONFIG_DIR=$Root
cd /d "$NodeDir"
for %%F in ("$LogDir\nodo.log") do if %%~zF GTR 5000000 move /y "$LogDir\nodo.log" "$LogDir\nodo-anterior.log" >nul
"$NodeExe" "$NodeDir\server.js" >> "$LogDir\nodo.log" 2>&1
"@
[IO.File]::WriteAllText($Launcher, $launcherText, (New-Object Text.UTF8Encoding $false))

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Launcher`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Sirve Quetzal LMS a los celulares de la red local y sincroniza con la nube.' -Force | Out-Null

# ---------- 5. Firewall: solo la red local ----------
Say "Abriendo el puerto $Port para la red local"
Get-NetFirewallRule -DisplayName $FwRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $FwRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
  -RemoteAddress LocalSubnet -Profile Any | Out-Null

# ---------- 6. Que no se duerma enchufada ----------
if (-not $Update) {
  Say 'Evitando que la computadora se suspenda mientras está enchufada'
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 4

# ---------- Listo ----------
$suffix = if ($Port -eq 80) { '' } else { ":$Port" }
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress
$ok = $false
try { $ok = (Invoke-WebRequest -Uri "http://localhost$suffix/node-config.js" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }

if ($Update) {
  Say $(if ($ok) { 'Listo: código actualizado y nodo reiniciado.' } else { "El nodo no respondió. Revisa $LogDir\nodo.log" })
  exit
}

# Accesos directos en el escritorio público (para cualquier usuario de la computadora).
$desk = [Environment]::GetFolderPath('CommonDesktopDirectory')
$wsh = New-Object -ComObject WScript.Shell
foreach ($s in @(@{ n = 'Quetzal (nodo escolar)'; u = "http://localhost$suffix/" },
                 @{ n = 'Quetzal - Cartel para estudiantes'; u = "http://localhost$suffix/cartel" })) {
  $lnk = $wsh.CreateShortcut((Join-Path $desk "$($s.n).url"))
  $lnk.TargetPath = $s.u
  $lnk.Save()
}

Say $(if ($ok) { '¡Nodo instalado y funcionando!' } else { 'Nodo instalado, pero todavía no responde' })
Write-Host ''
Write-Host '  Los estudiantes, conectados al Wi-Fi del router, abren en el celular:'
foreach ($ip in $ips) { Write-Host "     http://$ip$suffix" -ForegroundColor Cyan }
Write-Host ''
Write-Host "  Código de docente:   $TeacherCode   (para el botón 'Docente'; guárdalo)"
Write-Host "  Cartel con QR:       acceso directo 'Quetzal - Cartel para estudiantes' en el escritorio"
Write-Host "  Configuración:       $ConfigFile"
Write-Host "  Registro (log):      $LogDir\nodo.log"
Write-Host "  Actualizar:          ejecuta de nuevo el instalador con -Update"
Write-Host ''
if (-not $ok) { Warn "Revisa $LogDir\nodo.log para ver el error." }
Warn 'Importante: pide al técnico que reserve esta IP en el router (reserva DHCP), así la dirección no cambia.'
if ($cfgNow.nodeToken -like 'PEGAR*') { Warn "Falta el token: pégalo en $ConfigFile y reinicia la computadora para que sincronice." }
if ($ok) { Start-Process "http://localhost$suffix/cartel" }
