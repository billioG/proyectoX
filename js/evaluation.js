// ================================================
// EVALUACIÓN - PARTE 1: CARGAR PROYECTOS
// ================================================

let currentEvalProjectId = null;

async function loadEvaluationProjects() {
  const container = document.getElementById('eval-projects-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando proyectos...</div>';

  try {
    let finalProjects;

    if (navigator.onLine) {
      if (userRole === 'docente') {
        await loadTeacherNotifications();
      }

      let query = _supabase
        .from('projects')
        .select(`
          *,
          students(full_name, school_code, grade, section, schools(name)),
          groups(name),
          evaluations(id, total_score)
        `)
        .order('created_at', { ascending: false });

      if (userRole === 'docente') {
        const { data: assignments } = await _supabase
          .from('teacher_assignments')
          .select('school_code, grade, section')
          .eq('teacher_id', currentUser.id);

        if (!assignments || assignments.length === 0) {
          container.innerHTML = '<div class="info-box">ℹ️ No tienes asignaciones de grados. Contacta al administrador.</div>';
          return;
        }

        const { data: projects, error } = await query;
        if (error) throw error;

        const filters = assignments.map(a => ({
          school_code: a.school_code,
          grade: a.grade,
          section: a.section
        }));

        finalProjects = projects.filter(p => {
          if (!p.students) return false;

          return filters.some(f => {
            const match = String(p.students.school_code) === String(f.school_code) &&
              String(p.students.grade) === String(f.grade) &&
              String(p.students.section) === String(f.section);
            return match;
          });
        });

        console.log(`📋 Proyectos filtrados para docente: ${finalProjects.length} de ${projects.length}`);
      } else {
        const { data: projects, error } = await query;
        if (error) throw error;
        finalProjects = projects;
      }

      // Guardar en caché
      await _syncManager.setCache('evaluation_projects', finalProjects);
    } else {
      // Offline: cargar de caché
      finalProjects = await _syncManager.getCache('evaluation_projects');
      if (!finalProjects) {
        container.innerHTML = '<div class="empty-state">❌ No hay datos guardados para evaluar offline. Carga esta sección con internet primero.</div>';
        return;
      }
      showToast('📂 Cargando proyectos desde caché (Modo Offline)', 'info');
    }

    renderEvaluationProjects(finalProjects, container);

  } catch (err) {
    console.error('Error cargando proyectos:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar proyectos</div>';
  }
}

function renderEvaluationProjects(projects, container) {
  if (!projects || projects.length === 0) {
    container.innerHTML = '<div class="empty-state">📭 No hay proyectos para evaluar</div>';
    return;
  }

  const notEvaluated = projects.filter(p => !p.evaluations || p.evaluations.length === 0);
  const evaluated = projects.filter(p => p.evaluations && p.evaluations.length > 0);

  container.innerHTML = `
    ${notEvaluated.length > 0 ? `
      <div class="alert-box">
        <h3>
          <i class="fas fa-exclamation-circle"></i> 
          Proyectos Pendientes de Evaluación (${notEvaluated.length})
        </h3>
        <p>
          Prioriza la evaluación de estos proyectos para completar el ranking
        </p>
      </div>
      ${notEvaluated.map(p => renderProjectCard(p, false)).join('')}
    ` : ''}

    ${evaluated.length > 0 ? `
      <div class="info-box" style="margin: 30px 0 20px;">
        <h3 style="margin: 0 0 8px; font-size: 1.1rem;">
          <i class="fas fa-check-circle"></i> 
          Proyectos Evaluados (${evaluated.length})
        </h3>
      </div>
      ${evaluated.map(p => renderProjectCard(p, true)).join('')}
    ` : ''}
  `;
}

function renderProjectCard(p, isEvaluated) {
  const studentName = p.students?.full_name || 'Estudiante';
  const schoolName = p.students?.schools?.name || 'Establecimiento';
  const grade = p.students?.grade || '';
  const section = p.students?.section || '';
  const groupName = p.groups?.name || null;
  const score = p.evaluations && p.evaluations.length > 0 ? p.evaluations[0].total_score : 0;

  return `
    <div class="section-card" style="margin-bottom: 16px; ${isEvaluated ? 'opacity: 0.85; border-left: 4px solid var(--success-color);' : 'border-left: 4px solid var(--warning-color);'}">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px; gap: 16px;">
        <div style="flex: 1;">
          <h3 style="margin: 0 0 8px; font-size: 1.2rem; color: var(--dark);">${sanitizeInput(p.title)}</h3>
          <p style="color: var(--text-light); font-size: 0.85rem; margin: 0; line-height: 1.4;">
            👤 ${sanitizeInput(studentName)} • 
            🏫 ${sanitizeInput(schoolName)} • 
            📚 ${grade} - ${section}
            ${groupName ? ` • 👥 ${sanitizeInput(groupName)}` : ''}
          </p>
        </div>
        ${isEvaluated ? `
          <div style="background: var(--success-color); color: white; padding: 10px 16px; border-radius: 8px; font-weight: 600; text-align: center; min-width: 80px;">
            <div style="font-size: 1.5rem;">${score}</div>
            <div style="font-size: 0.75rem; opacity: 0.9;">puntos</div>
          </div>
        ` : ''}
      </div>

      <p style="margin-bottom: 16px; color: var(--text-dark); line-height: 1.6;">${sanitizeInput(p.description || '')}</p>

      ${p.video_url ? `
        <div class="video-box" style="margin-bottom: 16px; border-radius: 8px; overflow: hidden;">
          <video controls style="width: 100%; max-height: 300px;">
            <source src="${p.video_url}" type="video/mp4">
          </video>
        </div>
      ` : ''}

      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
        ${isEvaluated ? `
          <button class="btn-secondary" onclick="viewEvaluationDetails(${p.id})">
            <i class="fas fa-eye"></i> Ver Evaluación
          </button>
        ` : `
          <button class="btn-primary" onclick="openEvaluationModal(${p.id})">
            <i class="fas fa-clipboard-check"></i> Evaluar Ahora
          </button>
        `}
      </div>

      <small style="color: var(--text-light); display: block; margin-top: 12px; font-size: 0.8rem;">
        Publicado: ${formatDate(p.created_at)}
      </small>
    </div>
  `;
}

async function loadTeacherNotifications() {
  if (userRole !== 'docente') return;

  try {
    // Primero obtener las asignaciones del docente
    const { data: assignments } = await _supabase
      .from('teacher_assignments')
      .select('school_code, grade, section')
      .eq('teacher_id', currentUser.id);

    if (!assignments || assignments.length === 0) {
      updateNotificationBadge(0);
      return;
    }

    // Obtener proyectos de esas secciones que NO tengan evaluación
    // Nota: Esto es más preciso que la tabla de notificaciones
    const { data: projects, error } = await _supabase
      .from('projects')
      .select(`
        id,
        score,
        students!inner(school_code, grade, section),
        evaluations(id)
      `);

    if (error) throw error;

    // Filtrar localmente los que coincidan con las asignaciones y no estén evaluados
    const pendingCount = projects.filter(p => {
      const hasEvaluation = (p.evaluations && p.evaluations.length > 0) || (p.score !== null && p.score > 0);
      if (hasEvaluation) return false;

      return assignments.some(a =>
        p.students?.school_code === a.school_code &&
        p.students?.grade === a.grade &&
        p.students?.section === a.section
      );
    }).length;

    updateNotificationBadge(pendingCount);

    // Opcional: Limpiar notificaciones obsoletas en segundo plano
    if (pendingCount === 0) {
      await _supabase
        .from('teacher_notifications')
        .update({ is_read: true })
        .eq('teacher_id', currentUser.id)
        .eq('is_read', false);
    }

  } catch (err) {
    console.error('Error calculando notificaciones reales:', err);
  }
}

function updateNotificationBadge(count) {
  const evaluateNavItems = document.querySelectorAll('.nav-item');

  evaluateNavItems.forEach(item => {
    if (item.textContent.includes('Evaluar')) {
      const existingBadge = item.querySelector('.notification-badge');
      if (existingBadge) existingBadge.remove();

      if (count > 0) {
        item.style.position = 'relative';
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = count;
        item.appendChild(badge);
      }
    }
  });
}
// ================================================
// PARTE 2: MODAL DE EVALUACIÓN
// ================================================

function openEvaluationModal(projectId) {
  currentEvalProjectId = projectId;

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'evaluation-modal';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px;">
      <div class="modal-header">
        <h2>📋 Evaluar Proyecto</h2>
        <button class="close-modal" onclick="closeEvaluationModal()">×</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 24px;">
          <h4 style="margin-bottom: 16px; color: var(--dark);">Criterios de Evaluación</h4>
          
          <div style="margin-bottom: 16px;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--dark);">
              <span>💡 Creatividad e Innovación</span>
              <span style="color: var(--text-light); font-weight: 400;">/ 20 pts</span>
            </label>
            <input 
              type="number" 
              class="input-field" 
              id="creativity_score" 
              min="0" 
              max="20" 
              value="0"
              onchange="updateEvaluationTotal()"
            >
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--dark);">
              <span>🎯 Claridad de Presentación</span>
              <span style="color: var(--text-light); font-weight: 400;">/ 20 pts</span>
            </label>
            <input 
              type="number" 
              class="input-field" 
              id="clarity_score" 
              min="0" 
              max="20" 
              value="0"
              onchange="updateEvaluationTotal()"
            >
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--dark);">
              <span>⚙️ Funcionalidad del Proyecto</span>
              <span style="color: var(--text-light); font-weight: 400;">/ 20 pts</span>
            </label>
            <input 
              type="number" 
              class="input-field" 
              id="functionality_score" 
              min="0" 
              max="20" 
              value="0"
              onchange="updateEvaluationTotal()"
            >
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--dark);">
              <span>👥 Trabajo en Equipo</span>
              <span style="color: var(--text-light); font-weight: 400;">/ 20 pts</span>
            </label>
            <input 
              type="number" 
              class="input-field" 
              id="teamwork_score" 
              min="0" 
              max="20" 
              value="0"
              onchange="updateEvaluationTotal()"
            >
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--dark);">
              <span>🌍 Impacto Social</span>
              <span style="color: var(--text-light); font-weight: 400;">/ 20 pts</span>
            </label>
            <input 
              type="number" 
              class="input-field" 
              id="social_impact_score" 
              min="0" 
              max="20" 
              value="0"
              onchange="updateEvaluationTotal()"
            >
          </div>

          <div style="text-align: center; padding: 24px; background: var(--light-gray); border-radius: 10px; margin: 20px 0;">
            <span style="font-size: 1.2rem; color: var(--text-light);">Puntuación Total</span><br>
            <span id="eval-total-score" style="font-size: 3rem; font-weight: 700; color: var(--primary-color);">0</span>
            <span style="font-size: 1.5rem; color: var(--text-light);">/100</span>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <label>
            <strong>📝 Retroalimentación para el Estudiante (Visible para el equipo):</strong>
            <textarea 
              id="eval-feedback" 
              class="input-field" 
              rows="4" 
              placeholder="Escribe retroalimentación constructiva para los estudiantes..."
              style="resize: vertical; margin-top: 8px;"
            ></textarea>
          </label>
          <small style="color: var(--text-light); display: block; margin-top: 6px; font-size: 0.85rem;">
            ℹ️ Este mensaje será visible para todos los integrantes del equipo
          </small>
        </div>

        <button class="btn-primary" onclick="submitEvaluation()" id="btn-submit-eval">
          <i class="fas fa-save"></i> Guardar Evaluación
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function closeEvaluationModal() {
  const modal = document.getElementById('evaluation-modal');
  if (modal) modal.remove();
  currentEvalProjectId = null;
}

