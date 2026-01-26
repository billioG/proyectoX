// ================================================
// SISTEMA DE INSIGNIAS - ACTUALIZADO
// ================================================

async function checkAndAwardBadges(projectId, score) {
  if (!currentUser) return;

  try {
    const { data: project } = await _supabase
      .from('projects')
      .select('user_id, group_id, votes')
      .eq('id', projectId)
      .single();

    if (!project) return;

    // Obtener todos los estudiantes que deben ser premiados (el autor y su grupo si existe)
    let studentsToReward = [project.user_id];

    if (project.group_id) {
      const { data: groupMembers } = await _supabase
        .from('group_members')
        .select('student_id')
        .eq('group_id', project.group_id);

      if (groupMembers) {
        studentsToReward = [...new Set([...studentsToReward, ...groupMembers.map(m => m.student_id)])];
      }
    }

    for (const studentId of studentsToReward) {
      // Obtener todos los proyectos del estudiante (propios O de sus grupos)
      const { data: myGroups } = await _supabase
        .from('group_members')
        .select('group_id')
        .eq('student_id', studentId);

      const groupIds = myGroups?.map(g => g.group_id) || [];

      const { data: studentProjects } = await _supabase
        .from('projects')
        .select('id, score, votes')
        .or(`user_id.eq.${studentId}${groupIds.length > 0 ? `,group_id.in.(${groupIds.join(',')})` : ''}`);

      const totalProjects = studentProjects?.length || 0;
      const totalLikes = studentProjects?.reduce((sum, p) => sum + (p.votes || 0), 0) || 0;
      const highScores = studentProjects?.filter(p => p.score >= 85).length || 0;
      const excellentScores = studentProjects?.filter(p => p.score >= 90).length || 0;

      const badgesToAward = [];

      // Badge 1: Primera Publicación
      if (totalProjects >= 1) badgesToAward.push(1);

      // Badge 2: Estrella Brillante (10+ likes)
      if (totalLikes >= 10) badgesToAward.push(2);

      // Badge 3: Excelencia (90+)
      if (score >= 90 || excellentScores >= 1) badgesToAward.push(3);

      // Badge 5: Constancia (5+ proyectos)
      if (totalProjects >= 5) badgesToAward.push(5);

      // Badge 6: Popular (50+ likes)
      if (totalLikes >= 50) badgesToAward.push(6);

      // Badge 7: Maestro (3 con 85+)
      if (highScores >= 3) badgesToAward.push(7);

      // Otorgar insignias
      for (const bId of badgesToAward) {
        await awardBadge(studentId, bId);
      }
    }

    // Si quien evalúa es docente, verificar sus insignias también
    if (userRole === 'docente' || userRole === 'admin') {
      await checkTeacherBadges(currentUser.id);
    }

    console.log(`✅ Insignias verificadas para ${studentsToReward.length} estudiantes`);

  } catch (err) {
    console.error('Error verificando insignias:', err);
  }
}

async function awardBadge(userId, badgeId) {
  try {
    const isTeacherBadge = badgeId >= 100;
    const table = isTeacherBadge ? 'teacher_badges' : 'student_badges';
    const idColumn = isTeacherBadge ? 'teacher_id' : 'student_id';

    // Verificar si ya tiene la insignia
    const { data: existing } = await _supabase
      .from(table)
      .select('id')
      .eq(idColumn, userId)
      .eq('badge_id', badgeId)
      .maybeSingle();

    if (existing) return;

    // Otorgar insignia
    const { error } = await _supabase
      .from(table)
      .insert({
        [idColumn]: userId,
        badge_id: badgeId
      });

    if (error) {
      if (error.message && error.message.includes("Could not find the table")) {
        console.warn(`⚠️ La tabla ${table} no existe en Supabase. Ignorando insignia.`);
        return;
      }
      throw error;
    }

    // Notificar al usuario actual
    if (currentUser && userId === currentUser.id) {
      const badgeList = isTeacherBadge ? TEACHER_BADGES : BADGES;
      const badge = badgeList.find(b => b.id === badgeId);
      if (badge) {
        showToast(`🎉 ¡Nueva insignia desbloqueada: ${badge.icon} ${badge.name}!`, 'success');
      }
    }

  } catch (err) {
    // No loguear errores de tabla inexistente como errores graves
    if (err.message && err.message.includes("Could not find the table")) return;
    console.error('Error otorgando insignia:', err);
  }
}

