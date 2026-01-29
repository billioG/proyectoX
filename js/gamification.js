/**
 * SISTEMA DE GAMIFICACIÓN Y KPIs (XP, NIVELES, INDICADORES)
 */

window.initGamification = async function initGamification() {
  const userRole = window.userRole;
  const currentUser = window.currentUser;
  const fetchWithCache = window.fetchWithCache;
  const _supabase = window._supabase;

  try {
    if (userRole === 'estudiante') {
      const cacheKey = `student_xp_snapshot_${currentUser.id}`;
      await fetchWithCache(cacheKey, async () => {
        if (typeof window.updateLoginStreak === 'function') await window.updateLoginStreak();
        return await window.calculateStudentXP(currentUser.id);
      }, (xpData) => {
        if (!xpData) return;
        if (typeof window.renderGamificationSidebar === 'function') window.renderGamificationSidebar(xpData.level, xpData.totalXP, xpData.levelProgress, xpData.xpInLevel);
        if (typeof window.checkBadgeCelebrations === 'function') window.checkBadgeCelebrations(xpData.earnedBadges);
        if (typeof window.checkDailyChest === 'function') window.checkDailyChest();
      });

    } else if (userRole === 'docente') {
      const cacheKey = `teacher_kpi_snapshot_${currentUser.id}`;
      await fetchWithCache(cacheKey, async () => {
        const { data: assignments } = await _supabase.from('teacher_assignments').select('*').eq('teacher_id', currentUser.id);
        const xpData = typeof window.calculateMonthlyKPIs === 'function' ? await window.calculateMonthlyKPIs(currentUser.id, assignments || []) : { totalXP: 0 };

        // Reto Maestro Legendario (12 retos)
        const { count: totalChallenges } = await _supabase
          .from('teacher_challenges')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', currentUser.id);

        return { xpData, totalChallenges };
      }, (snapshot) => {
        if (snapshot.xpData) {
          if (typeof window.renderTeacherSidebar === 'function') window.renderTeacherSidebar(snapshot.xpData);
          if (snapshot.totalChallenges >= 12) {
            if (typeof window.checkBadgeCelebrations === 'function') window.checkBadgeCelebrations([{ badge_id: 200 }]);
          }
        }
      });
    }
  } catch (err) {
    console.error('Error en gamificación:', err);
  }
}

// Actualización automática tras sincronización exitosa
window.addEventListener('sync-finished', async (e) => {
  const userRole = window.userRole;
  const currentUser = window.currentUser;
  if (e.detail && e.detail.processed > 0) {
    console.log('🔄 Sincronización exitosa, refrescando insignias y nivel...');
    if (userRole === 'estudiante' && typeof window.checkAllBadges === 'function') {
      await window.checkAllBadges(currentUser.id);
    }
    window.initGamification();
  }
});

window.calculateTeacherKPIs = async function calculateTeacherKPIs(teacherId) {
  try {
    // 1. Calcular Asistencia Global (Placeholder)
    const attendance = 85;

    // 2. Proyectos Subidos (Cobertura de grupos) (Placeholder)
    const projectCoverage = 75;

    // 3. Evidencia Semanal (Placeholder)
    const weeksEvidence = 3;

    return {
      attendance,
      projectCoverage,
      weeksEvidence
    };
  } catch (err) {
    console.error('Error KPIs:', err);
    return null;
  }
}

