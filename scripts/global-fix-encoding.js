const fs = require('fs');
const path = require('path');

const filesToFix = [
    'js/attendance.js',
    'js/admin-dashboard.js',
    'js/admin-waivers.js',
    'js/auth.js',
    'js/attendance_append.js',
    'js/profile.js',
    'js/projects.js',
    'js/students.js',
    'js/teachers.js',
    'js/groups.js'
];

const replacements = [
    // Triple-encoded mess
    [/Ã°Å¸â€œÅ¡/g, '📚'],
    [/Ã°Å¸â€˜Â¨Ã¢â‚¬ÂÃ°Å¸ÂÂ«/g, '👨‍🏫'],
    [/Ã°Å¸ÂÂ«/g, '🏫'],
    [/Ã¢Â­Â/g, '⭐'],
    [/Ã¢ÂÅ’/g, '❌'],
    [/Ã¢Å¡ÂÃ¯Â¸Â/g, '⚠️'],
    [/Ã°Å¸â€œÂ·/g, '📷'],
    [/Ã°Å¸â€œÂ/g, '📅'],
    [/Ã°Å¸â€˜Â¨/g, '👨'],
    [/Ã°Å¸â€˜Â©/g, '👩'],
    [/Ã°Å¸â€Â/g, '🛡️'],
    [/Ã°Å¸â€œÅ /g, '📊'],
    [/Ã°Å¸Å½â€°/g, '🎉'],
    [/Ã°Å¸â€™Â¡/g, '💡'],
    [/Ã°Å¸â€™Â¬/g, '💬'],

    // Double-encoded mess
    [/ðŸ‘¨â€ðŸ«/g, '👨‍🏫'],
    [/ðŸ‘¨â€ ðŸ «/g, '👨‍🏫'],
    [/ðŸ˜ /g, '😐'],
    [/ðŸ˜  /g, '😐'],
    [/âŒ/g, '❌'],
    [/â Œ/g, '❌'],
    [/ðŸ"…/g, '📅'],
    [/ðŸ"¸/g, '📸'],
    [/ðŸ"Š/g, '📊'],
    [/âš ï¸/g, '⚠️'],
    [/ðŸ‘‘/g, '👑'],
    [/ðŸŽ‰/g, '🎉'],
    [/ðŸ’¡/g, '💡'],
    [/ðŸ’¬/g, '💬'],
    [/â­ /g, '⭐'],
    [/â˜†/g, '☆'],
    [/ðŸ˜ž/g, '😫'],
    [/ðŸ˜•/g, '😕'],
    [/ðŸ˜Š/g, '😊'],
    [/ðŸ¤©/g, '🤩'],
    [/â†’/g, '→'],
    [/ðŸ“¦/g, '📦'],
    [/âš§ï¸ /g, '⚧️'],

    // Common Spanish character corruption
    [/EvaluaciÃ³n/g, 'Evaluación'],
    [/GESTIÃ"N/g, 'GESTIÓN'],
    [/CÃ"DIGOS/g, 'CÓDIGOS'],
    [/CUMPLEAÃ‘OS/g, 'CUMPLEAÑOS'],
    [/Ã­Å¡ltima/g, 'Última'],
    [/Ã­Å¡ltimo/g, 'Último'],
    [/Ã±/g, 'ñ'],
    [/Ã¡/g, 'á'],
    [/Ã©/g, 'é'],
    [/Ã³/g, 'ó'],
    [/Ãº/g, 'ú'],
    [/Ãš/g, 'Ú'],
    [/Ã‘/g, 'Ñ'],
    [/í“/g, 'Ó'],
    [/Ã“/g, 'Ó'],
    [/Ã¢â‚¬â€œ/g, '—'],
    [/Ã—/g, '×'],
    [/âœ…/g, '✅'],
    [/âœ“/g, '✓'],
    [/Ã¢ÂœÂ…/g, '✅'],
    [/Ã¢ÂœÂ/g, '✓'],
    [/Â¡/g, '¡'],
    [/Â¿/g, '¿']
];

filesToFix.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        replacements.forEach(([regex, replacement]) => {
            content = content.replace(regex, replacement);
        });

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Fixed encoding in ${file}`);
        } else {
            console.log(`ℹ️ No changes needed in ${file}`);
        }
    }
});
console.log('Finalizado.');
