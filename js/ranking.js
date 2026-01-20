// ================================================
// RANKING DE PROYECTOS - COMPLETO
// ================================================

async function loadRanking() {
  const container = document.getElementById('ranking-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando ranking...</div>';

  try {
    const { data: projects, error } = await _supabase
      .from('projects')
      .select(`
        *,
        students(id, full_name, school_code, grade, section, schools(name)),
        groups(name, group_members(student_id))
      `)
      .not('score', 'is', null)
      .order('votes', { ascending: false })
      .order('score', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!projects || projects.length === 0) {
      container.innerHTML = '<div class="empty-state">🏆 No hay proyectos calificados en el ranking aún</div>';
      return;
    }

    container.innerHTML = `
      <div class="section-card" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 1.5rem;">🏆 Top 20 Mejores Proyectos</h3>
        <p style="margin: 10px 0 0; opacity: 0.9;">Clasificados por puntuación y popularidad</p>
      </div>

      ${projects.map((p, index) => {
      let medal = '';
      let cardClass = '';

      if (index === 0) {
        medal = '🥇';
        cardClass = 'rank-1';
      } else if (index === 1) {
        medal = '🥈';
        cardClass = 'rank-2';
      } else if (index === 2) {
        medal = '🥉';
        cardClass = 'rank-3';
      }

      return `
          <div class="section-card ${cardClass}" style="margin-bottom: 15px; position: relative; ${index < 3 ? 'border-left: 5px solid #ffd700;' : ''}">
            <div style="display: flex; gap: 20px; align-items: center;">
              <div style="font-size: 3rem; min-width: 60px; text-align: center; font-weight: 700; ${index < 3 ? '' : 'color: var(--text-light);'}">
                ${medal || `#${index + 1}`}
              </div>
              
              <div style="flex: 1;">
                <h3 style="margin: 0 0 10px 0; font-size: 1.3rem;">${sanitizeInput(p.title)}</h3>
                <p style="color: var(--text-light); margin: 5px 0; font-size: 0.9rem;">
                  👤 ${sanitizeInput(p.students?.full_name || 'Estudiante')} • 
                  🏫 ${sanitizeInput(p.students?.schools?.name || '')}
                  ${p.groups ? ` • 👥 ${sanitizeInput(p.groups.name)}` : ''}
                </p>
                <p style="margin: 10px 0 0; color: var(--text-dark);">${sanitizeInput(p.description || '').substring(0, 150)}${p.description && p.description.length > 150 ? '...' : ''}</p>
              </div>

              <div style="text-align: center; min-width: 120px;">
                ${(() => {
          const isOwner = p.students?.id === currentUser?.id;
          const isTeacherOrAdmin = userRole === 'docente' || userRole === 'admin';
          const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
          const canSeeScore = isOwner || isTeacherOrAdmin || isGroupMember;

          if (canSeeScore) {
            return `
                      <div style="background: var(--primary-color); color: white; padding: 15px; border-radius: 12px; margin-bottom: 10px;">
                        <div style="font-size: 2rem; font-weight: 700;">${p.score}</div>
                        <small style="opacity: 0.9;">Puntos</small>
                      </div>
                    `;
          } else {
            return `
                      <div style="background: var(--light-gray); color: var(--text-light); padding: 15px; border-radius: 12px; margin-bottom: 10px; border: 1px dashed var(--border-color);">
                        <i class="fas fa-lock" style="font-size: 1.5rem; margin-bottom: 5px; display: block;"></i>
                        <small>Privado</small>
                      </div>
                    `;
          }
        })()}
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; color: var(--accent-color);">
                  <i class="fas fa-heart"></i>
                  <strong>${p.votes || 0}</strong>
                </div>
              </div>
            </div>

            <div style="margin-top: 15px; text-align: right;">
              <button class="btn-secondary btn-sm" onclick="viewProjectDetails(${p.id})">
                <i class="fas fa-eye"></i> Ver Detalles
              </button>
            </div>
          </div>
        `;
    }).join('')}
    `;

  } catch (err) {
    console.error('Error cargando ranking:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar el ranking</div>';
  }
}

console.log('✅ ranking.js cargado correctamente');
