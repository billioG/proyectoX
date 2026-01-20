/**
 * SISTEMA DE GAMIFICACIÓN Y KPIs (XP, NIVELES, INDICADORES)
 */

async function initGamification() {
  try {
    if (userRole === 'estudiante') {
      const xpData = await calculateStudentXP(currentUser.id);
      if (!xpData) return;

      updateLoginStreak();
      renderGamificationSidebar(xpData.level, xpData.totalXP, xpData.levelProgress, xpData.xpInLevel);
      checkBadgeCelebrations(xpData.earnedBadges);

    } else if (userRole === 'docente' || userRole === 'admin') {
      const xpData = await calculateTeacherXP(currentUser.id);
      if (xpData) {
        renderTeacherSidebar(xpData);
      }
    }
  } catch (err) {
    console.error('Error en gamificación:', err);
  }
}

async function calculateTeacherKPIs(teacherId) {
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

async function calculateStudentXP(studentId) {
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

    const totalXP = (totalProjects * 50) + (totalVotes * 10) + totalScore + (badgeCount * 100);
    const level = Math.floor(totalXP / 500) + 1;
    const xpInLevel = totalXP % 500;
    const levelProgress = (xpInLevel / 500) * 100;

    return { totalXP, level, xpInLevel, levelProgress, earnedBadges, totalProjects, totalVotes, totalScore };
  } catch (err) {
    console.error('Error calculando XP:', err);
    return null;
  }
}

function renderGamificationSidebar(level, totalXP, progress, xpInLevel) {
  // Cambiar a seleccionar todo el sidebar para añadir al final
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const existing = document.getElementById('gamification-sidebar');
  if (existing) existing.remove();

  const streakKey = `streak_${currentUser.id}`;
  const streak = localStorage.getItem(streakKey) || 1;

  const div = document.createElement('div');
  div.id = 'gamification-sidebar';
  div.className = 'xp-container';
  div.style.marginTop = 'auto'; // Empujar al fondo
  div.style.padding = '0 15px 20px'; // Padding igual al del docente

  div.innerHTML = `
    <div style="background: var(--bg-color); border-radius: 12px; padding: 15px; border: 1px solid var(--border-color); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
        <div>
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
            <small style="color: var(--primary-color); font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.5px;">Nivel Actual</small>
            <i class="fas fa-info-circle" style="color: var(--text-light); font-size: 0.8rem; cursor: pointer;" onclick="showXPInfoModal()" title="¿Cómo ganar XP?"></i>
          </div>
          <span style="color: var(--text-color); font-size: 1.8rem; font-weight: 800; line-height: 1;">${level}</span>
        </div>
        <div style="text-align: right;">
          <span style="color: var(--text-color); font-size: 0.9rem; font-weight: 700;">${xpInLevel} <small style="color: var(--text-light); font-size: 0.7rem; font-weight: 400;">/ 500 XP</small></span>
        </div>
      </div>
      
      <div class="xp-bar-bg" style="height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; margin-bottom: 15px;">
        <div class="xp-bar-fill" style="width: ${progress}%; background: linear-gradient(90deg, #22d3ee, #818cf8); height: 100%;"></div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-color);">
        <small style="color: var(--text-light); font-size: 0.75rem;">Total: <strong>${totalXP} XP</strong></small>
        <div class="streak-badge" style="background: linear-gradient(135deg, #f97316, #ef4444); padding: 4px 10px; border-radius: 20px; color: white; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 4px rgba(249, 115, 22, 0.3);">
          <i class="fas fa-fire" style="font-size: 0.8rem;"></i>
          <span style="font-size: 0.85rem; font-weight: 700;">${streak} días</span>
        </div>
      </div>
    </div>
  `;

  sidebar.appendChild(div);
}

function showXPInfoModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.zIndex = '10000';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px; border: none; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 15px;">
        <h3 style="margin: 0; color: var(--primary-color);">🚀 ¿Cómo ganar XP?</h3>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      
      <div class="modal-body">
        <div style="display: flex; align-items: center; margin-bottom: 15px;">
          <div style="background: #e0e7ff; color: #4338ca; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 1.2rem;">
            <i class="fas fa-project-diagram"></i>
          </div>
          <div>
            <strong style="display: block; color: var(--dark);">Publicar Proyectos</strong>
            <span style="color: var(--success-color); font-weight: 700;">+50 XP</span> <span style="color: var(--text-light); font-size: 0.9rem;">por proyecto</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; margin-bottom: 15px;">
          <div style="background: #fee2e2; color: #b91c1c; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 1.2rem;">
            <i class="fas fa-heart"></i>
          </div>
          <div>
            <strong style="display: block; color: var(--dark);">Recibir 'Me Gusta'</strong>
            <span style="color: var(--success-color); font-weight: 700;">+10 XP</span> <span style="color: var(--text-light); font-size: 0.9rem;">por cada voto</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; margin-bottom: 15px;">
          <div style="background: #fef3c7; color: #b45309; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 1.2rem;">
            <i class="fas fa-star"></i>
          </div>
          <div>
            <strong style="display: block; color: var(--dark);">Calificación Docente</strong>
            <span style="color: var(--success-color); font-weight: 700;">+10 XP</span> <span style="color: var(--text-light); font-size: 0.9rem;">por calificar</span>
          </div>
        </div>

        <div style="display: flex; align-items: center;">
          <div style="background: #d1fae5; color: #047857; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 1.2rem;">
            <i class="fas fa-award"></i>
          </div>
          <div>
            <strong style="display: block; color: var(--dark);">Desbloquear Insignias</strong>
            <span style="color: var(--success-color); font-weight: 700;">+100 XP</span> <span style="color: var(--text-light); font-size: 0.9rem;">por insignia</span>
          </div>
        </div>

        <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
           <h4 style="margin: 0 0 10px; color: var(--primary-color);">📈 Niveles</h4>
           <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0 0 5px;">
             <strong>Nivel 1-5:</strong> <span style="background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Novato</span>
           </p>
           <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0 0 5px;">
             <strong>Nivel 6-10:</strong> <span style="background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Experto</span>
           </p>
           <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0;">
             <strong>Nivel 11+:</strong> <span style="background:#fce7f3; color:#db2777; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Maestro</span>
           </p>

           <div style="margin-top: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; padding: 10px; border-radius: 8px; text-align: center;">
             <i class="fas fa-gift" style="animation: bounce 2s infinite;"></i> 
             <strong style="margin-left: 5px;">Regalo Sorpresa</strong> al Nivel 10
           </div>
        </div>

        <div style="margin-top: 20px; text-align: center; padding-top: 15px; border-top: 1px solid var(--border-color);">
          <small style="color: var(--text-light);">¡Sube de nivel para desbloquear nuevas funciones!</small>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function calculateTeacherXP(teacherId) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    // 1. Asistencia (Meta: 4 listas o registros en grupos). 5 XP por c/u, Max: 20 XP.
    const { count: attendanceCount } = await _supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .gte('created_at', startOfMonthISO);

    // 2. Evaluaciones (Meta: 20 evaluaciones). 1 XP por c/u, Max: 20 XP.
    const { count: evalCount } = await _supabase
      .from('evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .gte('created_at', startOfMonthISO);

    // 3. Evidencia Semanal (Meta: 4 semanas). 10 XP por semana, Max: 40 XP.
    // Usamos 'projects' filtrando por un flag (o simulamos si no hemos creado la tabla evidence)
    // Para simplificar, asumiremos que se guarda en una tabla ficticia 'weekly_evidence',
    // si no existe esto lanzará 0, pero la lógica visual funcionará igual.
    const { count: evidenceCount } = await _supabase
      .from('weekly_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .gte('created_at', startOfMonthISO);

    // 4. Informe Mensual (Si existe). 20 XP.
    const { count: reportCount } = await _supabase
      .from('teacher_reports')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .eq('month', new Date().getMonth() + 1)
      .eq('year', new Date().getFullYear());

    // CALCULO
    const attXP = Math.min((attendanceCount || 0) * 5, 20);
    const evalXP = Math.min((evalCount || 0) * 1, 20);
    const evidXP = Math.min((evidenceCount || 0) * 10, 40);
    const repXP = (reportCount || 0) > 0 ? 20 : 0;

    const totalXP = attXP + evalXP + evidXP + repXP;

    return { totalXP };

  } catch (err) {
    console.error('Error KPIs:', err);
    // Retorno fallback para demo
    return { totalXP: 15 };
  }
}

