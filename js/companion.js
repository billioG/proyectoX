/**
 * MASCOTAS -- cada estudiante elige UNA especie inicial (quetzal, jaguar o
 * tortuga, estilo Pokémon) que evoluciona en 6 etapas según cuántas gemas
 * ganó EN TOTAL (students.gems_earned_total). No retrocede si gasta gemas.
 * La especie se guarda vía RPC choose_companion (migrations/companion-species.sql).
 * Todo en SVG plano, viewBox 300x300.
 */

const STAGE_THRESHOLDS = [0, 100, 300, 600, 1000, 1600];
// Etapa -> tamaño de la criatura (0 = huevo; 4 y 5 = adulto + aura/corona).
const STAGE_GROWTH = [0, 1, 2, 3, 3, 3];

// ---------- piezas comunes ----------
function eyePair(lx, rx, y, r) {
  return [lx, rx].map(x => `<g class="cp-eye">
    <circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>
    <circle cx="${x + (x < 150 ? 3 : -3)}" cy="${y + 1}" r="${r * 0.6}" fill="#1E293B" class="companion-eye"/>
    <circle cx="${x + (x < 150 ? 6 : 0)}" cy="${y - 3}" r="${r * 0.22}" fill="#fff"/></g>`).join('');
}

function egg(c) {
  return `<g class="cp-egg">
    <ellipse cx="150" cy="170" rx="80" ry="100" fill="${c.shell}" stroke="${c.stroke}" stroke-width="5"/>
    <circle cx="112" cy="95" r="9" fill="${c.spot}"/><circle cx="186" cy="118" r="7" fill="${c.spot}"/>
    <circle cx="128" cy="222" r="10" fill="${c.spot}"/><circle cx="190" cy="215" r="6" fill="${c.spot}"/>
    <circle cx="160" cy="80" r="5" fill="${c.spot}"/>
    ${eyePair(128, 172, 160, 11)}
    <path class="companion-mouth" d="M138 186 Q150 195 162 186" stroke="#3E2723" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
}

function aura(color) {
  return `<circle cx="150" cy="150" r="140" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="14 10" opacity="0.7" class="companion-aura"/>`;
}

function crown() {
  return `
    <path d="M118 40 L126 12 L139 30 L150 4 L161 30 L174 12 L182 40 Z" fill="#FFD54F" stroke="#F57F17" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="150" cy="27" r="4" fill="#E53935"/><circle cx="131" cy="32" r="3" fill="#1E88E5"/><circle cx="169" cy="32" r="3" fill="#1E88E5"/>`;
}

function sparkles() {
  const star = (x, y, s) => `<path d="M ${x} ${y - s} l ${s * 0.3} ${s * 0.7} l ${s * 0.7} ${s * 0.3} l ${-s * 0.7} ${s * 0.3} l ${-s * 0.3} ${s * 0.7} l ${-s * 0.3} ${-s * 0.7} l ${-s * 0.7} ${-s * 0.3} l ${s * 0.7} ${-s * 0.3} Z" fill="#FFD54F" class="companion-sparkle"/>`;
  return star(42, 70, 14) + star(262, 95, 11) + star(252, 250, 13) + star(48, 240, 9);
}

// ---------- QUETZAL ----------
function quetzalTail(len) {
  if (len === 'short') return `<g class="cp-tail">
    <path d="M 185 300 C 170 350 130 380 125 420 C 145 420 185 370 195 300 Z" fill="#009624"/>
    <path d="M 215 300 C 230 350 270 380 275 420 C 255 420 215 370 205 300 Z" fill="#00C853"/></g>`;
  if (len === 'long') return `<g class="cp-tail">
    <path d="M 185 300 C 160 380 90 410 80 480 C 105 480 180 400 195 300 Z" fill="#009624"/>
    <path d="M 215 300 C 240 380 310 410 320 480 C 295 480 220 400 205 300 Z" fill="#00C853"/>
    <path d="M 200 300 C 200 380 195 430 200 490 C 210 430 205 380 205 300 Z" fill="#00E676"/></g>`;
  return '';
}

function quetzalBody() {
  return `
    <ellipse cx="160" cy="335" rx="16" ry="8" fill="#FF9100"/><ellipse cx="240" cy="335" rx="16" ry="8" fill="#FF9100"/>
    <rect x="110" y="100" width="180" height="230" rx="90" fill="#00C853"/>
    <path d="M 170 105 C 170 70 190 65 200 65 C 210 65 230 70 230 105 Z" fill="#5CF29D"/>
    <path d="M 182 100 C 182 78 193 72 200 72 C 207 72 218 78 218 100 Z" fill="#00C853"/>
    <path class="cp-wing-l" d="M 110 180 C 65 200 60 265 115 275 C 108 240 115 200 110 180 Z" fill="#009624"/>
    <path class="cp-wing-r" d="M 290 180 C 335 200 340 265 285 275 C 292 240 285 200 290 180 Z" fill="#009624"/>
    <path d="M 135 195 C 135 295 265 295 265 195 C 265 180 135 180 135 195 Z" fill="#FF3D00"/>
    <path d="M 148 205 C 148 285 252 285 252 205 C 252 193 148 193 148 205 Z" fill="#FF5252"/>
    <g class="cp-eye"><circle cx="160" cy="158" r="28" fill="#FFFFFF"/><circle cx="166" cy="158" r="15" fill="#1E293B" class="companion-eye"/></g>
    <g class="cp-eye"><circle cx="240" cy="158" r="28" fill="#FFFFFF"/><circle cx="234" cy="158" r="15" fill="#1E293B" class="companion-eye"/></g>
    <path d="M 182 168 Q 200 162 218 168 C 218 195 200 218 200 218 C 200 218 182 195 182 168 Z" fill="#FFC107"/>`;
}

function quetzal(g) {
  // El cuerpo original vive en un espacio 400x500 centrado en x=200 --
  // cada escala se re-centra en x=150 del viewBox 300x300.
  const cfg = [
    { tail: '', t: 'translate(40 42) scale(0.55)' },
    { tail: 'short', t: 'translate(20 20) scale(0.65)' },
    { tail: 'long', t: 'translate(26 -2) scale(0.62)' },
  ][g - 1];
  return `<g transform="${cfg.t}">${quetzalTail(cfg.tail)}${quetzalBody()}</g>`;
}

// ---------- JAGUAR ----------
function rosettes(list) {
  return list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#4E342E" stroke-width="${Math.max(2.5, r * 0.5)}"/>`).join('');
}