function updateEvaluationTotal() {
  const creativity = parseInt(document.getElementById('creativity_score')?.value) || 0;
  const clarity = parseInt(document.getElementById('clarity_score')?.value) || 0;
  const functionality = parseInt(document.getElementById('functionality_score')?.value) || 0;
  const teamwork = parseInt(document.getElementById('teamwork_score')?.value) || 0;
  const socialImpact = parseInt(document.getElementById('social_impact_score')?.value) || 0;

  // Validar máximos
  if (creativity > 20) document.getElementById('creativity_score').value = 20;
  if (clarity > 20) document.getElementById('clarity_score').value = 20;
  if (functionality > 20) document.getElementById('functionality_score').value = 20;
  if (teamwork > 20) document.getElementById('teamwork_score').value = 20;
  if (socialImpact > 20) document.getElementById('social_impact_score').value = 20;

  const total = Math.min(creativity, 20) + Math.min(clarity, 20) + Math.min(functionality, 20) + Math.min(teamwork, 20) + Math.min(socialImpact, 20);

  const totalElement = document.getElementById('eval-total-score');
  if (totalElement) {
    totalElement.textContent = total;

    if (total >= 90) {
      totalElement.style.color = '#4caf50';
    } else if (total >= 70) {
      totalElement.style.color = '#ffc107';
    } else if (total >= 50) {
      totalElement.style.color = '#ff9800';
    } else {
      totalElement.style.color = '#f44336';
    }
  }
}
// ================================================
// PARTE 3: ENVIAR Y VER EVALUACIÓN
// ================================================

