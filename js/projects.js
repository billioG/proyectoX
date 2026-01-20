// ================================================
// GESTIÓN DE PROYECTOS - PARTE 1: INICIALIZACIÓN
// ================================================

if (typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    setTimeout(() => {
      if (currentUser) {
        initProjects();
      }
    }, 500);
  });
}

async function initProjects() {
  console.log('📦 Inicializando proyectos...');

  if (typeof setupVideoUpload === 'function') {
    setupVideoUpload();
  }

  if (typeof setupRealtime === 'function') {
    setupRealtime();
  }
}

async function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container) {
    console.warn('⚠️ feed-container no encontrado');
    return;
  }

  container.innerHTML = `
    <div style="grid-column: 1/-1; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; width: 100%;">
      ${Array(6).fill(0).map(() => `
        <div class="section-card" style="padding: 20px;">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text" style="width: 80%;"></div>
          <div class="skeleton skeleton-box" style="margin-top: 15px;"></div>
        </div>
      `).join('')}
    </div>
  `;

  try {
    const { data: projects, error } = await _supabase
      .from('projects')
      .select(`
        *,
        students(
          id,
          full_name,
          school_code,
          grade,
          section,
          schools(name)
        ),
        groups(
          name,
          group_members(student_id)
        )
      `);

    if (error) throw error;

    // 1. Verificar si el estudiante debe calificar al docente (1 vez por semana)
    let ratingPromptHTML = '';
    if (userRole === 'estudiante') {
      const student = projects.find(p => p.students?.id === currentUser.id)?.students;

      if (student) {
        const { data: assignment } = await _supabase
          .from('teacher_assignments')
          .select('teacher_id')
          .eq('school_code', student.school_code)
          .eq('grade', student.grade)
          .eq('section', student.section)
          .maybeSingle();

        if (assignment) {
          const { data: lastRating } = await _supabase
            .from('teacher_ratings')
            .select('created_at')
            .eq('student_id', currentUser.id)
            .eq('teacher_id', assignment.teacher_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const needsToRate = !lastRating || (new Date() - new Date(lastRating.created_at)) / (1000 * 60 * 60 * 24) >= 7;

          if (needsToRate) {
            ratingPromptHTML = `
               <div class="section-card" style="grid-column: 1/-1; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: white; display: flex; justify-content: space-between; align-items: center; padding: 20px; margin-bottom: 25px; border-radius: 12px; box-shadow: var(--shadow-md);">
                 <div style="display: flex; align-items: center; gap: 20px;">
                   <div style="font-size: 2.5rem;">👨‍🏫</div>
                   <div style="flex: 1;">
                     <h3 style="margin: 0; font-size: 1.2rem;">¡Tu opinión es importante!</h3>
                     <p style="margin: 5px 0 0; opacity: 0.9; font-size: 0.95rem;">No has calificado a tu docente esta semana. Ayúdanos a mejorar.</p>
                   </div>
                 </div>
                 <button class="btn-secondary" onclick="nav('profile')" style="background: white; color: var(--primary-color); border: none; font-weight: 700; padding: 10px 20px; min-width: 140px; margin-left: 15px;">
                   Calificar Ahora
                 </button>
               </div>
             `;
          }
        }
      }
    }

    if (!projects || projects.length === 0) {
      container.innerHTML = ratingPromptHTML + '<div class="empty-state" style="grid-column: 1/-1;">📭 No hay proyectos publicados aún</div>';
      return;
    }

    // Almacenar proyectos originales para filtrado
    window.allProjects = projects;

    // Ordenar por votes (likes) DESC, luego por score DESC para desempatar
    projects.sort((a, b) => {
      const votesA = a.votes || 0;
      const votesB = b.votes || 0;
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;

      if (votesB !== votesA) {
        return votesB - votesA;
      }
      return scoreB - scoreA;
    });

    // PANEL DOCENTE: REPORTES
    let teacherPanelHTML = '';
    if (userRole === 'docente' || userRole === 'admin') {
      const today = new Date().getDate();
      const showReportBtn = today >= 25 && today <= 30;

      teacherPanelHTML = `
        <div class="section-card" style="grid-column: 1/-1; background: var(--bg-card); display: flex; flex-wrap: wrap; gap: 20px; align-items: center; padding: 25px; margin-bottom: 25px; border-radius: 12px; border-left: 5px solid var(--primary-color); box-shadow: var(--shadow-sm);">
          <div style="flex: 1;">
            <h3 style="margin: 0; color: var(--primary-color); font-size: 1.3rem;">📋 Panel del Docente</h3>
            <p style="margin: 6px 0 0; color: var(--text-light);">Gestiona tus evidencias y reportes del programa.</p>
          </div>
          <div style="display: flex; gap: 10px;">
             <button class="btn-secondary" onclick="openWeeklyEvidenceModal()">
               <i class="fas fa-camera"></i> Evidencia Semanal
             </button>
             ${showReportBtn ? `
               <button class="btn-primary" onclick="openMonthlyReportModal()">
                 <i class="fas fa-file-alt"></i> Informe Mensual
               </button>
             ` : ''}
          </div>
        </div>
      `;
    }

    // Crear filtros
    const schools = [...new Set(projects.map(p => p.students?.schools?.name).filter(Boolean))].sort();
    const grades = [...new Set(projects.map(p => p.students?.grade).filter(Boolean))].sort();
    const sections = [...new Set(projects.map(p => p.students?.section).filter(Boolean))].sort();

    const filterHTML = `
      ${ratingPromptHTML}
      <div class="section-card projects-filter-container" style="grid-column: 1/-1; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px;">🔍 Filtros</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          <input 
            type="text" 
            id="filter-title" 
            class="input-field" 
            placeholder="Buscar por título..."
            onchange="applyFeedFilters()"
            style="margin: 0;"
          >
          <select id="filter-school" class="input-field" onchange="applyFeedFilters()" style="margin: 0;">
            <option value="">Todos los establecimientos</option>
            ${schools.map(s => `<option value="${s}">${sanitizeInput(s)}</option>`).join('')}
          </select>
          <select id="filter-grade" class="input-field" onchange="applyFeedFilters()" style="margin: 0;">
            <option value="">Todos los grados</option>
            ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
          <select id="filter-section" class="input-field" onchange="applyFeedFilters()" style="margin: 0;">
            <option value="">Todas las secciones</option>
            ${sections.map(s => `<option value="${s}">Sección ${s}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    const projectsHTML = projects.map(p => {
      const studentName = p.students?.full_name || 'Estudiante';
      const schoolName = p.students?.schools?.name || 'Establecimiento';
      const grade = p.students?.grade || '';
      const section = p.students?.section || '';
      const groupName = p.groups?.name || null;
      const hasScore = p.score && p.score > 0;

      // Control de visibilidad del punteo
      const isOwner = p.students?.id === currentUser?.id;
      const isTeacherOrAdmin = userRole === 'docente' || userRole === 'admin';
      const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
      const canSeeScore = isOwner || isTeacherOrAdmin || isGroupMember;

      return `
        <div class="project-card" data-title="${(p.title || '').toLowerCase()}" data-school="${schoolName}" data-grade="${grade}" data-section="${section}">
          ${hasScore && canSeeScore ? `<div class="score-badge">⭐ ${p.score}/100</div>` : ''}
          ${groupName ? `<div class="team-tag">👥 ${sanitizeInput(groupName)}</div>` : ''}
          
          <h3>${sanitizeInput(p.title)}</h3>
          
          <p class="project-meta">
            👤 ${sanitizeInput(studentName)}<br>
            🏫 ${sanitizeInput(schoolName)}<br>
            📚 ${grade} - ${section}
          </p>
          
          <p class="project-description">${sanitizeInput(p.description || '')}</p>
          
          ${p.video_url ? `
            <div class="video-box">
              <video controls preload="none">
                <source src="${p.video_url}" type="video/mp4">
              </video>
            </div>
          ` : ''}
          
          <div class="project-actions">
            <button class="btn-like ${isLikedByUser(p.id) ? 'liked' : ''}" onclick="toggleLike(${p.id})" id="like-btn-${p.id}">
              <i class="fas fa-heart"></i>
              <span id="like-count-${p.id}">${p.votes || 0}</span>
            </button>
            
            <button class="btn-secondary" onclick="viewProjectDetails(${p.id})">
              <i class="fas fa-eye"></i> Ver
            </button>
          </div>
          
          <small style="color: var(--text-light); display: block; padding: 10px 20px; font-size: 0.85rem;">
            ${formatDate(p.created_at)}
          </small>
        </div>
      `;
    }).join('');

    container.innerHTML = teacherPanelHTML + filterHTML + projectsHTML;

  } catch (err) {
    console.error('Error cargando proyectos:', err);
    container.innerHTML = '<div class="error-state" style="grid-column: 1/-1;">❌ Error al cargar proyectos</div>';
  }
}