function renderTeacherSidebar({ totalXP }) {
  // Ahora seleccionamos el sidebar completo para añadirlo al final
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const existing = document.getElementById('gamification-sidebar');
  if (existing) existing.remove();

  // Obtener nombre del mes actual en español
  const monthName = new Date().toLocaleDateString('es-ES', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const div = document.createElement('div');
  div.id = 'gamification-sidebar';
  div.className = 'xp-container';
  div.style.marginTop = 'auto'; // Empujar al fondo si el contenedor padre es flex
  div.style.padding = '0 15px 20px';

  div.innerHTML = `
    <div style="background: var(--bg-color); border-radius: 12px; padding: 15px; border: 1px solid var(--border-color); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <h4 style="color: var(--primary-color); margin: 0 0 10px 0; font-size: 0.85rem; text-transform: uppercase; font-weight: 700;">⚡ Mi Desempeño (${capitalizedMonth})</h4>
      
      <div style="margin-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end;">
        <span style="color: var(--text-color); font-size: 2rem; font-weight: 700; line-height: 1;">${totalXP}</span>
        <span style="color: var(--text-light); font-size: 0.9rem;">/ 100 XP</span>
      </div>

      <div class="xp-bar-bg" style="height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
        <div class="xp-bar-fill" style="width: ${totalXP}%; background: linear-gradient(90deg, #f97316, #fbbf24); height: 100%;"></div>
      </div>
      
      <div style="font-size: 0.75rem; color: var(--text-light);">
        <div style="display:flex; justify-content: space-between; margin-bottom: 3px;">
            <span>📅 Asistencia:</span> 
            <span style="font-weight:600;">Max 20 XP</span>
        </div>
        <div style="display:flex; justify-content: space-between; margin-bottom: 3px;">
            <span>📝 Evaluación:</span> 
            <span style="font-weight:600;">Max 20 XP</span>
        </div>
        <div style="display:flex; justify-content: space-between; margin-bottom: 3px;">
            <span>📸 Evidencia (10/sem):</span> 
            <span style="font-weight:600;">Max 40 XP</span>
        </div>
        <div style="display:flex; justify-content: space-between;">
            <span>📋 Informe Mensual:</span> 
            <span style="font-weight:600;">Max 20 XP</span>
        </div>
      </div>
    </div>
  `;

  sidebar.appendChild(div);
}

function updateLoginStreak() {
  const streakKey = `streak_${currentUser.id} `;
  const lastLoginKey = `last_login_${currentUser.id} `;
  const today = new Date().toDateString();
  const lastLogin = localStorage.getItem(lastLoginKey);

  if (!lastLogin) {
    localStorage.setItem(streakKey, '1');
    localStorage.setItem(lastLoginKey, today);
    return;
  }

  if (lastLogin === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (lastLogin === yesterday.toDateString()) {
    let currentStreak = parseInt(localStorage.getItem(streakKey) || 1);
    localStorage.setItem(streakKey, (currentStreak + 1).toString());
    showToast(`🔥 ¡Racha de ${currentStreak + 1} días! Sigue así.`, 'info');
  } else {
    localStorage.setItem(streakKey, '1');
  }

  localStorage.setItem(lastLoginKey, today);
}

function checkBadgeCelebrations(earnedBadges) {
  if (!earnedBadges || earnedBadges.length === 0) return;

  const seenKey = `seen_badges_${currentUser.id} `;
  const seenBadges = JSON.parse(localStorage.getItem(seenKey) || '[]');

  const newBadges = earnedBadges.filter(b => !seenBadges.includes(b.badge_id));

  if (newBadges.length > 0) {
    const badgeId = newBadges[0].badge_id;
    const badgeInfo = BADGES.find(b => b.id === badgeId);

    if (badgeInfo) {
      setTimeout(() => showBadgeCelebrationModal(badgeInfo), 1500);
    }
    const updatedSeen = [...seenBadges, ...newBadges.map(b => b.badge_id)];
    localStorage.setItem(seenKey, JSON.stringify(updatedSeen));
  }
}

function showBadgeCelebrationModal(badge) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.zIndex = '10000';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px; border: 4px solid var(--primary-color);">
      <div class="badge-unlock-modal">
        <div class="badge-unlock-icon">${badge.icon}</div>
        <h2 class="celebration-title">¡NUEVA INSIGNIA!</h2>
        <h3 style="margin-bottom: 15px;">${badge.name}</h3>
        <p style="color: var(--text-light); margin-bottom: 25px;">${badge.description}</p>

        <div style="background: var(--light-gray); padding: 15px; border-radius: 12px; margin-bottom: 25px;">
          <small style="color: var(--primary-color); font-weight: 700;">+100 XP RECOMPENSA</small>
        </div>

        <button class="btn-primary" style="width: 100%;" onclick="this.closest('.modal').remove(); startBirthdayConfetti();">
          ¡Genial! 🚀
        </button>
      </div>
    </div>
    `;

  document.body.appendChild(modal);
  startBirthdayConfetti();
}
