/**
 * TORNEOS ENTRE ESTABLECIMIENTOS -- temporada tipo liga. Equipos nuevos
 * (no los grupos de proyecto), un capitán responde en nombre del equipo
 * un quiz grupal generado por IA contra un equipo de OTRO
 * establecimiento. Solo el admin arma la temporada; los capitanes se
 * retan libremente durante la ventana de la temporada.
 */

window._tournamentSeason = null;
window._tournamentMyTeam = null;

window.loadTournamentsSection = async function loadTournamentsSection() {
  const container = document.getElementById('tournaments-section');
  if (!container || window.userRole !== 'estudiante') {
    if (container) container.innerHTML = '<p class="text-slate-500 text-xs text-center py-6">Disponible para estudiantes.</p>';
    return;
  }
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const { data: seasons } = await _supabase.from('tournament_seasons')
    .select('*').eq('status', 'active').order('starts_at', { ascending: false }).limit(1);

  const season = seasons?.[0];
  window._tournamentSeason = season || null;

  if (!season) {
    container.innerHTML = '<div class="text-center text-slate-500 text-xs py-8"><i class="fas fa-circle-info mr-1"></i> No hay ninguna temporada activa por ahora.</div>';
    return;
  }

  const { data: myMembership } = await _supabase.from('tournament_team_members')
    .select('team_id, tournament_teams(id, name, captain_id)').eq('season_id', season.id).eq('student_id', currentUser.id).maybeSingle();

  window._tournamentMyTeam = myMembership?.tournament_teams || null;

  if (!window._tournamentMyTeam) {
    container.innerHTML = `
      <div class="glass-card p-6 text-center border-dashed border-2 border-white/10 bg-transparent mb-4">
        <h4 class="text-sm font-black text-white uppercase mb-1">${window.sanitizeInput(season.name)}</h4>
        <p class="text-[0.65rem] text-slate-500 mb-4">Todavía no estás en ningún equipo de esta temporada.</p>
        <button class="btn-primary-tw h-10 px-6 text-xs uppercase font-black" onclick="window.openCreateTournamentTeamModal()"><i class="fas fa-plus"></i> Crear Equipo</button>
      </div>
      <div id="tournament-standings"></div>
    `;
    window.renderTournamentStandings(season.id);
    return;
  }

  container.innerHTML = `
    <div class="glass-card p-6 mb-4 bg-emerald-500/5 border border-emerald-500/20">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-black text-white uppercase">${window.sanitizeInput(window._tournamentMyTeam.name)}</h4>
        ${window._tournamentMyTeam.captain_id === currentUser.id ? '<span class="text-[0.55rem] font-black uppercase text-amber-400"><i class="fas fa-star"></i> Capitán</span>' : ''}
      </div>
      <p class="text-[0.65rem] text-slate-500">${window.sanitizeInput(season.name)}</p>
      ${window._tournamentMyTeam.captain_id === currentUser.id ? `
        <div class="flex gap-2 mt-4">
          <button class="btn-secondary-tw h-9 px-4 text-[0.6rem] uppercase font-bold flex-1" onclick="window.openManageTeamModal()"><i class="fas fa-users"></i> Mi Equipo</button>
          <button class="btn-primary-tw h-9 px-4 text-[0.6rem] uppercase font-bold flex-1" onclick="window.openChallengeTeamModal()"><i class="fas fa-swords"></i> Retar</button>
        </div>
      ` : ''}
    </div>
    <div id="tournament-matches" class="space-y-2 mb-4"></div>
    <div id="tournament-standings"></div>
  `;

  window.renderTournamentMatches();
  window.renderTournamentStandings(season.id);
}

