/**
 * MASCOTA DE GEMAS -- criatura propia del estudiante (distinta del
 * asistente/quetzal del chat) que evoluciona en 4 etapas según cuántas
 * gemas ganó EN TOTAL (students.gems_earned_total, ver
 * migrations/companion-gems-total.sql). No retrocede si gasta gemas.
 */

// Cuerpo base del quetzal (mismo diseño que quetzal-svg.svg / el asistente
// del chat en mascot-widget.js) y accesorios que se van acumulando etapa
// tras etapa -- todos en el mismo sistema de coordenadas 400x500 del
// quetzal original, para poder reusar las mismas piezas sin recalcular nada.
function bird() {
    return `
        <path d="M 185 300 C 160 380 90 410 80 480 C 105 480 180 400 195 300 Z" fill="#009624" />
        <path d="M 215 300 C 240 380 310 410 320 480 C 295 480 220 400 205 300 Z" fill="#00C853" />
        <ellipse cx="160" cy="335" rx="16" ry="8" fill="#FF9100" /><ellipse cx="240" cy="335" rx="16" ry="8" fill="#FF9100" />
        <rect x="110" y="100" width="180" height="230" rx="90" fill="#00C853" />
        <path d="M 170 105 C 170 70 190 65 200 65 C 210 65 230 70 230 105 Z" fill="#5CF29D" />
        <path d="M 182 100 C 182 78 193 72 200 72 C 207 72 218 78 218 100 Z" fill="#00C853" />
        <path d="M 110 180 C 65 200 60 265 115 275 C 108 240 115 200 110 180 Z" fill="#009624" />
        <path d="M 290 180 C 335 200 340 265 285 275 C 292 240 285 200 290 180 Z" fill="#009624" />
        <path d="M 135 195 C 135 295 265 295 265 195 C 265 180 135 180 135 195 Z" fill="#FF3D00" />
        <path d="M 148 205 C 148 285 252 285 252 205 C 252 193 148 193 148 205 Z" fill="#FF5252" />
        <circle cx="160" cy="158" r="28" fill="#FFFFFF" /><circle cx="166" cy="158" r="15" fill="#1E293B" class="companion-eye" />
        <circle cx="240" cy="158" r="28" fill="#FFFFFF" /><circle cx="234" cy="158" r="15" fill="#1E293B" class="companion-eye" />
        <path d="M 182 168 Q 200 162 218 168 C 218 195 200 218 200 218 C 200 218 182 195 182 168 Z" fill="#FFC107" />
    `;
}
function glasses() {
    return `
        <circle cx="160" cy="158" r="30" fill="none" stroke="#3E2723" stroke-width="6" />
        <circle cx="240" cy="158" r="30" fill="none" stroke="#3E2723" stroke-width="6" />
        <line x1="190" y1="158" x2="210" y2="158" stroke="#3E2723" stroke-width="6" />
    `;
}
function cap() {
    return `
        <polygon points="200,8 275,45 200,82 125,45" fill="#212121" stroke="#000" stroke-width="2" />
        <rect x="175" y="45" width="50" height="30" fill="#37474F" />
        <line x1="270" y1="45" x2="272" y2="90" stroke="#FBC02D" stroke-width="4" />
        <circle cx="272" cy="96" r="10" fill="#FBC02D" />
    `;
}
function diploma() {
    return `
        <rect x="255" y="225" width="16" height="50" rx="4" fill="#FFF8E1" stroke="#D7CCC8" stroke-width="2" />
        <rect x="255" y="225" width="16" height="7" fill="#EF5350" /><rect x="255" y="268" width="16" height="7" fill="#EF5350" />
    `;
}
function satchel() {
    return `
        <path d="M 130 230 L 270 230 L 260 290 L 140 290 Z" fill="#8D6E63" stroke="#5D4037" stroke-width="2.5" />
        <rect x="185" y="212" width="30" height="22" rx="5" fill="none" stroke="#5D4037" stroke-width="4" />
    `;
}
function sparkles() {
    return `
        <path d="M 200 12 l 5 14 l 14 5 l -14 5 l -5 14 l -5 -14 l -14 -5 l 14 -5 Z" fill="#FFD54F" />
        <circle cx="145" cy="35" r="5" fill="#FFD54F" /><circle cx="258" cy="28" r="4" fill="#FFD54F" />
    `;
}