function jaguar(g) {
  const sc = [0.62, 0.8, 0.95][g - 1];
  const tail = g >= 2
    ? `<g class="cp-tail cp-tail-j"><path d="M205 240 C 258 248 270 200 246 178" stroke="#F5A623" stroke-width="16" fill="none" stroke-linecap="round"/><circle cx="246" cy="178" r="9" fill="#4E342E"/></g>`
    : '';
  const bodySpots = g >= 2 ? rosettes([[116, 205, 7], [184, 200, 8], [122, 247, 6], [180, 250, 7]]) : '';
  const headSpots = g >= 3 ? rosettes([[106, 88, 6], [194, 88, 6], [150, 70, 7], [128, 72, 4], [172, 72, 4]]) : rosettes([[150, 72, 6]]);
  const brows = g >= 3
    ? `<path d="M104 94 L138 102 M196 94 L162 102" stroke="#4E342E" stroke-width="5" stroke-linecap="round"/>`
    : '';
  return `<g transform="translate(150 170) scale(${sc}) translate(-150 -170)">
    ${tail}
    <ellipse cx="150" cy="220" rx="68" ry="58" fill="#F5A623"/>
    <ellipse cx="150" cy="232" rx="38" ry="36" fill="#FFE0B2"/>
    ${bodySpots}
    <ellipse cx="112" cy="272" rx="22" ry="13" fill="#F5A623"/><ellipse cx="188" cy="272" rx="22" ry="13" fill="#F5A623"/>
    <g class="cp-ear-l"><circle cx="96" cy="68" r="24" fill="#F5A623"/><circle cx="96" cy="68" r="12" fill="#6D4C41"/></g>
    <g class="cp-ear-r"><circle cx="204" cy="68" r="24" fill="#F5A623"/><circle cx="204" cy="68" r="12" fill="#6D4C41"/></g>
    <circle cx="150" cy="125" r="72" fill="#F5A623"/>
    ${headSpots}
    <ellipse cx="150" cy="152" rx="36" ry="25" fill="#FFE0B2"/>
    ${eyePair(122, 178, 115, 17)}
    ${brows}
    <path d="M139 140 L161 140 L150 152 Z" fill="#5D4037"/>
    <path d="M150 152 Q141 164 132 157 M150 152 Q159 164 168 157" stroke="#5D4037" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M112 150 L88 146 M112 157 L88 161 M188 150 L212 146 M188 157 L212 161" stroke="#8D6E63" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

// ---------- TORTUGA ----------
function hex(cx, cy, r, fill, stroke) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
}

function tortuga(g) {
  const sc = [0.62, 0.8, 0.95][g - 1];
  let pattern = hex(150, 162, 22, '#26A69A', '#004D40');
  if (g >= 2) pattern += hex(106, 178, 16, '#26A69A', '#004D40') + hex(194, 178, 16, '#26A69A', '#004D40');
  if (g >= 3) pattern += hex(124, 136, 13, '#4DB6AC', '#004D40') + hex(176, 136, 13, '#4DB6AC', '#004D40');
  const rim = g >= 3 ? '#FFB300' : '#00695C';
  return `<g transform="translate(150 170) scale(${sc}) translate(-150 -170)">
    <g class="cp-flip-l"><ellipse cx="72" cy="232" rx="32" ry="14" fill="#7CB342" transform="rotate(-25 72 232)"/></g>
    <g class="cp-flip-r"><ellipse cx="228" cy="232" rx="32" ry="14" fill="#7CB342" transform="rotate(25 228 232)"/></g>
    <ellipse cx="98" cy="272" rx="22" ry="12" fill="#7CB342"/><ellipse cx="202" cy="272" rx="22" ry="12" fill="#7CB342"/>
    <path d="M58 225 C 58 96, 242 96, 242 225 Z" fill="#00897B"/>
    ${pattern}
    <ellipse cx="150" cy="226" rx="98" ry="13" fill="${rim}"/>
    <g class="cp-head">
      <circle cx="150" cy="218" r="44" fill="#9CCC65"/>
      <circle cx="120" cy="232" r="7" fill="#F48FB1" opacity=".7"/><circle cx="180" cy="232" r="7" fill="#F48FB1" opacity=".7"/>
      ${eyePair(132, 168, 208, 14)}
      <path d="M138 236 Q150 246 162 236" stroke="#33691E" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
  </g>`;
}

// ---------- catálogo ----------
const COMPANION_SPECIES = {
  quetzal: {
    label: 'Quetzal',
    desc: 'Libre y veloz. El ave nacional de Guatemala.',
    color: '#00C853',
    egg: { shell: '#E8F5E9', stroke: '#00C853', spot: '#69F0AE' },
    names: ['Huevo de Quetzal', 'Pichón', 'Quetzalito', 'Quetzal', 'Quetzal Guardián', "Q'uq'umatz"],
    draw: quetzal,
  },
  jaguar: {
    label: 'Jaguar',
    desc: 'Valiente y fuerte. El rey de la selva maya.',
    color: '#F5A623',
    egg: { shell: '#FFF3E0', stroke: '#F5A623', spot: '#8D6E63' },
    names: ['Huevo de Jaguar', 'Cachorro', 'Jaguarcito', 'Jaguar', 'Jaguar Guardián', 'Balam'],
    draw: jaguar,
  },
  tortuga: {
    label: 'Tortuga',
    desc: 'Sabia y paciente. Nada la detiene.',
    color: '#00897B',
    egg: { shell: '#E0F2F1', stroke: '#00897B', spot: '#4DB6AC' },
    names: ['Huevo de Tortuga', 'Tortuguita', 'Tortuga Joven', 'Tortuga Marina', 'Tortuga Guardiana', 'Tortuga Ancestral'],
    draw: tortuga,
  },
};
window.COMPANION_SPECIES = COMPANION_SPECIES;

function companionSvgInner(species, stageIndex) {
  const sp = COMPANION_SPECIES[species] || COMPANION_SPECIES.quetzal;
  const growth = STAGE_GROWTH[stageIndex] ?? 0;
  if (growth === 0) return egg(sp.egg);
  let svg = `<g class="cp-body">${sp.draw(growth)}</g>`;
  if (stageIndex === 4) svg = aura(sp.color) + svg;
  if (stageIndex === 5) svg = aura('#FFD54F') + svg + crown() + sparkles();
  return svg;
}

window.getCompanionStage = function getCompanionStage(gemsEarnedTotal, species = window._myCompanionSpecies || 'quetzal') {
  const total = gemsEarnedTotal || 0;
  let stageIndex = 0;
  STAGE_THRESHOLDS.forEach((t, i) => { if (total >= t) stageIndex = i; });
  const names = (COMPANION_SPECIES[species] || COMPANION_SPECIES.quetzal).names;
  const stage = { name: names[stageIndex], threshold: STAGE_THRESHOLDS[stageIndex] };
  const next = stageIndex < STAGE_THRESHOLDS.length - 1
    ? { name: names[stageIndex + 1], threshold: STAGE_THRESHOLDS[stageIndex + 1] }
    : null;
  const progress = next ? Math.min(100, Math.round(((total - stage.threshold) / (next.threshold - stage.threshold)) * 100)) : 100;
  return { stageIndex, stage, next, total, progress };
};

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
    .companion-sparkle { animation: companion-twinkle 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes companion-twinkle { 0%, 100% { opacity: .3; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.1); } }
    .companion-hatch { animation: companion-hatch .5s ease-in-out infinite; transform-origin: 50% 90%; }
    @keyframes companion-hatch { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
    .companion-flash { animation: companion-flash .25s steps(2) infinite; }
    @keyframes companion-flash { 0% { filter: brightness(1); } 100% { filter: brightness(0) invert(1); } }
    /* --- movimientos naturales (se suman con cada etapa) --- */
    .cp-svg { transform-origin: 50% 90%; }
    .cp-svg .cp-eye { transform-box: fill-box; transform-origin: center; animation: cp-blink 4.3s infinite; }
    @keyframes cp-blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
    .cp-svg .cp-body { transform-box: fill-box; transform-origin: 50% 100%; animation: cp-breathe 3.2s ease-in-out infinite; }
    @keyframes cp-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.025, .975); } }
    .cp-svg .cp-egg { transform-box: fill-box; transform-origin: 50% 100%; animation: cp-egg-wobble 5s ease-in-out infinite; }
    @keyframes cp-egg-wobble { 0%, 80%, 100% { transform: rotate(0); } 84% { transform: rotate(-6deg); } 88% { transform: rotate(6deg); } 92% { transform: rotate(-3deg); } }
    .cp-svg .cp-wing-l, .cp-svg .cp-wing-r, .cp-svg .cp-tail, .cp-svg .cp-ear-l, .cp-svg .cp-ear-r,
    .cp-svg .cp-flip-l, .cp-svg .cp-flip-r, .cp-svg .cp-head { transform-box: fill-box; }
    .cp-svg .cp-wing-l { transform-origin: 100% 15%; }
    .cp-svg .cp-wing-r { transform-origin: 0% 15%; }
    .cp-svg .cp-tail { transform-origin: 50% 0%; }
    .cp-svg .cp-tail-j { transform-origin: 0% 90%; }
    .cp-svg .cp-ear-l, .cp-svg .cp-ear-r { transform-origin: 50% 100%; }
    .cp-svg .cp-flip-l { transform-origin: 100% 50%; }
    .cp-svg .cp-flip-r { transform-origin: 0% 50%; }
    .cp-svg .cp-head { transform-origin: 50% 100%; }
    .cp-g2 .cp-wing-l, .cp-g3 .cp-wing-l { animation: cp-flap-l 3s ease-in-out infinite; }
    .cp-g2 .cp-wing-r, .cp-g3 .cp-wing-r { animation: cp-flap-r 3s ease-in-out infinite; }
    @keyframes cp-flap-l { 0%, 70%, 100% { transform: rotate(0); } 78% { transform: rotate(18deg); } 86% { transform: rotate(-4deg); } 92% { transform: rotate(14deg); } }
    @keyframes cp-flap-r { 0%, 70%, 100% { transform: rotate(0); } 78% { transform: rotate(-18deg); } 86% { transform: rotate(4deg); } 92% { transform: rotate(-14deg); } }
    .cp-g2 .cp-tail, .cp-g3 .cp-tail { animation: cp-sway 2.8s ease-in-out infinite; }
    @keyframes cp-sway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
    .cp-g2 .cp-tail-j, .cp-g3 .cp-tail-j { animation: cp-wag 1.6s ease-in-out infinite; }
    @keyframes cp-wag { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(10deg); } }
    .cp-g3 .cp-ear-l { animation: cp-twitch 5.5s ease-in-out infinite; }
    .cp-g3 .cp-ear-r { animation: cp-twitch 5.5s ease-in-out 2.7s infinite; }
    @keyframes cp-twitch { 0%, 88%, 100% { transform: rotate(0); } 91% { transform: rotate(-14deg); } 95% { transform: rotate(8deg); } }
    .cp-g2 .cp-flip-l, .cp-g3 .cp-flip-l { animation: cp-paddle-l 2.4s ease-in-out infinite; }
    .cp-g2 .cp-flip-r, .cp-g3 .cp-flip-r { animation: cp-paddle-r 2.4s ease-in-out infinite; }
    @keyframes cp-paddle-l { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(14deg); } }
    @keyframes cp-paddle-r { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-14deg); } }
    .cp-g3 .cp-head { animation: cp-peek 6s ease-in-out infinite; }
    @keyframes cp-peek { 0%, 80%, 100% { transform: rotate(0) translateY(0); } 85% { transform: rotate(-8deg) translateY(-4px); } 92% { transform: rotate(8deg) translateY(-4px); } }

    /* --- emotes al tocar --- */
    .cp-svg.cp-emote-hop { animation: cp-hop .7s cubic-bezier(.3,1.6,.5,1) 2 !important; }
    @keyframes cp-hop { 0%, 100% { transform: translateY(0) scale(1, 1); } 20% { transform: translateY(0) scale(1.15, .85); } 55% { transform: translateY(-38px) scale(.92, 1.1); } }
    .cp-svg.cp-emote-wiggle { animation: cp-wiggle .3s ease-in-out 4 !important; }
    @keyframes cp-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
    .cp-svg.cp-emote-spin { animation: cp-spin .9s cubic-bezier(.5,0,.3,1) !important; }
    @keyframes cp-spin { 0% { transform: rotateY(0) translateY(0); } 50% { transform: rotateY(180deg) translateY(-20px); } 100% { transform: rotateY(360deg) translateY(0); } }
    .cp-svg.cp-emote-dance { animation: cp-dance 1.5s ease-in-out !important; }
    @keyframes cp-dance { 0%, 100% { transform: translateX(0) rotate(0); } 15% { transform: translateX(-14px) rotate(-10deg) translateY(-8px); } 30% { transform: translateX(0) rotate(0); } 45% { transform: translateX(14px) rotate(10deg) translateY(-8px); } 60% { transform: translateX(0) rotate(0); } 80% { transform: translateY(-18px) scale(1.08); } }
    .cp-svg.cp-emote-fly { animation: cp-fly 1.7s ease-in-out !important; }
    .cp-svg.cp-emote-fly .cp-wing-l, .cp-svg.cp-emote-fly .cp-wing-r { animation-duration: .18s !important; }
    @keyframes cp-fly { 0%, 100% { transform: translateY(0); } 30% { transform: translateY(-50px) rotate(-6deg); } 60% { transform: translateY(-40px) rotate(6deg); } }
    .cp-svg.cp-emote-roar { animation: cp-roar 1.2s ease-out !important; }
    @keyframes cp-roar { 0% { transform: scale(1); } 20% { transform: scale(.92); } 35% { transform: scale(1.22) rotate(-2deg); } 45% { transform: scale(1.2) rotate(2deg); } 55% { transform: scale(1.22) rotate(-2deg); } 100% { transform: scale(1); } }
    .cp-svg.cp-emote-shell .cp-head { animation: cp-shell 1.5s ease-in-out !important; }
    @keyframes cp-shell { 0%, 100% { transform: scale(1) translateY(0); } 25%, 65% { transform: scale(.2) translateY(-60px); } 80% { transform: scale(1.15) translateY(0); } }
    .cp-svg.cp-emote-legend { animation: cp-legend 1.5s ease-out !important; }
    @keyframes cp-legend { 0% { filter: drop-shadow(0 0 0 #FFD54F); transform: scale(1); } 40% { filter: drop-shadow(0 0 22px #FFD54F) brightness(1.25); transform: scale(1.15) translateY(-12px); } 100% { filter: drop-shadow(0 0 0 #FFD54F); transform: scale(1); } }
    .cp-svg.cp-emote-wobble { animation: cp-wiggle .22s ease-in-out 4 !important; }
    .cp-bubble { position: absolute; top: -6%; right: -4%; font-size: 1.6rem; pointer-events: none; animation: cp-bubble 1.2s ease-out forwards; }
    @keyframes cp-bubble { 0% { transform: translateY(8px) scale(.3); opacity: 0; } 25% { transform: translateY(0) scale(1.15); opacity: 1; } 100% { transform: translateY(-28px) scale(1); opacity: 0; } }
    .cp-emote-chip { display:inline-flex; align-items:center; gap:.3rem; padding:.25rem .6rem; border-radius:9999px; font-size:.65rem; font-weight:800; }
    @media (prefers-reduced-motion: reduce) { .cp-svg, .cp-svg * { animation: none !important; } }

    .cp-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:.75rem; }
    @media (max-width: 520px) { .cp-grid { grid-template-columns: 1fr; } }
    .cp-card { background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.1); border-radius: 1.25rem; padding: 1rem; cursor: pointer;
      transition: transform .15s, border-color .15s, background .15s; display:flex; flex-direction:column; align-items:center; text-align:center; }
    @media (max-width: 520px) { .cp-card { flex-direction:row; text-align:left; gap:1rem; } }
    .cp-card:hover { transform: translateY(-4px); border-color: var(--cp-color); background: rgba(255,255,255,.1); }
    .cp-card .cp-art { width: 7.5rem; height: 7.5rem; flex-shrink:0; }
    .cp-card h3 { font-weight: 900; font-size: 1.1rem; text-transform: uppercase; font-style: italic; color: var(--cp-color); margin: .25rem 0; }
    .cp-card p { font-size: .75rem; color: #cbd5e1; margin: 0; }
  `;
  document.head.appendChild(style);
};

