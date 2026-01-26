# Script para corregir problemas de encoding en attendance.js
$filePath = "js/attendance.js"

# Leer como bytes
$bytes = [System.IO.File]::ReadAllBytes($filePath)

# Detectar encoding actual (probablemente Windows-1252 o UTF-8 mal guardado)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Corregir iconos problemáticos - presente
$text = $text.Replace("icon: '`u274c`"'", "icon: '`u2713'")  # ❌" -> ✓
$text = $text.Replace("icon: '`u274c—'", "icon: '`u2717'")       # ❌— -> ✗

# Guardar con UTF-8 limpio
[System.IO.File]::WriteAllText($filePath, $text, [System.Text.Encoding]::UTF8)

Write-Host "Archivo corregido exitosamente"
