// ================================================
// SISTEMA DE INSIGNIAS - ACTUALIZADO
// ================================================

async function checkAndAwardBadges(projectId, score) {
  if (!currentUser) return;

  try {
    const { data: project } = await _supabase
      .from('projects')
      .select('user_id, votes')
      .eq('id', projectId)
      .single();

    if (!project) return;

    const studentId = project.user_id;

    // Obtener todos los proyectos del estudiante
    const { data: studentProjects } = await _supabase
      .from('projects')
      .select('id, score, votes')
      .eq('user_id', studentId);

    const totalProjects = studentProjects?.length || 0;
    const totalLikes = studentProjects?.reduce((sum, p) => sum + (p.votes || 0), 0) || 0;
    const highScores = studentProjects?.filter(p => p.score >= 85).length || 0;
    const excellentScores = studentProjects?.filter(p => p.score >= 90).length || 0;

    const badgesToAward = [];

    // Badge 1: Primera Publicación
    if (totalProjects >= 1) {
      badgesToAward.push(1);
    }
    
    // Badge 2: Estrella Brillante (10+ likes totales)
    if (totalLikes >= 10) {
      badgesToAward.push(2);
    }
    
    // Badge 3: Excelencia (proyecto con 90+)
    if (score >= 90 || excellentScores >= 1) {
      badgesToAward.push(3);
    }
    
    // Badge 5: Constancia (5+ proyectos)
    if (totalProjects >= 5) {
      badgesToAward.push(5);
    }
    
    // Badge 6: Popular (50+ likes totales)
    if (totalLikes >= 50) {
      badgesToAward.push(6);
    }
    
    // Badge 7: Maestro (3 proyectos con 85+)
    if (highScores >= 3) {
      badgesToAward.push(7);
    }

    // Otorgar insignias
    for (const badgeId of badgesToAward) {
      await awardBadge(studentId, badgeId);
    }

    console.log(`✅ Insignias verificadas para estudiante ${studentId}`);

  } catch (err) {
    console.error('Error verificando insignias:', err);
  }
}

async function awardBadge(studentId, badgeId) {
  try {
    // Verificar si ya tiene la insignia
    const { data: existing } = await _supabase
      .from('student_badges')
      .select('id')
      .eq('student_id', studentId)
      .eq('badge_id', badgeId)
      .maybeSingle();

    if (existing) {
      console.log(`⊘ Insignia ${badgeId} ya otorgada`);
      return;
    }

    // Otorgar insignia
    const { error } = await _supabase
      .from('student_badges')
      .insert({
        student_id: studentId,
        badge_id: badgeId
      });

    if (error) throw error;

    console.log(`✅ Insignia ${badgeId} otorgada`);

    // Notificar al estudiante si es el usuario actual
    if (currentUser && studentId === currentUser.id) {
      const badge = BADGES.find(b => b.id === badgeId);
      if (badge) {
        showToast(`🎉 ¡Nueva insignia desbloqueada: ${badge.icon} ${badge.name}!`, 'success');
      }
    }

  } catch (err) {
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

// Verificar insignias al cargar perfil de estudiante
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (currentUser && userRole === 'estudiante') {
        checkAllBadges(currentUser.id);
      }
    }, 2000);
  });
}

console.log('✅ badges.js cargado correctamente');
