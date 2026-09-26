/**
 * PASE DE TEMPORADA -- gratis, estilo Clash Royale. Una temporada por mes;
 * el XP ganado en el mes sube de nivel (30 niveles) y cada nivel tiene un
 * premio que se reclama a mano. Premios y niveles los define el servidor
 * (get_season_pass / claim_season_reward, migrations/season-pass.sql).
 */

const SP_STYLES = `
.sp-head{display:flex;align-items:center;gap:1rem;margin:.5rem 0 1rem;text-align:left}
.sp-level{width:4.5rem;height:4.5rem;border-radius:1.25rem;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#f59e0b,#ef4444);box-shadow:0 6px 0 #b45309,0 10px 25px rgba(245,158,11,.4);font-weight:900}
.sp-level b{font-size:1.9rem;line-height:1}.sp-level span{font-size:.55rem;letter-spacing:.15em;text-transform:uppercase}
.sp-bar{height:.8rem;border-radius:9999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:.4rem}
.sp-bar div{height:100%;border-radius:9999px;background:linear-gradient(90deg,#facc15,#f97316);transition:width .6s}
.sp-track{display:flex;gap:.6rem;overflow-x:auto;padding:1rem .25rem 1.25rem;scroll-snap-type:x proximity}
.sp-node{flex:0 0 6.2rem;scroll-snap-align:center;border-radius:1rem;padding:.5rem .4rem .6rem;display:flex;flex-direction:column;align-items:center;gap:.35rem;
  background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.08);position:relative}
.sp-node.milestone{border-color:rgba(250,204,21,.5);background:rgba(250,204,21,.07)}
.sp-node.ready{border-color:#4ade80;animation:sp-glow 1.4s ease-in-out infinite}
.sp-node.claimed{opacity:.5}
.sp-node.locked .sp-art{filter:grayscale(1) opacity(.45)}
@keyframes sp-glow{0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.5)}50%{box-shadow:0 0 18px 2px rgba(74,222,128,.55)}}
.sp-lv{font-size:.6rem;font-weight:900;letter-spacing:.1em;color:#94a3b8;text-transform:uppercase}
.sp-art{width:4rem;height:4rem;display:flex;align-items:center;justify-content:center;font-size:1.9rem}
.sp-amt{font-size:.8rem;font-weight:900;color:#67e8f9}
.sp-btn{width:100%;border:0;border-radius:.6rem;padding:.35rem .2rem;font-size:.6rem;font-weight:900;text-transform:uppercase;cursor:pointer;background:#22c55e;color:#fff}
.sp-tag{font-size:.6rem;font-weight:800;color:#64748b}
`;

function spEnsureStyles() {
  window.GameArena?.ensureStyles();
  if (typeof window.ensureCompanionStyles === 'function') window.ensureCompanionStyles();
  if (document.getElementById('season-pass-styles')) return;
  const st = document.createElement('style');
  st.id = 'season-pass-styles';
  st.textContent = SP_STYLES;
  document.head.appendChild(st);
}

