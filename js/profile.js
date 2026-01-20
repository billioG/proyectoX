// ================================================
// GESTIÓN DE PERFILES - PARTE 1 CORREGIDA
// ================================================

async function loadProfile() {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent) return;

  profileContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i></div>';

  try {
    if (userRole === 'estudiante') {
      await loadStudentProfile();
    } else if (userRole === 'docente') {
      await loadTeacherProfile();
    } else if (userRole === 'admin') {
      await loadAdminProfile();
    }
  } catch (err) {
    console.error('Error cargando perfil:', err);
    profileContent.innerHTML = '<div class="error-state">❌ Error al cargar perfil</div>';
  }
}

async function loadStudentProfile() {
  const profileContent = document.getElementById('profile-content');

  try {
    const { data: student, error } = await _supabase
      .from('students')
      .select(`
        *,
        schools(name, code)
      `)
      .eq('id', currentUser.id)
      .single();

    if (error) throw error;
    if (!student) {
      profileContent.innerHTML = '<div class="error-state">❌ No se encontró información del estudiante</div>';
      return;
    }

    const { data: projects } = await _supabase
      .from('projects')
      .select('id, title, score, votes, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    const { data: earnedBadges } = await _supabase
      .from('student_badges')
      .select('badge_id, earned_at')
      .eq('student_id', currentUser.id);

    const earnedBadgeIds = earnedBadges?.map(b => b.badge_id) || [];

    const { data: assignment } = await _supabase
      .from('teacher_assignments')
      .select(`
        teacher_id,
        teachers(id, full_name, email)
      `)
      .eq('school_code', student.school_code)
      .eq('grade', student.grade)
      .eq('section', student.section)
      .maybeSingle();

    const myTeacher = assignment?.teachers || null;

    let hasRatedThisWeek = false;
    let lastRatingDate = null;
    let needsToRate = false;

    if (myTeacher) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { data: recentRating } = await _supabase
        .from('teacher_ratings')
        .select('created_at')
        .eq('student_id', currentUser.id)
        .eq('teacher_id', myTeacher.id)
        .gte('created_at', oneWeekAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      hasRatedThisWeek = !!recentRating;

      if (recentRating) {
        lastRatingDate = new Date(recentRating.created_at);
      }

      const { data: lastRating } = await _supabase
        .from('teacher_ratings')
        .select('created_at')
        .eq('student_id', currentUser.id)
        .eq('teacher_id', myTeacher.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastRating) {
        needsToRate = true;
      } else {
        const lastDate = new Date(lastRating.created_at);
        const daysSinceLastRating = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
        needsToRate = daysSinceLastRating >= 7;
      }
      const teacherName = 'Docente';
    }

    // Obtener datos de gamificación
    const xpData = await calculateStudentXP(student.id);
    const totalXP = xpData?.totalXP || 0;
    const currentLevel = xpData?.level || 1;

    const totalProjects = projects?.length || 0;
    const totalLikes = projects?.reduce((sum, p) => sum + (p.votes || 0), 0) || 0;
    const avgScore = totalProjects > 0
      ? (projects.reduce((sum, p) => sum + (p.score || 0), 0) / totalProjects).toFixed(1)
      : 0;

    const displayName = student.full_name || currentUser.email?.split('@')[0] || 'Estudiante';

    // CONTINÚA en PARTE 2 con el HTML inline...
    renderStudentProfileHTMLInline(profileContent, student, displayName, myTeacher, needsToRate, hasRatedThisWeek, lastRatingDate, totalProjects, totalLikes, avgScore, earnedBadgeIds, earnedBadges, projects, totalXP, currentLevel);

  } catch (err) {
    console.error('Error en perfil estudiante:', err);
    profileContent.innerHTML = '<div class="error-state">❌ Error al cargar perfil del estudiante</div>';
  }
}

// ================================================
// FUNCIÓN RENDERIZADA: PERFIL ESTUDIANTE HTML
// ================================================

function renderStudentProfileHTMLInline(profileContent, student, displayName, myTeacher, needsToRate, hasRatedThisWeek, lastRatingDate, totalProjects, totalLikes, avgScore, earnedBadgeIds, earnedBadges, projects, totalXP, currentLevel) {
  const schoolName = student.schools?.name || 'Establecimiento';
  const gradeSection = `${student.grade} - Sección ${student.section}`;
  const birthDate = student.birth_date ? new Date(student.birth_date) : null;
  const isBirthday = checkIfBirthday(birthDate);
  const birthDateFormatted = birthDate ? formatDate(student.birth_date) : 'No especificada';

  if (isBirthday) {
    setTimeout(startBirthdayConfetti, 1000);
  }

  profileContent.innerHTML = `
    ${isBirthday ? `
      <div style="background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center; animation: pulse 1s infinite;">
        <h3 style="margin: 0; font-size: 1.5rem;">🎉 ¡FELIZ CUMPLEAÑOS! 🎉</h3>
        <p style="margin: 8px 0 0 0; font-size: 1.1rem;">¡Que disfrutes tu día especial!</p>
      </div>
    ` : ''}
    
    <div class="profile-header">
      <div class="profile-avatar ${isBirthday ? 'birthday-glow' : ''}">
        ${student.profile_photo_url ? `<img src="${student.profile_photo_url}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 2.5rem;">👤</span>'}
      </div>
      <div>
        <h2 style="margin: 0 0 6px 0; font-size: 1.4rem; font-weight: 600; color: var(--dark); text-transform: capitalize;">${sanitizeInput(displayName)}</h2>
        <p class="profile-role">👨‍🎓 Estudiante</p>
        <p style="color: var(--text-light); font-size: 0.9rem; margin-top: 4px;">
          <i class="far fa-envelope"></i> ${currentUser.email}
        </p>
        <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 8px; display: grid; gap: 4px;">
           <span><i class="fas fa-school" style="width: 20px; text-align: center; color: var(--primary-color);"></i> ${sanitizeInput(schoolName)}</span>
           <span><i class="fas fa-graduation-cap" style="width: 20px; text-align: center; color: var(--primary-color);"></i> ${student.grade} - Sección "${student.section}"</span>
        </div>
      </div>
      <button class="btn-secondary" onclick="openUploadPhotoModal()" style="align-self: flex-start; white-space: nowrap;">
        <i class="fas fa-camera"></i> Cambiar Foto
      </button>
    </div>

    <div style="background: var(--bg-card); padding: 16px; border-radius: 10px; box-shadow: var(--shadow); margin-bottom: 20px; border-left: 4px solid var(--primary-color);">
      <p style="margin: 8px 0; font-size: 0.95rem; color: var(--text-color);">
        <strong style="color: var(--heading-color);">📅 Fecha de Nacimiento:</strong> <span style="color: var(--text-light);">${birthDateFormatted}</span>
      </p>
      <p style="margin: 8px 0; font-size: 0.95rem; color: var(--text-color);">
        <strong style="color: var(--heading-color);">⚧️ Género:</strong> <span style="color: var(--text-light);">${student.gender ? (student.gender === 'masculino' ? 'Masculino 👨' : 'Femenino 👩') : 'No especificado'}</span>
      </p>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="background: linear-gradient(135deg, rgba(34, 211, 238, 0.1), transparent);">
        <i class="fas fa-trophy" style="color: #0891b2;"></i>
        <strong>${currentLevel}</strong>
        <span>Nivel</span>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, rgba(129, 140, 248, 0.1), transparent);">
        <i class="fas fa-bolt" style="color: #4f46e5;"></i>
        <strong>${totalXP}</strong>
        <span>XP Total</span>
      </div>
      <div class="stat-card">
        <i class="fas fa-project-diagram"></i>
        <strong>${totalProjects}</strong>
        <span>Proyectos</span>
      </div>
      <div class="stat-card">
        <i class="fas fa-thumbs-up"></i>
        <strong>${totalLikes}</strong>
        <span>Votos</span>
      </div>
      <div class="stat-card">
        <i class="fas fa-star"></i>
        <strong>${avgScore}</strong>
        <span>Promedio</span>
      </div>
      <div class="stat-card">
        <i class="fas fa-award"></i>
        <strong>${earnedBadges?.length || 0}</strong>
        <span>Insignias</span>
      </div>
    </div>

    ${myTeacher ? `
      <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">👨‍🏫 Mi Docente Asignado</h3>
    ` : `
      <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">👨‍🏫 Mi Docente</h3>
      <div class="info-box" style="background: var(--light-gray); padding: 15px; border-radius: 10px; color: var(--text-light); border: 1px dashed var(--border-color);">
        <p style="margin: 0;"><i class="fas fa-info-circle"></i> Aún no tienes un docente asignado para ${student.school_code} - ${student.grade} ${student.section}.</p>
      </div>
    `}

    ${myTeacher ? `
      ${needsToRate ? `
        <div style="background: linear-gradient(135deg, #fff3cd, #ffe69c); border: 2px solid #ffc107; color: #856404; padding: 16px; border-radius: 10px; margin-bottom: 16px; animation: pulse-warning 2s infinite;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas fa-exclamation-circle" style="font-size: 1.5rem;"></i>
            <div>
              <strong style="display: block; font-size: 1rem;">⚠️ Evaluación Pendiente</strong>
              <p style="margin: 4px 0 0 0; font-size: 0.9rem;">Debes evaluar a tu docente al menos una vez por semana</p>
            </div>
          </div>
        </div>
      ` : ''}
      <div class="section-card" style="background: linear-gradient(135deg, var(--light-gray), white); padding: 20px; border-left: 4px solid var(--primary-color);">
        <div style="display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: start;">
          <div>
            <strong style="display: block; margin-bottom: 10px; font-size: 1.1rem; color: var(--dark);">${sanitizeInput(myTeacher.full_name)}</strong>
            <p style="margin: 6px 0; color: var(--text-light); font-size: 0.9rem;">
              <i class="fas fa-envelope" style="margin-right: 8px; color: var(--primary-color);"></i> ${myTeacher.email}
            </p>
            <p style="margin: 6px 0; color: var(--text-light); font-size: 0.9rem;">
              <i class="fas fa-book" style="margin-right: 8px; color: var(--primary-color);"></i> Docente de ${gradeSection}
            </p>
          </div>
          <div style="text-align: right; min-width: 160px;">
            ${needsToRate ? `
              <button class="btn-primary" onclick="openSuggestionModal()" style="margin-bottom: 8px; width: 100%; white-space: nowrap; font-size: 0.9rem;">
                <i class="fas fa-star"></i> Evaluar
              </button>
            ` : `
              <div style="background: var(--primary-color); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; text-align: center; margin-bottom: 8px;">
                <i class="fas fa-check-circle"></i> Evaluado
              </div>
            `}
            ${hasRatedThisWeek && lastRatingDate ? `
              <small style="color: var(--text-light); display: block; font-size: 0.75rem; line-height: 1.3;">
                Última: ${formatDate(lastRatingDate.toISOString())}
              </small>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">📚 Mis Proyectos</h3>
    ${!projects || projects.length === 0 ? `
      <div class="empty-state" style="text-align: center; padding: 40px 20px;">
        <p style="font-size: 1.2rem; margin-bottom: 10px;">📭 Sin proyectos aún</p>
        <p style="color: var(--text-light);">Crea tu primer proyecto para comenzar</p>
      </div>
    ` : `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
        ${projects.map(p => `
          <div class="section-card" style="cursor: pointer; transition: all 0.3s; display: flex; flex-direction: column;" onclick="nav('projects', '${p.id}')">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; gap: 8px;">
              <h4 style="margin: 0; color: var(--dark); flex: 1; font-size: 1rem;">${sanitizeInput(p.title)}</h4>
              <span style="background: var(--primary-color); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; white-space: nowrap; flex-shrink: 0;">
                ⭐ ${p.score || 0}
              </span>
            </div>
            <div style="display: flex; gap: 14px; color: var(--text-light); font-size: 0.85rem; margin-top: auto; flex-wrap: wrap;">
              <span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-thumbs-up" style="font-size: 0.9rem;"></i> ${p.votes || 0}</span>
              <span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-calendar" style="font-size: 0.9rem;"></i> ${formatDate(p.created_at)}</span>
            </div>
              <span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-calendar" style="font-size: 0.9rem;"></i> ${formatDate(p.created_at)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `}

    <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">🏆 Mis Insignias</h3>
    <div class="section-card">
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 16px; text-align: center;">
        ${BADGES.map(b => {
    const isEarned = earnedBadgeIds.includes(b.id);
    const earnedInfo = earnedBadges?.find(eb => eb.badge_id === b.id);

    return `
            <div class="badge-item ${isEarned ? 'unlocked' : 'locked'}" title="${sanitizeInput(b.description)}">
              <div class="badge-icon">${b.icon}</div>
              <div class="badge-name">${sanitizeInput(b.name)}</div>
              ${isEarned && earnedInfo ? `
                <small style="color: var(--primary-color); font-size: 0.75rem; font-weight: 600;">
                  ${formatDate(earnedInfo.earned_at)}
                </small>
              ` : `
                <small class="badge-desc">${sanitizeInput(b.description)}</small>
              `}
            </div>
          `;
  }).join('')}
      </div>
    </div>


  `;
}
// ================================================
// PARTE 2: MODALES DE FOTO Y SUGERENCIAS
// ================================================

function openUploadPhotoModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'upload-photo-modal';

  modal.innerHTML = `
    < div class="modal-content" >
      <div class="modal-header">
        <h2>📷 Cambiar Foto de Perfil</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <input 
          type="file" 
          id="photo-input" 
          accept="image/*" 
          class="input-field"
          onchange="previewPhoto(this)"
        >
        
        <div id="photo-preview" style="text-align: center; margin: 20px 0; display: none;">
          <img id="preview-image" style="max-width: 100%; max-height: 300px; border-radius: 10px; box-shadow: var(--shadow);">
        </div>
        
        <button class="btn-primary" onclick="uploadProfilePhoto()" id="btn-upload-photo">
          <i class="fas fa-upload"></i> Subir Foto
        </button>
      </div>
    </div >
    `;

  document.body.appendChild(modal);
}

function previewPhoto(input) {
  const preview = document.getElementById('photo-preview');
  const image = document.getElementById('preview-image');

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      image.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function uploadProfilePhoto() {
  const fileInput = document.getElementById('photo-input');
  const file = fileInput?.files[0];
  const btn = document.getElementById('btn-upload-photo');

  if (!file) {
    return showToast('❌ Selecciona una foto', 'error');
  }

  if (file.size > 5 * 1024 * 1024) {
    return showToast('❌ La foto no debe superar 5MB', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';

  try {
    const fileName = `${currentUser.id}_${Date.now()}.${file.name.split('.').pop()} `;

    const { data: uploadData, error: uploadError } = await _supabase.storage
      .from('profile-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = _supabase.storage
      .from('profile-photos')
      .getPublicUrl(fileName);

    let updateError = null;

    if (userRole === 'estudiante') {
      const { error } = await _supabase
        .from('students')
        .update({ profile_photo_url: urlData.publicUrl })
        .eq('id', currentUser.id);
      updateError = error;
    } else if (userRole === 'docente') {
      const { error } = await _supabase
        .from('teachers')
        .update({ profile_photo_url: urlData.publicUrl })
        .eq('id', currentUser.id);
      updateError = error;
    } else if (userRole === 'admin') {
      const { error } = await _supabase
        .from('admins')
        .update({ profile_photo_url: urlData.publicUrl })
        .eq('id', currentUser.id);
      updateError = error;
    }

    if (updateError) throw updateError;

    showToast('✅ Foto de perfil actualizada', 'success');
    document.getElementById('upload-photo-modal').remove();
    await loadProfile();

  } catch (err) {
    console.error('Error subiendo foto:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Subir Foto';
  }
}

function openSuggestionModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'suggestion-modal';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>💡 Buzón de Sugerencias</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <label>
          <strong>Tipo de mensaje:</strong>
          <select id="suggestion-type" class="input-field" onchange="toggleRatingSection()">
            <option value="suggestion">💬 Sugerencia General</option>
            <option value="rating">⭐ Evaluar a mi Docente</option>
          </select>
        </label>

        <div id="rating-section" style="display: none; margin: 20px 0;">
          <label><strong>Calificación:</strong></label>
          <div style="text-align: center; margin: 16px 0;">
            <div id="suggestion-rating-stars" style="font-size: 2.5rem; cursor: pointer;">
              ${[1, 2, 3, 4, 5].map(i => `
                <span 
                  class="suggestion-rating-star" 
                  data-value="${i}" 
                  onclick="selectSuggestionRating(${i})"
                  style="opacity: 0.3; transition: all 0.2s; margin: 0 4px; display: inline-block;"
                >⭐</span>
              `).join('')}
            </div>
            <p id="suggestion-rating-text" style="margin-top: 10px; font-weight: 600; color: var(--dark); min-height: 24px;"></p>
          </div>
        </div>

        <label>
          <strong>Mensaje:</strong>
          <textarea 
            id="suggestion-message" 
            rows="5" 
            placeholder="Escribe tu sugerencia o comentario sobre tu docente..."
            class="input-field"
            style="resize: vertical; margin-top: 8px;"
          ></textarea>
        </label>

        <button class="btn-primary" onclick="submitSuggestion()" id="btn-submit-suggestion" style="margin-top: 16px;">
          <i class="fas fa-paper-plane"></i> Enviar
        </button>
      </div>
    </div >
    `;

  document.body.appendChild(modal);
}

let suggestionRatingValue = 0;

function toggleRatingSection() {
  const type = document.getElementById('suggestion-type')?.value;
  const ratingSection = document.getElementById('rating-section');

  if (type === 'rating') {
    ratingSection.style.display = 'block';
  } else {
    ratingSection.style.display = 'none';
    suggestionRatingValue = 0;
    document.querySelectorAll('.suggestion-rating-star').forEach(star => {
      star.style.opacity = '0.3';
      star.style.transform = 'scale(1)';
    });
    const ratingText = document.getElementById('suggestion-rating-text');
    if (ratingText) ratingText.textContent = '';
  }
}

function selectSuggestionRating(rating) {
  suggestionRatingValue = rating;

  document.querySelectorAll('.suggestion-rating-star').forEach((star, index) => {
    star.style.opacity = index < rating ? '1' : '0.3';
    star.style.transform = index < rating ? 'scale(1.15)' : 'scale(1)';
  });

  const ratingTexts = {
    1: '😞 Muy insatisfecho',
    2: '😕 Insatisfecho',
    3: '😐 Regular',
    4: '😊 Satisfecho',
    5: '🤩 Muy satisfecho'
  };

  const ratingText = document.getElementById('suggestion-rating-text');
  if (ratingText) {
    ratingText.textContent = ratingTexts[rating] || '';
  }
}
// ================================================
// PARTE 3: ENVIAR SUGERENCIA Y CALIFICAR DOCENTE
// ================================================

async function submitSuggestion() {
  const type = document.getElementById('suggestion-type')?.value;
  const message = document.getElementById('suggestion-message')?.value.trim();
  const btn = document.getElementById('btn-submit-suggestion');

  if (!message) {
    return showToast('❌ Escribe un mensaje', 'error');
  }

  if (type === 'rating' && suggestionRatingValue === 0) {
    return showToast('❌ Selecciona una calificación', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    const { data: student } = await _supabase
      .from('students')
      .select('school_code, grade, section')
      .eq('id', currentUser.id)
      .single();

    if (!student) {
      throw new Error('No se encontró información del estudiante');
    }

    const { data: assignment } = await _supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('school_code', student.school_code)
      .eq('grade', student.grade)
      .eq('section', student.section)
      .maybeSingle();

    if (type === 'rating' && assignment) {
      const { error: ratingError } = await _supabase
        .from('teacher_ratings')
        .insert({
          student_id: currentUser.id,
          teacher_id: assignment.teacher_id,
          rating: suggestionRatingValue,
          message: message
        });

      if (ratingError) {
        if (ratingError.message.includes('duplicate') || ratingError.code === '23505') {
          showToast('⚠️ Ya calificaste a tu docente esta semana', 'warning');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
          return;
        }
        throw ratingError;
      }

      showToast('✅ Calificación enviada al docente', 'success');
    } else {
      const { error } = await _supabase
        .from('student_suggestions')
        .insert({
          student_id: currentUser.id,
          type: 'suggestion',
          message: message,
          rating: null
        });

      if (error) throw error;

      showToast('✅ Sugerencia enviada correctamente', 'success');
    }

    document.getElementById('suggestion-modal').remove();
    suggestionRatingValue = 0;
    await loadProfile();

  } catch (err) {
    console.error('Error enviando sugerencia:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
  }
}

function openRateTeacherModal(teacherId, teacherName) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'rate-teacher-modal';

  modal.innerHTML = `
    < div class="modal-content" >
      <div class="modal-header">
        <h2>⭐ Calificar a ${sanitizeInput(teacherName)}</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="text-align: center; margin-bottom: 24px; color: var(--text-light); font-size: 0.95rem;">
          Califica el desempeño de tu docente del 1 al 5 estrellas
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <div id="rating-stars" style="font-size: 3rem; cursor: pointer;">
            ${[1, 2, 3, 4, 5].map(i => `
              <span 
                class="rating-star" 
                data-value="${i}" 
                onclick="selectTeacherRating(${i})"
                style="opacity: 0.3; transition: all 0.2s; margin: 0 6px; display: inline-block;"
              >⭐</span>
            `).join('')}
          </div>
          <p id="rating-text" style="margin-top: 16px; font-weight: 600; color: var(--dark); font-size: 1.1rem; min-height: 28px;"></p>
        </div>

        <label>
          <strong>Mensaje (opcional):</strong>
          <textarea 
            id="teacher-rating-message" 
            rows="4" 
            placeholder="Escribe un comentario sobre tu docente..."
            class="input-field"
            style="resize: vertical; margin-top: 8px;"
          ></textarea>
        </label>
        <small style="color: var(--text-light); display: block; margin-top: 8px; font-size: 0.85rem;">
          ℹ️ Tu mensaje solo será visible para el administrador. El docente solo verá tu calificación promedio.
        </small>

        <button class="btn-primary" onclick="submitTeacherRating('${teacherId}')" id="btn-rate-teacher" style="margin-top: 16px;">
          <i class="fas fa-star"></i> Enviar Calificación
        </button>
      </div>
    </div >
    `;

  document.body.appendChild(modal);
}

let selectedTeacherRating = 0;

function selectTeacherRating(rating) {
  selectedTeacherRating = rating;

  document.querySelectorAll('.rating-star').forEach((star, index) => {
    star.style.opacity = index < rating ? '1' : '0.3';
    star.style.transform = index < rating ? 'scale(1.15)' : 'scale(1)';
  });

  const ratingTexts = {
    1: '😞 Muy insatisfecho',
    2: '😕 Insatisfecho',
    3: '😐 Regular',
    4: '😊 Satisfecho',
    5: '🤩 Muy satisfecho'
  };

  const ratingText = document.getElementById('rating-text');
  if (ratingText) {
    ratingText.textContent = ratingTexts[rating] || '';
  }
}

async function submitTeacherRating(teacherId) {
  if (selectedTeacherRating === 0) {
    return showToast('❌ Selecciona una calificación', 'error');
  }

  const message = document.getElementById('teacher-rating-message')?.value.trim();
  const btn = document.getElementById('btn-rate-teacher');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    const { error } = await _supabase
      .from('teacher_ratings')
      .insert({
        student_id: currentUser.id,
        teacher_id: teacherId,
        rating: selectedTeacherRating,
        message: message || null
      });

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        showToast('⚠️ Ya calificaste a este docente esta semana', 'warning');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-star"></i> Enviar Calificación';
        return;
      }
      throw error;
    }

    showToast('✅ Calificación enviada correctamente', 'success');
    document.getElementById('rate-teacher-modal').remove();
    selectedTeacherRating = 0;
    await loadProfile();

  } catch (err) {
    console.error('Error enviando calificación:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-star"></i> Enviar Calificación';
  }
}
// ================================================
// PARTE 4A: PERFIL DOCENTE
// ================================================

async function loadTeacherProfile() {
  const profileContent = document.getElementById('profile-content');

  try {
    const { data: teacher } = await _supabase
      .from('teachers')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    const displayName = teacher?.full_name || currentUser?.email?.split('@')[0] || 'Docente';
    const birthDate = teacher?.birth_date ? new Date(teacher.birth_date) : null;
    const isBirthday = checkIfBirthday(birthDate);
    const birthDateFormatted = birthDate ? formatDate(teacher.birth_date) : 'No especificada';

    const { data: assignments } = await _supabase
      .from('teacher_assignments')
      .select(`
  school_code,
    grade,
    section,
    schools(name)
      `)
      .eq('teacher_id', currentUser.id);

    const { data: ratings } = await _supabase
      .from('teacher_ratings')
      .select('rating')
      .eq('teacher_id', currentUser.id);

    const { data: evaluations } = await _supabase
      .from('evaluations')
      .select('id')
      .eq('teacher_id', currentUser.id);

    const avgRating = ratings && ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
      : 0;

    profileContent.innerHTML = `
      ${isBirthday ? `
        <div style="background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center; animation: pulse 1s infinite;">
          <h3 style="margin: 0; font-size: 1.5rem;">🎉 ¡FELIZ CUMPLEAÑOS! 🎉</h3>
          <p style="margin: 8px 0 0 0; font-size: 1.1rem;">¡Que disfrutes tu día especial!</p>
        </div>
      ` : ''
      }
      
      <div class="profile-header">
        <div class="profile-avatar">
          ${teacher.profile_photo_url ? `<img src="${teacher.profile_photo_url}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 2.5rem;">👨‍🏫</span>'}
        </div>
        <div>
          <h2 style="margin: 0 0 6px 0; font-size: 1.6rem;">${sanitizeInput(displayName)}</h2>
          <p class="profile-role">👨‍🏫 Docente</p>
          <p style="color: var(--text-light); font-size: 0.9rem; margin-top: 4px;">${currentUser.email}</p>
        </div>
        <button class="btn-secondary" onclick="openUploadPhotoModal()" style="align-self: flex-start; white-space: nowrap;">
          <i class="fas fa-camera"></i> Cambiar Foto
        </button>
      </div>

      <div style="background: white; padding: 16px; border-radius: 10px; box-shadow: var(--shadow); margin-bottom: 20px; border-left: 4px solid var(--primary-color);">
        <p style="margin: 8px 0; font-size: 0.95rem; color: var(--text-dark);">
          <strong style="color: var(--dark);">📅 Fecha de Nacimiento:</strong> <span style="color: var(--text-light);">${birthDateFormatted}</span>
        </p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <i class="fas fa-school"></i>
          <strong>${assignments?.length || 0}</strong>
          <span>Asignaciones</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-clipboard-check"></i>
          <strong>${evaluations?.length || 0}</strong>
          <span>Evaluaciones</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-star"></i>
          <strong>${avgRating}</strong>
          <span>Calificación Promedio</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-users"></i>
          <strong>${ratings?.length || 0}</strong>
          <span>Calificaciones</span>
        </div>
      </div>

      <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">🏫 Mis Asignaciones</h3>
      ${!assignments || assignments.length === 0 ? '<div class="empty-state">No tienes asignaciones</div>' : `
        <div class="section-card">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
            ${assignments.map(a => `
              <div style="padding: 16px; background: var(--light-gray); border-radius: 8px; border-left: 4px solid var(--primary-color);">
                <strong style="display: block; margin-bottom: 6px; color: var(--dark); font-size: 0.95rem;">${sanitizeInput(a.schools?.name || 'Establecimiento')}</strong>
                <p style="margin: 0; color: var(--text-light); font-size: 0.85rem;">
                  📚 ${a.grade} - Sección ${a.section}
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      `}

      <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">⭐ Tu Calificación Promedio</h3>
      <div class="section-card" style="text-align: center;">
        <div style="padding: 32px; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: white; border-radius: 12px;">
          <span style="font-size: 1.2rem; opacity: 0.9; display: block; margin-bottom: 12px;">Calificación de Estudiantes</span>
          <span style="font-size: 3.5rem; font-weight: 700; display: block;">${avgRating}</span>
          <span style="font-size: 1.5rem; opacity: 0.9;">/5.0</span>
          <div style="margin-top: 16px; font-size: 2rem;">
            ${'⭐'.repeat(Math.round(parseFloat(avgRating)))}${'☆'.repeat(5 - Math.round(parseFloat(avgRating)))}
          </div>
          <small style="opacity: 0.9; font-size: 0.9rem; display: block; margin-top: 12px;">
            Basado en ${ratings?.length || 0} calificación(es)
          </small>
        </div>
      </div>
  `;

  } catch (err) {
    console.error('Error en perfil docente:', err);
    profileContent.innerHTML = '<div class="error-state">❌ Error al cargar perfil del docente</div>';
  }
}
// ================================================
// PARTE 4B: PERFIL ADMIN Y FUNCIONES (FINAL)
// ================================================

async function loadAdminProfile() {
  const profileContent = document.getElementById('profile-content');

  try {
    const [projectsRes, studentsRes, teachersRes, schoolsRes, groupsRes] = await Promise.all([
      _supabase.from('projects').select('*', { count: 'exact', head: true }),
      _supabase.from('students').select('*', { count: 'exact', head: true }),
      _supabase.from('teachers').select('*', { count: 'exact', head: true }),
      _supabase.from('schools').select('*', { count: 'exact', head: true }),
      _supabase.from('groups').select('*', { count: 'exact', head: true })
    ]);

    const totalProjects = projectsRes.count || 0;
    const totalStudents = studentsRes.count || 0;
    const totalTeachers = teachersRes.count || 0;
    const totalSchools = schoolsRes.count || 0;
    const totalGroups = groupsRes.count || 0;

    const { data: evaluations } = await _supabase.from('evaluations').select('total_score');
    const { data: ratings } = await _supabase.from('teacher_ratings').select('rating, message, created_at, students(full_name), teachers(full_name)');

    const avgScore = evaluations && evaluations.length > 0
      ? (evaluations.reduce((sum, e) => sum + (e.total_score || 0), 0) / evaluations.length).toFixed(1)
      : 0;

    const avgTeacherRating = ratings && ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
      : 0;

    const commentsCount = ratings?.filter(r => r.message).length || 0;

    profileContent.innerHTML = `
    < div class="profile-header" >
        <div class="profile-avatar">
          <span style="font-size: 2.5rem;">👑</span>
        </div>
        <div>
          <h2 style="margin: 0 0 6px 0; font-size: 1.6rem;">Panel de Administración</h2>
          <p class="profile-role">👑 Administrador del Sistema</p>
          <p style="color: var(--text-light); font-size: 0.9rem; margin-top: 4px;">${currentUser.email}</p>
        </div>
        <button class="btn-secondary" onclick="exportAllData()" style="align-self: flex-start; white-space: nowrap;">
          <i class="fas fa-file-export"></i> Exportar Reportes
        </button>
      </div >

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
        <div class="section-card" style="margin-bottom: 0; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: white;">
          <h3 style="color: white; font-size: 1.1rem; opacity: 0.9;">Puntuación Promedio</h3>
          <div style="font-size: 3rem; font-weight: 700; margin: 10px 0;">${avgScore} <small style="font-size: 1rem; font-weight: 400;">/ 100</small></div>
          <p style="font-size: 0.85rem; opacity: 0.8;">Calidad general de los proyectos entregados</p>
        </div>
        <div class="section-card" style="margin-bottom: 0; border-left: 4px solid var(--accent-color);">
          <h3 style="font-size: 1.1rem;">Interacción Estudiantil</h3>
          <div style="font-size: 3rem; font-weight: 700; margin: 10px 0; color: var(--accent-color);">${totalProjects}</div>
          <p style="font-size: 0.85rem; color: var(--text-light);">Proyectos publicados en total</p>
        </div>
      </div>

      <h3 style="margin: 24px 0 16px; color: var(--dark); font-size: 1.3rem;">📊 Estadísticas de Población</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <i class="fas fa-school"></i>
          <strong>${totalSchools}</strong>
          <span>Escuelas</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-user-graduate"></i>
          <strong>${totalStudents}</strong>
          <span>Alumnos</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-chalkboard-teacher"></i>
          <strong>${totalTeachers}</strong>
          <span>Docentes</span>
        </div>
        <div class="stat-card">
          <i class="fas fa-users"></i>
          <strong>${totalGroups}</strong>
          <span>Grupos</span>
        </div>
      </div>

      <h3 style="margin: 32px 0 16px; color: var(--dark); font-size: 1.3rem;">🚀 Herramientas de Gestión</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
        <button class="btn-secondary" onclick="nav('schools')" style="text-align: left; padding: 15px;">
          <i class="fas fa-school" style="margin-bottom: 8px; display: block; font-size: 1.2rem;"></i>
          <strong>Establecimientos</strong>
        </button>
        <button class="btn-secondary" onclick="nav('students')" style="text-align: left; padding: 15px;">
          <i class="fas fa-user-graduate" style="margin-bottom: 8px; display: block; font-size: 1.2rem;"></i>
          <strong>Estudiantes</strong>
        </button>
        <button class="btn-secondary" onclick="nav('teachers')" style="text-align: left; padding: 15px;">
          <i class="fas fa-chalkboard-teacher" style="margin-bottom: 8px; display: block; font-size: 1.2rem;"></i>
          <strong>Docentes</strong>
        </button>
        <button class="btn-secondary" onclick="nav('groups')" style="text-align: left; padding: 15px;">
          <i class="fas fa-users" style="margin-bottom: 8px; display: block; font-size: 1.2rem;"></i>
          <strong>Grupos</strong>
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 32px 0 16px;">
        <h3 style="margin: 0; color: var(--dark); font-size: 1.3rem;">💬 Feedback Reciente</h3>
        <button class="btn-secondary btn-sm" onclick="viewAllTeacherComments()">
          Ver Todo
        </button>
      </div>
      ${renderRecentComments(ratings)}
  `;

  } catch (err) {
    console.error('Error en perfil admin:', err);
    profileContent.innerHTML = '<div class="error-state">❌ Error al cargar perfil del administrador</div>';
  }
}

function renderRecentComments(ratings) {
  if (!ratings || ratings.length === 0) {
    return '<div class="empty-state">No hay comentarios disponibles</div>';
  }

  const recentRatings = ratings.filter(r => r.message).slice(0, 5);

  if (recentRatings.length === 0) {
    return '<div class="empty-state">No hay comentarios con mensaje</div>';
  }

  return `
    < div style = "display: grid; gap: 12px;" >
      ${recentRatings.map(r => `
        <div class="section-card" style="padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div>
              <strong style="font-size: 0.95rem;">${sanitizeInput(r.students?.full_name || 'Estudiante')}</strong>
              <small style="display: block; color: var(--text-light); margin-top: 2px;">
                → ${sanitizeInput(r.teachers?.full_name || 'Docente')}
              </small>
            </div>
            <span style="font-size: 1.1rem;">${'⭐'.repeat(r.rating)}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-dark); background: var(--light-gray); padding: 10px; border-radius: 6px; margin: 8px 0;">
            ${sanitizeInput(r.message)}
          </p>
          <small style="color: var(--text-light);">${formatDate(r.created_at)}</small>
        </div>
      `).join('')
    }
    </div >
    <button class="btn-secondary" onclick="viewAllTeacherComments()" style="margin-top: 16px; width: 100%;">
      <i class="fas fa-eye"></i> Ver Todos los Comentarios
    </button>
  `;
}

async function viewAllTeacherComments() {
  try {
    const { data: ratings } = await _supabase
      .from('teacher_ratings')
      .select(`
  rating,
    message,
    created_at,
    students(full_name, school_code, grade, section)
      `)
      .order('created_at', { ascending: false });

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
    < div class="modal-content" style = "max-width: 900px;" >
        <div class="modal-header">
          <h2>💬 Todas las Calificaciones y Comentarios</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          ${!ratings || ratings.length === 0 ? '<p class="empty-state">No hay calificaciones aún</p>' : `
            <div style="max-height: 70vh; overflow-y: auto;">
              ${ratings.map(r => `
                <div class="section-card" style="margin-bottom: 16px;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; flex-wrap: wrap; gap: 12px;">
                    <div>
                      <strong style="font-size: 1rem; color: var(--dark);">${sanitizeInput(r.students?.full_name || 'Estudiante')}</strong>
                      <p style="font-size: 0.85rem; color: var(--text-light); margin: 4px 0;">
                        Evaluó a: <strong>Docente responsable</strong>
                      </p>
                    </div>
                    <span style="font-size: 1.3rem;">
                      ${'⭐'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                    </span>
                  </div>
                  ${r.message ? `
                    <div style="background: var(--light-gray); padding: 14px; border-radius: 8px; border-left: 3px solid var(--primary-color);">
                      <strong style="display: block; margin-bottom: 8px; font-size: 0.9rem;">💬 Comentario:</strong>
                      <p style="margin: 0; color: var(--text-dark); line-height: 1.6; font-size: 0.9rem;">${sanitizeInput(r.message)}</p>
                    </div>
                  ` : '<p style="color: var(--text-light); font-style: italic; font-size: 0.85rem;">Sin comentario escrito</p>'}
                  <small style="color: var(--text-light); display: block; margin-top: 10px;">${formatDate(r.created_at)}</small>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div >
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando comentarios:', err);
    showToast('❌ Error al cargar comentarios', 'error');
  }
}

async function exportAllData() {
  showToast('📦 Generando exportación completa...', 'default');

  try {
    if (typeof exportStudentsCSV === 'function') await exportStudentsCSV();
    await new Promise(r => setTimeout(r, 500));
    if (typeof exportGroupsCSV === 'function') await exportGroupsCSV();
    await new Promise(r => setTimeout(r, 500));
    if (typeof exportProjectsCSV === 'function') await exportProjectsCSV();

    showToast('✅ Exportación completa finalizada', 'success');
  } catch (err) {
    console.error('Error en exportación:', err);
    showToast('❌ Error en exportación', 'error');
  }
}

// ================================================
// UTILIDADES PARA PERFIL
// ================================================

// La función startBirthdayConfetti se movió a main.js para uso global

function checkIfBirthday(birthDate) {
  if (!birthDate) return false;
  const today = new Date();
  return birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
}

console.log('✅ profile.js cargado completamente');

