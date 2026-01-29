/**
 * PROJECT MODALS - Gestión de ventanas emergentes (Tailwind Edition)
 */

window.viewProjectDetails = async function viewProjectDetails(projectId) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const showToast = window.showToast;

  try {
    const { data: project, error } = await _supabase
      .from('projects')
      .select(`
        *,
        students(id, full_name, school_code, grade, section, schools(name)),
        groups(id, name, group_members(role, student_id, students(full_name))),
        evaluations(*)
      `)
      .eq('id', projectId)
      .single();

    if (error) throw error;
    console.log("PROYECTO CARGADO:", project);

    // REINTENTO DE CARGA DE EVALUACIÓN (Si el join falló o el score es > 0)
    if (project.score > 0 && (!project.evaluations || project.evaluations.length === 0)) {
      try {
        const { data: directEval } = await _supabase
          .from('evaluations')
          .select('*')
          .eq('project_id', projectId);

        if (directEval && directEval.length > 0) {
          project.evaluations = directEval;
        }
      } catch (e) {
        console.warn("No se pudo obtener el desglose de evaluación (RLS o Error):", e);
      }
    }

    const isOwner = project.user_id === currentUser?.id;
    const isTeacherOrAdmin = userRole === 'docente' || userRole === 'admin';
    const isGroupMember = project.groups?.group_members?.some(m => m.student_id === currentUser?.id);
    const canSeeFullInfo = isOwner || isGroupMember || isTeacherOrAdmin;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300">
        <div class="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800 dark:text-white leading-tight">${sanitizeInput(project.title)}</h2>
                <div class="flex gap-4 mt-2">
                    <span class="text-[0.6rem] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-1 rounded-md">
                        ${project.bimestre || 1}º Bimestre
                    </span>
                    ${project.groups ? `<span class="text-[0.6rem] font-bold uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-md">👥 ${sanitizeInput(project.groups.name)}</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-4">
                ${(canSeeFullInfo && project.score) ? `
                    <div class="bg-primary text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-primary/30">
                        ${project.score}<span class="text-[0.7rem] opacity-70 ml-1">/100</span>
                    </div>` : ''}
                <button class="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors" onclick="this.closest('.fixed').remove()">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
        </div>

        <div class="p-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <small class="text-[0.6rem] font-bold uppercase text-slate-400 block mb-1">Autor Principal</small>
                <div class="font-semibold text-slate-700 dark:text-slate-200">${sanitizeInput(project.students?.full_name)}</div>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <small class="text-[0.6rem] font-bold uppercase text-slate-400 block mb-1">Establecimiento</small>
                <div class="font-semibold text-slate-700 dark:text-slate-200">${sanitizeInput(project.students?.schools?.name || 'N/A')}</div>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <small class="text-[0.6rem] font-bold uppercase text-slate-400 block mb-1">Grado y Sección</small>
                <div class="font-semibold text-slate-700 dark:text-slate-200">${project.students?.grade} - ${project.students?.section}</div>
            </div>
          </div>
          
          <div class="rounded-3xl overflow-hidden bg-black mb-8 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800">
              <video controls class="w-full aspect-video">
                <source src="${project.video_url}" type="video/mp4">
              </video>
          </div>

          <div class="bg-primary/5 dark:bg-primary/10 p-6 rounded-3xl border border-primary/10 mb-10">
            <h4 class="text-sm font-bold uppercase text-primary tracking-widest mb-3 flex items-center gap-2">
                <i class="fas fa-align-left"></i> Resumen del Proyecto
            </h4>
            <p class="text-slate-700 dark:text-slate-300 leading-relaxed">${sanitizeInput(project.description)}</p>
          </div>

          ${canSeeFullInfo && project.score ? `
            <div class="border-t border-slate-200 dark:border-slate-800 pt-8 mt-4">
              <h4 class="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                  <i class="fas fa-chart-bar text-primary"></i> Desglose de Evaluación
              </h4>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                ${(() => {
          const ev = Array.isArray(project.evaluations) ? project.evaluations[0] : project.evaluations;
          return [
            { l: 'Creatividad', v: ev?.creativity_score, i: '💡' },
            { l: 'Claridad', v: ev?.clarity_score, i: '🎯' },
            { l: 'Función', v: ev?.functionality_score, i: '⚙️' },
            { l: 'Equipo', v: ev?.teamwork_score, i: '👥' },
            { l: 'Impacto', v: ev?.social_impact_score, i: '🌍' }
          ].map(c => `
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center transform hover:scale-105 transition-all">
                        <div class="text-2xl mb-2">${c.i}</div>
                        <div class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1">${c.l}</div>
                        <div class="text-xl font-bold text-primary">${c.v !== undefined ? c.v : 0}<span class="text-[0.7rem] opacity-50 ml-0.5">/20</span></div>
                    </div>
                  `).join('');
        })()}
              </div>
              ${project.evaluations?.[0]?.feedback ? `
                <div class="mt-8 bg-amber-50 dark:bg-amber-900/20 p-6 rounded-3xl border-l-4 border-amber-500">
                  <h5 class="text-xs font-bold uppercase text-amber-600 dark:text-amber-400 mb-2">Comentarios del Revisor</h5>
                  <p class="text-amber-900 dark:text-amber-200 italic leading-relaxed">"${sanitizeInput(project.evaluations[0].feedback)}"</p>
                </div>
              ` : ''}
            </div>
          ` : (canSeeFullInfo ? `
            <div class="bg-slate-100 dark:bg-slate-800 p-8 rounded-3xl text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div class="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-clock text-2xl text-slate-400"></i>
                </div>
                <h4 class="text-lg font-bold text-slate-800 dark:text-slate-200">En Proceso de Revisión</h4>
                <p class="text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">Tu docente evaluará este proyecto pronto. ¡Mantente al tanto de las notificaciones!</p>
            </div>
          ` : '')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('❌ Error al cargar detalles', 'error');
  }
}

window.openChallengeEvidenceModal = function openChallengeEvidenceModal(challengeId) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-8 dark:bg-slate-900 shadow-2xl transform scale-100 transition-all duration-300">
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fas fa-trophy text-amber-500"></i> Completar Reto del Mes
            </h3>
            <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" onclick="this.closest('.fixed').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            Comparte tu experiencia. Cuéntanos cómo impactó este reto en tu aula y qué resultados observaste con tus estudiantes.
        </p>

        <textarea id="challenge-comment" class="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all mb-8" placeholder="Escribe aquí tu reflexión educativa..."></textarea>
        
        <div class="flex gap-4">
            <button class="grow bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold py-3 rounded-xl transition-all" onclick="this.closest('.fixed').remove()">CANCELAR</button>
            <button class="grow bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all" onclick="window.submitChallengeEvidence && window.submitChallengeEvidence('${challengeId}')">ENVIAR EVIDENCIA</button>
        </div>
      </div>
  `;
  document.body.appendChild(modal);
}

window.uploadProject = async function uploadProject() {
  const title = document.getElementById('project-title')?.value.trim();
  const description = document.getElementById('project-description')?.value.trim();
  const videoFile = document.getElementById('project-video')?.files[0];
  const groupId = document.getElementById('project-group')?.value || null;
  const btn = document.getElementById('btn-upload-project');
  const showToast = window.showToast;
  const currentUser = window.currentUser;
  const _syncManager = window._syncManager;
  const nav = window.nav;

  if (!title || !description || !videoFile) {
    if (typeof showToast === 'function') showToast('❌ Completa los campos', 'error');
    return;
  }

  const MAX_SIZE = 50 * 1024 * 1024;
  if (videoFile.size > MAX_SIZE) {
    if (typeof showToast === 'function') showToast('❌ Video muy pesado (Máx 50MB)', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Guardando Proyecto...';

  try {
    // Detección de IP (solo si hay conexión)
    let clientIP = 'offline';
    if (navigator.onLine && _syncManager && !_syncManager.simulatedOffline) {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { timeout: 3000 });
        const ipData = await ipRes.json();
        clientIP = ipData.ip;
      } catch (e) {
        console.warn('IP detection failed, continuing offline');
      }
    }

    const bimestre = document.getElementById('project-bimestre')?.value || 1;

    // Preparar datos del proyecto
    const projectData = {
      user_id: currentUser.id,
      group_id: groupId,
      title,
      description,
      bimestre: parseInt(bimestre),
      upload_ip: clientIP,
      client_metadata: { agent: navigator.userAgent, platform: navigator.platform },
      _fileBlob: videoFile // El archivo se guardará en IndexedDB
    };

    // USAR EL GESTOR DE SINCRONIZACIÓN (MODO KOLIBRI / OFFLINE)
    if (_syncManager && typeof _syncManager.enqueue === 'function') {
      await _syncManager.enqueue('upload_project', projectData);
    }

    if (typeof showToast === 'function') showToast('🚀 Proyecto guardado (Pendiente Sync)', 'success');

    // Limpiar formulario
    document.getElementById('project-title').value = '';
    document.getElementById('project-description').value = '';
    if (typeof window.clearVideoPreview === 'function') window.clearVideoPreview();

    if (typeof nav === 'function') nav('feed');
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('❌ Error al guardar proyecto', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane text-xl"></i> PUBLICAR PROYECTO AHORA';
  }
}

window.initUploadView = async function initUploadView() {
  const select = document.getElementById('project-group');
  if (!select) return;
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  try {
    // Consulta simplificada para evitar errores de ambigüedad
    const { data: memberships, error } = await _supabase
      .from('group_members')
      .select('group_id, groups(name)')
      .eq('student_id', currentUser.id);

    if (error) throw error;

    let html = '<option value="">Individual</option>';
    if (memberships && memberships.length > 0) {
      memberships.forEach(m => {
        const team = m.groups;
        const teamName = Array.isArray(team) ? team[0]?.name : team?.name;
        if (teamName) {
          html += `<option value="${m.group_id}">${sanitizeInput(teamName)}</option>`;
        }
      });
    }
    select.innerHTML = html;
  } catch (e) {
    console.error("Error cargando equipos para subida:", e);
    select.innerHTML = '<option value="">Individual (Error cargando equipos)</option>';
  }
}

window.previewUploadVideo = function previewUploadVideo(input) {
  const container = document.getElementById('video-preview-container');
  const player = document.getElementById('video-preview-player');

  if (input.files && input.files[0]) {
    const file = input.files[0];
    const url = URL.createObjectURL(file);
    if (player) {
      player.src = url;
      if (container) container.classList.remove('hidden');
    }
  }
}

window.clearVideoPreview = function clearVideoPreview() {
  const input = document.getElementById('project-video');
  const container = document.getElementById('video-preview-container');
  const player = document.getElementById('video-preview-player');
  if (input) input.value = '';
  if (player) {
    URL.revokeObjectURL(player.src);
    player.src = '';
  }
  if (container) container.classList.add('hidden');
}

console.log('✅ project-modals.js refacturado (1Bot Edition)');