window.calculateStudentXP = async function calculateStudentXP(studentId) {
  const _supabase = window._supabase;
  const userData = window.userData;
  try {
    const { data: myGroups } = await _supabase
      .from('group_members')
      .select('group_id')
      .eq('student_id', studentId);

    const groupIds = myGroups?.map(g => g.group_id) || [];

    const { data: projects } = await _supabase
      .from('projects')
      .select('score, votes')
      .or(`user_id.eq.${studentId}${groupIds.length > 0 ? `,group_id.in.(${groupIds.join(',')})` : ''}`);

    const { data: earnedBadges } = await _supabase
      .from('student_badges')
      .select('badge_id')
      .eq('student_id', studentId);

    const totalProjects = projects?.length || 0;
    const totalVotes = projects?.reduce((sum, p) => sum + (p.votes || 0), 0) || 0;
    const totalScore = projects?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
    const badgeCount = earnedBadges?.length || 0;

    const bonusXP = userData?.xp || 0;
    const totalXP = (totalProjects * 50) + (totalVotes * 10) + totalScore + (badgeCount * 100) + bonusXP;
    const level = Math.floor(totalXP / 500) + 1;
    const xpInLevel = totalXP % 500;
    const levelProgress = (xpInLevel / 500) * 100;

    return { totalXP, level, xpInLevel, levelProgress, earnedBadges, totalProjects, totalVotes, totalScore, gems: userData?.gems || 0 };
  } catch (err) {
    console.error('Error calculando XP:', err);
    return null;
  }
}

window.renderGamificationSidebar = function renderGamificationSidebar(level, totalXP, progress, xpInLevel) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const existing = document.getElementById('gamification-sidebar');
  if (existing) existing.remove();

  const streak = window.userData?.streak || 0;

  const container = document.createElement('div');
  container.id = 'gamification-sidebar';
  container.className = 'px-6 py-4 mt-auto mb-6';

  container.innerHTML = `
    <div class="glass-card p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-lg relative overflow-hidden group">
      <div class="flex justify-between items-start mb-4 relative z-10">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-[1.25rem] bg-indigo-500 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-500/20 ring-4 ring-white dark:ring-slate-900 transform group-hover:scale-110 transition-transform duration-500">
            ${level}
          </div>
          <div>
            <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest leading-none mb-1">Tu Rango</div>
            <div class="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-tight">Novato Élite</div>
          </div>
        </div>
        <div class="flex flex-col items-end">
            <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/10 shadow-sm animate-pulse">
                <i class="fas fa-fire text-sm"></i>
                <span class="text-xs font-bold leading-none">${streak} DÍAS</span>
            </div>
        </div>
      </div>

      <div class="space-y-3 relative z-10">
        <div class="flex justify-between items-end px-0.5">
          <span class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Progreso de Nivel</span>
          <span class="text-[0.7rem] font-semibold text-slate-700 dark:text-slate-300">${xpInLevel} <span class="opacity-50">/ 500 XP</span></span>
        </div>
        <div class="h-3.5 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden p-0.5 border border-slate-50 dark:border-slate-800">
          <div class="h-full bg-gradient-to-r from-primary to-indigo-500 rounded-full transition-all duration-1000 ease-out" style="width: ${progress}%"></div>
        </div>
      </div>

      <!-- Stats Footer -->
      <div class="mt-5 pt-4 border-t border-slate-50 dark:border-slate-800/50 flex justify-between items-center relative z-10">
        <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[0.6rem] shadow-sm"><i class="fas fa-star"></i></div>
            <span class="text-[0.65rem] font-bold text-slate-500 uppercase tracking-widest">${totalXP} XP ToTal</span>
        </div>
        <button onclick="window.showXPInfoModal && window.showXPInfoModal()" class="text-slate-300 hover:text-primary transition-colors">
            <i class="fas fa-info-circle text-sm"></i>
        </button>
      </div>

      <!-- GAME CENTER BUTTON (NEW) -->
      <button onclick="window.openGamificationHub && window.openGamificationHub()" class="w-full py-3 mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-95 transition-all text-[0.65rem] flex items-center justify-center gap-2 relative z-10">
        <i class="fas fa-gamepad animate-bounce"></i> Abrir Centro de Juego
      </button>
    </div>
  `;

  sidebar.appendChild(container);
}

