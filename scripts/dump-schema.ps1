# Vuelca el ESQUEMA de la base de producción (tablas, funciones, políticas,
# permisos) a supabase/schema.sql. No incluye datos de alumnos.
#
# Uso (PowerShell):
#   $env:SUPABASE_DB_URL = 'postgresql://postgres.<ref>:<CONTRASEÑA>@aws-0-<región>.pooler.supabase.com:5432/postgres'
#   ./scripts/dump-schema.ps1
#
# La cadena de conexión está en Supabase → botón "Connect" → "Session pooler"
# (la conexión directa db.<ref>.supabase.co solo funciona con IPv6).
# La contraseña es la de la base de datos, no la de tu cuenta.
# NUNCA guardes esa cadena en el repositorio.
#
# Requiere UNA de estas dos opciones:
#   a) pg_dump de PostgreSQL 15 o superior instalado (recomendado en Windows), o
#   b) Docker Desktop abierto (lo usa la CLI de Supabase por dentro).

param(
  [string]$DbUrl = $env:SUPABASE_DB_URL,
  [string]$Out = "supabase/schema.sql"
)

$ErrorActionPreference = 'Stop'
if (-not $DbUrl) {
  Write-Host 'Falta la cadena de conexión. Definí $env:SUPABASE_DB_URL (ver el encabezado de este script).' -ForegroundColor Red
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root $Out
New-Item -ItemType Directory -Force (Split-Path $outPath) | Out-Null

if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
  Write-Host 'Usando pg_dump...'
  # Sin --no-privileges a propósito: los grant/revoke por columna son parte
  # de la seguridad de este proyecto y tienen que quedar en el volcado.
  pg_dump $DbUrl --schema-only --schema=public --no-owner --file $outPath
} else {
  Write-Host 'pg_dump no está instalado: usando la CLI de Supabase (necesita Docker abierto)...'
  npx -y supabase@latest db dump --db-url $DbUrl --schema public -f $outPath
}

Write-Host "Listo: $Out" -ForegroundColor Green
Write-Host 'Revisalo antes de subirlo: no debería tener datos personales ni secretos.'