// Las clases cp-g{n} habilitan los movimientos naturales de cada etapa
// (ver ensureCompanionStyles); tocar la mascota dispara un emote.
window.renderCompanionSvg = function renderCompanionSvg(stageIndex, extraClass = 'companion-idle', species = window._myCompanionSpecies || 'quetzal') {
  const growth = STAGE_GROWTH[stageIndex] ?? 0;
  return `<svg viewBox="0 0 300 300" class="cp-svg cp-g${growth} ${extraClass}" data-stage="${stageIndex}" data-species="${species}"
    onclick="window.playCompanionEmote(this)" style="width:100%; height:100%; overflow:visible; cursor:pointer;">${companionSvgInner(species, stageIndex)}</svg>`;
};

// Emotes: se desbloquean al evolucionar (estilo Free Fire).
const SPECIAL_EMOTE = {
  quetzal: { id: 'fly', label: 'Vuelo', bubble: '🪶' },
  jaguar: { id: 'roar', label: 'Rugido', bubble: '💢' },
  tortuga: { id: 'shell', label: 'Caparazón', bubble: '🛡️' },
};

function emotesFor(species) {
  const special = SPECIAL_EMOTE[species] || SPECIAL_EMOTE.quetzal;
  return [
    { id: 'hop', label: 'Salto', bubble: '✨', minStage: 1 },
    { id: 'wiggle', label: 'Alegría', bubble: '💚', minStage: 1 },
    { id: 'spin', label: 'Giro', bubble: '🌀', minStage: 2 },
    { id: 'dance', label: 'Baile', bubble: '🎵', minStage: 3 },
    { ...special, minStage: 4 },
    { id: 'legend', label: 'Aura Legendaria', bubble: '👑', minStage: 5 },
  ];
}
window.getCompanionEmotes = emotesFor;