window.renderTeacherSidebar = function renderTeacherSidebar(stats) {
  const { totalXP, attCount, attMeta, evalCount, evalMeta, evidCount, evidMeta, repCount, repMeta, challengeXP } = stats;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const existing = document.getElementById('gamification-sidebar');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'gamification-sidebar';
  container.className = 'px-6 py-4 mt-auto mb-6';

  container.innerHTML = `
    <div class="glass-card p-6 bg-slate-900 text-white border-none shadow-2xl relative overflow-hidden group">
      <div class="absolute -right-6 -top-6 text-7xl opacity-5 rotate-12 group-hover:rotate-45 transition-transform duration-700 pointer-events-none">
        <i class="fas fa-bolt"></i>
      </div>
      
      <div class="relative z-10 mb-6 flex justify-between items-center">
        <div>
            <h4 class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary mb-1">Métricas de Impacto</h4>
            <div class="text-3xl font-bold flex items-baseline gap-2 leading-none">${totalXP} <span class="text-[0.6rem] opacity-40 uppercase tracking-widest font-bold">/ 100 XP</span></div>
        </div>
        <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-primary border border-white/10">
            <i class="fas fa-chart-line"></i>
        </div>
      </div>

      <div class="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-8">
        <div class="h-full bg-primary rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(0,173,239,0.5)]" style="width: ${totalXP}%"></div>
      </div>

      <div class="grid grid-cols-2 gap-3 relative z-10">
        ${[
      { l: 'Asis', c: attCount, m: attMeta, i: 'fa-calendar-check', col: 'text-sky-400', d: 'Días de asistencia registrados este mes mediante escaneo QR.' },
      { l: 'Eval', c: evalCount, m: evalMeta, i: 'fa-star', col: 'text-amber-400', d: 'Proyectos de alumnos calificados en el panel de evaluación.' },
      { l: 'Evid', c: evidCount, m: evidMeta, i: 'fa-camera', col: 'text-emerald-400', d: 'Cargas de evidencia semanal (fotos y descripción) completadas.' },
      { l: 'Info', c: repCount, m: repMeta, i: 'fa-file-alt', col: 'text-indigo-400', d: 'Informe mensual detallado enviado electrónicamente.' }
    ].map(o => `
            <div class="p-3 bg-white/5 rounded-2xl border border-white/[0.03] text-center hover:bg-white/10 transition-colors cursor-help group/kpi" title="${o.d}">
                <div class="text-[0.55rem] font-bold uppercase text-white/40 tracking-widest mb-1">${o.l}</div>
                <div class="text-xs font-bold text-white">${o.c || 0}<span class="opacity-30 mx-0.5">/</span>${o.m}</div>
            </div>
        `).join('')}
      </div>

      <div class="mt-6 pt-5 border-t border-white/5 text-center relative z-10">
        <span class="text-[0.7rem] font-bold text-white/40 uppercase tracking-widest flex items-center justify-center gap-2">
          <i class="fas fa-trophy text-amber-500 animate-bounce"></i> Reto Global: <strong class="text-primary font-bold">${challengeXP || 0}/10 XP</strong>
        </span>
      </div>
    </div>
  `;

  sidebar.appendChild(container);
}

// ==========================================
// NUEVO SISTEMA DE GAMIFICACIÓN EVOLUCIONADA (1BOT ROYALE)
// ==========================================

window.activeHappyHour = false;
window.doubleXPMultiplier = 1;