// Función para aplicar filtros al feed
function applyFeedFilters() {
  const titleFilter = document.getElementById('filter-title')?.value.toLowerCase().trim() || '';
  const schoolFilter = document.getElementById('filter-school')?.value || '';
  const gradeFilter = document.getElementById('filter-grade')?.value || '';
  const sectionFilter = document.getElementById('filter-section')?.value || '';

  const projectCards = document.querySelectorAll('.project-card');
  let visibleCount = 0;

  projectCards.forEach(card => {
    const cardTitle = card.getAttribute('data-title')?.toLowerCase() || '';
    const cardSchool = card.getAttribute('data-school') || '';
    const cardGrade = card.getAttribute('data-grade') || '';
    const cardSection = card.getAttribute('data-section') || '';

    // Verificar si coincide con los filtros
    const matchTitle = !titleFilter || cardTitle.includes(titleFilter);
    const matchSchool = !schoolFilter || cardSchool === schoolFilter;
    const matchGrade = !gradeFilter || cardGrade === gradeFilter;
    const matchSection = !sectionFilter || cardSection === sectionFilter;

    const shouldShow = matchTitle && matchSchool && matchGrade && matchSection;
    card.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) visibleCount++;
  });

  // Mostrar/ocultar mensaje de sin resultados
  const emptyMessage = document.getElementById('no-projects-message');
  if (visibleCount === 0) {
    if (emptyMessage) {
      emptyMessage.style.display = 'block';
    } else {
      const container = document.getElementById('projects-container');
      const noProjectsDiv = document.createElement('div');
      noProjectsDiv.id = 'no-projects-message';
      noProjectsDiv.className = 'error-state';
      noProjectsDiv.style.gridColumn = '1/-1';
      noProjectsDiv.textContent = '😢 No hay proyectos que coincidan con los filtros';
      container.appendChild(noProjectsDiv);
    }
  } else if (emptyMessage) {
    emptyMessage.style.display = 'none';
  }
}

