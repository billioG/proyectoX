/**
 * LIGAS SEMANALES -- estilo Duolingo. Se compite por XP de la semana
 * contra los de tu escuela en tu división (get_my_league,
 * migrations/weekly-leagues.sql). Top 3 suben, últimos 3 bajan.
 */

const LEAGUE_TIERS = [
  { name: 'Bronce', color: '#d97706', icon: '🥉' },
  { name: 'Plata', color: '#94a3b8', icon: '🥈' },
  { name: 'Oro', color: '#eab308', icon: '🥇' },
  { name: 'Diamante', color: '#22d3ee', icon: '💎' },
  { name: 'Jade', color: '#10b981', icon: '🗿' },
];
window.LEAGUE_TIERS = LEAGUE_TIERS;

const LG_STYLES = `
.lg-head{display:flex;align-items:center;gap:1rem;padding:1.25rem;border-radius:1.5rem;margin-bottom:1rem;color:#fff;
  background:linear-gradient(135deg,var(--lg-c),#0f172a 120%);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.lg-badge{width:4.5rem;height:4.5rem;flex-shrink:0;border-radius:1.25rem;display:flex;align-items:center;justify-content:center;font-size:2.4rem;
  background:rgba(255,255,255,.15);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}
.lg-row{display:flex;align-items:center;gap:.75rem;padding:.55rem .75rem;border-radius:1rem;background:rgba(255,255,255,.04);margin-bottom:.35rem;color:#e2e8f0}
.lg-row.me{background:rgba(99,102,241,.2);box-shadow:inset 0 0 0 2px #818cf8}
.lg-rank{width:1.6rem;text-align:center;font-weight:900;font-size:.85rem;color:#94a3b8}
.lg-pet{width:2.6rem;height:2.6rem;flex-shrink:0}
.lg-name{flex:1;min-width:0;font-weight:800;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lg-xp{font-weight:900;font-size:.8rem;color:#facc15;font-family:ui-monospace,monospace}
.lg-zone{font-size:.6rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:.4rem .75rem;margin:.5rem 0 .4rem;border-radius:9999px;display:inline-flex;gap:.4rem;align-items:center}
.lg-zone.up{background:rgba(74,222,128,.12);color:#4ade80}
.lg-zone.down{background:rgba(244,63,94,.12);color:#fb7185}
`;

function lgEnsureStyles() {
  window.GameArena?.ensureStyles();
  if (document.getElementById('league-styles')) return;
  const st = document.createElement('style');
  st.id = 'league-styles';
  st.textContent = LG_STYLES;
  document.head.appendChild(st);
  window.ensureCompanionStyles?.();
}

function lgTimeLeft(endsAt) {
  const ms = new Date(endsAt) - new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guatemala' }));
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${Math.max(0, h)}h`;
}

function lgPet(row) {
  if (row.companion_species && typeof window.renderCompanionSvg === 'function' && typeof window.getCompanionStage === 'function') {
    const stage = window.getCompanionStage(row.gems_earned_total, row.companion_species).stageIndex;
    return `<div class="lg-pet">${window.renderCompanionSvg(stage, '', row.companion_species, row.companion_equipped || {})}</div>`;
  }
  return window.GameArena ? window.GameArena.avatarHtml(row.full_name, row.profile_photo_url, 'ga-mini-avatar') : '';
}

window.renderLeagueSection = async function renderLeagueSection(containerId = 'league-section') {
  const el = document.getElementById(containerId);
  if (!el) return;
  lgEnsureStyles();
  const { data: lg, error } = await window._supabase.rpc('get_my_league');
  if (error) {
    el.innerHTML = `<p class="text-slate-500 text-xs">No se pudo cargar la liga.</p>`;
    return console.error('Liga:', error);
  }
  const tier = LEAGUE_TIERS[lg.tier] || LEAGUE_TIERS[0];
  const next = LEAGUE_TIERS[lg.tier + 1];
  const s = window.sanitizeInput || ((v) => v);
  const me = window.currentUser?.id;
  const board = lg.board || [];
  const size = board.length;
  const canPromote = size >= 3 && lg.tier < 4;
  const canDemote = lg.tier > 0 && size >= 6;

  const rows = board.map((r, i) => {
    const rank = i + 1;
    let zone = '';
    if (canPromote && rank === 1) zone = `<div class="lg-zone up"><i class="fas fa-arrow-up"></i> Zona de ascenso${next ? ` a ${next.name}` : ''}</div>`;
    if (canDemote && rank === size - 2) zone = `<div class="lg-zone down"><i class="fas fa-arrow-down"></i> Zona de descenso</div>`;
    if (canPromote && rank === 4) zone = `<div style="height:.5rem"></div>`;
    return `${zone}<div class="lg-row ${r.id === me ? 'me' : ''}">
      <span class="lg-rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>
      ${lgPet(r)}
      <span class="lg-name">${s(r.full_name)}${r.id === me ? ' (vos)' : ''}${window.GameArena ? window.GameArena.streakHtml(r.duel_win_streak || 0, '.65rem') : ''}</span>
      <span class="lg-xp">${r.xp} XP</span>
    </div>`;
  }).join('');

  const notInBoard = !board.some(r => r.id === me);
  el.innerHTML = `
    <div class="lg-head" style="--lg-c:${tier.color}">
      <div class="lg-badge">${tier.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.6rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;opacity:.8">Liga semanal</div>
        <div style="font-size:1.6rem;font-weight:900;font-style:italic;text-transform:uppercase">División ${tier.name}</div>
        <div style="font-size:.75rem;font-weight:700;opacity:.85"><i class="fas fa-hourglass-half"></i> Termina en ${lgTimeLeft(lg.ends_at)} · Tu XP: ${lg.my_xp}</div>
      </div>
    </div>
    ${notInBoard ? `<p style="color:#94a3b8;font-size:.8rem;margin-bottom:.75rem"><i class="fas fa-circle-info"></i> Ganá XP esta semana (cursos, retos, duelos) para entrar a la tabla.</p>` : ''}
    <div>${rows || '<p style="color:#64748b;font-size:.8rem">Nadie sumó XP esta semana todavía. ¡Sé el primero!</p>'}</div>
    <p style="color:#64748b;font-size:.7rem;margin-top:.75rem">Competís contra tu escuela en tu misma división. Los 3 primeros suben; los 3 últimos bajan (si hay 6 o más).</p>`;

  if (lg.result === 'up' || lg.result === 'down') window.showLeagueResult(lg.result, lg.tier);
};

window.showLeagueResult = function showLeagueResult(result, tierIndex) {
  const tier = LEAGUE_TIERS[tierIndex];
  if (!tier || !window.GameArena) return;
  const up = result === 'up';
  window.GameArena.result({
    ok: up,
    title: up ? '¡Ascendiste!' : 'Bajaste de división',
    subtitle: up ? `Terminaste en el top 3 la semana pasada.` : 'Esta semana podés recuperarte.',
    detailHtml: `<div style="font-size:3.5rem;margin:.25rem 0">${tier.icon}</div>
      <div style="font-size:1.3rem;font-weight:900;font-style:italic;text-transform:uppercase;color:${tier.color}">División ${tier.name}</div>`,
  });
};