async function submitEvaluation() {
  if (!currentEvalProjectId) {
    return showToast('❌ Error: No hay proyecto seleccionado', 'error');
  }

  const creativity = parseInt(document.getElementById('creativity_score')?.value) || 0;
  const clarity = parseInt(document.getElementById('clarity_score')?.value) || 0;
  const functionality = parseInt(document.getElementById('functionality_score')?.value) || 0;
  const teamwork = parseInt(document.getElementById('teamwork_score')?.value) || 0;
  const socialImpact = parseInt(document.getElementById('social_impact_score')?.value) || 0;
  const feedback = document.getElementById('eval-feedback')?.value.trim() || '';

  const totalScore = creativity + clarity + functionality + teamwork + socialImpact;

  if (totalScore === 0) {
    return showToast('❌ Debes asignar al menos un punto', 'error');
  }

  const btn = document.getElementById('btn-submit-eval');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  }

  try {
    const evaluationData = {
      project_id: currentEvalProjectId,
      teacher_id: currentUser.id,
      creativity_score: creativity,
      clarity_score: clarity,
      functionality_score: functionality,
      teamwork_score: teamwork,
      social_impact_score: socialImpact,
      total_score: totalScore,
      feedback: feedback || null
    };

    let successOnline = false;
    if (navigator.onLine) {
      try {
        const { error: evalError } = await _supabase
          .from('evaluations')
          .upsert(evaluationData, { onConflict: 'project_id' });

        if (evalError) {
          // Si es un error real de Supabase (como el 409), lo mostramos y no encolamos
          console.error('❌ Supabase Error:', evalError);
          showToast(`❌ Error: ${evalError.message}`, 'error');
          return; // Detenemos aquí, no tiene sentido encolar un error de datos/esquema
        }

        await _supabase
          .from('projects')
          .update({ score: totalScore })
          .eq('id', currentEvalProjectId);

        await _supabase
          .from('teacher_notifications')
          .update({ is_read: true })
          .eq('project_id', currentEvalProjectId)
          .eq('teacher_id', currentUser.id);

        if (typeof checkAndAwardBadges === 'function') {
          await checkAndAwardBadges(currentEvalProjectId, totalScore);
        }

        // Actualizar contador de notificaciones inmediatamente
        if (typeof loadTeacherNotifications === 'function') {
          await loadTeacherNotifications();
        }

        showToast('✅ Evaluación guardada correctamente', 'success');
        successOnline = true;
      } catch (netErr) {
        // Esto solo ocurre si falla el fetch (sin internet real o DNS)
        console.warn('⚠️ Fallo de conexión, guardando offline:', netErr);
        successOnline = false;
      }
    }

    if (!successOnline) {
      await _syncManager.enqueue('save_evaluation', evaluationData);

      const cachedProjects = await _syncManager.getCache('evaluation_projects');
      if (cachedProjects) {
        const p = cachedProjects.find(p => p.id === currentEvalProjectId);
        if (p) {
          p.score = totalScore;
          p.evaluations = [{ id: 'temp-' + Date.now(), total_score: totalScore }];
          await _syncManager.setCache('evaluation_projects', cachedProjects);
        }
      }
      showToast('📥 Guardado en cola (Sin conexión estable)', 'warning');
    }

    closeEvaluationModal();
    await loadEvaluationProjects();

  } catch (err) {
    console.error('Error guardando evaluación:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar Evaluación';
    }
  }
}