window.renderTournamentMatches = async function renderTournamentMatches() {
  const el = document.getElementById('tournament-matches');
  if (!el || !window._tournamentMyTeam) return;
  const _supabase = window._supabase;
  const teamId = window._tournamentMyTeam.id;

  const { data: matches } = await _supabase.from('tournament_matches')
    .select('id, status, topic, team_a_id, team_b_id, challenger_team_id, team_a_score, team_b_score, winner_team_id, created_at')
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order('created_at', { ascending: false }).limit(15);

  if (!matches?.length) { el.innerHTML = ''; return; }

  const otherTeamIds = [...new Set(matches.flatMap(m => [m.team_a_id, m.team_b_id]).filter(id => id !== teamId))];
  const { data: otherTeams } = otherTeamIds.length
    ? await _supabase.from('tournament_teams').select('id, name, school_code, schools(name)').in('id', otherTeamIds)
    : { data: [] };
  const teamMap = new Map((otherTeams || []).map(t => [t.id, t]));

  const isCaptain = window._tournamentMyTeam.captain_id === window.currentUser.id;
  const sanitizeInput = window.sanitizeInput;

  el.innerHTML = matches.map(m => {
    const opponentId = m.team_a_id === teamId ? m.team_b_id : m.team_a_id;
    const opponent = teamMap.get(opponentId);
    const opponentName = opponent ? `${sanitizeInput(opponent.name)} (${sanitizeInput(opponent.schools?.name || opponent.school_code)})` : 'Rival';
    let statusHtml = '', actionHtml = '';

    if (m.status === 'pending' && m.challenger_team_id !== teamId && isCaptain) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-amber-400">Te retaron</span>`;
      actionHtml = `
        <button class="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[0.6rem] font-black uppercase mr-2" onclick="window.respondTournamentMatch('${m.id}', true)">Aceptar</button>
        <button class="h-8 px-3 rounded-lg bg-rose-500 text-white text-[0.6rem] font-black uppercase" onclick="window.respondTournamentMatch('${m.id}', false)">Rechazar</button>
      `;
    } else if (m.status === 'pending' && m.challenger_team_id === teamId) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-400">Esperando respuesta...</span>`;
      if (isCaptain) actionHtml = `<button class="h-8 px-3 rounded-lg bg-slate-700 text-white text-[0.6rem] font-black uppercase" onclick="window.cancelTournamentMatch('${m.id}')">Cancelar</button>`;
    } else if (m.status === 'rejected') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
    } else if (m.status === 'cancelled') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Cancelado</span>`;
    } else if (m.status === 'active') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-primary">En curso</span>`;
      if (isCaptain) actionHtml = `<button class="h-8 px-4 rounded-lg bg-primary text-white text-[0.6rem] font-black uppercase" onclick="window.openTournamentMatchQuiz('${m.id}')">Jugar</button>`;
    } else if (m.status === 'completed') {
      const tie = !m.winner_team_id;
      const won = m.winner_team_id === teamId;
      statusHtml = tie
        ? `<span class="text-[0.6rem] font-black uppercase text-slate-400">Empate ${m.team_a_score}-${m.team_b_score}</span>`
        : won
          ? `<span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-trophy"></i> Ganaron ${m.team_a_id === teamId ? m.team_a_score : m.team_b_score}-${m.team_a_id === teamId ? m.team_b_score : m.team_a_score}</span>`
          : `<span class="text-[0.6rem] font-black uppercase text-rose-400">Perdieron ${m.team_a_id === teamId ? m.team_a_score : m.team_b_score}-${m.team_a_id === teamId ? m.team_b_score : m.team_a_score}</span>`;
    }

    return `
      <div class="glass-card p-4 flex items-center justify-between gap-3 bg-white/5 border-white/5">
        <div class="min-w-0">
          <div class="text-xs font-bold text-white truncate">vs ${opponentName}</div>
          <div class="text-[0.6rem] text-slate-500 truncate">${sanitizeInput(m.topic)}</div>
          ${statusHtml}
        </div>
        <div class="shrink-0 flex items-center">${actionHtml}</div>
      </div>
    `;
  }).join('');
}

