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
    await window.attachProjectAuthors?.([project]);
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
    // El feedback escrito del docente es privado -- solo el equipo que
    // subió el proyecto o el admin lo ve, otros docentes navegando proyectos
    // ajenos no.
    const canSeeFeedback = isOwner || isGroupMember || userRole === 'admin';

    // Eliminar: el admin siempre; un docente solo proyectos de alumnos de un
    // establecimiento donde tiene clase asignada (ej. se subió con la cuenta
    // equivocada).
    let canDelete = userRole === 'admin';
    if (userRole === 'docente' && project.students?.school_code) {
      const { data: mine } = await _supabase.from('teacher_assignments').select('school_code')
        .eq('teacher_id', currentUser.id).eq('school_code', project.students.school_code).limit(1);
      canDelete = !!mine?.length;
    }

    const modal = document.createElement('div');
    modal.dataset.projectModal = project.id;
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
                    ${project.groups ? `<span class="text-[0.6rem] font-bold uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-md"><i class="fas fa-users"></i> ${sanitizeInput(project.groups.name)}</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-4">
                ${(canSeeFullInfo && project.score) ? `
                    <div class="bg-primary text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-primary/30">
                        ${project.score}<span class="text-[0.7rem] opacity-70 ml-1">/100</span>
                    </div>` : ''}
                ${canDelete ? `
                <button class="h-10 px-3 rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-widest transition-colors" title="Eliminar proyecto" onclick="window.deleteProject(${project.id}, '${window.sanitizeAttr ? window.sanitizeAttr(project.title).replace(/'/g, "\\'") : ''}')">
                    <i class="fas fa-trash-alt"></i> Eliminar
                </button>` : ''}
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
              ${window.isModel3D?.(project.video_url)
                ? window.model3DViewerHtml(project.video_url, { projectId: project.id, needsThumb: !project.thumbnail_url })
                : `<video controls class="w-full aspect-video">
                <source src="${project.video_url}" type="video/mp4">
              </video>`}
          </div>

          <div class="bg-primary/5 dark:bg-primary/10 p-6 rounded-3xl border border-primary/10 mb-10">
            <h4 class="text-sm font-bold uppercase text-primary tracking-widest mb-3 flex items-center gap-2">
                <i class="fas fa-align-left"></i> Resumen del Proyecto
            </h4>
            <p class="text-slate-700 dark:text-slate-300 leading-relaxed">${sanitizeInput(project.description)}</p>
          </div>

          ${canSeeFullInfo && project.score ? (() => {
          // PostgREST embebe la relación como objeto (no array) por el
          // UNIQUE constraint en evaluations.project_id.
          const ev = Array.isArray(project.evaluations) ? project.evaluations[0] : project.evaluations;
          const criteriaHtml = [
            { l: 'Creatividad', v: ev?.creativity_score, i: '<i class="fas fa-lightbulb"></i>', d: 'Qué tan original e innovadora es la idea del proyecto.' },
            { l: 'Claridad', v: ev?.clarity_score, i: '<i class="fas fa-bullseye"></i>', d: 'Qué tan bien se explica y se entiende el proyecto.' },
            { l: 'Función', v: ev?.functionality_score, i: '<i class="fas fa-gear"></i>️', d: 'Qué tan bien funciona técnicamente lo que construyeron.' },
            { l: 'Equipo', v: ev?.teamwork_score, i: '<i class="fas fa-users"></i>', d: 'Qué tan bien se nota la colaboración entre los integrantes.' },
            { l: 'Impacto', v: ev?.social_impact_score, i: '<i class="fas fa-earth-americas"></i>', d: 'Qué tanto beneficia o resuelve un problema real de la comunidad.' }
          ].map(c => `
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center transform hover:scale-105 transition-all cursor-help" title="${window.sanitizeAttr ? window.sanitizeAttr(c.d) : c.d}">
                        <div class="text-2xl mb-2">${c.i}</div>
                        <div class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1">${c.l}</div>
                        <div class="text-xl font-bold text-primary">${c.v !== undefined ? c.v : 0}<span class="text-[0.7rem] opacity-50 ml-0.5">/20</span></div>
                    </div>
                  `).join('');
          return `
            <div class="border-t border-slate-200 dark:border-slate-800 pt-8 mt-4">
              <h4 class="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                  <i class="fas fa-chart-bar text-primary"></i> Desglose de Evaluación
              </h4>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                ${criteriaHtml}
              </div>
              ${canSeeFeedback && ev?.feedback ? `
                <div class="mt-8 bg-amber-50 dark:bg-amber-900/20 p-6 rounded-3xl border-l-4 border-amber-500">
                  <h5 class="text-xs font-bold uppercase text-amber-600 dark:text-amber-400 mb-2">Comentarios del Revisor</h5>
                  <p class="text-amber-900 dark:text-amber-200 italic leading-relaxed">"${sanitizeInput(ev.feedback)}"</p>
                </div>
              ` : ''}
            </div>
          `;
        })() : (canSeeFullInfo ? `
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
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al cargar detalles', 'error');
  }
}

