// ================================================
// MÓDULO DE REPORTES Y EVIDENCIA DOCENTE
// ================================================

// ------------------------------------------------
// 1. REPORTE MENSUAL (26 de cada mes)
// ------------------------------------------------

window.openMonthlyReportModal = async function openMonthlyReportModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const currentMonth = new Date().toLocaleString('es-GT', { month: 'long' });
  const currentYear = new Date().getFullYear();

  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-primary/20 flex flex-col max-h-[90vh]">
      <div class="bg-gradient-to-br from-primary to-indigo-600 p-8 text-center relative overflow-hidden shrink-0">
          <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div class="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl text-white mx-auto mb-4 shadow-lg">
              <i class="fas fa-file-alt"></i>
          </div>
          <h2 class="text-2xl font-black text-white uppercase tracking-tight relative z-10">Informe Mensual - ATT</h2>
          <p class="text-indigo-100 text-[0.65rem] font-bold uppercase tracking-[0.2em] mt-1 relative z-10">Aulas Técnicas y Tecnológicas • Eje: Juventud / Infancia</p>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar p-8">
        <form id="monthly-report-form" onsubmit="window.submitMonthlyReport(event)" class="space-y-6 text-left">
          <!-- INTRODUCCIÓN -->
          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">1. Introducción</label>
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-sm italic font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
              El presente informe contiene un análisis de avance de las metas importantes establecidas 
              en el mes de <strong class="text-primary font-black uppercase">${currentMonth}</strong> de <strong class="text-primary font-black uppercase">${currentYear}</strong>.
            </div>
            <input type="hidden" name="month" value="${new Date().getMonth() + 1}">
            <input type="hidden" name="year" value="${new Date().getFullYear()}">
          </div>

          <!-- RESULTADOS ALCANZADOS -->
          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">2. Resultados Alcanzados</label>
            <textarea class="input-field-tw mb-4" name="results_intro" rows="2" placeholder="Escribe una breve introducción..." required></textarea>
            
            <div id="results-list" class="space-y-3">
              <div class="flex gap-2">
                <input type="text" class="input-field-tw h-11 text-sm" name="results[]" placeholder="Hito o resultado clave 1" required>
              </div>
              <div class="flex gap-2">
                <input type="text" class="input-field-tw h-11 text-sm" name="results[]" placeholder="Hito o resultado clave 2" required>
              </div>
            </div>
            <button type="button" class="mt-4 text-[0.65rem] font-black uppercase text-primary hover:text-indigo-600 tracking-widest flex items-center gap-2 transition-colors" onclick="window.addResultField()">
              <i class="fas fa-plus-circle"></i> Agregar otro punto
            </button>
          </div>

          <!-- GRID DOS COLUMNAS PARA SECCIONES CORTAS -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">3. Inconvenientes Externos</label>
              <textarea class="input-field-tw" name="inconveniences" rows="3" placeholder="Describe problemas externos..." required></textarea>
            </div>
            <div>
              <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">4. Acciones Implementadas</label>
              <textarea class="input-field-tw" name="actions" rows="3" placeholder="¿Cómo lo resolviste?" required></textarea>
            </div>
          </div>

          <!-- CONCLUSIÓN -->
          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">5. Conclusión</label>
            <textarea class="input-field-tw" name="conclusion" rows="3" placeholder="Conclusión general del mes..." required></textarea>
          </div>

          <!-- FOTOGRAFÍAS -->
          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">6. Evidencia Fotográfica (5 Fotos)</label>
            <div class="relative group cursor-pointer mb-3">
                <div class="absolute inset-0 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl group-hover:border-primary transition-colors flex flex-col items-center justify-center p-6 pointer-events-none">
                     <i class="fas fa-images text-2xl text-slate-300 dark:text-slate-600 mb-2 group-hover:text-primary transition-colors"></i>
                     <span class="text-[0.6rem] font-black text-slate-400 group-hover:text-primary uppercase tracking-widest">Seleccionar Imágenes</span>
                </div>
                <input type="file" id="report-photos" class="w-full h-24 opacity-0 cursor-pointer" accept="image/*" multiple onchange="window.previewReportPhotos(this)">
            </div>
            <div id="photos-preview" class="flex gap-2 flex-wrap min-h-[60px]"></div>
            <p class="text-[0.55rem] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-1"><i class="fas fa-info-circle text-primary"></i> Se requieren exactamente 5 fotografías para el reporte.</p>
          </div>

          <div class="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button type="button" class="flex-1 btn-secondary-tw h-12 uppercase tracking-widest text-xs font-black" onclick="this.closest('.fixed').remove()">Cancelar</button>
            <button type="submit" class="flex-[2] btn-primary-tw h-12 uppercase tracking-widest text-xs font-black shadow-lg shadow-primary/20" id="btn-submit-report">
              <i class="fas fa-paper-plane mr-2"></i> Enviar Informe
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.addResultField = function addResultField() {
  const container = document.getElementById('results-list');
  const div = document.createElement('div');
  div.className = 'flex gap-2 animate-fadeIn';
  div.innerHTML = `
    <input type="text" class="input-field-tw h-11 text-sm" name="results[]" placeholder="Nuevo hito..." required>
    <button type="button" onclick="this.parentElement.remove()" class="w-11 h-11 shrink-0 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
      <i class="fas fa-times"></i>
    </button>
  `;
  container.appendChild(div);
}

