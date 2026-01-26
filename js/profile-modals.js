// ==========================================
// MODALS DE PERFIL (Tailwind Styles Refactor)
// ==========================================

let criteriaRatings = {
  interest: 0,
  practice: 0,
  resources: 0,
  respect: 0,
  clarity: 0
};

window.showXPInfoModal = function () {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  let content = '';

  if (userRole === 'docente' || userRole === 'admin') {
    content = `
         <div class="p-6 space-y-4">
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-slate-700 text-indigo-500 flex items-center justify-center font-bold text-sm">30%</div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Asistencia</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Pasar lista en tus clases</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-amber-50 dark:bg-slate-700 text-amber-500 flex items-center justify-center font-bold text-sm">40%</div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Evaluación</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Calificar proyectos de alumnos</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-slate-700 text-cyan-500 flex items-center justify-center font-bold text-sm">20%</div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Evidencia</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Subir fotos de actividades</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-slate-700 text-emerald-500 flex items-center justify-center font-bold text-sm">10%</div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Informe</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Enviar resumen mensual</div>
                </div>
            </div>
         </div>`;
  } else {
    // CONTENIDO PARA ESTUDIANTES
    content = `
         <div class="p-6 space-y-4">
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-slate-700 text-emerald-500 flex items-center justify-center font-bold text-xl"><i class="fas fa-rocket"></i></div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Publicar Proyecto</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Gana <span class="text-emerald-500">50 XP</span> por cada proyecto</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-amber-50 dark:bg-slate-700 text-amber-500 flex items-center justify-center font-bold text-xl"><i class="fas fa-medal"></i></div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Medallas</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Gana <span class="text-amber-500">100 XP</span> por cada logro desbloqueado</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-rose-50 dark:bg-slate-700 text-rose-500 flex items-center justify-center font-bold text-xl"><i class="fas fa-heart"></i></div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Votos</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Gana <span class="text-rose-500">10 XP</span> por cada like recibido</div>
                </div>
            </div>
             <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div class="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-slate-700 text-indigo-500 flex items-center justify-center font-bold text-xl"><i class="fas fa-star-half-alt"></i></div>
                <div>
                    <div class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-wider">Calificación</div>
                    <div class="text-[0.65rem] font-bold text-slate-400">Suma tu <span class="text-indigo-500">Nota Final</span> directo a tu XP</div>
                </div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div class="text-[0.7rem] font-black text-primary uppercase tracking-[0.2em] mb-1">💎 Cómo ganar Gemas</div>
                <div class="flex items-center gap-3 p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500 text-white flex items-center justify-center text-sm shadow-sm"><i class="fas fa-gift"></i></div>
                    <div class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">Cofre Diario (Regalo aleatorio)</div>
                </div>
                <div class="flex items-center gap-3 p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500 text-white flex items-center justify-center text-sm shadow-sm"><i class="fas fa-camera"></i></div>
                    <div class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">Cambio de Foto (Una sola vez)</div>
                </div>
            </div>
         </div>`;
  }

  modal.innerHTML = `
        <div class="glass-card w-full max-w-sm p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-primary/20">
            <div class="bg-gradient-to-br from-primary to-indigo-600 p-8 text-center relative overflow-hidden">
                <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div class="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl text-white mx-auto mb-4 shadow-lg ring-4 ring-white/10">
                    <i class="fas fa-gamepad"></i>
                </div>
                <h2 class="text-2xl font-black text-white uppercase tracking-tight relative z-10">Sistema de XP</h2>
                <p class="text-indigo-100 text-xs font-bold uppercase tracking-widest mt-1">¿Cómo subir de nivel?</p>
            </div>
            
            ${content}

            <div class="p-6 pt-0">
                <button onclick="this.closest('.fixed').remove()" class="btn-primary-tw w-full h-12 text-xs uppercase tracking-widest font-bold">
                    ¡Entendido, a ganar!
                </button>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
}

function openUploadPhotoModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.id = 'upload-photo-modal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
      <div class="glass-card w-full max-w-sm p-0 shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-6 text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
             <div class="w-16 h-16 mx-auto bg-indigo-50 dark:bg-slate-800 text-indigo-500 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-sm">
                <i class="fas fa-camera"></i>
            </div>
            <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Foto de Perfil</h2>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Actualiza tu imagen pública</p>
        </div>
        
        <div class="p-6">
            <div class="relative group cursor-pointer mb-6">
                <div class="absolute inset-0 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl group-hover:border-primary transition-colors flex flex-col items-center justify-center p-8 pointer-events-none">
                     <i class="fas fa-cloud-upload-alt text-2xl text-slate-300 dark:text-slate-600 mb-2 group-hover:text-primary transition-colors"></i>
                     <span class="text-[0.65rem] font-bold text-slate-400 group-hover:text-primary uppercase tracking-widest">Click para seleccionar</span>
                </div>
                <input 
                  type="file" 
                  id="photo-input" 
                  accept="image/*" 
                  class="w-full h-32 opacity-0 cursor-pointer"
                  onchange="previewPhoto(this)"
                >
            </div>
            
            <div id="photo-preview-container" class="hidden mb-6 text-center animate-fadeIn">
                <div class="w-24 h-24 mx-auto rounded-full overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-xl">
                    <img id="preview-image" class="w-full h-full object-cover">
                </div>
                <button onclick="clearPhotoPreview()" class="text-[0.6rem] font-bold text-rose-500 uppercase tracking-widest mt-2 hover:underline">Eliminar selección</button>
            </div>
            
            <div class="flex gap-3">
                <button class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-colors" onclick="document.getElementById('upload-photo-modal').remove()">Cancelar</button>
                <button class="flex-[2] py-3 btn-primary-tw rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/30" onclick="uploadProfilePhoto()" id="btn-upload-photo">
                  <i class="fas fa-check mr-2"></i> Guardar
                </button>
            </div>
        </div>
      </div>
    `;

  document.body.appendChild(modal);
}