window.openChallengeEvidenceModal = async function openChallengeEvidenceModal(challengeId) {
  const challenge = (window.MONTHLY_CHALLENGES || []).find(c => c.id === challengeId);

  // Antes siempre abría una caja de texto en blanco, incluso si ya habías
  // respondido este reto -- no había forma de ver qué habías escrito.
  const { data: existing } = await window._supabase.from('teacher_challenges')
    .select('comment, created_at').eq('teacher_id', window.currentUser.id).eq('challenge_id', challengeId).maybeSingle();

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-8 dark:bg-slate-900 shadow-2xl transform scale-100 transition-all duration-300">
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fas fa-trophy text-amber-500"></i> ${existing ? 'Tu Reflexión de este Mes' : 'Completar Reto del Mes'}
            </h3>
            <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" onclick="this.closest('.fixed').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>

        ${challenge ? `
        <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 mb-6">
            <p class="text-sm font-black text-amber-700 dark:text-amber-400 mb-1">${window.sanitizeInput(challenge.name)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">${window.sanitizeInput(challenge.description)}</p>
            <p class="text-[0.65rem] font-bold text-amber-600 mt-2 uppercase tracking-widest"><i class="fas fa-gift"></i> ${window.sanitizeInput(challenge.reward)}</p>
        </div>` : ''}

        ${existing ? `
        <div class="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 mb-2">
            <p class="text-[0.65rem] font-bold text-emerald-600 uppercase tracking-widest mb-2"><i class="fas fa-circle-check"></i> Enviado el ${new Date(existing.created_at).toLocaleDateString('es-GT')}</p>
            <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">${window.sanitizeInput(existing.comment)}</p>
        </div>
        ` : `
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-3 leading-relaxed">
            Comparte tu experiencia. Cuéntanos cómo impactó este reto en tu aula y qué resultados observaste con tus estudiantes.
        </p>
        <p class="text-[0.7rem] text-slate-400 mb-3 italic">Una IA revisa que tu reflexión sea concreta antes de contarla como completada -- "ok" o "listo" no alcanza.</p>

        <textarea id="challenge-comment" class="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all mb-2" placeholder="Escribe aquí tu reflexión educativa..."></textarea>
        <p id="challenge-comment-feedback" class="text-xs text-rose-500 font-semibold mb-6 hidden"></p>

        <div class="flex gap-4">
            <button class="grow bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold py-3 rounded-xl transition-all" onclick="this.closest('.fixed').remove()">CANCELAR</button>
            <button id="btn-submit-challenge" class="grow bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all" onclick="window.submitChallengeEvidence && window.submitChallengeEvidence('${challengeId}')">ENVIAR EVIDENCIA</button>
        </div>
        `}
      </div>
  `;
  document.body.appendChild(modal);
}

window.openStudentChallengeModal = async function openStudentChallengeModal(challengeId) {
  const challenge = (window.STUDENT_MONTHLY_CHALLENGES || []).find(c => c.id === challengeId);

  const { data: existing } = await window._supabase.from('student_challenges')
    .select('comment, created_at').eq('student_id', window.currentUser.id).eq('challenge_id', challengeId).maybeSingle();

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-8 dark:bg-slate-900 shadow-2xl transform scale-100 transition-all duration-300">
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fas fa-trophy text-amber-500"></i> ${existing ? 'Tu Reflexión de este Mes' : 'Completar Reto del Mes'}
            </h3>
            <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" onclick="this.closest('.fixed').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>

        ${challenge ? `
        <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 mb-6">
            <p class="text-sm font-black text-amber-700 dark:text-amber-400 mb-1">${window.sanitizeInput(challenge.name)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">${window.sanitizeInput(challenge.description)}</p>
            <p class="text-[0.65rem] font-bold text-amber-600 mt-2 uppercase tracking-widest"><i class="fas fa-gift"></i> +30 XP y 10 gemas</p>
        </div>` : ''}

        ${existing ? `
        <div class="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 mb-2">
            <p class="text-[0.65rem] font-bold text-emerald-600 uppercase tracking-widest mb-2"><i class="fas fa-circle-check"></i> Enviado el ${new Date(existing.created_at).toLocaleDateString('es-GT')}</p>
            <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">${window.sanitizeInput(existing.comment)}</p>
        </div>
        ` : `
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-3 leading-relaxed">
            Contanos cómo aplicaste esto en tu vida o con tus compañeros. Sé concreto.
        </p>
        <p class="text-[0.7rem] text-slate-400 mb-3 italic">Una IA revisa que tu reflexión sea concreta antes de contarla como completada -- "ok" o "listo" no alcanza.</p>

        <textarea id="student-challenge-comment" class="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all mb-2" placeholder="Escribe aquí tu reflexión..."></textarea>
        <p id="student-challenge-comment-feedback" class="text-xs text-rose-500 font-semibold mb-6 hidden"></p>

        <div class="flex gap-4">
            <button class="grow bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold py-3 rounded-xl transition-all" onclick="this.closest('.fixed').remove()">CANCELAR</button>
            <button id="btn-submit-student-challenge" class="grow bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all" onclick="window.submitStudentChallengeEvidence && window.submitStudentChallengeEvidence('${challengeId}')">ENVIAR</button>
        </div>
        `}
      </div>
  `;
  document.body.appendChild(modal);
}

// Borra el proyecto (la evaluación, reacciones y avisos se borran en cascada
// en la base) y, si se puede, su archivo en Storage. El .select() sirve para
// notar un borrado bloqueado por permisos: sin error pero con 0 filas.
window.deleteProject = async function deleteProject(projectId, title) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  if (!confirm(`¿Eliminar el proyecto "${title || ''}"?\n\nSe borra también su evaluación, reacciones y archivo. No se puede deshacer.`)) return;

  try {
    const { data: project } = await _supabase.from('projects').select('video_url').eq('id', projectId).maybeSingle();

    const { data: deleted, error } = await _supabase.from('projects').delete().eq('id', projectId).select('id');
    if (error) throw error;
    if (!deleted?.length) throw new Error('Sin permiso para eliminar este proyecto');

    try {
      const path = project?.video_url ? decodeURIComponent(new URL(project.video_url).pathname.split('/project-videos/')[1] || '') : '';
      if (path) await _supabase.storage.from('project-videos').remove([path]);
    } catch (e) { console.warn('No se pudo borrar el archivo del proyecto:', e); }

    // El feed y el ranking muestran primero lo que tienen en caché: se saca de ahí.
    for (const key of ['projects_feed_cache', 'global_ranking_top_20']) {
      try {
        const cached = await window._syncManager?.getCache(key);
        if (Array.isArray(cached)) await window._syncManager.setCache(key, cached.filter(p => p.id !== projectId));
      } catch (e) { /* sin caché */ }
    }

    document.querySelectorAll(`[data-project-modal="${projectId}"]`).forEach(m => m.remove());
    if (typeof showToast === 'function') showToast('<i class="fas fa-trash-alt"></i> Proyecto eliminado', 'success');
    if (document.getElementById('ranking-list')) window.loadRanking?.();
    window.loadFeed?.();
  } catch (err) {
    console.error('Error eliminando proyecto:', err);
    if (typeof showToast === 'function') showToast(`<i class="fas fa-circle-xmark"></i> No se pudo eliminar: ${window.sanitizeInput ? window.sanitizeInput(err.message || 'error') : 'error'}`, 'error');
  }
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

  const MIN_TITLE_LENGTH = 5;
  const MIN_DESCRIPTION_LENGTH = 40;

  if (!title || !description || !videoFile) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Completa todos los campos', 'error');
    return;
  }
  if (title.length < MIN_TITLE_LENGTH) {
    if (typeof showToast === 'function') showToast(`<i class="fas fa-circle-xmark"></i> El título es muy corto (mínimo ${MIN_TITLE_LENGTH} caracteres)`, 'error');
    return;
  }
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    if (typeof showToast === 'function') showToast(`<i class="fas fa-circle-xmark"></i> La descripción es muy corta -- explica bien tu proyecto (mínimo ${MIN_DESCRIPTION_LENGTH} caracteres, llevas ${description.length})`, 'error');
    return;
  }

  // Subido de 50MB -- feedback de un docente: grabaciones directas del
  // celular ya pesan más de 50MB para 2 minutos, y pedirles editar/comprimir
  // antes de poder subir es fricción innecesaria.
  const MAX_SIZE = 150 * 1024 * 1024;
  if (videoFile.size > MAX_SIZE) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Archivo muy pesado (Máx 150MB)', 'error');
    return;
  }
  const modelExt = uploadModelExt(videoFile);

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

    // Modelos 3D: miniatura para el feed, generada ahora mientras el archivo
    // está a mano. Si falla (sin internet para bajar three.js, sin WebGL...)
    // el proyecto se sube igual y la miniatura se completa al abrirlo.
    let thumbnail_url = null;
    if (modelExt && window.captureModelThumbnail) {
      const localUrl = URL.createObjectURL(videoFile);
      try { thumbnail_url = await window.captureModelThumbnail(localUrl, modelExt); }
      catch (e) { console.warn('No se pudo generar la miniatura 3D:', e); }
      finally { URL.revokeObjectURL(localUrl); }
    }

    // Preparar datos del proyecto
    const projectData = {
      user_id: currentUser.id,
      group_id: groupId,
      title,
      description,
      bimestre: parseInt(bimestre),
      upload_ip: clientIP,
      client_metadata: { agent: navigator.userAgent, platform: navigator.platform },
      _fileBlob: videoFile, // El archivo se guardará en IndexedDB
      ...(modelExt ? { _fileExt: modelExt } : {}),
      ...(thumbnail_url ? { thumbnail_url } : {})
    };

    // USAR EL GESTOR DE SINCRONIZACIÓN (MODO KOLIBRI / OFFLINE)
    if (_syncManager && typeof _syncManager.enqueue === 'function') {
      await _syncManager.enqueue('upload_project', projectData);
    }

    if (typeof showToast === 'function') showToast('<i class="fas fa-rocket"></i> Proyecto guardado (Pendiente Sync)', 'success');

    // Limpiar formulario
    document.getElementById('project-title').value = '';
    document.getElementById('project-description').value = '';
    if (typeof window.clearVideoPreview === 'function') window.clearVideoPreview();

    if (typeof nav === 'function') nav('feed');
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al guardar proyecto', 'error');
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

  const slot = document.getElementById('model-preview-slot');

  if (input.files && input.files[0]) {
    const file = input.files[0];
    const url = URL.createObjectURL(file);
    const modelExt = uploadModelExt(file);
    if (modelExt) {
      if (player) { player.classList.add('hidden'); player.removeAttribute('src'); }
      if (slot) {
        slot.innerHTML = window.model3DViewerHtml(url, { ext: modelExt });
        slot.classList.remove('hidden');
      }
      if (container) container.classList.remove('hidden');
    } else if (player) {
      player.classList.remove('hidden');
      if (slot) { slot.innerHTML = ''; slot.classList.add('hidden'); }
      player.src = url;
      if (container) container.classList.remove('hidden');
    }
  }
}

function uploadModelExt(file) {
  const ext = (file?.name?.split('.').pop() || '').toLowerCase();
  return ['stl', 'obj', 'glb'].includes(ext) ? ext : null;
}

window.clearVideoPreview = function clearVideoPreview() {
  const input = document.getElementById('project-video');
  const container = document.getElementById('video-preview-container');
  const player = document.getElementById('video-preview-player');
  const slot = document.getElementById('model-preview-slot');
  if (input) input.value = '';
  if (player) {
    URL.revokeObjectURL(player.src);
    player.src = '';
    player.classList.remove('hidden');
  }
  if (slot) { slot.innerHTML = ''; slot.classList.add('hidden'); }
  if (container) container.classList.add('hidden');
}

console.log('✅ project-modals.js refacturado (1Bot Edition)');
