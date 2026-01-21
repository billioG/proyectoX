// ================================================
// MÓDULO DE REPORTES Y EVIDENCIA DOCENTE
// ================================================

// ------------------------------------------------
// 1. REPORTE MENSUAL (26 de cada mes)
// ------------------------------------------------

async function openMonthlyReportModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px;">
      <h2 style="color: var(--primary-color); text-align: center;">📄 Informe Mensual - ATT</h2>
      <p style="text-align: center; color: var(--text-light); margin-bottom: 20px;">
        Aulas Técnicas y Tecnológicas - Eje: Juventud / Infancia
      </p>

      <form id="monthly-report-form" onsubmit="submitMonthlyReport(event)">
        <!-- INTRODUCCIÓN -->
        <div class="form-group">
          <label>1. Introducción</label>
          <div style="background: var(--light-gray); padding: 15px; border-radius: 8px; font-size: 0.9rem; color: var(--text-dark);">
            El presente informe contiene un análisis de avance de las metas importantes establecidas 
            en el mes de <strong>${new Date().toLocaleString('es-GT', { month: 'long' })}</strong> de <strong>${new Date().getFullYear()}</strong>.
            Este informe tiene como objetivo proporcionar una visión detallada del progreso realizado...
          </div>
          <input type="hidden" name="month" value="${new Date().getMonth() + 1}">
          <input type="hidden" name="year" value="${new Date().getFullYear()}">
        </div>

        <!-- RESULTADOS ALCANZADOS -->
        <div class="form-group">
          <label>2. Resultados Alcanzados</label>
          <textarea class="input-field" name="results_intro" rows="3" placeholder="Escribe una breve introducción..." required></textarea>
          <div id="results-list" style="margin-top: 10px;">
            <div class="input-group" style="margin-bottom: 5px;">
              <span class="input-group-addon">•</span>
              <input type="text" class="input-field" name="results[]" placeholder="Hito o resultado clave 1" required>
            </div>
            <div class="input-group" style="margin-bottom: 5px;">
              <span class="input-group-addon">•</span>
              <input type="text" class="input-field" name="results[]" placeholder="Hito o resultado clave 2" required>
            </div>
            <div class="input-group" style="margin-bottom: 5px;">
              <span class="input-group-addon">•</span>
              <input type="text" class="input-field" name="results[]" placeholder="Hito o resultado clave 3" required>
            </div>
          </div>
          <button type="button" class="btn-secondary" style="margin-top: 5px; font-size: 0.8rem;" onclick="addResultField()">
            + Agregar otro punto
          </button>
        </div>

        <!-- INCONVENIENTES -->
        <div class="form-group">
          <label>3. Inconvenientes Externos</label>
          <textarea class="input-field" name="inconveniences" rows="3" placeholder="Describe cualquier inconveniente externo a 1bot..." required></textarea>
        </div>

        <!-- ACCIONES -->
        <div class="form-group">
          <label>4. Acciones Implementadas</label>
          <textarea class="input-field" name="actions" rows="3" placeholder="¿Qué acciones se tomaron para resolver los inconvenientes?" required></textarea>
        </div>

        <!-- CONCLUSIÓN -->
        <div class="form-group">
          <label>5. Conclusión</label>
          <textarea class="input-field" name="conclusion" rows="3" placeholder="Conclusión general del mes..." required></textarea>
        </div>

        <!-- FOTOGRAFÍAS -->
        <div class="form-group">
          <label>6. Evidencia Fotográfica (5 Fotos)</label>
          <input type="file" id="report-photos" class="input-field" accept="image/*" multiple onchange="previewReportPhotos(this)">
          <div id="photos-preview" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;"></div>
          <small style="color: var(--text-light);">Debes adjuntar exactamente 5 fotografías.</small>
        </div>

        <div class="modal-buttons">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          <button type="submit" class="btn-primary" id="btn-submit-report">
            <i class="fas fa-paper-plane"></i> Enviar Informe
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