// ================================================
// PARTE 2: LIKES Y DETALLES DE PROYECTOS
// ================================================

function isLikedByUser(projectId) {
  if (!currentUser) return false;
  const likedProjects = JSON.parse(localStorage.getItem(`liked_${currentUser.id}`) || '[]');
  return likedProjects.includes(projectId);
}

async function toggleLike(projectId) {
  if (!currentUser) {
    return showToast('❌ Debes iniciar sesión', 'error');
  }

  const btn = document.getElementById(`like-btn-${projectId}`);
  const countSpan = document.getElementById(`like-count-${projectId}`);

  try {
    const { data: existingLike } = await _supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existingLike) {
      await _supabase.from('project_likes').delete().eq('id', existingLike.id);
      await _supabase.rpc('decrement_votes', { project_id: projectId });

      if (btn) btn.classList.remove('liked');
      if (countSpan) {
        const current = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = Math.max(0, current - 1);
      }

      let likedProjects = JSON.parse(localStorage.getItem(`liked_${currentUser.id}`) || '[]');
      likedProjects = likedProjects.filter(id => id !== projectId);
      localStorage.setItem(`liked_${currentUser.id}`, JSON.stringify(likedProjects));

    } else {
      await _supabase.from('project_likes').insert({
        project_id: projectId,
        user_id: currentUser.id
      });

      await _supabase.rpc('increment_votes', { project_id: projectId });

      if (btn) btn.classList.add('liked');
      if (countSpan) {
        const current = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = current + 1;
      }

      let likedProjects = JSON.parse(localStorage.getItem(`liked_${currentUser.id}`) || '[]');
      likedProjects.push(projectId);
      localStorage.setItem(`liked_${currentUser.id}`, JSON.stringify(likedProjects));
    }

    await loadFeed();

  } catch (err) {
    console.error('Error con Me Gusta:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function viewProjectDetails(projectId) {
  try {
    const { data: project, error } = await _supabase
      .from('projects')
      .select(`
        *,
        students(id, full_name, school_code, grade, section, schools(name)),
        groups(id, name, group_members(role, student_id, students(full_name))),
        evaluations!project_id(
          creativity_score,
          clarity_score,
          functionality_score,
          teamwork_score,
          social_impact_score,
          total_score,
          comments,
          feedback,
          created_at,
          teacher_id
        )
      `)
      .eq('id', projectId)
      .single();

    if (error) throw error;

    // DEBUG: Ver qué datos de evaluación estamos recibiendo
    console.log('📊 Project evaluations:', project.evaluations);
    console.log('📊 Project score:', project.score);

    // Verificar si el usuario actual es el propietario
    const isOwner = project.students?.id === currentUser.id;

    // Verificar si el usuario es miembro del grupo
    let isGroupMember = false;
    if (project.groups && project.groups.group_members) {
      isGroupMember = project.groups.group_members.some(m => m.student_id === currentUser.id);
    }

    // Docentes y admins pueden ver toda la información
    const isTeacherOrAdmin = userRole === 'docente' || userRole === 'admin';

    // Si no es propietario ni miembro del grupo, solo puede ver video y likes
    const canSeeFullInfo = isOwner || isGroupMember || isTeacherOrAdmin;

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 15px;">
            <h2>${sanitizeInput(project.title)}</h2>
            ${project.score && canSeeFullInfo ? `<span class="score-badge" style="position: static; margin: 0;">⭐ ${project.score}/100</span>` : ''}
          </div>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          ${!canSeeFullInfo ? `
            <div class="info-box" style="margin-bottom: 16px;">
              <p style="margin: 0; font-size: 0.9rem;">
                <i class="fas fa-lock"></i> <strong>Nota:</strong> Solo los integrantes del grupo pueden ver comentarios y calificación
              </p>
            </div>
          ` : ''}

          ${canSeeFullInfo ? `
            <div class="project-details-grid">
              <p><strong>👤 Estudiante:</strong> <span>${sanitizeInput(project.students?.full_name || 'N/A')}</span></p>
              <p><strong>🏫 Establecimiento:</strong> <span>${sanitizeInput(project.students?.schools?.name || 'N/A')}</span></p>
              <p><strong>📚 Grado:</strong> <span>${project.students?.grade} - Sección ${project.students?.section}</span></p>
              ${project.groups ? `<p><strong>👥 Grupo:</strong> <span>${sanitizeInput(project.groups.name)}</span></p>` : ''}
            </div>

            ${project.groups && project.groups.group_members?.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <strong>Integrantes del grupo:</strong>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">
                  ${project.groups.group_members.map(m => `
                    <div class="member-role-card ${m.role}">
                      <small style="font-weight: 600;">${getRoleLabel(m.role)}</small>
                      <p style="margin: 5px 0 0; font-size: 0.9rem;">${sanitizeInput(m.students?.full_name || 'N/A')}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div style="margin-bottom: 20px;">
              <strong>Descripción:</strong>
              <p style="margin-top: 8px;">${sanitizeInput(project.description || 'Sin descripción')}</p>
            </div>
          ` : ''}

          <h3 style="margin-top: 16px; margin-bottom: 12px;">📹 Video del Proyecto</h3>

          ${project.video_url ? `
            <div class="video-box" style="margin-bottom: 20px;">
              <video controls style="width: 100%;">
                <source src="${project.video_url}" type="video/mp4">
              </video>
            </div>
          ` : ''}

          ${canSeeFullInfo && (project.evaluations?.length > 0 || (project.score !== null && project.score !== undefined)) ? `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 10px; margin-top: 20px;">
              <h3 style="margin-bottom: 15px;">📊 Desglose de Calificación</h3>
              ${project.evaluations?.length > 0 ? project.evaluations.map(e => `
                <div style="margin-top: 5px;">
                  <div style="background: var(--bg-card); border-radius: 10px; padding: 20px; border: 1px solid var(--border-color); margin-bottom: 20px;">
                    <div style="display: grid; gap: 12px; margin-bottom: 15px;">
                      
                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🎨 Creatividad e Innovación</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${e.creativity_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🗣️ Claridad de Presentación</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${e.clarity_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">⚙️ Funcionalidad / Solución</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${e.functionality_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🤝 Trabajo en Equipo</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${e.teamwork_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🌍 Impacto Social</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${e.social_impact_score || 0}/20</span>
                      </div>
                      
                    </div>

                    <div style="background: var(--bg-hover); padding: 15px; border-radius: 8px; text-align: right; color: var(--text-color); border: 1px solid var(--border-color);">
                      <strong style="font-size: 1.1rem; color: var(--text-color);">Puntuación Final:</strong> 
                      <span style="font-size: 1.8rem; font-weight: 800; color: var(--success-color); margin-left: 10px;">${e.total_score}/100</span>
                    </div>

                    ${e.feedback || e.comments ? `
                      <div style="margin-top: 15px; background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid var(--info-color);">
                        <strong style="display: block; color: var(--info-color); margin-bottom: 5px; font-size: 0.95rem;">💬 Retroalimentación del Docente:</strong>
                        <p style="margin: 0; color: var(--text-color); line-height: 1.5; font-size: 0.95rem;">${sanitizeInput(e.feedback || e.comments)}</p>
                      </div>
                    ` : ''}
                  </div>
                  
                  <small style="color: var(--text-light); display: block; margin-top: 10px; text-align: right;">
                    Evaluado el ${formatDate(e.created_at)}
                  </small>
                </div>
              `).join('') : (project.creativity_score || project.clarity_score || project.functionality_score || project.teamwork_score || project.social_impact_score) ? `
                <div style="margin-top: 5px;">
                  <div style="background: var(--bg-card); border-radius: 10px; padding: 20px; border: 1px solid var(--border-color); margin-bottom: 20px;">
                    <div style="display: grid; gap: 12px; margin-bottom: 15px;">
                      
                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🎨 Creatividad e Innovación</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${project.creativity_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🗣️ Claridad de Presentación</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${project.clarity_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">⚙️ Funcionalidad / Solución</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${project.functionality_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🤝 Trabajo en Equipo</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${project.teamwork_score || 0}/20</span>
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px;">
                        <span style="color: var(--text-color); font-size: 0.95rem;">🌍 Impacto Social</span>
                        <span style="font-weight: 700; color: var(--primary-color);">${project.social_impact_score || 0}/20</span>
                      </div>
                      
                    </div>

                    <div style="background: var(--bg-hover); padding: 15px; border-radius: 8px; text-align: right; color: var(--text-color); border: 1px solid var(--border-color);">
                      <strong style="font-size: 1.1rem; color: var(--text-color);">Puntuación Final:</strong> 
                      <span style="font-size: 1.8rem; font-weight: 800; color: var(--success-color); margin-left: 10px;">${project.score}/100</span>
                    </div>
                  </div>
                </div>
              ` : `
                <div style="background: var(--primary-color); color: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                  <strong style="font-size: 2rem; display: block; margin-bottom: 5px;">${project.score}/100</strong>
                  <span style="opacity: 0.9; font-size: 1.1rem;">Calificación Total</span>
                  <p style="margin: 10px 0 0; font-size: 0.9rem; opacity: 0.9;">El docente asignó una nota directa sin desglose detallado.</p>
                </div>
              `}
            </div>
          ` : canSeeFullInfo ? `
            <div style="text-align: center; padding: 30px 20px; background: #fff9db; border: 2px dashed #ffe066; border-radius: 12px; margin-top: 20px;">
              <div style="font-size: 2.5rem; margin-bottom: 15px;">⏳</div>
              <h3 style="margin: 0 0 10px; color: #856404;">Proyecto en espera de calificación</h3>
              <p style="color: #666; margin-bottom: 20px;">Los detalles del punteo aparecerán aquí una vez que el docente califique el proyecto.</p>
              ${isTeacherOrAdmin ? `
                <button class="btn-primary" onclick="this.closest('.modal').remove(); nav('evaluation'); setTimeout(() => { 
                  const btn = document.querySelector('[onclick*=\"openEvaluationModal(${project.id})\"]');
                  if(btn) btn.click();
                }, 500)">
                  <i class="fas fa-edit"></i> Calificar ahora
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando detalles:', err);
    showToast('❌ Error al cargar detalles del proyecto', 'error');
  }
}

function getRoleLabel(role) {
  const roles = {
    'planner': '📋 Planner',
    'maker': '🔨 Maker',
    'speaker': '🎤 Speaker'
  };
  return roles[role] || role;
}
// ================================================
// PARTE 2: GRUPOS Y SUBIDA DE PROYECTOS
// ================================================

async function loadGroupsForUpload() {
  const select = document.getElementById('project-group');

  if (!select) {
    console.warn('⚠️ Select de grupos no encontrado');
    return;
  }

  if (!currentUser || userRole !== 'estudiante') {
    console.warn('⚠️ Usuario no válido para cargar grupos');
    return;
  }

  try {
    const { data: student } = await _supabase
      .from('students')
      .select('school_code, grade, section')
      .eq('id', currentUser.id)
      .single();

    if (!student) {
      console.warn('⚠️ No se encontró información del estudiante');
      return;
    }

    const { data: memberships } = await _supabase
      .from('group_members')
      .select(`
        group_id,
        groups(id, name)
      `)
      .eq('student_id', currentUser.id);

    select.innerHTML = '<option value="">Individual (sin grupo)</option>';

    if (memberships && memberships.length > 0) {
      memberships.forEach(m => {
        if (m.groups) {
          const opt = document.createElement('option');
          opt.value = m.groups.id;
          opt.textContent = m.groups.name;
          select.appendChild(opt);
        }
      });
    }
  } catch (err) {
    console.error('Error cargando grupos:', err);
  }
}

function setupVideoUpload() {
  const videoInput = document.getElementById('project-video');
  const preview = document.getElementById('video-preview');

  if (videoInput && preview) {
    videoInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `
          <video controls style="width:100%;max-height:300px;border-radius:10px;">
            <source src="${url}" type="${file.type}">
          </video>
          <p style="margin-top: 10px; color: var(--text-light); font-size: 0.9rem;">
            Tamaño: ${(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        `;
        preview.style.display = 'block';
      }
    });
  }
}

async function uploadProject() {
  if (userRole !== 'estudiante') {
    return showToast('❌ Solo estudiantes pueden subir proyectos', 'error');
  }

  const title = document.getElementById('project-title')?.value.trim();
  const description = document.getElementById('project-description')?.value.trim();
  const videoInput = document.getElementById('project-video');
  const groupId = document.getElementById('project-group')?.value || null;
  const btn = document.getElementById('btn-upload-project');

  if (!title || !description) {
    return showToast('❌ Completa título y descripción', 'error');
  }

  const videoFile = videoInput?.files[0];
  if (!videoFile) {
    return showToast('❌ Selecciona un video', 'error');
  }

  if (videoFile.size > 50 * 1024 * 1024) {
    return showToast('❌ El video no debe superar 50MB', 'error');
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo video...';
  }

  try {
    // 1. Subir video
    const sanitizeFileName = (name) => {
      return name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-zA-Z0-9.-]/g, "_") // Reemplazar caracteres especiales por guiones bajos
        .replace(/_{2,}/g, "_"); // Evitar guiones bajos dobles
    };

    const fileName = `${Date.now()}_${sanitizeFileName(videoFile.name)}`;
    const { data: uploadData, error: uploadError } = await _supabase.storage
      .from('project-videos')
      .upload(fileName, videoFile);

    if (uploadError) throw uploadError;

    const { data: urlData } = _supabase.storage
      .from('project-videos')
      .getPublicUrl(fileName);

    // 2. Crear proyecto
    const { data: newProject, error: projectError } = await _supabase
      .from('projects')
      .insert({
        user_id: currentUser.id,
        group_id: groupId,
        title: title,
        description: description,
        video_url: urlData.publicUrl
      })
      .select()
      .single();

    if (projectError) throw projectError;

    // 3. Notificar al docente asignado
    await notifyTeacherNewProject(currentUser.id, newProject.id);

    // 4. Verificar insignias
    if (typeof checkAndAwardBadges === 'function') {
      await checkAndAwardBadges(newProject.id, 0);
    }

    // 5. Rotar roles si es de grupo
    if (groupId) {
      await rotateGroupRoles(groupId);
    }

    showToast('✅ Proyecto publicado correctamente', 'success');

    // Limpiar formulario
    document.getElementById('project-title').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-video').value = '';
    document.getElementById('video-preview').style.display = 'none';
    document.getElementById('video-preview').innerHTML = '';

    await loadFeed();
    nav('feed');

  } catch (err) {
    console.error('Error subiendo proyecto:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-upload"></i> Publicar Proyecto';
    }
  }
}

async function notifyTeacherNewProject(studentId, projectId) {
  try {
    // Obtener información del estudiante
    const { data: student } = await _supabase
      .from('students')
      .select('school_code, grade, section')
      .eq('id', studentId)
      .single();

    if (!student) return;

    // Buscar docente asignado
    const { data: assignment } = await _supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('school_code', student.school_code)
      .eq('grade', student.grade)
      .eq('section', student.section)
      .maybeSingle();

    if (!assignment) {
      console.log('⚠️ No hay docente asignado para este grado');
      return;
    }

    // Crear notificación para el docente
    await _supabase
      .from('teacher_notifications')
      .insert({
        teacher_id: assignment.teacher_id,
        project_id: projectId,
        type: 'new_project',
        message: 'Nuevo proyecto publicado para evaluar',
        is_read: false
      });

    console.log('✅ Notificación enviada al docente');

  } catch (err) {
    console.error('Error enviando notificación:', err);
  }
}
// ================================================
// PARTE 3: REALTIME Y UTILIDADES
// ================================================

function setupRealtime() {
  const projectsChannel = _supabase
    .channel('projects-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      payload => {
        console.log('🔔 Cambio en proyectos:', payload);
        if (typeof loadFeed === 'function') {
          loadFeed();
        }
      }
    )
    .subscribe();
}

/**
 * Rota los roles del grupo en sentido de las manecillas del reloj
 * Planner -> Maker -> Speaker -> Helper -> Planner
 */
async function rotateGroupRoles(groupId) {
  try {
    const { data: members, error } = await _supabase
      .from('group_members')
      .select('id, role')
      .eq('group_id', groupId);

    if (error || !members) return;

    const rolesOrder = ['planner', 'maker', 'speaker', 'helper'];

    for (const member of members) {
      const currentIndex = rolesOrder.indexOf(member.role);
      if (currentIndex === -1) continue;

      const nextIndex = (currentIndex + 1) % rolesOrder.length;
      const nextRole = rolesOrder[nextIndex];

      await _supabase
        .from('group_members')
        .update({ role: nextRole })
        .eq('id', member.id);
    }

    console.log(`🔄 Roles rotados para el grupo ${groupId}`);
  } catch (err) {
    console.error('Error rotando roles:', err);
  }
}

console.log('✅ projects.js cargado completamente');
