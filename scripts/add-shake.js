const fs = require('fs');

// Agregar animación shake al final del CSS
const shakeAnimation = `
/* ================================================ */
/* ANIMACIÓN DE ERROR PARA LOGIN                    */
/* ================================================ */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* Mejoras en el componente de login */
#auth-container .auth-card {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const cssPath = 'css/styles.css';
let content = fs.readFileSync(cssPath, 'utf8');

// Solo agregar si no existe ya
if (!content.includes('@keyframes shake')) {
    content += shakeAnimation;
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('✅ Animación shake agregada a styles.css');
} else {
    console.log('⚠️ Animación shake ya existe');
}