function addResultField() {
  const div = document.createElement('div');
  div.className = 'input-group';
  div.style.marginBottom = '5px';
  div.innerHTML = `
    <span class="input-group-addon">•</span>
    <input type="text" class="input-field" name="results[]" placeholder="Nuevo hito..." required>
    <button type="button" onclick="this.parentElement.remove()" style="border:none; bg:transparent; cursor:pointer; color:red;">&times;</button>
  `;
  document.getElementById('results-list').appendChild(div);
}

function previewReportPhotos(input) {
  const container = document.getElementById('photos-preview');
  container.innerHTML = '';

  if (input.files.length > 5) {
    showToast('⚠️ Máximo 5 fotos', 'warning');
    input.value = ''; // Reset
    return;
  }

  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.width = '80px';
      img.style.height = '80px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '6px';
      container.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// ------------------------------------------------
// 2. EVIDENCIA SEMANAL (Por Grupo)
// ------------------------------------------------

async function openWeeklyEvidenceModal() {
  // Intentar obtener ubicación geográfica
  let locationText = 'Cargando ubicación...';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => locationText = `${pos.coords.latitude}, ${pos.coords.longitude}`,
      (err) => locationText = 'Ubicación no disponible'
    );
  } else {
    locationText = 'Geolocalización no soportada';
  }

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="padding: 25px; max-width: 500px; background: var(--bg-card); color: var(--text-color);">
      <h2 style="color: var(--primary-color); margin-top: 0;">📸 Evidencia Semanal</h2>
      <p style="color: var(--text-light); margin-bottom: 25px; line-height: 1.5;">
        Sube fotografías de tus actividades de esta semana.
      </p>

      <form onsubmit="submitWeeklyEvidence(event)">
        <input type="hidden" name="location" id="evidence-location" value="${locationText}">

        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: var(--heading-color); font-weight: 600;">Título de la Actividad</label>
          <input type="text" class="input-field" name="title" required placeholder="Ej: Taller de Robótica Básica" style="background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color);">
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: var(--heading-color); font-weight: 600;">Descripción</label>
          <textarea class="input-field" name="description" rows="3" required placeholder="Describe brevemente lo realizado..." style="background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color);"></textarea>
        </div>

        <div class="form-group" style="margin-bottom: 25px;">
          <label style="display: block; margin-bottom: 8px; color: var(--heading-color); font-weight: 600;">Fotografías (1-5)</label>
          <input type="file" id="evidence-photos" class="input-field" accept="image/*" multiple required onchange="previewReportPhotos(this)" style="background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 10px;">
          <div id="photos-preview" class="preview-container" style="margin-top: 15px; display: flex; gap: 10px; overflow-x: auto;"></div>
        </div>

        <div style="background: var(--bg-hover); padding: 15px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 25px; border: 1px solid var(--border-color);">
          <div style="margin-bottom: 5px;"><strong>📅 Fecha:</strong> ${new Date().toLocaleDateString()}</div>
          <div style="margin-bottom: 5px;"><strong>🕒 Hora:</strong> ${new Date().toLocaleTimeString()}</div>
          <div><strong>📍 Ubicación:</strong> <span id="loc-display">${locationText}</span></div>
        </div>

        <div class="modal-buttons" style="display: flex; justify-content: flex-end; gap: 12px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          <button type="submit" class="btn-primary">
            <i class="fas fa-camera"></i> Subir Evidencia
          </button>
        </div>
      </form>
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

async function submitMonthlyReport(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-report');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  // Simulamos subida a Supabase
  setTimeout(() => {
    showToast('✅ Informe Mensual enviado correctamente', 'success');
    btn.closest('.modal').remove();
    // Aquí irían los inserts a 'teacher_reports' y 'storage'
  }, 1500);
}

async function submitWeeklyEvidence(e) {
  e.preventDefault();
  showToast('✅ Evidencia subida con éxito', 'success');
  e.target.closest('.modal').remove();
  // Aquí irían los inserts a 'weekly_evidence' y 'storage'
}
