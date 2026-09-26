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
.ga-quick{margin-bottom:2rem;padding:1rem;border-radius:1.5rem;background:rgba(250,204,21,.06);border:1px solid rgba(250,204,21,.25)}
.ga-quick-title{font-weight:900;font-style:italic;text-transform:uppercase;color:#facc15;font-size:1rem;margin-bottom:.75rem}
.ga-quick-title span{display:block;font-style:normal;text-transform:none;font-weight:700;font-size:.7rem;color:#94a3b8}
.ga-quick-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.5rem}
@media (max-width:520px){.ga-quick-row{grid-template-columns:repeat(3,minmax(0,1fr))}}
.ga-quick-btn{display:flex;flex-direction:column;align-items:center;gap:.35rem;padding:.75rem .25rem;border-radius:1rem;border:0;cursor:pointer;color:#fff;
  background:rgba(255,255,255,.07);transition:transform .1s,background .15s;font-weight:800;font-size:.62rem;line-height:1.15}
.ga-quick-btn i{font-size:1.3rem;color:#facc15}
.ga-quick-btn:hover{background:rgba(250,204,21,.15)}
.ga-quick-btn:active{transform:scale(.93)}
.ga-online{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-top:.75rem;font-size:.72rem}
.ga-online-label{font-weight:900;color:#4ade80;display:inline-flex;align-items:center;gap:.35rem;margin-right:.2rem}
.ga-online-empty{color:#94a3b8;font-weight:700}
.ga-online-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .7rem;border-radius:9999px;border:1px solid rgba(74,222,128,.35);background:rgba(74,222,128,.08);color:#fff;font-weight:800;font-size:.72rem;cursor:pointer}
.ga-online-chip:hover{background:rgba(74,222,128,.2)}
.ga-dot{width:.5rem;height:.5rem;border-radius:9999px;background:#4ade80;box-shadow:0 0 0 0 rgba(74,222,128,.7);animation:ga-pulse 1.6s infinite}
@keyframes ga-pulse{70%{box-shadow:0 0 0 .4rem rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
.ga-record{margin-top:1rem;font-size:.8rem;font-weight:800;color:#cbd5e1}
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

  // Datos de cada juego 1v1 para crear retos genéricos (revancha, rápido).
  GAMES: {
    quiz: { table: 'student_duels', label: 'Desafío de Código', icon: 'fa-code', cache: '_duelsCache', reload: 'loadDuelsSection', topic: true },
    hangman: { table: 'student_hangman_duels', label: 'Ahorcado', icon: 'fa-spider', cache: '_hangmanDuelsCache', reload: 'loadHangmanSection', topic: true },
    timed_math: { table: 'student_timed_math_duels', label: 'Contrarreloj', icon: 'fa-stopwatch', cache: '_timedMathDuelsCache', reload: 'loadTimedMathSection', topic: false },
    debug: { table: 'student_debug_duels', label: 'Encontrá el Error', icon: 'fa-bug', cache: '_debugDuelsCache', reload: 'loadDebugSection', topic: true },
    spelling: { table: 'student_spelling_duels', label: 'Ortografía', icon: 'fa-spell-check', cache: '_spellingDuelsCache', reload: 'loadSpellingSection', topic: true },
  },

  async createChallenge(game, { opponentId, wager, topic }) {
    const g = this.GAMES[game];
    const gems = window.userData?.gems ?? 0;
    const safeWager = Math.max(0, Math.min(wager ?? 10, gems));
    const row = { challenger_id: window.currentUser.id, opponent_id: opponentId, wager_gems: safeWager };
    // Sin tema elegido: el tema de la semana del docente; si no hay, un tema
    // de la clase; si tampoco, cultura general.
    if (g.topic) row.topic = topic || window.resolveDuelTopic?.(window._weeklyTopic ? '__weekly__' : '__class__') || 'Cultura general';
    if (game === 'quiz') row.question_count = window.computeDuelQuestionCount ? window.computeDuelQuestionCount(safeWager) : 5;

    const { data, error } = await window._supabase.from(g.table).insert(row).select('id').single();
    if (error) {
      window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
      return null;
    }
    if (typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(data.id, 'challenge', game);
    if (typeof window[g.reload] === 'function') window[g.reload]();
    return data.id;
  },

  // Revancha: mismo juego, mismo rival, misma apuesta (topeada a tus gemas).
  async rematch(game, duelId) {
    const g = this.GAMES[game];
    const d = (window[g.cache] || []).find(x => x.id === duelId);
    if (!d) return;
    const opponentId = d.challenger_id === window.currentUser.id ? d.opponent_id : d.challenger_id;
    const rival = d.challenger_id === window.currentUser.id ? d.opponent : d.challenger;
    const id = await this.createChallenge(game, { opponentId, wager: d.wager_gems, topic: d.topic });
    if (id) window.showToast(`<i class="fas fa-swords"></i> ¡Revancha enviada a ${(window.sanitizeInput || (v => v))(rival?.full_name || 'tu rival')}!`, 'success');
  },

  // Reto rápido: un toque -- compañero al azar, tema al azar, 10 gemas.
  async quickChallenge(game) {
    const u = window.userData;
    const { data: classmates } = await window._supabase.from('students')
      .select('id, full_name')
      .eq('school_code', u.school_code).eq('grade', u.grade).eq('section', u.section)
      .neq('id', window.currentUser.id);
    if (!classmates?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No hay compañeros en tu clase para retar', 'error');
    // Evita retar a alguien con quien ya tenés un reto pendiente de este juego.
    const busy = new Set((window[this.GAMES[game].cache] || []).filter(d => d.status === 'pending' || d.status === 'active')
      .map(d => (d.challenger_id === window.currentUser.id ? d.opponent_id : d.challenger_id)));
    const free = classmates.filter(c => !busy.has(c.id));
    // Primero alguien conectado: así el reto se juega ya y no queda esperando.
    const online = free.filter(c => this.isOnline(c.id));
    const pool = online.length ? online : (free.length ? free : classmates);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const id = await this.createChallenge(game, { opponentId: pick.id, wager: 10 });
    if (id) window.showToast(`<i class="fas fa-bolt"></i> ¡Retaste a ${(window.sanitizeInput || (v => v))(pick.full_name)} a ${this.GAMES[game].label}!`, 'success');
  },

  quickStripHtml() {
    this.ensureStyles();
    const s = window.sanitizeInput || ((v) => v);
    const weekly = window._weeklyTopic;
    return `<div class="ga-quick">
      <div class="ga-quick-title"><i class="fas fa-bolt"></i> Reto rápido${this.streakHtml(window._myDuelStreak || 0, '.8rem')} <span>${weekly
        ? `un toque: rival al azar, 10 💎 · 🎯 Tema de la semana: <b style="color:#fde68a">${s(weekly)}</b>`
        : 'un toque: rival y tema de tu clase al azar, 10 💎'} · ganar da +5 💎 aunque tengas 0 · <a href="javascript:void(0)" onclick="window.openGemsGuide && window.openGemsGuide()" style="color:#67e8f9;font-weight:900;text-decoration:underline">¿cómo gano gemas?</a></span></div>
      <div class="ga-quick-row">${Object.entries(this.GAMES).map(([key, g]) =>
        `<button class="ga-quick-btn" onclick="window.GameArena.quickChallenge('${key}')"><i class="fas ${g.icon}"></i><span>${g.label}</span></button>`).join('')}</div>
      <div class="ga-online" id="ga-online">${this.onlineHtml()}</div>
    </div>`;
  },

  // ---- Quién está conectado ahora (Realtime Presence: sin tablas ni SQL).
  // Un canal por clase; "conectado" = tiene la app abierta y visible.
  _presence: null,
  _classmateNames: {},

  syncPresence() {
    const u = window.userData;
    if (this._presence || window.userRole !== 'estudiante' || !u?.grade || window.isNodeSession || !window._supabase?.channel || !window.currentUser) return;
    const room = `online-${u.school_code}-${u.grade}-${u.section}`.normalize('NFD').replace(/[^\w-]/g, '_');
    const ch = window._supabase.channel(room, { config: { presence: { key: window.currentUser.id } } });
    this._presence = ch;
    window._onlineIds = new Set();
    ch.on('presence', { event: 'sync' }, () => {
      window._onlineIds = new Set(Object.keys(ch.presenceState()).filter(id => id !== window.currentUser?.id));
      this.refreshOnline();
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED' && !document.hidden) ch.track({ at: Date.now() });
    });
    document.addEventListener('visibilitychange', () => {
      if (!this._presence) return;
      if (document.hidden) this._presence.untrack();
      else this._presence.track({ at: Date.now() });
    });
    this.loadClassmateNames();
  },

  async loadClassmateNames() {
    const u = window.userData;
    const { data } = await window._supabase.from('students').select('id, full_name')
      .eq('school_code', u.school_code).eq('grade', u.grade).eq('section', u.section)
      .neq('id', window.currentUser.id);
    (data || []).forEach(c => { this._classmateNames[c.id] = c.full_name; });
    this.refreshOnline();
  },

  isOnline(id) {
    return !!window._onlineIds?.has(id);
  },

  onlineHtml() {
    const s = window.sanitizeInput || ((v) => v);
    const ids = [...(window._onlineIds || [])].filter(id => this._classmateNames[id]);
    if (!ids.length) return '<span class="ga-online-empty"><i class="fas fa-user-clock"></i> Ningún compañero conectado ahora -- igual podés retar: le llega cuando entre.</span>';
    return `<span class="ga-online-label"><span class="ga-dot"></span> ${ids.length} conectado${ids.length > 1 ? 's' : ''} · tocá para retar</span>`
      + ids.map(id => `<button class="ga-online-chip" onclick="window.GameArena.openChallengeFor('${id}')"><span class="ga-dot"></span>${s(this._classmateNames[id])}</button>`).join('');
  },

  // Refresca la barra y los selectores de rival que estén abiertos.
  refreshOnline() {
    const box = document.getElementById('ga-online');
    if (box) box.innerHTML = this.onlineHtml();
    document.querySelectorAll('select[data-ga-opponents] option').forEach(o => {
      o.textContent = (this.isOnline(o.value) ? '🟢 ' : '') + o.dataset.name;
    });
  },

  // <option>s de rival: conectados primero y con 🟢.
  opponentOptionsHtml(classmates) {
    const s = window.sanitizeInput || ((v) => v);
    classmates.forEach(c => { this._classmateNames[c.id] = c.full_name; });
    const sorted = [...classmates].sort((a, b) => this.isOnline(b.id) - this.isOnline(a.id));
    return sorted.map(c => `<option value="${c.id}" data-name="${s(c.full_name)}">${this.isOnline(c.id) ? '🟢 ' : ''}${s(c.full_name)}</option>`).join('');
  },

  // Tocar a un compañero conectado: elegís el juego y sale el reto (10 💎).
  openChallengeFor(id) {
    const s = window.sanitizeInput || ((v) => v);
    const name = this._classmateNames[id] || 'tu compañero';
    document.getElementById('ga-challenge-for')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ga-challenge-for';
    modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-md p-6 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
        <h2 class="text-lg font-bold text-white mb-1"><i class="fas fa-swords text-rose-500 mr-2"></i> Retar a ${s(name)}</h2>
        <p class="text-xs text-slate-400 mb-4">${this.isOnline(id) ? '🟢 Está conectado ahora' : 'Le llega cuando entre'} · apuesta 10 💎</p>
        <div class="ga-quick-row">${Object.entries(this.GAMES).map(([key, g]) =>
          `<button class="ga-quick-btn" data-game="${key}"><i class="fas ${g.icon}"></i><span>${g.label}</span></button>`).join('')}</div>
        <button class="w-full mt-4 py-2 text-xs font-bold text-slate-400" data-close>Cancelar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.querySelectorAll('[data-game]').forEach(btn => btn.onclick = async () => {
      modal.remove();
      const game = btn.dataset.game;
      const ok = await this.createChallenge(game, { opponentId: id, wager: 10 });
      if (ok) window.showToast(`<i class="fas fa-bolt"></i> ¡Retaste a ${s(name)} a ${this.GAMES[game].label}!`, 'success');
    });
  },

  // Historial cara a cara contra cada rival (sumando los 5 juegos).
  async loadRivalries() {
    const { data } = await window._supabase.rpc('get_my_rivalries');
    window._rivalries = data || {};
    return window._rivalries;
  },

  recordFor(rivalId) {
    const r = window._rivalries?.[rivalId];
    return r ? { w: r.w, l: r.l, t: r.t } : null;
  },

  recordChipHtml(duel) {
    const rivalId = duel.challenger_id === window.currentUser.id ? duel.opponent_id : duel.challenger_id;
    const r = this.recordFor(rivalId);
    if (!r || (r.w + r.l + r.t) === 0) return '';
    const color = r.w > r.l ? '#4ade80' : r.w < r.l ? '#fb7185' : '#cbd5e1';
    return `<span style="display:inline-block;margin-left:.35rem;padding:.05rem .45rem;border-radius:9999px;background:rgba(255,255,255,.08);color:${color};font-size:.6rem;font-weight:900">${r.w}-${r.l}${r.t ? `-${r.t}` : ''}</span>`;
  },

  // Arriba (a la vista): pendientes, en curso y los terminados en las
  // últimas 24h -- así se ve el resultado y la revancha sin abrir el historial.
  isOnTop(d) {
    if (d.status === 'pending' || d.status === 'active') return true;
    return d.status === 'completed' && d.resolved_at && (Date.now() - new Date(d.resolved_at).getTime()) < 86400000;
  },

  rematchBtnHtml(game, duel) {
    return `<button class="h-8 px-3 rounded-lg text-white text-[0.6rem] font-black uppercase mr-2" style="background:linear-gradient(135deg,#f97316,#dc2626)" onclick="window.GameArena.rematch('${game}', '${duel.id}')"><i class="fas fa-rotate-right"></i> Revancha</button>`;
  },

  // Lo llama cada juego al terminar: si con esa jugada se cerró el duelo,
  // notify-duel avisa a los dos (una sola vez); si no, no hace nada.
  notifyResult(game, duelId) {
    if (typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(duelId, 'result', game);
    window.refreshMyWalletSoon?.();
  },

  // Columnas de students para el join de challenger/opponent en cada juego.
  STUDENT_JOIN: 'full_name, profile_photo_url, companion_species, gems_earned_total, companion_equipped, duel_win_streak',

  // "🔥 N" si viene ganando 2 o más duelos seguidos.
  streakHtml(n, size = '.75rem') {
    return n >= 2 ? `<span style="display:inline-block;margin-left:.3rem;padding:.05rem .45rem;border-radius:9999px;background:rgba(249,115,22,.18);color:#fdba74;font-size:${size};font-weight:900">🔥${n}</span>` : '';
  },

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
    const rivalId = duel?.challenger_id === window.currentUser.id ? duel?.opponent_id : duel?.challenger_id;
    if (!window._rivalries) await this.loadRivalries().catch(() => {});
    return {
      me: { name: window.userData?.full_name, photo: window.userData?.profile_photo_url, companion: myCompanion, streak: window._myDuelStreak || 0 },
      rival: { name: rival?.full_name, photo: rival?.profile_photo_url, companion: rivalCompanion, streak: rival?.duel_win_streak || 0 },
      wager: duel?.wager_gems || 0,
      record: this.recordFor(rivalId),
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
  async versus({ title, me, rival, wager, record }) {
    this.ensureStyles();
    const s = window.sanitizeInput || ((v) => v);
    const overlay = document.createElement('div');
    overlay.className = 'ga-overlay';
    overlay.innerHTML = `
      <div class="ga-panel">
        <div class="ga-title">${s(title)}</div>
        <div class="ga-vs">
          <div class="ga-player left">${this.fighterHtml(me)}<div class="ga-name">${s(me.name || 'Vos')}</div>${this.streakHtml(me.streak)}</div>
          <div class="ga-vs-badge">VS</div>
          <div class="ga-player right">${this.fighterHtml(rival)}<div class="ga-name">${s(rival.name || 'Rival')}</div>${this.streakHtml(rival.streak)}</div>
        </div>
        ${wager > 0 ? `<div class="ga-wager"><i class="fas fa-gem"></i> ${wager} gemas en juego</div>` : ''}
        ${record && (record.w + record.l + record.t) > 0
          ? `<div class="ga-record">Historial: Vos <b style="color:#4ade80">${record.w}</b> - <b style="color:#fb7185">${record.l}</b> ${s(rival.name?.split(' ')[0] || 'Rival')}${record.t ? ` · ${record.t} empate(s)` : ''}</div>`
          : `<div class="ga-record">Primer duelo entre ustedes</div>`}
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

  // "¿Sabías que?" del duelo: lo generó la IA con el contenido y el
  // servidor solo lo entrega si ya jugaste. Contrarreloj no usa IA: trucos
  // de cálculo mental fijos.
  MATH_TIPS: [
    'Para multiplicar por 5, multiplicá por 10 y dividí entre 2: 5 × 48 = 480 ÷ 2 = 240.',
    'Para multiplicar por 9, multiplicá por 10 y restá el número: 9 × 7 = 70 − 7 = 63.',
    'Para multiplicar por 11 un número de dos cifras, sumá sus cifras y ponelas en el medio: 11 × 36 = 3(3+6)6 = 396.',
    'Un número es divisible entre 3 si la suma de sus cifras lo es: 471 → 4+7+1 = 12 → sí.',
    'Para sumar 99, sumá 100 y restá 1: 245 + 99 = 345 − 1 = 344.',
    'El cuadrado de un número que termina en 5: multiplicá la decena por la siguiente y agregá 25. 35² = 3×4 = 12 → 1225.',
    'Restar es sumar hacia arriba: 1000 − 387 → de 387 a 400 son 13, de 400 a 1000 son 600 → 613.',
    'Multiplicar por 4 es duplicar dos veces: 4 × 23 = 46 → 92.',
    'Los mayas usaban base 20 y fueron de los primeros en usar el cero.',
    'Dividir entre 5 es multiplicar por 2 y dividir entre 10: 135 ÷ 5 = 270 ÷ 10 = 27.',
  ],

  async factFor(game, duelId) {
    if (game === 'timed_math') return this.MATH_TIPS[Math.floor(Math.random() * this.MATH_TIPS.length)];
    try {
      const { data } = await window._supabase.rpc('get_duel_fact', { p_game: game, p_duel_id: duelId });
      return data || null;
    } catch {
      return null;
    }
  },

  async resultWithFact(game, duelId, opts) {
    return this.result({ ...opts, fact: await this.factFor(game, duelId) });
  },

  // Pantalla de resultado con la mascota. Se resuelve al tocar "Continuar".
  result({ ok, title, subtitle, detailHtml = '', fact = null }) {
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
          ${fact ? `<div style="margin-top:1.1rem;text-align:left;padding:.8rem .9rem;border-radius:1rem;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.3)">
            <div style="font-size:.62rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#facc15;margin-bottom:.3rem">💡 ¿Sabías que?</div>
            <div style="font-size:.82rem;line-height:1.45;color:#e2e8f0">${s(fact)}</div>
          </div>` : ''}
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