const COMPANION_STAGES = [
    {
        name: 'Huevito',
        threshold: 0,
        svg: `
            <ellipse cx="150" cy="170" rx="80" ry="100" fill="#FFF8E1" stroke="#FFB300" stroke-width="4" />
            <circle cx="118" cy="90" r="6" fill="#FFE082" /><circle cx="182" cy="130" r="5" fill="#FFE082" /><circle cx="138" cy="205" r="7" fill="#FFE082" /><circle cx="192" cy="220" r="5" fill="#FFE082" />
            <circle cx="128" cy="160" r="11" fill="#3E2723" class="companion-eye" />
            <circle cx="172" cy="160" r="11" fill="#3E2723" class="companion-eye" />
            <circle cx="131" cy="156" r="3" fill="#FFFFFF" /><circle cx="175" cy="156" r="3" fill="#FFFFFF" />
            <path class="companion-mouth" d="M138 185 Q150 193 162 185" stroke="#3E2723" stroke-width="3" fill="none" stroke-linecap="round" />
        `,
    },
    {
        name: 'Aventurero',
        threshold: 100,
        svg: `<g transform="translate(-63,-38) scale(0.75)">${bird()}</g>`,
    },
    {
        name: 'Estudioso',
        threshold: 300,
        svg: `<g transform="translate(-63,-38) scale(0.75)">${bird()}${glasses()}</g>`,
    },
    {
        name: 'Graduado',
        threshold: 600,
        svg: `<g transform="translate(-63,-38) scale(0.75)">${bird()}${cap()}${diploma()}</g>`,
    },
    {
        name: 'Mentor',
        threshold: 1000,
        svg: `<g transform="translate(-63,-38) scale(0.75)">${bird()}${glasses()}${cap()}${satchel()}</g>`,
    },
    {
        // Etapa final -- máxima evolución: el quetzal real de la app (mismo
        // diseño que el asistente del chat, ver mascot-widget.js) con todo
        // lo que fue acumulando en el camino.
        name: 'Maestro Supremo',
        threshold: 1600,
        svg: `
            <circle cx="150" cy="150" r="145" fill="none" stroke="#FFD54F" stroke-width="4" opacity="0.6" class="companion-aura" />
            <g transform="translate(-63,-38) scale(0.75)">${bird()}${glasses()}${cap()}${satchel()}${sparkles()}</g>
        `,
    },
];
window.COMPANION_STAGES = COMPANION_STAGES;

window.getCompanionStage = function getCompanionStage(gemsEarnedTotal) {
    const total = gemsEarnedTotal || 0;
    let stageIndex = 0;
    for (let i = 0; i < COMPANION_STAGES.length; i++) {
        if (total >= COMPANION_STAGES[i].threshold) stageIndex = i;
    }
    const stage = COMPANION_STAGES[stageIndex];
    const next = COMPANION_STAGES[stageIndex + 1] || null;
    const progress = next ? Math.min(100, Math.round(((total - stage.threshold) / (next.threshold - stage.threshold)) * 100)) : 100;
    return { stageIndex, stage, next, total, progress };
}

window.ensureCompanionStyles = function ensureCompanionStyles() {
    if (document.getElementById('companion-styles')) return;
    const style = document.createElement('style');
    style.id = 'companion-styles';
    style.textContent = `
        .companion-idle { animation: companion-bob 2.4s ease-in-out infinite; }
        @keyframes companion-bob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-8px) rotate(-2deg); } }
        .companion-victory { animation: companion-victory 0.9s ease-in-out infinite; }
        @keyframes companion-victory { 0%, 100% { transform: translateY(0) scale(1) rotate(0deg); } 30% { transform: translateY(-24px) scale(1.12) rotate(-6deg); } 60% { transform: translateY(-4px) scale(1.05) rotate(4deg); } }
        .companion-defeat { animation: companion-defeat 1.4s ease-in-out; }
        @keyframes companion-defeat { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 30% { transform: translateY(6px) rotate(-8deg); } 60% { transform: translateY(10px) rotate(8deg); opacity: 0.8; } 100% { transform: translateY(14px) rotate(-4deg); opacity: 0.6; } }
        .companion-aura { animation: companion-aura-spin 6s linear infinite; transform-origin: 150px 150px; }
        @keyframes companion-aura-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
}

window.renderCompanionSvg = function renderCompanionSvg(stageIndex, extraClass = 'companion-idle') {
    const stage = COMPANION_STAGES[stageIndex] || COMPANION_STAGES[0];
    return `<svg viewBox="0 0 300 300" class="${extraClass}" style="width:100%; height:100%;">${stage.svg}</svg>`;
}

window.renderCompanionCard = async function renderCompanionCard(containerId, studentId) {
    const container = document.getElementById(containerId);
    if (!container || !window._supabase) return;
    window.ensureCompanionStyles();

    const { data: student } = await window._supabase.from('students').select('gems_earned_total').eq('id', studentId).maybeSingle();
    const { stageIndex, stage, next, total, progress } = window.getCompanionStage(student?.gems_earned_total);

    container.innerHTML = `
        <div class="glass-card p-8 flex flex-col sm:flex-row items-center gap-8 animate-slideUp">
            <div class="w-32 h-32 shrink-0">${window.renderCompanionSvg(stageIndex)}</div>
            <div class="grow w-full text-center sm:text-left">
                <div class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-1">Mi Mascota</div>
                <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-3">${stage.name}</h3>
                ${next ? `
                    <div class="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div class="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-700" style="width:${progress}%"></div>
                    </div>
                    <p class="text-xs text-slate-400 font-bold">${total} / ${next.threshold} gemas ganadas -- evoluciona a "${next.name}"</p>
                ` : `
                    <p class="text-xs text-amber-500 font-bold uppercase tracking-widest"><i class="fas fa-crown"></i> ¡Evolución máxima alcanzada! (${total} gemas ganadas en total)</p>
                `}
            </div>
        </div>
    `;
}

console.log('✅ companion.js cargado');
