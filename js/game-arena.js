/**
 * GAME ARENA -- capa visual compartida por los desafíos 1v1: pantalla VS
 * con cuenta regresiva, cronómetro, feedback de acierto/error (flash,
 * vibración, sonido corto) y pantalla de resultado con la mascota.
 * CSS propio (prefijo ga-) para no depender de clases de Tailwind.
 */

const GA_STYLES = `
.ga-overlay{position:fixed;inset:0;z-index:240;display:flex;align-items:center;justify-content:center;padding:1.5rem;
  background:radial-gradient(circle at 50% 30%,#1e1b4b 0%,#0f172a 55%,#020617 100%);overflow:hidden;animation:ga-fade .25s ease-out}
.ga-overlay::before{content:"";position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.03) 0 10deg,transparent 10deg 20deg);animation:ga-spin 40s linear infinite}
.ga-panel{position:relative;width:100%;max-width:32rem;text-align:center;color:#fff}
.ga-vs{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.ga-player{flex:1;display:flex;flex-direction:column;align-items:center;gap:.6rem;min-width:0}
.ga-player.left{animation:ga-in-left .5s cubic-bezier(.2,1.4,.4,1) both}
.ga-player.right{animation:ga-in-right .5s cubic-bezier(.2,1.4,.4,1) both}
.ga-avatar{width:5.5rem;height:5.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:900;
  background:linear-gradient(135deg,#6366f1,#ec4899);border:4px solid rgba(255,255,255,.9);box-shadow:0 0 30px rgba(99,102,241,.6);overflow:hidden}
.ga-player.right .ga-avatar{background:linear-gradient(135deg,#f97316,#ef4444);box-shadow:0 0 30px rgba(239,68,68,.6)}
.ga-avatar img{width:100%;height:100%;object-fit:cover}
.ga-fighter{width:7.5rem;height:7.5rem;filter:drop-shadow(0 0 18px rgba(99,102,241,.55))}
.ga-player.right .ga-fighter{filter:drop-shadow(0 0 18px rgba(239,68,68,.55))}
.ga-player.right .ga-fighter{transform:scaleX(-1)}
.ga-name{font-weight:800;font-size:.85rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ga-vs-badge{font-size:2.6rem;font-weight:900;font-style:italic;color:#facc15;text-shadow:0 0 20px rgba(250,204,21,.8),0 4px 0 #a16207;animation:ga-pop .6s .3s cubic-bezier(.2,1.6,.4,1) both}
.ga-title{font-size:.7rem;font-weight:900;letter-spacing:.3em;text-transform:uppercase;color:#a5b4fc;margin-bottom:1.5rem}
.ga-wager{margin-top:1.5rem;display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1.1rem;border-radius:9999px;background:rgba(34,211,238,.12);
  border:1px solid rgba(34,211,238,.4);color:#67e8f9;font-weight:900;font-size:.9rem}
.ga-count{font-size:7rem;font-weight:900;color:#fff;text-shadow:0 0 40px rgba(255,255,255,.6);animation:ga-count .8s ease-out both}
.ga-go{color:#4ade80;text-shadow:0 0 40px rgba(74,222,128,.8)}
.ga-card{position:relative;background:rgba(15,23,42,.85);border:1px solid rgba(255,255,255,.1);border-radius:1.5rem;padding:1.75rem;box-shadow:0 20px 60px rgba(0,0,0,.5);
  animation:ga-rise .4s cubic-bezier(.2,1.2,.4,1) both}
.ga-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem}
.ga-chip{font-size:.65rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:.35rem .75rem;border-radius:9999px;background:rgba(255,255,255,.08)}
.ga-clock{font-family:ui-monospace,monospace;font-size:1.1rem;font-weight:900;color:#facc15}
.ga-ok{animation:ga-flash-ok .5s ease-out}
.ga-bad{animation:ga-shake .45s ease-in-out,ga-flash-bad .5s ease-out}
.ga-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%;height:3.25rem;border-radius:1rem;font-weight:900;font-size:.85rem;
  letter-spacing:.1em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 6px 0 #15803d,0 10px 25px rgba(34,197,94,.35);
  transition:transform .1s,box-shadow .1s;border:0;cursor:pointer}
.ga-btn:active{transform:translateY(4px);box-shadow:0 2px 0 #15803d}
.ga-btn:disabled{opacity:.6;cursor:not-allowed}
.ga-result-title{font-size:2rem;font-weight:900;font-style:italic;text-transform:uppercase;margin:.5rem 0}
.ga-result-title.win{color:#4ade80;text-shadow:0 0 25px rgba(74,222,128,.6)}
.ga-result-title.lose{color:#fb7185;text-shadow:0 0 25px rgba(251,113,133,.5)}
.ga-input{width:100%;height:3.5rem;border-radius:1rem;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.15);color:#fff;
  text-align:center;font-size:1.5rem;font-weight:800;letter-spacing:.08em;outline:none;transition:border-color .2s,box-shadow .2s}
.ga-input:focus{border-color:#818cf8;box-shadow:0 0 0 4px rgba(129,140,248,.25)}
.ga-keys{display:flex;justify-content:center;gap:.4rem;margin-top:.75rem;flex-wrap:wrap}
.ga-key{min-width:2.6rem;height:2.6rem;border-radius:.75rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;
  font-weight:800;font-size:1.1rem;cursor:pointer;transition:transform .08s,background .15s}
.ga-key:hover{background:rgba(129,140,248,.25)}
.ga-key:active{transform:scale(.88);background:rgba(129,140,248,.45)}
.ga-hero{position:relative;overflow:hidden;cursor:pointer;border-radius:1.5rem;padding:1.5rem;margin-bottom:1rem;color:#fff;
  background:linear-gradient(135deg,var(--ga-c1,#6366f1),var(--ga-c2,#ec4899));box-shadow:0 10px 30px rgba(0,0,0,.35);transition:transform .15s}
.ga-hero:hover{transform:translateY(-3px) scale(1.01)}
.ga-hero:active{transform:scale(.98)}
.ga-hero-icon{position:absolute;right:-.5rem;bottom:-1.5rem;font-size:7rem;opacity:.18;transform:rotate(-12deg)}
.ga-hero h4{font-size:1.25rem;font-weight:900;font-style:italic;text-transform:uppercase;margin:0 0 .25rem}
.ga-hero p{font-size:.75rem;font-weight:600;opacity:.85;margin:0}
.ga-hero-cta{display:inline-flex;align-items:center;gap:.4rem;margin-top:1rem;padding:.45rem 1rem;border-radius:9999px;background:rgba(255,255,255,.2);
  font-size:.7rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.ga-mini-avatar{width:2.5rem;height:2.5rem;border-radius:9999px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;
  background:linear-gradient(135deg,#f97316,#ef4444);overflow:hidden}
.ga-mini-avatar img{width:100%;height:100%;object-fit:cover}
.ga-mascot{width:9rem;height:9rem;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:4rem}
@keyframes ga-fade{from{opacity:0}to{opacity:1}}
@keyframes ga-spin{to{transform:rotate(360deg)}}
@keyframes ga-in-left{from{transform:translateX(-120%) scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes ga-in-right{from{transform:translateX(120%) scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes ga-pop{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
@keyframes ga-count{0%{transform:scale(2.2);opacity:0}40%{transform:scale(1);opacity:1}100%{transform:scale(.8);opacity:0}}
@keyframes ga-rise{from{transform:translateY(40px) scale(.95);opacity:0}to{transform:none;opacity:1}}
@keyframes ga-flash-ok{0%{box-shadow:0 0 0 0 rgba(74,222,128,.9)}100%{box-shadow:0 0 0 24px rgba(74,222,128,0)}}
@keyframes ga-flash-bad{0%{box-shadow:0 0 0 0 rgba(244,63,94,.9)}100%{box-shadow:0 0 0 24px rgba(244,63,94,0)}}
@keyframes ga-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-7px)}80%{transform:translateX(7px)}}
@media (prefers-reduced-motion:reduce){.ga-overlay *,.ga-overlay::before{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

let gaAudioCtx = null;
function gaBeep(freq, ms, type = 'sine', gain = 0.05) {
  try {
    gaAudioCtx = gaAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = gaAudioCtx.createOscillator();
    const g = gaAudioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(gaAudioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, gaAudioCtx.currentTime + ms / 1000);
    osc.stop(gaAudioCtx.currentTime + ms / 1000);
  } catch (e) { /* sin audio, no pasa nada */ }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

window.GameArena = {
  ensureStyles() {
    if (document.getElementById('game-arena-styles')) return;
    const style = document.createElement('style');
    style.id = 'game-arena-styles';
    style.textContent = GA_STYLES;
    document.head.appendChild(style);
  },

  avatarHtml(name, photoUrl, cls = 'ga-avatar') {
    const s = window.sanitizeInput || ((v) => v);
    const initial = s((name || '?').trim().charAt(0).toUpperCase());
    return `<div class="${cls}">${photoUrl ? `<img src="${window.sanitizeAttr ? window.sanitizeAttr(photoUrl) : photoUrl}" alt="">` : initial}</div>`;
  },

  // Tarjeta grande para "crear reto" en el Centro de Juego.
  heroHtml({ title, subtitle, icon, c1, c2, onclick, cta = '<i class="fas fa-bolt"></i> Retar a alguien' }) {
    this.ensureStyles();
    return `
      <div class="ga-hero" style="--ga-c1:${c1};--ga-c2:${c2}" onclick="${onclick}">
        <i class="fas ${icon} ga-hero-icon"></i>
        <h4>${title}</h4>
        <p>${subtitle}</p>
        <span class="ga-hero-cta">${cta}</span>
      </div>`;
  },

  // Columnas de students para el join de challenger/opponent en cada juego.
  STUDENT_JOIN: 'full_name, profile_photo_url, companion_species, gems_earned_total, companion_equipped',

  // Jugadores de un duelo listos para versus() (con su mascota si tienen).
  async fightersFor(duel) {
    if (typeof window.loadMyCompanion === 'function' && window._myCompanionSpecies === undefined) await window.loadMyCompanion();
    const rival = duel?.challenger_id === window.currentUser.id ? duel?.opponent : duel?.challenger;
    const rivalCompanion = rival?.companion_species && typeof window.getCompanionStage === 'function'
      ? { species: rival.companion_species, stage: window.getCompanionStage(rival.gems_earned_total, rival.companion_species).stageIndex, equipped: rival.companion_equipped }
      : null;
    const myCompanion = window._myCompanionSpecies
      ? { species: window._myCompanionSpecies, stage: window._myCompanionStageIndex || 0, equipped: window._myCompanionEquipped }
      : null;
    return {
      me: { name: window.userData?.full_name, photo: window.userData?.profile_photo_url, companion: myCompanion },
      rival: { name: rival?.full_name, photo: rival?.profile_photo_url, companion: rivalCompanion },
      wager: duel?.wager_gems || 0,
    };
  },

  // Avatar chico del rival para las tarjetas de la lista.
  rivalMiniHtml(duel) {
    const rival = duel.challenger_id === window.currentUser.id ? duel.opponent : duel.challenger;
    return this.avatarHtml(rival?.full_name, rival?.profile_photo_url, 'ga-mini-avatar');
  },

  // Mascota del jugador en el VS (si tiene); si no, foto/inicial.
  fighterHtml(p) {
    if (p.companion?.species && typeof window.renderCompanionSvg === 'function') {
      window.ensureCompanionStyles?.();
      const { species, stage, equipped } = p.companion;
      return `<div class="ga-fighter">${window.renderCompanionSvg(stage, 'companion-idle', species, equipped || {})}</div>`;
    }
    return this.avatarHtml(p.name, p.photo);
  },

  // Pantalla VS + 3-2-1. Se resuelve cuando termina (antes de arrancar el
  // reloj del servidor, así la animación no le cuenta tiempo al alumno).
  async versus({ title, me, rival, wager }) {
    this.ensureStyles();
    const s = window.sanitizeInput || ((v) => v);
    const overlay = document.createElement('div');
    overlay.className = 'ga-overlay';
    overlay.innerHTML = `
      <div class="ga-panel">
        <div class="ga-title">${s(title)}</div>
        <div class="ga-vs">
          <div class="ga-player left">${this.fighterHtml(me)}<div class="ga-name">${s(me.name || 'Vos')}</div></div>
          <div class="ga-vs-badge">VS</div>
          <div class="ga-player right">${this.fighterHtml(rival)}<div class="ga-name">${s(rival.name || 'Rival')}</div></div>
        </div>
        ${wager > 0 ? `<div class="ga-wager"><i class="fas fa-gem"></i> ${wager} gemas en juego</div>` : ''}
      </div>`;
    document.body.appendChild(overlay);
    // Cada mascota "saluda" con un emote al entrar al ring.
    setTimeout(() => overlay.querySelectorAll('.ga-fighter .cp-svg').forEach((svg, i) =>
      setTimeout(() => window.playCompanionEmote?.(svg), i * 350)), 550);
    await wait(2000);

    const panel = overlay.querySelector('.ga-panel');
    for (const n of ['3', '2', '1']) {
      panel.innerHTML = `<div class="ga-count">${n}</div>`;
      gaBeep(520, 150, 'square');
      if (navigator.vibrate) navigator.vibrate(40);
      await wait(700);
    }
    panel.innerHTML = `<div class="ga-count ga-go">¡YA!</div>`;
    gaBeep(880, 300, 'square');
    if (navigator.vibrate) navigator.vibrate(120);
    await wait(500);
    overlay.remove();
  },

  // Cronómetro visual (el tiempo que cuenta de verdad lo mide el servidor).
  startStopwatch(el) {
    const start = performance.now();
    const id = setInterval(() => {
      if (!document.body.contains(el)) return clearInterval(id);
      el.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
    }, 100);
    return () => clearInterval(id);
  },

  feedback(el, ok) {
    if (!el) return;
    el.classList.remove('ga-ok', 'ga-bad');
    void el.offsetWidth;
    el.classList.add(ok ? 'ga-ok' : 'ga-bad');
    if (ok) { gaBeep(660, 120); setTimeout(() => gaBeep(990, 180), 110); }
    else gaBeep(160, 300, 'sawtooth', 0.04);
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  },

  // Pantalla de resultado con la mascota. Se resuelve al tocar "Continuar".
  result({ ok, title, subtitle, detailHtml = '' }) {
    this.ensureStyles();
    if (typeof window.ensureCompanionStyles === 'function') window.ensureCompanionStyles();
    const s = window.sanitizeInput || ((v) => v);
    const mascot = typeof window.renderCompanionSvg === 'function'
      ? window.renderCompanionSvg(window._myCompanionStageIndex || 0, ok ? 'companion-victory' : 'companion-defeat')
      : (ok ? '🏆' : '😢');

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ga-overlay';
      overlay.innerHTML = `
        <div class="ga-panel"><div class="ga-card">
          <div class="ga-mascot">${mascot}</div>
          <div class="ga-result-title ${ok ? 'win' : 'lose'}">${s(title)}</div>
          <p style="color:#cbd5e1;font-size:.9rem;margin-bottom:1rem">${s(subtitle)}</p>
          ${detailHtml}
          <button class="ga-btn" style="margin-top:1.5rem">Continuar <i class="fas fa-arrow-right"></i></button>
        </div></div>`;
      overlay.querySelector('.ga-btn').onclick = () => { overlay.remove(); resolve(); };
      document.body.appendChild(overlay);

      if (ok) {
        gaBeep(523, 120); setTimeout(() => gaBeep(659, 120), 120); setTimeout(() => gaBeep(784, 250), 240);
        if (typeof window.confetti === 'function') {
          window.confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, zIndex: 260 });
          setTimeout(() => window.confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0 }, zIndex: 260 }), 250);
          setTimeout(() => window.confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1 }, zIndex: 260 }), 400);
        }
      } else {
        gaBeep(392, 200, 'triangle'); setTimeout(() => gaBeep(311, 350, 'triangle'), 200);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    });
  },
};
