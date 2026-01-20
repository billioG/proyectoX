// ================================================
// GESTIÓN DE ASISTENCIA - PARTE 1: VISTA PRINCIPAL
// ================================================

async function loadAttendance() {
  const container = document.getElementById('attendance-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando asistencia...</div>';

  try {
    if (userRole === 'docente' || userRole === 'admin') {
      container.innerHTML = `
        <div id="attendance-stats-container"></div>
        <div id="attendance-main-interface"></div>
      `;
      await loadAttendanceInterface();
      await loadAttendanceStats();
    } else {
      container.innerHTML = '<div class="info-box">ℹ️ Esta sección es solo para docentes y administradores</div>';
    }
  } catch (err) {
    console.error('Error cargando asistencia:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar asistencia</div>';
  }
}

async function loadAttendanceInterface() {
  const container = document.getElementById('attendance-main-interface');
  if (!container) return;

  const { data: assignments } = await _supabase
    .from('teacher_assignments')
    .select(`
      school_code,
      grade,
      section,
      schools(name)
    `)
    .eq('teacher_id', currentUser.id);

  container.innerHTML = `
    <div class="section-card" style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 1.3rem;">📱 Tomar Asistencia con QR</h3>
      <p style="color: var(--text-light); margin-bottom: 20px; font-size: 0.9rem;">
        Los estudiantes mostrarán su código QR y tú lo escanearás con la cámara
      </p>

      ${assignments && assignments.length > 0 ? `
        <label>
          <strong>Selecciona el Grupo/Sección:</strong>
          <select id="attendance-assignment" class="input-field" onchange="loadStudentsForAttendance()">
            <option value="">Seleccionar...</option>
            ${assignments.map((a, index) => `
              <option value="${index}" data-school="${a.school_code}" data-grade="${a.grade}" data-section="${a.section}">
                ${sanitizeInput(a.schools?.name || 'Establecimiento')} - ${a.grade} ${a.section}
              </option>
            `).join('')}
          </select>
        </label>
      ` : '<p class="empty-state">No tienes asignaciones de grupos</p>'}

      <div id="attendance-students-list" style="display: none; margin-top: 24px;"></div>

      <div id="qr-scanner-section" style="display: none; margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0;">📸 Escanear Código QR</h4>
          <button class="btn-secondary" onclick="printSectionQRs()" style="padding: 6px 12px; font-size: 0.85rem;">
            <i class="fas fa-print"></i> Imprimir todos los QRs
          </button>
        </div>
        <div style="text-align: center; margin-bottom: 20px;">
          <button class="btn-primary" onclick="startQRScanner()" id="btn-start-scanner">
            <i class="fas fa-camera"></i> Activar Cámara
          </button>
          <button class="btn-secondary" onclick="stopQRScanner()" id="btn-stop-scanner" style="display: none;">
            <i class="fas fa-stop"></i> Detener Cámara
          </button>
        </div>

        <div id="qr-video-container" style="display: none; max-width: 500px; margin: 0 auto; position: relative;">
          <video id="qr-video" style="width: 100%; border-radius: 12px; border: 3px solid var(--primary-color);"></video>
          <div id="qr-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60%; height: 60%; border: 3px solid var(--primary-color); border-radius: 12px; pointer-events: none;"></div>
        </div>

        <div id="scan-result" style="margin-top: 20px; text-align: center;"></div>
      </div>
    </div>

    <div class="section-card">
      <h3 style="margin: 0 0 16px; font-size: 1.3rem;">📊 Historial de Asistencia</h3>
      <div id="attendance-history"></div>
    </div>
  `;

  await loadAttendanceHistory();
}

async function loadStudentsForAttendance() {
  const select = document.getElementById('attendance-assignment');
  const studentsList = document.getElementById('attendance-students-list');
  const scannerSection = document.getElementById('qr-scanner-section');

  if (!select || !studentsList) return;

  const selectedOption = select.options[select.selectedIndex];
  const schoolCode = selectedOption?.dataset.school;
  const grade = selectedOption?.dataset.grade;
  const section = selectedOption?.dataset.section;

  if (!schoolCode || !grade || !section) {
    studentsList.style.display = 'none';
    scannerSection.style.display = 'none';
    return;
  }

  const cacheKey = `attendance_students_${schoolCode}_${grade}_${section}`;
  const today = new Date().toISOString().split('T')[0];

  try {
    let students, todayAttendance;

    if (navigator.onLine) {
      // 1. Cargar desde Supabase
      const [studentsRes, attendanceRes] = await Promise.all([
        _supabase.from('students').select('id, full_name, username, profile_photo_url').eq('school_code', schoolCode).eq('grade', grade).eq('section', section).order('full_name'),
        _supabase.from('attendance').select('student_id, status').eq('date', today).eq('school_code', schoolCode).eq('grade', grade).eq('section', section)
      ]);

      if (studentsRes.error) throw studentsRes.error;

      students = studentsRes.data;
      todayAttendance = attendanceRes.data || [];

      // 2. Guardar en caché local
      await _syncManager.setCache(cacheKey, { students, todayAttendance });
    } else {
      // 3. Fallback a caché local
      const cached = await _syncManager.getCache(cacheKey);
      if (cached) {
        students = cached.students;
        todayAttendance = cached.todayAttendance;
        showToast('📂 Cargando datos desde caché (Modo Offline)', 'info');
      } else {
        studentsList.innerHTML = '<p class="empty-state">❌ No hay datos guardados para este grupo para trabajar offline</p>';
        return;
      }
    }

    const attendanceMap = {};
    todayAttendance?.forEach(a => {
      attendanceMap[a.student_id] = a.status;
    });

    studentsList.innerHTML = `
      <h4 style="margin-bottom: 12px; color: var(--heading-color);">👥 Estudiantes de ${grade} ${section}</h4>
      <div style="display: grid; gap: 10px;">
        ${students.map(s => {
      const status = attendanceMap[s.id] || 'absent';
      const statusConfig = {
        'present': { color: 'var(--success-color)', icon: '✓', text: 'Presente' },
        'absent': { color: 'var(--danger-color)', icon: '✗', text: 'Ausente' },
        'late': { color: 'var(--warning-color)', icon: '⏰', text: 'Tarde' }
      };
      const config = statusConfig[status];

      return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
              <div style="display: flex; align-items: center; gap: 12px;">
                ${s.profile_photo_url
          ? `<img src="${s.profile_photo_url}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary-color);">`
          : '<div style="width: 36px; height: 36px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--text-light);">👤</div>'
        }
                <div>
                  <strong style="display: block; font-size: 0.95rem; color: var(--text-color);">${sanitizeInput(s.full_name)}</strong>
                  <small style="color: var(--text-light);">@${s.username}</small>
                </div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span style="background: ${config.color}; color: white; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">
                  ${config.icon} ${config.text}
                </span>
                <button class="btn-icon" onclick="viewStudentQR('${s.id}', '${sanitizeInput(s.full_name)}', '${s.username}')" title="Ver QR" style="background: var(--bg-hover); color: var(--text-color);">
                  <i class="fas fa-qrcode"></i>
                </button>
              </div>
            </div>
          `;
    }).join('')}
      </div>

      <div style="margin-top: 20px; padding: 16px; background: var(--bg-hover); border-radius: 8px; text-align: center; border: 1px solid var(--border-color); color: var(--text-color);">
        <strong>Total: ${students.length} estudiantes</strong> • 
        <span style="color: var(--success-color); font-weight: 700;">✓ ${Object.values(attendanceMap).filter(s => s === 'present').length} Presentes</span> • 
        <span style="color: var(--danger-color); font-weight: 700;">✗ ${students.length - Object.values(attendanceMap).filter(s => s !== 'absent').length} Ausentes</span>
      </div>
    `;

    studentsList.style.display = 'block';
    scannerSection.style.display = 'block';

  } catch (err) {
    console.error('Error cargando estudiantes:', err);
  }
}
// ================================================
// PARTE 2: SCANNER DE CÓDIGOS QR
// ================================================

let qrStream = null;
let qrScanning = false;
let lastScannedIds = {}; // Cooldown para no repetir escaneo del mismo alumno seguido
const SCAN_COOLDOWN = 5000; // 5 segundos de espera para re-escanear al mismo alumno

// Audio para feedback (Beep)
const beepAudio = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
  const oscillator = beepAudio.createOscillator();
  const gainNode = beepAudio.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(beepAudio.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(800, beepAudio.currentTime);
  gainNode.gain.setValueAtTime(0.1, beepAudio.currentTime);
  oscillator.start();
  oscillator.stop(beepAudio.currentTime + 0.1);
}

async function startQRScanner() {
  const videoElement = document.getElementById('qr-video');
  const videoContainer = document.getElementById('qr-video-container');
  const startBtn = document.getElementById('btn-start-scanner');
  const stopBtn = document.getElementById('btn-stop-scanner');
  const resultDiv = document.getElementById('scan-result');

  if (!videoElement || qrScanning) return;

  try {
    qrScanning = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    qrStream = stream;
    videoElement.srcObject = stream;
    videoElement.play();

    videoContainer.style.display = 'block';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    resultDiv.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">📸 Apunta la cámara al código QR del estudiante...</p>';

    // Cargar librería jsQR si no está disponible
    if (typeof jsQR === 'undefined') {
      await loadJsQRLibrary();
    }

    scanQRCode(videoElement, resultDiv);

  } catch (err) {
    console.error('Error iniciando cámara:', err);
    showToast('❌ No se pudo acceder a la cámara', 'error');
    qrScanning = false;

    if (err.name === 'NotAllowedError') {
      resultDiv.innerHTML = '<p style="color: var(--danger-color);">❌ Permiso de cámara denegado. Permite el acceso en la configuración del navegador.</p>';
    } else {
      resultDiv.innerHTML = '<p style="color: var(--danger-color);">❌ Error al acceder a la cámara</p>';
    }
  }
}

function loadJsQRLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof jsQR !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function scanQRCode(videoElement, resultDiv) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  function tick() {
    if (!qrScanning) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code) {
          handleQRCodeDetected(code.data, resultDiv);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  tick();
}

async function handleQRCodeDetected(qrData, resultDiv) {
  try {
    const data = JSON.parse(qrData);
    const studentId = data.id || data.student_id;

    if (!studentId) return;

    // Verificar cooldown
    const now = Date.now();
    if (lastScannedIds[studentId] && (now - lastScannedIds[studentId] < SCAN_COOLDOWN)) {
      return;
    }

    lastScannedIds[studentId] = now;
    playBeep();
    if (navigator.vibrate) navigator.vibrate(200);

    // Efecto visual de flash
    const videoContainer = document.getElementById('qr-video-container');
    videoContainer.style.boxShadow = '0 0 30px #4caf50';
    setTimeout(() => videoContainer.style.boxShadow = 'none', 300);

    // Obtener información del estudiante
    let student;
    if (navigator.onLine) {
      const { data, error } = await _supabase
        .from('students')
        .select('id, full_name, username, school_code, grade, section')
        .eq('id', studentId)
        .single();
      if (!error) student = data;
    }

    // Si falló o estamos offline, buscar en el cache de la vista actual
    if (!student) {
      const select = document.getElementById('attendance-assignment');
      const selectedOption = select?.options[select.selectedIndex];
      if (selectedOption) {
        const cacheKey = `attendance_students_${selectedOption.dataset.school}_${selectedOption.dataset.grade}_${selectedOption.dataset.section}`;
        const cached = await _syncManager.getCache(cacheKey);
        student = cached?.students?.find(s => s.id === studentId);
        // El cache de students no tiene school_code/grade/section completo por registro, lo tomamos del select
        if (student) {
          student.school_code = selectedOption.dataset.school;
          student.grade = selectedOption.dataset.grade;
          student.section = selectedOption.dataset.section;
        }
      }
    }

    if (!student) {
      console.warn('⚠️ Estudiante no encontrado en caché ni online');
      return;
    }

    // Registrar asistencia
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0];
    const attendanceData = {
      student_id: student.id,
      teacher_id: currentUser.id,
      school_code: student.school_code,
      grade: student.grade,
      section: student.section,
      date: todayStr,
      time: timeStr,
      status: 'present'
    };

    let successOnline = false;
    if (navigator.onLine) {
      try {
        const { error: attendanceError } = await _supabase
          .from('attendance')
          .upsert(attendanceData, { onConflict: 'student_id,date' });

        if (attendanceError) {
          // Error de datos o esquema, no de red
          console.error('❌ Supabase Error:', attendanceError);
          showToast(`❌ Error: ${attendanceError.message}`, 'error');
          return;
        }
        successOnline = true;
      } catch (netErr) {
        console.warn('⚠️ Fallo de conexión en asistencia, guardando offline:', netErr);
        successOnline = false;
      }
    }

    if (!successOnline) {
      await _syncManager.enqueue('mark_attendance', attendanceData);
      // Actualizar caché local para que se vea reflejado el cambio
      const cacheKey = `attendance_students_${student.school_code}_${student.grade}_${student.section}`;
      const cached = await _syncManager.getCache(cacheKey);
      if (cached) {
        const existingIdx = cached.todayAttendance.findIndex(a => a.student_id === student.id);
        if (existingIdx >= 0) cached.todayAttendance[existingIdx].status = 'present';
        else cached.todayAttendance.push({ student_id: student.id, status: 'present' });
        await _syncManager.setCache(cacheKey, cached);
      }
      showToast('📥 Asistencia en cola (Conexión inestable)', 'warning');
    }

    resultDiv.innerHTML = `
      <div style="background: rgba(76, 175, 80, 0.15); padding: 15px; border-radius: 12px; border: 2px solid #4caf50; animation: pulse 0.5s;">
        <h4 style="margin: 0; color: #2e7d32;">✅ ${sanitizeInput(student.full_name)}</h4>
        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #4caf50;">REGISTRADO - ${timeStr}</p>
      </div>
    `;

    showToast(`✅ ${student.full_name} registrado`, 'success');

    // Recargar lista de estudiantes (opcional, para ver el check)
    loadStudentsForAttendance();

  } catch (err) {
    console.error('Error detallado procesando QR:', err);
    resultDiv.innerHTML = `
      <div style="background: #ffebee; padding: 16px; border-radius: 8px; border: 2px solid var(--danger-color); margin-bottom: 15px;">
        <p style="margin: 0; color: var(--danger-color); font-weight: 600;">❌ Error: ${err.message || 'Error desconocido'}</p>
      </div>
    `;

    // Si fue un error de Supabase, no mostramos toast para no saturar, pero el div arriba lo indica
    if (!(err instanceof SyntaxError)) {
      // Intentar reanudar después de error si es necesario
      setTimeout(() => {
        if (qrScanning) resultDiv.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">📸 Listo para intentar de nuevo...</p>';
      }, 3000);
    }
  }
}

async function printSectionQRs() {
  const select = document.getElementById('attendance-assignment');
  const selectedOption = select?.options[select.selectedIndex];

  if (!selectedOption || !selectedOption.value) {
    return showToast('❌ Selecciona una sección primero', 'error');
  }

  const schoolCode = selectedOption.dataset.school;
  const grade = selectedOption.dataset.grade;
  const section = selectedOption.dataset.section;
  const schoolName = selectedOption.text.split(' - ')[0];

  try {
    showToast('⏳ Generando vista de impresión...', 'info');

    const { data: students, error } = await _supabase
      .from('students')
      .select('id, full_name, username')
      .eq('school_code', schoolCode)
      .eq('grade', grade)
      .eq('section', section)
      .order('full_name');

    if (error) throw error;
    if (!students || students.length === 0) throw new Error('No hay estudiantes en esta sección');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>QRs - ${grade} ${section}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #00bcd4; padding-bottom: 15px; }
            .print-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
            .qr-card { border: 1px solid #eee; padding: 15px; text-align: center; page-break-inside: avoid; border-radius: 12px; background: #fafafa; }
            .qr-card h3 { margin: 10px 0 5px; font-size: 0.85rem; font-weight: 600; height: 2.5em; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            .qr-card p { margin: 0; font-size: 0.75rem; color: #666; font-family: monospace; }
            .qr-placeholder { width: 140px; height: 140px; margin: 0 auto; background: white; padding: 5px; border-radius: 5px; }
            .qr-placeholder img { max-width: 100%; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
              .qr-card { border: 1px solid #ddd; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="position: sticky; top: 0; background: white; padding: 15px; border-bottom: 1px solid #ccc; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; z-index: 100;">
            <button onclick="window.print()" style="background: #00bcd4; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; font-family: inherit;">🖨️ Imprimir Ahora</button>
            <p style="margin: 0; font-size: 0.9rem;">Tip: En la configuración de impresión, activa "Gráficos de fondo" y usa orientación Vertical.</p>
          </div>
          <div class="header">
            <h1 style="margin: 0; color: #00bcd4; font-size: 1.5rem;">Asistencia 1Bot</h1>
            <p style="margin: 5px 0 0;">${schoolName} | ${grade} ${section}</p>
          </div>
          <div class="print-grid" id="print-container"></div>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <script>
            const students = ${JSON.stringify(students)};
            const container = document.getElementById('print-container');
            
            students.forEach(s => {
              const card = document.createElement('div');
              card.className = 'qr-card';
              card.innerHTML = \`
                <div id="qr-\${s.id}" class="qr-placeholder"></div>
                <h3>\${s.full_name}</h3>
                <p>@\${s.username}</p>
              \`;
              container.appendChild(card);
              
              new QRCode(document.getElementById('qr-' + s.id), {
                text: JSON.stringify({ id: s.id, username: s.username, timestamp: Date.now() }),
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
              });
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();

  } catch (err) {
    console.error('Error al imprimir QRs:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

function stopQRScanner() {
  qrScanning = false;

  if (qrStream) {
    qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }

  const videoElement = document.getElementById('qr-video');
  const videoContainer = document.getElementById('qr-video-container');
  const startBtn = document.getElementById('btn-start-scanner');
  const stopBtn = document.getElementById('btn-stop-scanner');

  if (videoElement) videoElement.srcObject = null;
  if (videoContainer) videoContainer.style.display = 'none';
  if (startBtn) startBtn.style.display = 'inline-block';
  if (stopBtn) stopBtn.style.display = 'none';
}
// ================================================
// PARTE 3: HISTORIAL Y REGISTRO MANUAL
// ================================================

async function loadAttendanceHistory() {
  const container = document.getElementById('attendance-history');
  if (!container) return;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: attendance, error } = await _supabase
      .from('attendance')
      .select(`
        *,
        students(full_name, username),
        schools(name)
      `)
      .eq('teacher_id', currentUser.id)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!attendance || attendance.length === 0) {
      container.innerHTML = '<p class="empty-state">No hay registros de asistencia en los últimos 30 días</p>';
      return;
    }

    // Agrupar por fecha
    const groupedByDate = attendance.reduce((acc, record) => {
      if (!acc[record.date]) {
        acc[record.date] = [];
      }
      acc[record.date].push(record);
      return acc;
    }, {});

    container.innerHTML = Object.entries(groupedByDate).map(([date, records]) => `
      <div style="margin-bottom: 16px;">
        <h4 style="margin-bottom: 10px; color: var(--dark); font-size: 1rem;">
          📅 ${formatDate(date)} 
          <span style="color: var(--text-light); font-weight: 400; font-size: 0.85rem;">(${records.length} registros)</span>
        </h4>
        <div style="display: grid; gap: 8px;">
          ${records.map(r => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--light-gray); border-radius: 6px;">
              <div>
                <strong style="font-size: 0.9rem;">${sanitizeInput(r.students?.full_name || 'Estudiante')}</strong>
                <small style="display: block; color: var(--text-light); margin-top: 2px;">
                  ${r.schools?.name || ''} • ${r.grade} ${r.section}
                </small>
              </div>
              <div style="text-align: right;">
                <span style="background: ${r.status === 'present' ? '#4caf50' : r.status === 'late' ? '#ff9800' : '#f44336'}; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                  ${r.status === 'present' ? '✓ Presente' : r.status === 'late' ? '⏰ Tarde' : '✗ Ausente'}
                </span>
                <small style="display: block; color: var(--text-light); margin-top: 4px;">${r.time}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Error cargando historial:', err);
    container.innerHTML = '<p class="error-state">❌ Error al cargar historial</p>';
  }
}

