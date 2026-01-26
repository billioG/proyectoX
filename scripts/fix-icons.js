const fs = require('fs');

// Leer el archivo
let content = fs.readFileSync('js/attendance.js', 'utf8');

// Reemplazar los iconos problemáticos
content = content.replace(/'present': \{ color: 'var\(--success-color\)', icon: '.*?', text: 'Presente' \}/g,
    "'present': { color: 'var(--success-color)', icon: '✓', text: 'Presente' }");

content = content.replace(/'absent': \{ color: 'var\(--danger-color\)', icon: '.*?', text: 'Ausente' \}/g,
    "'absent': { color: 'var(--danger-color)', icon: '✗', text: 'Ausente' }");

content = content.replace(/'late': \{ color: 'var\(--warning-color\)', icon: '.*?', text: 'Tarde' \}/g,
    "'late': { color: 'var(--warning-color)', icon: '⏰', text: 'Tarde' }");

// También corregir en el historial (líneas 646-647)
content = content.replace(/\$\{r\.status === 'present' \? '.*? Presente' : r\.status === 'late' \? '.*? Tarde' : '.*? Ausente'\}/g,
    "${r.status === 'present' ? '✓ Presente' : r.status === 'late' ? '⏰ Tarde' : r.status === 'excused' ? '📋 Justificado' : '✗ Ausente'}");

content = content.replace(/background: \$\{r\.status === 'present' \? '#4caf50' : r\.status === 'late' \? '#ff9800' : '#f44336'\}/g,
    "background: ${r.status === 'present' ? '#4caf50' : r.status === 'late' ? '#ff9800' : r.status === 'excused' ? '#00bcd4' : '#f44336'}");

// Guardar el archivo
fs.writeFileSync('js/attendance.js', content, 'utf8');

console.log('✅ Archivo attendance.js corregido');