async function checkAllBadges(studentId) {
  try {
    const { data: projects } = await _supabase
      .from('projects')
      .select('id, score, votes')
      .eq('user_id', studentId);

    const totalProjects = projects?.length || 0;
    const totalLikes = projects?.reduce((sum, p) => sum + (p.votes || 0), 0) || 0;
    const highScores = projects?.filter(p => p.score >= 85).length || 0;
    const excellentScores = projects?.filter(p => p.score >= 90).length || 0;

    const badgesToCheck = [];

    if (totalProjects >= 1) badgesToCheck.push(1);
    if (totalLikes >= 10) badgesToCheck.push(2);
    if (excellentScores >= 1) badgesToCheck.push(3);
    if (totalProjects >= 5) badgesToCheck.push(5);
    if (totalLikes >= 50) badgesToCheck.push(6);
    if (highScores >= 3) badgesToCheck.push(7);

    for (const badgeId of badgesToCheck) {
      await awardBadge(studentId, badgeId);
    }

    console.log('✅ Todas las insignias verificadas');

  } catch (err) {
    console.error('Error verificando todas las insignias:', err);
  }
}

/**
 * Verifica insignias específicas para docentes
 */
async function checkTeacherBadges(teacherId) {
  try {
    const { data: evaluations } = await _supabase
      .from('evaluations')
      .select('id, feedback')
      .eq('teacher_id', teacherId);

    const { data: groups } = await _supabase
      .from('groups')
      .select('id')
      .eq('created_by', teacherId);

    const totalEvals = evaluations?.length || 0;
    const totalGroups = groups?.length || 0;
    const feedbackCount = evaluations?.filter(e => e.feedback && e.feedback.length > 30).length || 0;

    const teacherBadgesToAward = [];

    // Badge 101: Evaluador Veloz (10+)
    if (totalEvals >= 10) teacherBadgesToAward.push(101);

    // Badge 103: Guía Maestro (5 grupos)
    if (totalGroups >= 5) teacherBadgesToAward.push(103);

    // Badge 104: Feedback de Calidad (20+)
    if (feedbackCount >= 20) teacherBadgesToAward.push(104);

    for (const badgeId of teacherBadgesToAward) {
      await awardBadge(teacherId, badgeId);
    }

    // Huevo de Pascua: Verificar si es Diciembre y tiene todos los retos
    const now = new Date();
    if (now.getMonth() === 11) { // 11 = Diciembre
      await checkFullYearChallenge(teacherId);
    }

  } catch (err) {
    console.error('Error verificando insignias de docente:', err);
  }
}

/**
 * Huevo de Pascua: Premio por completar todo el año
 */
async function checkFullYearChallenge(teacherId) {
  try {
    // En una implementación real, esto consultaría una tabla de 'retos_completados'
    // Por ahora, simulamos la verificación para habilitar el premio en Diciembre.
    const { data: badges } = await _supabase
      .from('teacher_badges')
      .select('badge_id')
      .eq('teacher_id', teacherId);

    const badgeIds = badges?.map(b => b.badge_id) || [];

    // Si logramos implementar un sistema de marcado de retos, aquí se validaría.
    // Por ahora dejamos la estructura lista.
    console.log('🔍 Verificando constancia anual para premio especial...');
  } catch (e) { }
}

// Verificar insignias al cargar perfil
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (currentUser) {
        if (userRole === 'estudiante') {
          checkAllBadges(currentUser.id);
        } else if (userRole === 'docente') {
          checkTeacherBadges(currentUser.id);
        }
      }
    }, 2000);
  });
}

console.log('✅ badges.js cargado correctamente');