async function markAttendanceManual(studentId, status) {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const timeStr = today.toTimeString().split(' ')[0];

    const { data: student } = await _supabase
      .from('students')
      .select('school_code, grade, section, full_name')
      .eq('id', studentId)
      .single();

    if (!student) throw new Error('Estudiante no encontrado');

    const { error } = await _supabase
      .from('attendance')
      .upsert({
        student_id: studentId,
        teacher_id: currentUser.id,
        school_code: student.school_code,
        grade: student.grade,
        section: student.section,
        date: dateStr,
        time: timeStr,
        status: status
      }, {
        onConflict: 'student_id,date'
      });

    if (error) throw error;

    showToast(`✅ ${student.full_name} marcado como ${status === 'present' ? 'presente' : status === 'late' ? 'tarde' : 'ausente'}`, 'success');

    await loadStudentsForAttendance();
    await loadAttendanceHistory();

  } catch (err) {
    console.error('Error registrando asistencia:', err);
    showToast('❌ Error al registrar asistencia', 'error');
  }
}

async function exportAttendanceCSV() {
  try {
    const select = document.getElementById('attendance-assignment');
    const selectedOption = select?.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
      return showToast('❌ Selecciona un grupo primero', 'error');
    }

    const schoolCode = selectedOption.dataset.school;
    const grade = selectedOption.dataset.grade;
    const section = selectedOption.dataset.section;

    const { data: attendance } = await _supabase
      .from('attendance')
      .select(`
        date,
        time,
        status,
        students(full_name, username)
      `)
      .eq('school_code', schoolCode)
      .eq('grade', grade)
      .eq('section', section)
      .order('date', { ascending: false })
      .order('time', { ascending: false });

    if (!attendance || attendance.length === 0) {
      return showToast('❌ No hay asistencia para exportar', 'error');
    }

    let csvContent = 'Fecha,Hora,Estudiante,Username,Estado\n';

    attendance.forEach(a => {
      const studentName = (a.students?.full_name || 'N/A').replace(/,/g, ';');
      const username = a.students?.username || '';
      const status = a.status === 'present' ? 'Presente' : a.status === 'late' ? 'Tarde' : 'Ausente';

      csvContent += `${a.date},${a.time},"${studentName}",${username},${status}\n`;
    });

    downloadCSV(csvContent, `asistencia_${grade}_${section}.csv`);
    showToast(`✅ Asistencia exportada`, 'success');

  } catch (err) {
    console.error('Error exportando asistencia:', err);
    showToast('❌ Error al exportar', 'error');
  }
}