window.renderTournamentStandings = async function renderTournamentStandings(seasonId) {
  const el = document.getElementById('tournament-standings');
  if (!el) return;
  const _supabase = window._supabase;
  const season = window._tournamentSeason?.id === seasonId
    ? window._tournamentSeason
    : (await _supabase.from('tournament_seasons').select('*').eq('id', seasonId).single()).data;
  if (!season) { el.innerHTML = ''; return; }

  const { data: teams } = await _supabase.from('tournament_teams').select('id, name, school_code, schools(name)').eq('season_id', seasonId);
  if (!teams?.length) { el.innerHTML = '<p class="text-slate-400 text-xs text-center py-6">Todavía no hay equipos inscritos en esta temporada.</p>'; return; }

  const { data: matches } = await _supabase.from('tournament_matches')
    .select('team_a_id, team_b_id, team_a_score, team_b_score, winner_team_id, status').eq('season_id', seasonId).eq('status', 'completed');

  const stats = new Map(teams.map(t => [t.id, { team: t, points: 0, played: 0, wins: 0, ties: 0, losses: 0 }]));
  (matches || []).forEach(m => {
    const a = stats.get(m.team_a_id), b = stats.get(m.team_b_id);
    if (!a || !b) return;
    a.played++; b.played++;
    if (!m.winner_team_id) {
      a.ties++; b.ties++;
      a.points += season.points_tie; b.points += season.points_tie;
    } else if (m.winner_team_id === m.team_a_id) {
      a.wins++; b.losses++;
      a.points += season.points_win; b.points += season.points_loss;
    } else {
      b.wins++; a.losses++;
      b.points += season.points_win; a.points += season.points_loss;
    }
  });

  const ranked = [...stats.values()].sort((a, b) => b.points - a.points);
  const sanitizeInput = window.sanitizeInput;

  el.innerHTML = `
    <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-3">Tabla de Posiciones</p>
    <div class="glass-card p-0 overflow-hidden bg-white/5 border-white/5">
      <table class="w-full text-left text-xs">
        <thead><tr class="text-[0.55rem] uppercase text-slate-500 border-b border-white/10">
          <th class="p-3">Equipo</th><th class="p-3 text-center">PJ</th><th class="p-3 text-center">G</th><th class="p-3 text-center">E</th><th class="p-3 text-center">P</th><th class="p-3 text-center">Pts</th>
        </tr></thead>
        <tbody>
          ${ranked.map(r => `
            <tr class="border-b border-white/5">
              <td class="p-3 text-white font-bold truncate max-w-[140px]">${sanitizeInput(r.team.name)} <span class="text-slate-500 font-normal">(${sanitizeInput(r.team.schools?.name || r.team.school_code)})</span></td>
              <td class="p-3 text-center text-slate-400">${r.played}</td>
              <td class="p-3 text-center text-emerald-400">${r.wins}</td>
              <td class="p-3 text-center text-slate-400">${r.ties}</td>
              <td class="p-3 text-center text-rose-400">${r.losses}</td>
              <td class="p-3 text-center text-white font-black">${r.points}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.openTournamentStandingsModal = function openTournamentStandingsModal(seasonId, seasonName) {
  document.getElementById('tournament-standings-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tournament-standings-modal';
  modal.className = 'fixed inset-0 z-[230] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-slate-900 border border-emerald-500/30">
      <div class="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
        <h3 class="text-sm font-black text-white uppercase tracking-widest"><i class="fas fa-earth-americas text-emerald-500 mr-1"></i> ${window.sanitizeInput(seasonName || '')}</h3>
        <button class="w-9 h-9 rounded-xl bg-white/5 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div id="tournament-standings"><div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i></div></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.renderTournamentStandings(seasonId);
}

// ================================================
// CREAR / GESTIONAR EQUIPO
// ================================================
window.openCreateTournamentTeamModal = function openCreateTournamentTeamModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-users text-emerald-500 mr-2"></i> Crear Equipo</h2>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Nombre del equipo</label>
      <input type="text" id="team-name" class="input-field-tw h-11 text-sm mb-6" placeholder="Ej: Los Robóticos">
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-create-team" onclick="window.createTournamentTeam()"><i class="fas fa-check"></i> Crear</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.createTournamentTeam = async function createTournamentTeam() {
  const name = document.getElementById('team-name')?.value.trim();
  const btn = document.getElementById('btn-create-team');
  if (!name) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un nombre al equipo', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const season = window._tournamentSeason;
  const { data: team, error } = await window._supabase.from('tournament_teams').insert({
    season_id: season.id, name, school_code: window.userData.school_code, captain_id: window.currentUser.id,
  }).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Crear';
    return;
  }

  await window._supabase.from('tournament_team_members').insert({ season_id: season.id, team_id: team.id, student_id: window.currentUser.id });

  window.showToast('<i class="fas fa-circle-check"></i> ¡Equipo creado! Ya sos el capitán', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadTournamentsSection();
}

window.openManageTeamModal = async function openManageTeamModal() {
  const _supabase = window._supabase;
  const season = window._tournamentSeason;
  const team = window._tournamentMyTeam;

  const { data: members } = await _supabase.from('tournament_team_members')
    .select('student_id, students(full_name)').eq('team_id', team.id);

  const { data: classmates } = await _supabase.from('students')
    .select('id, full_name').eq('school_code', window.userData.school_code)
    .eq('grade', window.userData.grade).eq('section', window.userData.section)
    .neq('id', window.currentUser.id).order('full_name');

  const memberIds = new Set((members || []).map(m => m.student_id));
  const available = (classmates || []).filter(c => !memberIds.has(c.id));

  const modal = document.createElement('div');
  modal.id = 'manage-team-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-users text-emerald-500 mr-2"></i> ${window.sanitizeInput(team.name)}</h2>
      <p class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2">Integrantes</p>
      <div class="space-y-2 mb-6">
        ${(members || []).map(m => `
          <div class="flex items-center justify-between p-2.5 rounded-lg bg-white/5 text-sm text-white">
            <span>${window.sanitizeInput(m.students?.full_name || '')} ${m.student_id === team.captain_id ? '<i class="fas fa-star text-amber-400 text-xs ml-1"></i>' : ''}</span>
            ${m.student_id !== team.captain_id ? `<button class="text-rose-400 hover:text-rose-300" onclick="window.removeTeamMember('${m.student_id}')"><i class="fas fa-times"></i></button>` : ''}
          </div>
        `).join('') || '<p class="text-xs text-slate-500">Solo vos, por ahora.</p>'}
      </div>
      ${available.length ? `
        <p class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2">Agregar compañero</p>
        <div class="flex gap-2 mb-6">
          <select id="add-member-select" class="input-field-tw h-10 text-sm flex-1">
            ${available.map(c => `<option value="${c.id}">${window.sanitizeInput(c.full_name)}</option>`).join('')}
          </select>
          <button class="btn-primary-tw h-10 px-4 text-xs" onclick="window.addTeamMember()"><i class="fas fa-plus"></i></button>
        </div>
      ` : ''}
      <button class="btn-secondary-tw w-full h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);
}

window.addTeamMember = async function addTeamMember() {
  const studentId = document.getElementById('add-member-select')?.value;
  if (!studentId) return;
  const { error } = await window._supabase.from('tournament_team_members').insert({
    season_id: window._tournamentSeason.id, team_id: window._tournamentMyTeam.id, student_id: studentId,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  document.getElementById('manage-team-modal')?.remove();
  window.openManageTeamModal();
}

window.removeTeamMember = async function removeTeamMember(studentId) {
  await window._supabase.from('tournament_team_members').delete().eq('team_id', window._tournamentMyTeam.id).eq('student_id', studentId);
  document.getElementById('manage-team-modal')?.remove();
  window.openManageTeamModal();
}

// ================================================
// RETAR A OTRO EQUIPO (de OTRO establecimiento)
// ================================================
window.openChallengeTeamModal = async function openChallengeTeamModal() {
  const _supabase = window._supabase;
  const season = window._tournamentSeason;
  const myTeam = window._tournamentMyTeam;

  const { data: teams } = await _supabase.from('tournament_teams')
    .select('id, name, school_code, schools(name)').eq('season_id', season.id).neq('school_code', myTeam.school_code);

  if (!teams?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> Todavía no hay equipos de otros establecimientos en esta temporada', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-swords text-rose-500 mr-2"></i> Retar Equipo</h2>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Equipo rival</label>
      <select id="challenge-team-select" class="input-field-tw h-11 text-sm mb-4">
        ${teams.map(t => `<option value="${t.id}">${window.sanitizeInput(t.name)} -- ${window.sanitizeInput(t.schools?.name || t.school_code)}</option>`).join('')}
      </select>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tema del quiz</label>
      <input type="text" id="challenge-topic" class="input-field-tw h-11 text-sm mb-6" placeholder="Ej: robótica, cultura STEAM...">
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-challenge" onclick="window.sendTournamentChallenge()"><i class="fas fa-paper-plane"></i> Retar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.sendTournamentChallenge = async function sendTournamentChallenge() {
  const opponentTeamId = document.getElementById('challenge-team-select')?.value;
  const topic = document.getElementById('challenge-topic')?.value.trim();
  const btn = document.getElementById('btn-send-challenge');
  if (!topic) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un tema', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const myTeam = window._tournamentMyTeam;
  const { error } = await window._supabase.from('tournament_matches').insert({
    season_id: window._tournamentSeason.id,
    team_a_id: myTeam.id,
    team_b_id: opponentTeamId,
    challenger_team_id: myTeam.id,
    topic,
    question_count: 8,
  });

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.renderTournamentMatches();
}

window.cancelTournamentMatch = async function cancelTournamentMatch(matchId) {
  await window._supabase.from('tournament_matches').update({ status: 'cancelled' }).eq('id', matchId).eq('status', 'pending');
  window.showToast('<i class="fas fa-circle-check"></i> Reto cancelado', 'success');
  window.renderTournamentMatches();
}

window.respondTournamentMatch = async function respondTournamentMatch(matchId, accept) {
  if (!accept) {
    await window._supabase.from('tournament_matches').update({ status: 'rejected' }).eq('id', matchId);
    window.showToast('<i class="fas fa-circle-check"></i> Reto rechazado', 'success');
    return window.renderTournamentMatches();
  }

  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Generando preguntas...', 'info');
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/generate-team-match-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ match_id: matchId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error generando el quiz');
    window.showToast('<i class="fas fa-circle-check"></i> ¡Reto aceptado! Ya pueden jugar', 'success');
    window.renderTournamentMatches();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
}

// ================================================
// JUGAR EL PARTIDO (solo el capitán)
// ================================================
window.openTournamentMatchQuiz = async function openTournamentMatchQuiz(matchId) {
  const { data: myAnswer } = await window._supabase.from('tournament_match_answers')
    .select('id').eq('match_id', matchId).eq('team_id', window._tournamentMyTeam.id).maybeSingle();
  if (myAnswer) return window.showToast('<i class="fas fa-circle-info"></i> Tu equipo ya respondió -- esperá al rival', 'info');

  const { data: questions, error } = await window._supabase.rpc('get_tournament_match_questions', { p_match_id: matchId });
  if (error || !questions?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el quiz', 'error');

  window._activeTournamentQuiz = { matchId, questions, index: 0, selections: [] };
  window.renderTournamentQuizQuestion();
}

window.renderTournamentQuizQuestion = function renderTournamentQuizQuestion() {
  const state = window._activeTournamentQuiz;
  if (!state) return;
  const { questions, index } = state;
  const q = questions[index];
  const sanitizeInput = window.sanitizeInput;

  document.getElementById('tournament-quiz-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tournament-quiz-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <div class="flex justify-between items-center mb-4">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Pregunta ${index + 1} / ${questions.length}</span>
        <span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-users"></i> Respondés por tu equipo</span>
      </div>
      <h3 class="text-lg font-bold text-white mb-6">${sanitizeInput(q.question)}</h3>
      <div class="space-y-3">
        ${q.options.map((opt, i) => `
          <button class="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-sm text-white transition-all" onclick="window.selectTournamentAnswer(${i})">
            ${sanitizeInput(opt)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.selectTournamentAnswer = function selectTournamentAnswer(optionIndex) {
  const state = window._activeTournamentQuiz;
  if (!state) return;
  state.selections.push(optionIndex);
  state.index++;

  if (state.index < state.questions.length) {
    window.renderTournamentQuizQuestion();
  } else {
    window.submitTournamentAnswers();
  }
}

window.submitTournamentAnswers = async function submitTournamentAnswers() {
  const state = window._activeTournamentQuiz;
  if (!state) return;
  document.getElementById('tournament-quiz-modal')?.remove();

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/submit-team-match-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ match_id: state.matchId, answers: state.selections }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error enviando respuestas');
    window.showToast(`<i class="fas fa-circle-check"></i> ¡Tu equipo respondió! ${result.score}/${result.total} correctas.`, 'success');
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
  window._activeTournamentQuiz = null;
  window.renderTournamentMatches();
}

// ================================================
// ADMIN -- gestionar temporadas
// ================================================
window.openTournamentSeasonsAdminModal = function openTournamentSeasonsAdminModal() {
  document.getElementById('tournament-seasons-admin-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tournament-seasons-admin-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-emerald-500/30">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
          <i class="fas fa-earth-americas text-emerald-500"></i> Temporadas de Torneo
        </h2>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <div class="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
          <p class="text-[0.65rem] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest mb-3">Nueva temporada</p>
          <div class="space-y-3 mb-3">
            <input type="text" id="season-name" class="input-field-tw h-10 text-sm" placeholder="Nombre (ej: Torneo Agosto 2026)">
            <textarea id="season-description" class="input-field-tw text-sm" rows="2" placeholder="Descripción (opcional)"></textarea>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Inicio</label><input type="date" id="season-start" class="input-field-tw h-10 text-sm"></div>
              <div><label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Fin</label><input type="date" id="season-end" class="input-field-tw h-10 text-sm"></div>
            </div>
          </div>
          <button id="btn-create-season" class="btn-primary-tw w-full h-11 text-xs uppercase font-black" onclick="window.createTournamentSeason()"><i class="fas fa-plus"></i> Crear Temporada</button>
        </div>

        <div>
          <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-3">Temporadas existentes</p>
          <div id="tournament-seasons-admin-list" class="space-y-2">
            <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.loadTournamentSeasonsAdminList();
}

window.createTournamentSeason = async function createTournamentSeason() {
  const name = document.getElementById('season-name')?.value.trim();
  const description = document.getElementById('season-description')?.value.trim();
  const startDate = document.getElementById('season-start')?.value;
  const endDate = document.getElementById('season-end')?.value;
  const btn = document.getElementById('btn-create-season');

  if (!name || !startDate || !endDate) return window.showToast('<i class="fas fa-circle-xmark"></i> Completá nombre, inicio y fin', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { error } = await window._supabase.from('tournament_seasons').insert({
    name, description: description || null,
    starts_at: new Date(startDate).toISOString(),
    ends_at: new Date(endDate + 'T23:59:59').toISOString(),
    status: 'active',
    created_by: window.currentUser.id,
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-plus"></i> Crear Temporada';

  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Temporada creada y activa', 'success');
  window.loadTournamentSeasonsAdminList();
}

window.toggleTournamentSeasonStatus = async function toggleTournamentSeasonStatus(seasonId, newStatus) {
  await window._supabase.from('tournament_seasons').update({ status: newStatus }).eq('id', seasonId);
  window.showToast('<i class="fas fa-circle-check"></i> Temporada actualizada', 'success');
  window.loadTournamentSeasonsAdminList();
}

window.loadTournamentSeasonsAdminList = async function loadTournamentSeasonsAdminList() {
  const listEl = document.getElementById('tournament-seasons-admin-list');
  if (!listEl) return;
  const sanitizeInput = window.sanitizeInput;

  const { data: seasons, error } = await window._supabase.from('tournament_seasons')
    .select('id, name, status, starts_at, ends_at').order('created_at', { ascending: false }).limit(15);

  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">${error.message}</p>`; return; }
  if (!seasons?.length) { listEl.innerHTML = '<p class="text-slate-400 text-xs text-center py-4">Todavía no hay temporadas.</p>'; return; }

  const statusLabel = { upcoming: 'Próxima', active: 'Activa', closed: 'Cerrada' };
  const statusColor = { upcoming: 'bg-amber-500/10 text-amber-500', active: 'bg-emerald-500/10 text-emerald-500', closed: 'bg-slate-200 dark:bg-slate-700 text-slate-500' };

  listEl.innerHTML = seasons.map(s => `
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-xs font-bold text-slate-800 dark:text-white truncate">${sanitizeInput(s.name)}</div>
        <div class="text-[0.6rem] text-slate-400">${new Date(s.starts_at).toLocaleDateString('es-GT')} -- ${new Date(s.ends_at).toLocaleDateString('es-GT')}</div>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-lg text-[0.6rem] font-black uppercase ${statusColor[s.status]}">${statusLabel[s.status]}</span>
        <button class="text-primary hover:underline text-[0.6rem] font-bold uppercase" onclick="window.openTournamentStandingsModal('${s.id}', '${window.sanitizeAttr(s.name)}')">Tabla</button>
        ${s.status !== 'closed' ? `<button class="text-rose-500 hover:underline text-[0.6rem] font-bold uppercase" onclick="window.toggleTournamentSeasonStatus('${s.id}', 'closed')">Cerrar</button>` : ''}
      </div>
    </div>
  `).join('');
}

console.log('✅ tournaments.js cargado correctamente');