window.updateLoginStreak = async function updateLoginStreak() {
  const userData = window.userData;
  const userRole = window.userRole;
  const currentUser = window.currentUser;
  const _supabase = window._supabase;
  const showToast = window.showToast;

  if (!userData) return;
  const table = userRole === 'estudiante' ? 'students' : 'teachers';
  const today = new Date().toISOString().split('T')[0];
  const lastLogin = userData.last_login;

  if (lastLogin === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let currentStreak = userData.streak || 0;
  let newStreak = 1;
  let freezeUsed = false;

  if (lastLogin === yesterdayStr) {
    newStreak = currentStreak + 1;
    if (typeof showToast === 'function') showToast(`🔥 ¡Racha de ${newStreak} días! Sigue así.`, 'info');
  } else if (lastLogin) {
    // Check for streak freeze
    if (userData.streak_freeze) {
      newStreak = currentStreak;
      freezeUsed = true;
      if (typeof showToast === 'function') showToast('🧊 ¡Tu Racha fue salvada por un Hielo!', 'info');
    } else {
      newStreak = 1;
      if (typeof showToast === 'function') showToast('😢 Racha perdida. ¡Empieza de nuevo!', 'warning');
    }
  }

  const updateData = { last_login: today, streak: newStreak };
  if (freezeUsed) updateData.streak_freeze = false;

  const { error } = await _supabase.from(table).update(updateData).eq('id', currentUser.id);
  if (!error) {
    userData.last_login = today;
    userData.streak = newStreak;
    if (freezeUsed) userData.streak_freeze = false;
  }
}

// ==========================================
// 2. DAILY CHESTS (COFRES)
// ==========================================
window.checkDailyChest = function checkDailyChest() {
  const userData = window.userData;
  if (!userData) return;
  const today = new Date().toISOString().split('T')[0];
  const lastChest = userData.daily_chest_last_claimed;

  if (lastChest !== today) {
    setTimeout(() => {
      if (typeof window.showDailyChestModal === 'function') window.showDailyChestModal();
    }, 2000);
  }
}

window.showDailyChestModal = function showDailyChestModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
        <div class="flex flex-col items-center animate-bounce-in">
            <h2 class="text-3xl font-black text-white uppercase tracking-widest mb-8 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">¡Cofre Diario!</h2>
            <div class="relative group cursor-pointer transition-transform hover:scale-110 duration-300" onclick="window.openChest(this)">
                <div class="absolute inset-0 bg-yellow-400 opacity-20 blur-3xl rounded-full animate-pulse"></div>
                <i class="fas fa-treasure-chest text-[12rem] text-amber-400 drop-shadow-2xl filter brightness-110"></i>
                <div class="text-white text-center font-bold mt-4 animate-bounce">¡TOCA PARA ABRIR!</div>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
}

window.openChest = async function openChest(el) {
  const userData = window.userData;
  const userRole = window.userRole;
  const currentUser = window.currentUser;
  const _supabase = window._supabase;
  const showToast = window.showToast;

  const today = new Date().toISOString().split('T')[0];
  const table = userRole === 'estudiante' ? 'students' : 'teachers';

  // Random Reward
  const rewards = [
    { xp: 20, gems: 5, msg: "Poquito pero bendito" },
    { xp: 50, gems: 15, msg: "¡Nada mal!" },
    { xp: 100, gems: 50, msg: "¡Premio Mayor!", card: "Carta Algoritmo Dorado" }
  ];
  const reward = rewards[Math.floor(Math.random() * rewards.length)];

  // Save to DB
  const newXP = (userData.xp || 0) + reward.xp;
  const newGems = (userData.gems || 0) + reward.gems;

  const { error } = await _supabase.from(table).update({
    daily_chest_last_claimed: today,
    xp: newXP,
    gems: newGems
  }).eq('id', currentUser.id);

  if (error) {
    if (typeof showToast === 'function') showToast('❌ Error al reclamar cofre', 'error');
    return;
  }

  userData.daily_chest_last_claimed = today;
  userData.xp = newXP;
  userData.gems = newGems;

  if (typeof window.initGamification === 'function') window.initGamification(); // Refresh sidebar UI

  // Simulate opening animation
  el.innerHTML = `
        <div class="text-center animate-ping-once transition-all">
             <i class="fas fa-box-open text-[12rem] text-amber-300 mb-6 drop-shadow-2xl"></i>
             <div class="text-5xl font-black text-white drop-shadow-lg">+${reward.xp} XP</div>
             <div class="text-3xl font-black text-cyan-400 drop-shadow-lg">+${reward.gems} GEMS</div>
             <p class="text-amber-200 font-bold uppercase tracking-widest mt-2">${reward.msg}</p>
             <button onclick="location.reload()" class="mt-8 px-8 py-3 bg-white text-amber-600 rounded-full font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl">Recoger y Seguir</button>
        </div>
    `;
  el.onclick = null;

  if (typeof showToast === 'function') showToast(`🎁 Ganaste ${reward.xp} XP y ${reward.gems} Gemas`, 'success');
}

