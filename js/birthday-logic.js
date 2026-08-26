/**
 * BIRTHDAY LOGIC - Celebraciones y Felicitaciones
 */

window.checkBirthdayCelebration = async function checkBirthdayCelebration() {
    const data = window.userData;
    const user = window.currentUser;
    if (!data || !data.birth_date || !user) {
        console.log('🎂 Bday check: No user data or birth date found.');
        return;
    }

    const today = new Date();
    // Obtener mes y día en formato local "MM-DD"
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tMonth}-${tDay}`;

    // Extraer mes y día del string de la DB "YYYY-MM-DD"
    const bParts = data.birth_date.split('-');
    const bdayStr = `${bParts[1]}-${bParts[2]}`;

    console.log(`🎂 Comparando: Hoy (${todayStr}) vs Cumpleaños (${bdayStr})`);

    const isBirthday = (todayStr === bdayStr);

    const storageKey = `bday_seen_${user.id}_${today.getFullYear()}`;
    const alreadySeen = localStorage.getItem(storageKey);

    if (isBirthday && !alreadySeen) {
        console.log('🎉 ¡Es tu cumpleaños! Disparando celebración...');
        window.showBirthdayModal();
        localStorage.setItem(storageKey, 'true');
    } else if (isBirthday) {
        console.log('🎂 Ya se mostró la felicitación de hoy.');
    }
}

window.showBirthdayModal = function showBirthdayModal() {
    const data = window.userData;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
    modal.id = 'birthday-celebration-modal';

    modal.innerHTML = `
        <div class="relative w-full max-w-md p-12 text-center overflow-hidden rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl">
            <!-- Efectos de Fondo -->
            <div class="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full"></div>
            <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/20 blur-[80px] rounded-full"></div>
            
            <div class="relative z-10">
                <div class="text-8xl mb-8 animate-bounce"><i class="fas fa-cake-candles"></i></div>
                <h2 class="text-4xl font-black text-white uppercase tracking-tighter italic mb-4 drop-shadow-lg">
                    ¡FELIZ CUMPLEAÑOS!
                </h2>
                <p class="text-xl font-bold text-amber-400 uppercase tracking-widest mb-2">
                    ${data?.full_name?.split(' ')[0] || 'Innovador'}
                </p>
                <div class="h-1 w-20 bg-primary mx-auto mb-8 rounded-full"></div>
                
                <p class="text-slate-300 font-medium text-lg leading-relaxed mb-10">
                    En <b class="text-white">Quetzal LMS</b> celebramos tu vida y tu talento. ¡Que hoy sea un día lleno de innovación y alegría!
                </p>
                
                <button onclick="this.closest('.fixed').remove()" class="btn-primary-tw w-full h-16 text-lg font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary/40 transform hover:scale-105 active:scale-95 transition-all">
                    ¡GRACIAS EQUIPO! <i class="fas fa-rocket"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Disparar confetti si la librería está disponible
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#00C853', '#F59E0B', '#FF3D00']
        });
    }
}

// Función global referenciada en otros archivos
window.startBirthdayConfetti = function () {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
};

// Auto-inicializar al detectar userData (a través de auth.js)
const observer = setInterval(() => {
    // Verificamos si userData existe globalmente
    if (typeof window.userData !== 'undefined' && window.userData !== null) {
        window.checkBirthdayCelebration();
        clearInterval(observer);
    }
}, 1000);
