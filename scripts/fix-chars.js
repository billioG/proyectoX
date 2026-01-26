const fs = require('fs');

// Leer el archivo
let content = fs.readFileSync('js/attendance.js', 'utf8');

// Lista de reemplazos de caracteres corruptos
const replacements = [
    // Caracteres corruptos comunes
    ['âŒ', '❌'],
    ['ðŸ"…', '📅'],
    ['ðŸ"¸', '📸'],
    ['ðŸ"Š', '📊'],
    ['â³', '⏳'],
    ['⚠️', '⚠️'],
    ['â€"', '—'],
    ['â°', '⏰'],
    ['✅', '✅'],
    // Otros caracteres mal codificados que aparecen en el archivo
    ['GESTIÃ"N', 'GESTIÓN'],
    ['CÃ"DIGOS', 'CÓDIGOS'],
    ['cámara', 'cámara'],
    ['denegado.', 'denegado.'],
    ['configuración', 'configuración'],
    ['Conexión', 'Conexión'],
];

// Aplicar reemplazos
for (const [from, to] of replacements) {
    content = content.split(from).join(to);
}

// Guardar el archivo
fs.writeFileSync('js/attendance.js', content, 'utf8');

console.log('✅ Caracteres corruptos corregidos en attendance.js');