// ==========================================
// 3. HAPPY HOUR & UI
// ==========================================
window.checkHappyHour = function checkHappyHour() {
  const hour = new Date().getHours();
  // Example: Happy hour between 18:00 and 20:00
  if (hour >= 18 && hour < 20) {
    window.activeHappyHour = true;
    window.doubleXPMultiplier = 2;
  }
}

window.renderGamificationHubBtn = function renderGamificationHubBtn() {
  const container = document.getElementById('gamification-sidebar');
  if (!container) return;

  const btn = document.createElement('button');
  btn.className = 'w-full py-3 mt-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-95 transition-all text-xs flex items-center justify-center gap-2';
  btn.innerHTML = '<i class="fas fa-gamepad"></i> Abrir Centro de Juego';
  btn.onclick = () => { if (typeof window.openGamificationHub === 'function') window.openGamificationHub(); };

  container.appendChild(btn);
}

window.openGamificationHub = async function openGamificationHub() {
  const _supabase = window._supabase;
  const fetchWithCache = window.fetchWithCache;

  const modal = document.createElement('div');
  modal.id = 'gamification-hub-modal';
  modal.className = 'fixed inset-0 z-[150] bg-slate-900 flex flex-col animate-fadeIn overflow-hidden';
  document.body.appendChild(modal);

  try {
    await fetchWithCache('student_ranking_top', async () => {
      return await _supabase
        .from('students')
        .select('full_name, xp, profile_photo_url')
        .order('xp', { ascending: false })
        .limit(10);
    }, (topStudents) => {
      if (typeof window.renderGamificationHubContent === 'function') window.renderGamificationHubContent(modal, topStudents);
    });
  } catch (err) {
    console.error(err);
    if (typeof window.renderGamificationHubContent === 'function') window.renderGamificationHubContent(modal, []);
  }
}