const EMOTE_MS = { hop: 1400, wiggle: 1200, spin: 900, dance: 1500, fly: 1700, roar: 1200, shell: 1500, legend: 1500, wobble: 900 };

window.playCompanionEmote = function playCompanionEmote(svg) {
  if (!svg || svg.dataset.emoting) return;
  const stage = parseInt(svg.dataset.stage || '0', 10);
  const species = svg.dataset.species || 'quetzal';
  let emote;
  if (stage === 0) {
    emote = { id: 'wobble', bubble: '❔' };
  } else {
    const pool = emotesFor(species).filter(e => e.minStage <= stage);
    const last = svg.dataset.lastEmote;
    const options = pool.length > 1 ? pool.filter(e => e.id !== last) : pool;
    emote = options[Math.floor(Math.random() * options.length)];
  }
  svg.dataset.emoting = '1';
  svg.dataset.lastEmote = emote.id;
  svg.classList.add(`cp-emote-${emote.id}`);

  const host = svg.parentElement;
  let bubble = null;
  if (host) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    bubble = document.createElement('span');
    bubble.className = 'cp-bubble';
    bubble.textContent = emote.bubble;
    host.appendChild(bubble);
  }
  if (navigator.vibrate && navigator.userActivation?.isActive) navigator.vibrate(30);

  setTimeout(() => {
    svg.classList.remove(`cp-emote-${emote.id}`);
    delete svg.dataset.emoting;
    bubble?.remove();
  }, EMOTE_MS[emote.id] || 1200);
};