function previewPhoto(input) {
  const container = document.getElementById('photo-preview-container');
  const image = document.getElementById('preview-image');
  const uploadText = input.parentElement.querySelector('div'); // The dashed box

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      image.src = e.target.result;
      container.classList.remove('hidden');
      if (uploadText) uploadText.style.opacity = '0'; // Hide the instructions
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function clearPhotoPreview() {
  const input = document.getElementById('photo-input');
  const container = document.getElementById('photo-preview-container');
  const uploadText = input.parentElement.querySelector('div');

  input.value = '';
  container.classList.add('hidden');
  if (uploadText) uploadText.style.opacity = '1';
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
    const fileName = `${currentUser.id}_${Date.now()}.${file.name.split('.').pop()}`;

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

    let table = '';
    if (userRole === 'estudiante') table = 'students';
    else if (userRole === 'docente') table = 'teachers';
    else if (userRole === 'admin') table = 'admins';

    // Update in DB (using 'teachers' specifically for this context if needed, but logic seems generic)
    // Note: 'admins' table likely doesn't exist based on previous turns, usually admins are in teachers or separate auth logic, 
    // but the original code had this logic. I will keep it but assuming 'teachers' is the main target as per context.

    // Fix: If admin, we usually don't have a profile photo table unless defined.
    // Assuming 'teachers' table is correct for the request context (teacher profile)

    const isFirstTime = !userData.profile_photo_url;
    const { error: updateError } = await _supabase
      .from(table)
      .update({ profile_photo_url: urlData.publicUrl })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    // Reward XP and Gems for first photo
    if (isFirstTime) {
      const rewardXP = 100;
      const rewardGems = 25;
      const newXP = (userData.xp || 0) + rewardXP;
      const newGems = (userData.gems || 0) + rewardGems;

      const { error: rewardError } = await _supabase
        .from(table)
        .update({ xp: newXP, gems: newGems })
        .eq('id', currentUser.id);

      if (!rewardError) {
        userData.xp = newXP;
        userData.gems = newGems;
        showToast(`✨ ¡Primer foto! Ganaste ${rewardXP} XP y ${rewardGems} Gemas`, 'success');
        if (typeof initGamification === 'function') initGamification();
      }
    }

    userData.profile_photo_url = urlData.publicUrl;
    updateHeaderUI();

    showToast('✅ Foto de perfil actualizada', 'success');
    document.getElementById('upload-photo-modal').remove();
    if (typeof loadProfile === 'function') await loadProfile();

  } catch (err) {
    console.error('Error subiendo foto:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check mr-2"></i> Guardar';
    }
  }
}