async function viewEvaluationDetails(projectId) {
  try {
    const { data: evaluation, error } = await _supabase
      .from('evaluations')
      .select(`
        *,
        projects(
          title,
          students(full_name)
        )
      `)
      .eq('project_id', projectId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>📊 Detalle de Evaluación</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 8px;"><strong>📝 Proyecto:</strong> ${sanitizeInput(evaluation.projects?.title || 'N/A')}</p>
          <p style="margin-bottom: 8px;"><strong>👤 Estudiante:</strong> ${sanitizeInput(evaluation.projects?.students?.full_name || 'N/A')}</p>
          <p style="margin-bottom: 20px;"><strong>👨‍🏫 Evaluado por:</strong> Docente responsable</p>
          <p style="margin-bottom: 20px;"><strong>📅 Fecha:</strong> ${formatDate(evaluation.created_at)}</p>

          <h3 style="margin: 20px 0 16px; color: var(--dark); font-size: 1.2rem;">Puntuaciones por Criterio:</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px;">
            <div style="text-align: center; padding: 14px; background: var(--light-gray); border-radius: 8px;">
              <small style="color: var(--text-light); display: block; margin-bottom: 6px;">💡 Creatividad</small>
              <strong style="font-size: 1.4rem; color: var(--primary-color);">${evaluation.creativity_score}/20</strong>
            </div>
            <div style="text-align: center; padding: 14px; background: var(--light-gray); border-radius: 8px;">
              <small style="color: var(--text-light); display: block; margin-bottom: 6px;">🎯 Claridad</small>
              <strong style="font-size: 1.4rem; color: var(--primary-color);">${evaluation.clarity_score}/20</strong>
            </div>
            <div style="text-align: center; padding: 14px; background: var(--light-gray); border-radius: 8px;">
              <small style="color: var(--text-light); display: block; margin-bottom: 6px;">⚙️ Funcionalidad</small>
              <strong style="font-size: 1.4rem; color: var(--primary-color);">${evaluation.functionality_score}/20</strong>
            </div>
            <div style="text-align: center; padding: 14px; background: var(--light-gray); border-radius: 8px;">
              <small style="color: var(--text-light); display: block; margin-bottom: 6px;">👥 Trabajo Equipo</small>
              <strong style="font-size: 1.4rem; color: var(--primary-color);">${evaluation.teamwork_score}/20</strong>
            </div>
            <div style="text-align: center; padding: 14px; background: var(--light-gray); border-radius: 8px;">
              <small style="color: var(--text-light); display: block; margin-bottom: 6px;">🌍 Impacto Social</small>
              <strong style="font-size: 1.4rem; color: var(--primary-color);">${evaluation.social_impact_score}/20</strong>
            </div>
          </div>

          <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: white; border-radius: 12px; margin: 20px 0;">
            <span style="font-size: 1.2rem; opacity: 0.9;">Puntuación Total</span><br>
            <span style="font-size: 3rem; font-weight: 700;">${evaluation.total_score}</span>
            <span style="font-size: 1.5rem;">/100</span>
          </div>

          ${evaluation.feedback ? `
            <div style="margin-top: 20px;">
              <h4 style="margin-bottom: 10px; color: var(--dark);">📝 Retroalimentación del Docente:</h4>
              <div style="background: #e3f2fd; padding: 16px; border-radius: 8px; border-left: 4px solid var(--primary-color);">
                <p style="margin: 0; color: var(--text-dark); line-height: 1.6;">${sanitizeInput(evaluation.feedback)}</p>
              </div>
            </div>
          ` : ''}

        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando evaluación:', err);
    showToast('❌ Error al cargar evaluación', 'error');
  }
}

console.log('✅ evaluation.js cargado completamente');