// Emote automático cada tanto -- la mascota se ve viva aunque nadie la toque.
function startAutoEmotes(container) {
  if (container._cpAutoEmote) clearInterval(container._cpAutoEmote);
  const id = container._cpAutoEmote = setInterval(() => {
    const svg = container.querySelector('.cp-svg');
    if (!svg || !document.body.contains(container)) return clearInterval(id);
    if (document.hidden) return;
    window.playCompanionEmote(svg);
  }, 9000);
}

// Carga especie + etapa del alumno actual y las deja en globals para que
// duelos/arena las usen. Si la etapa subió desde la última vez que se
// vio en este dispositivo, muestra la animación de evolución.
window.loadMyCompanion = async function loadMyCompanion() {
  if (window.userRole !== 'estudiante' || !window.currentUser || !window._supabase) return null;
  const uid = window.currentUser.id;
  const { data } = await window._supabase.from('students')
    .select('gems_earned_total, companion_species').eq('id', uid).maybeSingle();
  const species = data?.companion_species || null;
  const { stageIndex } = window.getCompanionStage(data?.gems_earned_total, species || 'quetzal');
  window._myCompanionSpecies = species;
  window._myCompanionStageIndex = stageIndex;

  if (species) {
    const key = `PX_COMPANION_STAGE_${uid}`;
    const seen = parseInt(localStorage.getItem(key) ?? '-1', 10);
    localStorage.setItem(key, String(stageIndex));
    if (seen >= 0 && stageIndex > seen) window.showCompanionEvolution(species, seen, stageIndex);
  }
  return { species, stageIndex, total: data?.gems_earned_total || 0 };
};