window.renderGamificationHubContent = function renderGamificationHubContent(modal, topStudents) {
  const activeHappyHour = window.activeHappyHour;
  const userData = window.userData;

  modal.innerHTML = `
        <!-- Navbar -->
        <div class="px-6 py-4 flex justify-between items-center bg-slate-900 border-b border-white/10 shrink-0">
             <div class="flex items-center gap-3">
                <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"><i class="fas fa-arrow-left"></i></button>
                <h2 class="text-lg font-black text-white uppercase tracking-widest">Centro de Juego</h2>
             </div>
             <div class="flex items-center gap-4">
                 ${activeHappyHour ? '<div class="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold uppercase animate-pulse">⚡ Happy Hour x2</div>' : ''}
                 <div class="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
                    <i class="fas fa-gem text-cyan-400"></i>
                    <span class="text-sm font-bold text-white">${userData?.gems || 0}</span>
                 </div>
             </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div class="max-w-5xl mx-auto space-y-12 pb-20">
            
                <!-- TIENDA -->
                <section>
                    <h3 class="text-2xl font-black text-white italic uppercase mb-6 flex items-center gap-3"><i class="fas fa-store text-indigo-500"></i> Tienda de Mascotas</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        ${window.renderShopItem('Búho Cibernético', 'Tu compañero de código', 500, '🦉', 'bg-indigo-500')}
                        ${window.renderShopItem('Racha Congelada', 'Protege tu racha 1 día', 300, '🧊', 'bg-cyan-500', userData?.streak_freeze)}
                        ${window.renderShopItem('Marco Dorado', 'Brilla en el ranking', 1000, '🖼️', 'bg-amber-500')}
                        ${window.renderShopItem('Desafío 1v1', 'Reta a un amigo', 100, '⚔️', 'bg-rose-500')}
                    </div>
                </section>

                <!-- LIGAS -->
                <section>
                    <h3 class="text-2xl font-black text-white italic uppercase mb-6 flex items-center gap-3"><i class="fas fa-trophy text-amber-400"></i> Liga de Diamantes</h3>
                    <div class="glass-card bg-slate-800/50 border-white/10 overflow-hidden">
                        <table class="w-full text-left">
                            <thead class="bg-white/5 text-[0.65rem] uppercase font-black text-slate-400 tracking-widest">
                                <tr>
                                    <th class="p-4 w-16 text-center">#</th>
                                    <th class="p-4">Estudiante</th>
                                    <th class="p-4 text-right">Bonos XP</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5 text-sm font-bold text-slate-300">
                                ${(topStudents || []).map((s, i) => `
                                    <tr class="${s.full_name === userData?.full_name ? 'bg-primary/10 border-l-4 border-l-primary' : ''}">
                                        <td class="p-4 text-center">
                                            ${i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : i + 1))}
                                        </td>
                                        <td class="p-4 text-white flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-full bg-slate-700 overflow-hidden border border-white/10">
                                                ${s.profile_photo_url ? `<img src="${s.profile_photo_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center bg-slate-600 text-[0.6rem]">${s.full_name.charAt(0)}</div>`}
                                            </div> 
                                            <span class="truncate max-w-[150px]">${s.full_name}</span>
                                            ${s.full_name === userData?.full_name ? '<span class="px-2 py-0.5 rounded-full bg-primary text-[0.5rem] uppercase">Tú</span>' : ''}
                                        </td>
                                        <td class="p-4 text-right font-mono text-amber-400">${s.xp || 0}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="p-3 text-center text-[0.6rem] font-bold uppercase text-slate-500 tracking-widest bg-white/5">
                            Temporada de Enero • Actualizado en vivo
                        </div>
                    </div>
                </section>
                
                 <!-- DUELOS (Prototipo) -->
                <section>
                     <h3 class="text-2xl font-black text-white italic uppercase mb-6 flex items-center gap-3"><i class="fas fa-swords text-rose-500"></i> Desafíos de Código</h3>
                     <div class="glass-card p-12 text-center border-dashed border-2 border-white/10 bg-transparent hover:border-white/20 transition-all cursor-pointer group" onclick="window.showToast && window.showToast('⚔️ ¡Próximamente! Estamos preparando las arenas de combate.', 'info')">
                        <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <i class="fas fa-plus text-2xl text-white/20 group-hover:text-white/50 transition-colors"></i>
                        </div>
                        <p class="text-sm font-black text-white uppercase tracking-widest">Crear Desafío 1v1</p>
                        <p class="text-[0.65rem] font-bold text-slate-500 mt-2">Apuesta gemas y gana XP extra</p>
                     </div>
                </section>
            </div>
        </div>
    `;
}

window.renderShopItem = function renderShopItem(name, desc, price, icon, colorClass, owned = false) {
  return `
        <div class="glass-card bg-slate-800 border-slate-700 p-4 relative group overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform" onclick="window.buyShopItem('${name}', ${price})">
            <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            ${owned ? '<div class="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500 text-[0.5rem] font-black uppercase rounded text-white z-10">Activo</div>' : ''}
            <div class="w-12 h-12 rounded-xl ${colorClass} text-white flex items-center justify-center text-2xl shadow-lg mb-3">
                ${icon}
            </div>
            <div class="font-black text-white text-sm uppercase tracking-tight leading-none mb-1">${name}</div>
            <div class="text-[0.65rem] font-bold text-slate-500 mb-3">${desc}</div>
            <button class="w-full py-2 rounded-lg ${owned ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/10 hover:bg-white/20 text-white'} text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-colors">
                <i class="fas fa-gem ${owned ? 'text-emerald-500' : 'text-cyan-400'}"></i> ${owned ? 'ADQUIRIDO' : price}
            </button>
        </div>
    `;
}

window.buyShopItem = async function buyShopItem(name, price) {
  const userData = window.userData;
  const userRole = window.userRole;
  const currentUser = window.currentUser;
  const _supabase = window._supabase;
  const showToast = window.showToast;

  if ((userData.gems || 0) < price) {
    if (typeof showToast === 'function') showToast('💎 No tienes suficientes gemas', 'error');
    return;
  }

  // Logic for specific items
  if (name === 'Racha Congelada') {
    if (userData.streak_freeze) {
      if (typeof showToast === 'function') showToast('🧊 Ya tienes un hielo activo', 'info');
      return;
    }

    const table = userRole === 'estudiante' ? 'students' : 'teachers';
    const { error } = await _supabase.from(table).update({
      gems: userData.gems - price,
      streak_freeze: true
    }).eq('id', currentUser.id);

    if (!error) {
      userData.gems -= price;
      userData.streak_freeze = true;
      if (typeof showToast === 'function') showToast('🧊 ¡Hielo de Racha activado!', 'success');
      // Refresh hub and sidebar
      if (typeof window.openGamificationHub === 'function') window.openGamificationHub();
      if (typeof window.initGamification === 'function') window.initGamification();
    }
  } else {
    if (typeof showToast === 'function') showToast('🚀 ¡Próximamente más artículos en la tienda!', 'info');
  }
}

window.checkBadgeCelebrations = function checkBadgeCelebrations(earnedBadges) {
  const currentUser = window.currentUser;
  const BADGES = window.BADGES || [];
  const TEACHER_BADGES = window.TEACHER_BADGES || [];

  if (!earnedBadges || earnedBadges.length === 0) return;

  const seenKey = `seen_badges_${currentUser.id}`;
  const seenBadges = JSON.parse(localStorage.getItem(seenKey) || '[]');

  const newBadges = earnedBadges.filter(b => !seenBadges.includes(b.badge_id));

  if (newBadges.length > 0) {
    const badgeId = newBadges[0].badge_id;
    const badgeInfo = [...BADGES, ...TEACHER_BADGES].find(b => b.id === badgeId);

    if (badgeInfo) {
      setTimeout(() => {
        if (typeof window.showBadgeCelebrationModal === 'function') window.showBadgeCelebrationModal(badgeInfo);
      }, 1500);
    }
    const updatedSeen = [...seenBadges, ...newBadges.map(b => b.badge_id)];
    localStorage.setItem(seenKey, JSON.stringify(updatedSeen));
  }
}

window.showBadgeCelebrationModal = function showBadgeCelebrationModal(badge) {
  const startBirthdayConfetti = window.startBirthdayConfetti;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';

  modal.innerHTML = `
    <div class="relative w-full max-sm p-8 text-center">
        <!-- Confetti effect container would go here -->
        
        <div class="mb-6 relative">
            <div class="absolute inset-0 bg-primary blur-[60px] opacity-40 animate-pulse"></div>
            <div class="relative text-[8rem] animate-bounce-in drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transform hover:scale-110 transition-transform duration-500">
                ${badge.icon}
            </div>
        </div>
        
        <div class="relative z-10 space-y-2 mb-8 animate-slideUp">
            <h2 class="text-3xl font-black text-white uppercase tracking-tighter italic drop-shadow-lg leading-none">
                ¡Nueva Insignia!
            </h2>
            <div class="inline-block px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-sm uppercase tracking-widest shadow-lg transform -rotate-2">
                ${badge.name}
            </div>
            <p class="text-slate-300 font-medium text-sm mt-4 px-4 leading-relaxed">
                "${badge.description}"
            </p>
        </div>

        <div class="flex flex-col gap-3 relative z-10 animate-slideUp" style="animation-delay: 0.1s">
            <div class="p-3 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center gap-2">
                <span class="text-amber-400 font-black text-lg">+100</span>
                <span class="text-xs font-bold text-white uppercase tracking-widest">Puntos de Experiencia</span>
            </div>
            
            <button class="w-full py-4 bg-primary hover:bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95" onclick="this.closest('.fixed').remove(); if (typeof window.startBirthdayConfetti === 'function') window.startBirthdayConfetti();">
                ¡Genial! 🚀
            </button>
        </div>
    </div>
    `;

  document.body.appendChild(modal);
  if (typeof startBirthdayConfetti === 'function') startBirthdayConfetti();
}