/**
 * Calcula y muestra estadísticas de asistencia semanal para el docente
 */
async function loadAttendanceStats() {
  const statsContainer = document.getElementById('attendance-stats-container');
  if (!statsContainer) return;

  statsContainer.innerHTML = '<div class="skeleton skeleton-box" style="height: 100px; margin-bottom: 20px;"></div>';

  try {
    // 1. Obtener total de alumnos asignados
    const { data: assignments } = await _supabase
      .from('teacher_assignments')
      .select('school_code, grade, section')
      .eq('teacher_id', currentUser.id);

    let totalAssignedStudents = 0;
    if (assignments) {
      for (const ass of assignments) {
        const { count } = await _supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('school_code', ass.school_code)
          .eq('grade', ass.grade)
          .eq('section', ass.section);
        totalAssignedStudents += (count || 0);
      }
    }

    // 2. Determinar rango de la semana (Lunes a hoy)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Dom) a 6 (Sab)
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const { data: weeklyAttendance } = await _supabase
      .from('attendance')
      .select('id')
      .eq('teacher_id', currentUser.id)
      .gte('date', monday.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0]);

    // Calcular días lectivos pasados (máx 5)
    const schoolDaysPassed = Math.max(1, dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5));
    const expectedRecords = totalAssignedStudents * schoolDaysPassed;
    const actualRecords = weeklyAttendance?.length || 0;
    const percentage = expectedRecords > 0 ? ((actualRecords / expectedRecords) * 100).toFixed(1) : 0;

    statsContainer.innerHTML = `
      <div class="section-card" style="background: linear-gradient(135deg, #11998e, #38ef7d); color: white; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px; font-size: 1.2rem;">📊 Resumen de Asistencia Semanal</h3>
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700;">${totalAssignedStudents}</div>
            <small style="opacity: 0.9;">Total Alumnos</small>
          </div>
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700;">${percentage}%</div>
            <small style="opacity: 0.9;">Promedio Semanal</small>
          </div>
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700;">${actualRecords}</div>
            <small style="opacity: 0.9;">Asistencias Tomadas</small>
          </div>
        </div>
        <p style="margin: 15px 0 0; font-size: 0.85rem; opacity: 0.8;">
          <i class="fas fa-info-circle"></i> Basado en ${schoolDaysPassed} días lectivos de esta semana.
        </p>
      </div>
    `;

    // 4. Informe Automático al Admin (Si es viernes o fin de semana)
    if (dayOfWeek >= 5 || dayOfWeek === 0) {
      await checkAndSendWeeklyReport(totalAssignedStudents, percentage, actualRecords);
    }

  } catch (err) {
    console.error('Error stats:', err);
    statsContainer.innerHTML = '';
  }
}

/**
 * Genera un informe semanal automático para el administrador
 */
async function checkAndSendWeeklyReport(totalStudents, percentage, records) {
  try {
    const today = new Date();
    const weekNumber = getWeekNumber(today);
    const year = today.getFullYear();
    const reportKey = `report_${currentUser.id}_${year}_${weekNumber}`;

    // Verificar si ya existe este informe
    const { data: existing } = await _supabase
      .from('attendance_reports')
      .select('id')
      .eq('report_key', reportKey)
      .maybeSingle();

    if (existing) return;

    // Crear informe
    await _supabase.from('attendance_reports').insert({
      report_key: reportKey,
      teacher_id: currentUser.id,
      total_students: totalStudents,
      attendance_percentage: parseFloat(percentage),
      total_records: records,
      week_number: weekNumber,
      year: year
    });

    console.log('✅ Informe semanal enviado al administrador');
  } catch (err) {
    // Es probable que la tabla no exista aún, ignoramos silenciosamente
    console.warn('⚠️ No se pudo enviar el informe semanal (¿Existe la tabla attendance_reports?)');
  }
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

console.log('✅ attendance.js cargado completamente');