function companionOverlay(inner) {
  if (window.GameArena) window.GameArena.ensureStyles();
  window.ensureCompanionStyles();
  const overlay = document.createElement('div');
  overlay.className = 'ga-overlay';
  overlay.innerHTML = `<div class="ga-panel" style="max-width:44rem">${inner}</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function celebrate() {
  if (typeof window.confetti === 'function') {
    window.confetti({ particleCount: 160, spread: 100, origin: { y: 0.55 }, zIndex: 260 });
  }
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
}

const waitMs = (ms) => new Promise(r => setTimeout(r, ms));

// Elegir mascota inicial (una sola vez). Se abre solo desde el Centro de
// Juego o el perfil cuando el alumno todavía no eligió.
window.openStarterPicker = function openStarterPicker() {
  if (document.getElementById('starter-picker')) return;
  const cards = Object.entries(COMPANION_SPECIES).map(([key, sp]) => `
    <div class="cp-card" style="--cp-color:${sp.color}" onclick="window.confirmStarter('${key}')">
      <div class="cp-art">${window.renderCompanionSvg(3, 'companion-idle', key)}</div>
      <div>
        <h3>${sp.label}</h3>
        <p>${sp.desc}</p>
      </div>
    </div>`).join('');

  const overlay = companionOverlay(`
    <div class="ga-card">
      <div class="ga-title" style="margin-bottom:.5rem">Elegí tu compañero</div>
      <p style="color:#cbd5e1;font-size:.85rem;margin-bottom:1.25rem">Va a crecer con vos: cada gema que ganes lo hace evolucionar.</p>
      <div class="cp-grid">${cards}</div>
    </div>`);
  overlay.id = 'starter-picker';
};

window.confirmStarter = function confirmStarter(species) {
  const sp = COMPANION_SPECIES[species];
  const picker = document.getElementById('starter-picker');
  if (!sp || !picker) return;
  picker.querySelector('.ga-panel').innerHTML = `
    <div class="ga-card">
      <div style="width:10rem;height:10rem;margin:0 auto">${window.renderCompanionSvg(3, 'companion-victory', species)}</div>
      <div class="ga-result-title" style="color:${sp.color}">¿${sp.label}?</div>
      <p style="color:#cbd5e1;font-size:.85rem;margin-bottom:1.25rem">Es para siempre -- no se puede cambiar después.</p>
      <button class="ga-btn" id="btn-confirm-starter" onclick="window.chooseStarter('${species}')"><i class="fas fa-heart"></i> ¡Lo elijo!</button>
      <button onclick="document.getElementById('starter-picker').remove(); window.openStarterPicker()" style="margin-top:.9rem;background:none;border:0;color:#94a3b8;font-weight:800;font-size:.75rem;cursor:pointer">Volver</button>
    </div>`;
};

window.chooseStarter = async function chooseStarter(species) {
  const btn = document.getElementById('btn-confirm-starter');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const { error } = await window._supabase.rpc('choose_companion', { p_species: species });
  if (error) {
    document.getElementById('starter-picker')?.remove();
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  }

  window._myCompanionSpecies = species;
  const stageIndex = window._myCompanionStageIndex || 0;
  localStorage.setItem(`PX_COMPANION_STAGE_${window.currentUser.id}`, String(stageIndex));
  const sp = COMPANION_SPECIES[species];
  const panel = document.querySelector('#starter-picker .ga-panel');

  // Nacimiento: el huevo se sacude, destello, aparece la criatura en su
  // etapa actual (si ya tenía gemas ganadas, nace ya evolucionada).
  panel.innerHTML = `<div style="width:12rem;height:12rem;margin:0 auto">${window.renderCompanionSvg(0, 'companion-hatch', species)}</div>
    <p class="ga-title" style="margin-top:1rem">¿Qué va a salir?</p>`;
  await waitMs(1600);
  panel.innerHTML = `<div style="width:12rem;height:12rem;margin:0 auto">${window.renderCompanionSvg(stageIndex > 0 ? stageIndex : 1, 'companion-flash', species)}</div>`;
  await waitMs(700);
  const shownStage = stageIndex > 0 ? stageIndex : 1;
  panel.innerHTML = `
    <div class="ga-card">
      <div style="width:12rem;height:12rem;margin:0 auto">${window.renderCompanionSvg(shownStage, 'companion-victory', species)}</div>
      <div class="ga-result-title win">¡${sp.names[shownStage]}!</div>
      <p style="color:#cbd5e1;font-size:.9rem;margin-bottom:1.25rem">Se unió a tu equipo. Ganá gemas en duelos, cursos y retos para que evolucione.</p>
      <button class="ga-btn" onclick="document.getElementById('starter-picker').remove()">¡Vamos! <i class="fas fa-arrow-right"></i></button>
    </div>`;
  if (shownStage !== stageIndex) window._myCompanionStageIndex = shownStage;
  celebrate();
  if (typeof window.renderCompanionCard === 'function' && document.getElementById('companion-card-slot')) {
    window.renderCompanionCard('companion-card-slot', window.currentUser.id);
  }
};

// Evolución estilo Pokémon: parpadeo entre la forma vieja y la nueva.
window.showCompanionEvolution = async function showCompanionEvolution(species, fromStage, toStage) {
  const sp = COMPANION_SPECIES[species];
  if (!sp) return;
  const overlay = companionOverlay(`
    <p class="ga-title">¿Qué está pasando?</p>
    <div id="evo-art" style="width:12rem;height:12rem;margin:0 auto"></div>`);
  const art = overlay.querySelector('#evo-art');
  for (let i = 0; i < 8; i++) {
    art.innerHTML = window.renderCompanionSvg(i % 2 ? toStage : fromStage, 'companion-flash', species);
    await waitMs(Math.max(120, 380 - i * 35));
  }
  overlay.querySelector('.ga-panel').innerHTML = `
    <div class="ga-card">
      <div style="width:12rem;height:12rem;margin:0 auto">${window.renderCompanionSvg(toStage, 'companion-victory', species)}</div>
      <div class="ga-result-title win">¡Evolucionó!</div>
      <p style="color:#cbd5e1;font-size:.9rem;margin-bottom:1.25rem">Tu ${sp.names[fromStage]} ahora es <b style="color:${sp.color}">${sp.names[toStage]}</b>.</p>
      <button class="ga-btn" onclick="this.closest('.ga-overlay').remove()">¡Genial! <i class="fas fa-star"></i></button>
    </div>`;
  celebrate();
};

window.renderCompanionCard = async function renderCompanionCard(containerId, studentId) {
  const container = document.getElementById(containerId);
  if (!container || !window._supabase) return;
  window.ensureCompanionStyles();

  const { data: student } = await window._supabase.from('students')
    .select('gems_earned_total, companion_species').eq('id', studentId).maybeSingle();
  const species = student?.companion_species || null;
  const isMe = studentId === window.currentUser?.id;

  if (!species) {
    container.innerHTML = `
      <div class="glass-card p-8 flex flex-col sm:flex-row items-center gap-8 animate-slideUp">
        <div class="w-32 h-32 shrink-0">${window.renderCompanionSvg(0, 'companion-hatch', 'quetzal')}</div>
        <div class="grow w-full text-center sm:text-left">
          <div class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-1">Mi Mascota</div>
          <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-3">${isMe ? 'Todavía no elegiste' : 'Sin mascota'}</h3>
          ${isMe ? `<button class="btn-primary-tw h-11 px-6 text-xs uppercase font-bold" onclick="window.openStarterPicker()"><i class="fas fa-egg"></i> Elegir mascota</button>` : ''}
        </div>
      </div>`;
    return;
  }

  const { stageIndex, stage, next, total, progress } = window.getCompanionStage(student?.gems_earned_total, species);
  const emoteChips = emotesFor(species).map(e => {
    const unlocked = e.minStage <= stageIndex;
    return unlocked
      ? `<span class="cp-emote-chip bg-primary/10 text-primary-dark dark:text-primary">${e.bubble} ${e.label}</span>`
      : `<span class="cp-emote-chip bg-slate-100 dark:bg-slate-800 text-slate-400" title="Se desbloquea en: ${COMPANION_SPECIES[species].names[e.minStage]}"><i class="fas fa-lock"></i> ${e.label}</span>`;
  }).join('');
  container.innerHTML = `
    <div class="glass-card p-8 flex flex-col sm:flex-row items-center gap-8 animate-slideUp">
      <div class="w-32 h-32 shrink-0">${window.renderCompanionSvg(stageIndex, 'companion-idle', species)}</div>
      <div class="grow w-full text-center sm:text-left">
        <div class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-1">Mi Mascota · ${COMPANION_SPECIES[species].label}</div>
        <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-3">${stage.name}</h3>
        ${next ? `
          <div class="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
            <div class="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-700" style="width:${progress}%"></div>
          </div>
          <p class="text-xs text-slate-400 font-bold">${total} / ${next.threshold} gemas ganadas -- evoluciona a "${next.name}"</p>
        ` : `
          <p class="text-xs text-amber-500 font-bold uppercase tracking-widest"><i class="fas fa-crown"></i> ¡Evolución máxima alcanzada! (${total} gemas ganadas en total)</p>
        `}
        <div class="mt-4">
          <div class="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-2">Emotes ${isMe ? '-- tocá tu mascota' : ''}</div>
          <div class="flex flex-wrap gap-1.5">${emoteChips}</div>
        </div>
      </div>
    </div>`;
  startAutoEmotes(container);
};

console.log('✅ companion.js cargado');