function spMonthName(seasonId) {
  const [y, m] = seasonId.split('-').map(Number);
  const name = new Date(y, m - 1, 15).toLocaleDateString('es-GT', { month: 'long' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function spDaysLeft(endsAt) {
  const ms = new Date(endsAt) - new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guatemala' }));
  return Math.max(0, Math.ceil(ms / 86400000));
}

async function spFetch() {
  const { data, error } = await window._supabase.rpc('get_season_pass');
  if (error) throw error;
  const claimed = new Set(data.claimed || []);
  const claimable = data.rewards.filter(r => r.level <= data.level && !claimed.has(r.level)).length;
  return { ...data, claimedSet: claimed, claimable };
}

// Tarjeta grande en el Centro de Juego.
window.renderSeasonHero = async function renderSeasonHero(containerId = 'season-pass-hero') {
  const el = document.getElementById(containerId);
  if (!el || window.userRole !== 'estudiante' || !window.GameArena) return;
  try {
    const p = await spFetch();
    el.innerHTML = window.GameArena.heroHtml({
      title: `Pase · ${spMonthName(p.season_id)}`,
      subtitle: `Nivel ${p.level}/${p.max_level} · quedan ${spDaysLeft(p.ends_at)} días. Premios gratis y accesorios exclusivos.`,
      icon: 'fa-ticket',
      c1: '#f59e0b',
      c2: '#ef4444',
      onclick: 'window.openSeasonPass()',
      cta: p.claimable > 0 ? `<i class="fas fa-gift"></i> ${p.claimable} premio(s) para reclamar` : '<i class="fas fa-ticket"></i> Ver pase',
    });
  } catch (err) {
    console.error('Pase de temporada:', err);
  }
};

window.openSeasonPass = async function openSeasonPass() {
  spEnsureStyles();
  if (typeof window.loadMyCompanion === 'function' && window._myCompanionSpecies === undefined) await window.loadMyCompanion();
  let pass;
  try {
    pass = await spFetch();
  } catch (err) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
  const itemIds = pass.rewards.filter(r => r.type === 'cosmetic').map(r => r.item);
  const { data: items } = await window._supabase.from('cosmetic_items').select('id, slot, name').in('id', itemIds);
  window._seasonPass = { ...pass, items: Object.fromEntries((items || []).map(i => [i.id, i])) };

  document.getElementById('season-pass-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'season-pass-overlay';
  overlay.className = 'ga-overlay';
  overlay.innerHTML = '<div class="ga-panel" style="max-width:44rem"><div class="ga-card" id="season-pass-card"></div></div>';
  document.body.appendChild(overlay);
  window.renderSeasonPass(true);
};

window.renderSeasonPass = function renderSeasonPass(scrollToCurrent = false) {
  const card = document.getElementById('season-pass-card');
  const p = window._seasonPass;
  if (!card || !p) return;
  const s = window.sanitizeInput || ((v) => v);
  const species = window._myCompanionSpecies;
  const stage = Math.max(window._myCompanionStageIndex || 0, 1);
  const into = p.xp - p.level * p.xp_per_level;
  const pct = p.level >= p.max_level ? 100 : Math.round((into / p.xp_per_level) * 100);

  const nodes = p.rewards.map(r => {
    const reached = r.level <= p.level;
    const claimed = p.claimedSet.has(r.level);
    const state = claimed ? 'claimed' : reached ? 'ready' : 'locked';
    let art = '💎', label = `${r.amount}`;
    if (r.type === 'cosmetic') {
      const item = p.items[r.item];
      art = species && item
        ? window.renderCompanionSvg(stage, '', species, { ...(window._myCompanionEquipped || {}), [item.slot]: r.item })
        : '🎁';
      label = item ? s(item.name) : 'Accesorio';
    }
    const action = claimed
      ? '<span class="sp-tag"><i class="fas fa-check"></i> Listo</span>'
      : reached
        ? `<button class="sp-btn" onclick="window.claimSeasonReward(${r.level})">Reclamar</button>`
        : '<span class="sp-tag"><i class="fas fa-lock"></i></span>';
    return `<div class="sp-node ${state} ${r.type === 'cosmetic' ? 'milestone' : ''}" data-level="${r.level}">
      <span class="sp-lv">Nv ${r.level}</span>
      <div class="sp-art" style="pointer-events:none">${art}</div>
      <span class="sp-amt" style="${r.type === 'cosmetic' ? 'color:#fde68a;font-size:.62rem;text-align:center;line-height:1.1' : ''}">${label}</span>
      ${action}
    </div>`;
  }).join('');

  card.innerHTML = `
    <div class="ga-topbar">
      <span class="ga-chip"><i class="fas fa-ticket"></i> Pase de Temporada</span>
      <span class="ga-chip" style="color:#fda4af"><i class="fas fa-hourglass-half"></i> ${spDaysLeft(p.ends_at)} días</span>
    </div>
    <div class="sp-head">
      <div class="sp-level"><span>Nivel</span><b>${p.level}</b></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:900;font-size:1.15rem;font-style:italic;text-transform:uppercase">Temporada ${spMonthName(p.season_id)}</div>
        <div class="sp-bar"><div style="width:${pct}%"></div></div>
        <div style="font-size:.7rem;color:#94a3b8;margin-top:.3rem;font-weight:700">
          ${p.level >= p.max_level ? '¡Pase completo!' : `${into} / ${p.xp_per_level} XP para el nivel ${p.level + 1}`}
        </div>
      </div>
    </div>
    ${p.claimable > 0 ? `<button class="ga-btn" onclick="window.claimAllSeasonRewards()"><i class="fas fa-gift"></i> Reclamar todo (${p.claimable})</button>` : ''}
    <div class="sp-track" id="sp-track">${nodes}</div>
    <p style="font-size:.72rem;color:#94a3b8;margin-bottom:1rem"><i class="fas fa-circle-info"></i> Todo el XP que ganes este mes (cursos, retos, duelos, cofre diario) suma al pase. Se reinicia el 1 de cada mes.</p>
    <button class="ga-btn" style="background:linear-gradient(135deg,#475569,#334155);box-shadow:0 6px 0 #1e293b" onclick="document.getElementById('season-pass-overlay').remove(); window.renderSeasonHero?.()">Cerrar</button>`;

  if (scrollToCurrent) {
    const target = card.querySelector(`.sp-node[data-level="${Math.max(1, Math.min(p.max_level, p.level))}"]`);
    target?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
};

async function spClaim(level) {
  const { data, error } = await window._supabase.rpc('claim_season_reward', { p_level: level });
  if (error) throw error;
  const p = window._seasonPass;
  p.claimedSet.add(level);
  p.claimable = Math.max(0, p.claimable - 1);
  if (data.gems_granted && window.userData) window.userData.gems = (window.userData.gems || 0) + data.gems_granted;
  return data;
}

window.claimSeasonReward = async function claimSeasonReward(level) {
  try {
    const data = await spClaim(level);
    if (typeof window.confetti === 'function') window.confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, zIndex: 260 });
    if (data.type === 'cosmetic' && !data.gems_granted) {
      window.showToast('<i class="fas fa-shirt"></i> ¡Accesorio exclusivo desbloqueado! Ponelo en el Vestidor', 'success');
    } else {
      window.showToast(`<i class="fas fa-gem"></i> +${data.gems_granted} gemas`, 'success');
    }
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
  window.renderSeasonPass();
};

window.claimAllSeasonRewards = async function claimAllSeasonRewards() {
  const p = window._seasonPass;
  const levels = p.rewards.filter(r => r.level <= p.level && !p.claimedSet.has(r.level)).map(r => r.level);
  let gems = 0, items = 0;
  for (const level of levels) {
    try {
      const data = await spClaim(level);
      gems += data.gems_granted || 0;
      if (data.type === 'cosmetic' && !data.gems_granted) items++;
    } catch (err) {
      console.error('Reclamo de pase:', err);
    }
  }
  if (typeof window.confetti === 'function') window.confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 }, zIndex: 260 });
  window.showToast(`<i class="fas fa-gift"></i> +${gems} gemas${items ? ` y ${items} accesorio(s) nuevo(s)` : ''}`, 'success');
  window.renderSeasonPass();
};