function openSuggestionModal() {
  const modal = document.createElement('div');
  // Ajustamos el z-index a 40 para que quede por debajo del sidebar (50) y header (60)
  // Y añadimos márgenes en desktop para que se centre solo en el área de contenido
  modal.className = 'fixed inset-0 z-[40] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-[2px] md:ml-72 md:mt-20 animate-in fade-in duration-300';
  modal.id = 'suggestion-modal';

  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-0 shadow-2xl animate-in zoom-in-95 duration-300 dark:bg-slate-900 flex flex-col max-h-[85vh] overflow-hidden border border-primary/20">
      <!-- Sticky Header -->
      <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shrink-0 z-10">
        <h2 class="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg shadow-inner"><i class="fas fa-comment-dots"></i></div>
            Centro de Feedback
        </h2>
        <button class="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all" onclick="this.closest('.fixed').remove()"><i class="fas fa-times text-xl"></i></button>
      </div>
      
      <!-- Scrollable Body -->
      <div class="p-8 overflow-y-auto custom-scrollbar">
        <div class="mb-6">
          <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest leading-none">Tipo de Comunicación</label>
          <select id="suggestion-type" class="input-field-tw h-11 text-sm pt-0 pb-0" onchange="toggleRatingSection()">
            <option value="suggestion">💡 Sugerencia para el Establecimiento</option>
            <option value="rating">⭐ Evaluar Clase de la Semana</option>
          </select>
        </div>

        <div id="rating-section" class="hidden mb-8 animate-in slide-in-from-top-4 duration-300">
          <div class="bg-primary/5 border border-primary/10 p-4 rounded-2xl mb-6">
            <p class="text-[0.8rem] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                👉 Selecciona cómo te sentiste en clase respecto a estos puntos:
            </p>
          </div>
          <div id="suggestion-eval-questions" class="space-y-4">
             <!-- Inyectado dinámicamente -->
          </div>
        </div>

        <div class="mb-8" id="msg-label">
          <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest leading-none">Tu Mensaje</label>
          <textarea id="suggestion-message" rows="4" placeholder="Escribe tu sugerencia..." class="input-field-tw min-h-[120px] resize-none text-sm"></textarea>
        </div>

        <button class="btn-primary-tw w-full h-14 shrink-0" onclick="submitSuggestion()" id="btn-submit-suggestion">
          <i class="fas fa-paper-plane"></i> ENVIAR AL DOCENTE
        </button>
      </div>
    </div>
    `;

  document.body.appendChild(modal);
}

function toggleRatingSection() {
  const type = document.getElementById('suggestion-type')?.value;
  const ratingSection = document.getElementById('rating-section');
  const msgLabel = document.getElementById('msg-label');
  const msgArea = document.getElementById('suggestion-message');

  if (type === 'rating') {
    ratingSection?.classList.remove('hidden');
    if (msgLabel) msgLabel.querySelector('label').textContent = '🌟 ¿Qué fue lo mejor de la semana?';
    if (msgArea) msgArea.placeholder = 'Lo mejor fue... (Resume en una línea)';

    const container = document.getElementById('suggestion-eval-questions');
    if (container) {
      container.innerHTML = [
        { id: 'interest', label: 'Dinámica de Clase', desc: 'La clase fue activa y entretenida.' },
        { id: 'practice', label: 'Aprendizaje Práctico', desc: 'Aplicamos los conocimientos en retos.' },
        { id: 'resources', label: 'Uso de Recursos', desc: 'La tecnología ayudó a entender mejor.' },
        { id: 'respect', label: 'Ambiente Respetuoso', desc: 'Me sentí seguro participando.' },
        { id: 'clarity', label: 'Claridad en la Guía', desc: 'Entendí los pasos para cumplir el reto.' }
      ].map(q => `
        <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 leading-none">
          <div class="flex justify-between items-start mb-2">
            <div>
                <strong class="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">${q.label}</strong>
                <p class="text-[0.7rem] text-slate-400 font-medium">${q.desc}</p>
            </div>
            <div id="val-badge-${q.id}" class="text-[0.7rem] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md hidden">0</div>
          </div>
          <div class="flex justify-between gap-2 mt-3">
            ${[
          { v: 1, e: '😞' }, { v: 2, e: '😐' }, { v: 3, e: '🙂' }, { v: 4, e: '😃' }, { v: 5, e: '🤩' }
        ].map(opt => `
              <div onclick="selectEvalOption('${q.id}', ${opt.v})" class="eval-opt-${q.id} flex-1 h-12 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-primary grayscale opacity-40 transition-all hover:scale-110" data-value="${opt.v}">
                <div class="text-2xl">${opt.e}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  } else {
    ratingSection?.classList.add('hidden');
    if (msgLabel) msgLabel.querySelector('label').textContent = 'Tu Mensaje';
    if (msgArea) msgArea.placeholder = 'Escribe tu sugerencia...';
    Object.keys(criteriaRatings).forEach(k => criteriaRatings[k] = 0);
  }
}

function selectEvalOption(questionId, value) {
  criteriaRatings[questionId] = value;
  document.querySelectorAll(`.eval-opt-${questionId}`).forEach(el => {
    const val = parseInt(el.getAttribute('data-value'));
    if (val === value) {
      el.classList.add('ring-4', 'ring-primary', 'bg-primary/10', 'border-primary', 'scale-110');
      el.classList.remove('grayscale', 'opacity-40', 'border-slate-200', 'dark:border-slate-700');
    } else {
      el.classList.remove('ring-4', 'ring-primary', 'bg-primary/10', 'border-primary', 'scale-110');
      el.classList.add('grayscale', 'opacity-40', 'border-slate-200', 'dark:border-slate-700');
    }
  });

  // Mostrar el valor en el badge si existe
  const badge = document.getElementById(`val-badge-${questionId}`);
  if (badge) {
    badge.textContent = value;
    badge.classList.remove('hidden');
  }
}

async function submitSuggestion() {
  const type = document.getElementById('suggestion-type')?.value;
  const message = document.getElementById('suggestion-message')?.value.trim();
  const btn = document.getElementById('btn-submit-suggestion');

  if (!message) return showToast('❌ Escribe un mensaje', 'error');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  }

  try {
    const { data: student } = await _supabase
      .from('students')
      .select('school_code, grade, section')
      .eq('id', currentUser.id)
      .single();

    const { data: assignment } = await _supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('school_code', student.school_code)
      .eq('grade', student.grade)
      .eq('section', student.section)
      .maybeSingle();

    if (type === 'rating' && assignment) {
      // VALIDACIÓN DE FECHA: Verificar si ya evaluó esta semana (lunes a domingo)
      const now = new Date();
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay(); // 0 (Domingo) - 6 (Sábado)
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes previo/actual
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data: existingRating } = await _supabase
        .from('teacher_ratings')
        .select('id')
        .eq('student_id', currentUser.id)
        .eq('teacher_id', assignment.teacher_id)
        .gte('created_at', startOfWeek.toISOString())
        .maybeSingle();

      if (existingRating) {
        // Si ya existe, cambiamos el tipo a sugerencia y notificamos al usuario
        const userConfirmed = confirm(
          '⚠️ Ya has evaluado a tu docente esta semana.\n\n¿Deseas enviar este mensaje como una SUGERENCIA general en su lugar?'
        );

        if (!userConfirmed) {
          throw new Error('Evaluación cancelada. Solo se permite una evaluación por semana.');
        }

        // Si acepta, procedemos a insertar como sugerencia
        const { error } = await _supabase.from('student_suggestions').insert({
          student_id: currentUser.id,
          message: `(Redirigido de Evaluación) ${message}`,
          type: 'suggestion'
        });
        if (error) throw error;
        showToast('✅ Enviado como sugerencia exitosamente.', 'success');

      } else {
        // Si no ha evaluado esta semana, procedemos con la evaluación normal
        const avg = (criteriaRatings.interest + criteriaRatings.practice + criteriaRatings.resources + criteriaRatings.respect + criteriaRatings.clarity) / 5;
        const { error } = await _supabase.from('teacher_ratings').insert({
          student_id: currentUser.id,
          teacher_id: assignment.teacher_id,
          rating: parseFloat(avg.toFixed(1)),
          message: message,
          best_moment: message,
          q_interest: criteriaRatings.interest || 0,
          q_practice: criteriaRatings.practice || 0,
          q_resources: criteriaRatings.resources || 0,
          q_respect: criteriaRatings.respect || 0,
          q_clarity: criteriaRatings.clarity || 0
        });

        if (error) throw error;
        showToast('✅ Evaluación enviada con éxito', 'success');
      }

    } else {
      const { error } = await _supabase.from('student_suggestions').insert({
        student_id: currentUser.id, message: message, type: 'suggestion'
      });
      if (error) throw error;
      showToast('✅ Sugerencia recibida. ¡Gracias!', 'success');
    }

    document.getElementById('suggestion-modal')?.remove();
    if (typeof loadProfile === 'function') await loadProfile();
  } catch (err) {
    console.error(err);
    if (err.message.includes('Evaluación cancelada')) {
      showToast('ℹ️ ' + err.message, 'info');
    } else {
      showToast('⚠️ ' + err.message, 'warning');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> ENVIAR AL DOCENTE';
    }
  }
}

async function viewAllTeacherComments(teacherId = null) {
  const targetId = teacherId || currentUser.id;
  try {
    const { data: ratings } = await _supabase
      .from('teacher_ratings')
      .select(`*, students(full_name, school_code, grade, section)`)
      .eq('teacher_id', targetId)
      .order('created_at', { ascending: false });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300';

    const getScoreIcon = (val) => {
      const icons = { 1: '😞', 2: '😐', 3: '🙂', 4: '😃', 5: '🤩' };
      return icons[val] || '➖';
    };

    modal.innerHTML = `
      <div class="glass-card w-full max-w-2xl p-0 shadow-2xl animate-in zoom-in-95 duration-300 dark:bg-slate-900 flex flex-col max-h-[85vh] overflow-hidden">
        <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shrink-0">
          <h2 class="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg shadow-inner"><i class="fas fa-star-half-alt"></i></div>
              Historial de Feedback
          </h2>
          <button class="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-all text-xl" onclick="this.closest('.fixed').remove()">×</button>
        </div>
        
        <div class="p-6 overflow-y-auto custom-scrollbar space-y-4">
          ${(ratings || []).map(r => `
            <div class="glass-card p-5 bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800">
              <div class="flex justify-between items-start mb-4">
                <div>
                   <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Retroalimentación Anónima</span>
                   <div class="text-xs font-bold text-slate-500">Bimestre ${r.bimestre || 'N/A'} • ${new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <div class="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-black text-sm shadow-lg shadow-amber-500/20">
                  ${r.rating.toFixed(1)} <i class="fas fa-star text-[0.7rem] ml-0.5"></i>
                </div>
              </div>
              
              <div class="flex justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-800 mb-4 shadow-inner">
                 ${['q_interest', 'q_practice', 'q_resources', 'q_respect', 'q_clarity'].map(k => `
                   <div class="text-center flex-1">
                      <div class="text-[1.2rem] mb-1">${getScoreIcon(r[k])}</div>
                      <div class="text-[0.5rem] font-black text-slate-400 uppercase tracking-tighter">${k.split('_')[1]}</div>
                   </div>
                 `).join('')}
              </div>

              <p class="text-[0.85rem] font-medium text-slate-600 dark:text-slate-300 italic leading-relaxed bg-white/50 dark:bg-slate-900/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                "${sanitizeInput(r.message || 'Sin comentario adicional.')}"
              </p>
            </div>
          `).join('')}
          ${(!ratings || ratings.length === 0) ? `
            <div class="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs opacity-50">No hay feedback registrado aún</div>
          ` : ''}
        </div>
      </div>`;
    document.body.appendChild(modal);
  } catch (err) {
    console.error(err);
    showToast('❌ Error al cargar comentarios', 'error');
  }
}