window.previewReportPhotos = function previewReportPhotos(input) {
  const container = document.getElementById('photos-preview');
  container.innerHTML = '';

  if (input.files.length > 5) {
    showToast('⚠️ Máximo 5 fotos permitidas', 'warning');
    input.value = '';
    return;
  }

  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgDiv = document.createElement('div');
      imgDiv.className = 'w-16 h-16 rounded-xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm animate-slideUp ring-1 ring-slate-100 dark:ring-slate-700';
      imgDiv.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
      container.appendChild(imgDiv);
    };
    reader.readAsDataURL(file);
  });
}

// ------------------------------------------------
// 2. EVIDENCIA SEMANAL (Por Grupo)
// ------------------------------------------------

// ------------------------------------------------
// 2. EVIDENCIA SEMANAL (Por Grupo)
// ------------------------------------------------

window.openWeeklyEvidenceModal = async function openWeeklyEvidenceModal() {
  let locationText = 'Cargando ubicación...';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationText = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        const input = document.getElementById('evidence-location');
        const display = document.getElementById('loc-display');
        if (input) input.value = locationText;
        if (display) display.textContent = locationText;
      },
      (err) => locationText = 'Ubicación desactivada'
    );
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-primary/20">
      <div class="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-center relative overflow-hidden">
          <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div class="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl text-white mx-auto mb-4 shadow-lg">
              <i class="fas fa-camera"></i>
          </div>
          <h2 class="text-2xl font-black text-white uppercase tracking-tight relative z-10">Evidencia Semanal</h2>
          <p class="text-indigo-100 text-[0.65rem] font-bold uppercase tracking-[0.2em] mt-1 relative z-10">Documenta tus actividades</p>
      </div>

      <div class="p-8">
        <form onsubmit="window.submitWeeklyEvidence(event)" class="space-y-5 text-left">
          <input type="hidden" name="location" id="evidence-location" value="${locationText}">

          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Actividad</label>
            <input type="text" class="input-field-tw h-11 text-sm pt-0 pb-0" name="title" required placeholder="Ej: Taller de Robótica">
          </div>

          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Descripción</label>
            <textarea class="input-field-tw text-sm" name="description" rows="3" required placeholder="¿Qué se realizó hoy?"></textarea>
          </div>

          <div>
            <label class="text-[0.7rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Fotos (1-5)</label>
            <div class="relative group cursor-pointer mb-2">
                <div class="absolute inset-0 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl group-hover:border-primary transition-colors flex flex-col items-center justify-center p-4 pointer-events-none">
                     <i class="fas fa-cloud-upload-alt text-xl text-slate-300 dark:text-slate-600 mb-1 group-hover:text-primary transition-colors"></i>
                     <span class="text-[0.6rem] font-black text-slate-400 group-hover:text-primary uppercase">Click para subir</span>
                </div>
                <input type="file" id="evidence-photos" class="w-full h-20 opacity-0 cursor-pointer" accept="image/*" multiple required onchange="window.previewReportPhotos(this)">
            </div>
            <div id="photos-preview" class="flex gap-2 flex-wrap min-h-[40px]"></div>
          </div>

          <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
            <div class="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
              <span>📅 ${new Date().toLocaleDateString()}</span>
              <span>📍 <span id="loc-display">${locationText}</span></span>
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 btn-secondary-tw h-12 uppercase tracking-widest text-[0.65rem] font-black" onclick="this.closest('.fixed').remove()">Cancelar</button>
            <button type="submit" class="flex-[2] btn-primary-tw h-12 uppercase tracking-widest text-[0.65rem] font-black shadow-lg shadow-primary/20">
              <i class="fas fa-cloud-upload-alt mr-2"></i> SUBIR EVIDENCIA
            </button>
          </div>
        </form>
      </div>
    </div>
    `;
  document.body.appendChild(modal);
  // Actualizar ubicación si llega después
  setTimeout(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = `${pos.coords.latitude}, ${pos.coords.longitude} `;
        const input = document.getElementById('evidence-location');
        const display = document.getElementById('loc-display');
        if (input) input.value = loc;
        if (display) display.textContent = loc;
      });
    }
  }, 2000);
}

// ------------------------------------------------
// LOGICA DE ENVÍO (Simulada para UI)
// ------------------------------------------------

window.submitMonthlyReport = async function submitMonthlyReport(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-report');
  const formData = new FormData(e.target);

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    const results = Array.from(formData.getAll('results[]'));
    const { error } = await _supabase
      .from('teacher_monthly_reports')
      .insert({
        teacher_id: currentUser.id,
        month: parseInt(formData.get('month')),
        year: parseInt(formData.get('year')),
        results_intro: formData.get('results_intro'),
        results: results,
        inconveniences: formData.get('inconveniences'),
        actions: formData.get('actions'),
        conclusion: formData.get('conclusion'),
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    showToast('✅ Informe Mensual enviado correctamente', 'success');
    e.target.closest('.modal').remove();
    initGamification(); // Recargar XP
  } catch (err) {
    console.error('Error enviando informe:', err);
    showToast('❌ Error al enviar informe: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Informe';
  }
}

window.submitWeeklyEvidence = async function submitWeeklyEvidence(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const formData = new FormData(e.target);
  const photos = document.getElementById('evidence-photos').files;

  if (photos.length === 0) {
    return showToast('❌ Adjunta al menos una fotografía', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';

  try {
    // 1. Subir fotos (solo la primera como representativa para simplificar en esta tabla)
    // Opcionalmente se podrían subir todas y guardar URLs en un array.
    let photoUrl = '';
    if (photos.length > 0) {
      const file = photos[0];
      const fileName = `evidence/${currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { error: uploadError } = await _supabase.storage.from('project-videos').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = _supabase.storage.from('project-videos').getPublicUrl(fileName);
      photoUrl = data.publicUrl;
    }

    // 2. Insertar en base de datos
    const { error } = await _supabase
      .from('weekly_evidence')
      .insert({
        teacher_id: currentUser.id,
        title: formData.get('title'),
        description: formData.get('description'),
        photo_url: photoUrl,
        location: formData.get('location'),
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    showToast('✅ Evidencia subida con éxito y +10 XP sumados.', 'success');
    const modal = e.target.closest('.fixed') || e.target.closest('.modal');
    if (modal) modal.remove();

    // Recargar XP y Feed para ocultar el botón
    initGamification();
    loadFeed();

  } catch (err) {
    console.error('Error subiendo evidencia:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-camera"></i> Subir Evidencia';
  }
}
