/**
 * ATTENDANCE - Gestión de Asistencia (Premium Edition)
 */

async function loadAttendance() {
    const container = document.getElementById('attendance-container');
    if (!container) return;

    container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-emerald-500"></i>
        <span class="font-black uppercase text-xs tracking-widest text-center">Iniciando Ecosistema de Asistencia...</span>
    </div>
  `;

    try {
        if (userRole === 'docente' || userRole === 'admin') {
            container.innerHTML = `
        <div id="attendance-stats-container" class="mb-8 animate-fadeIn"></div>
        <div id="attendance-main-interface" class="space-y-8 animate-fadeIn" style="animation-delay: 100ms"></div>
      `;
            await loadAttendanceInterface();
        } else {
            container.innerHTML = '<div class="glass-card p-10 text-slate-500 font-bold text-center text-xs uppercase tracking-widest">Acceso denegado para este rol.</div>';
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center text-xs uppercase tracking-widest">❌ Falló el enlace con el servidor de asistencia</div>';
    }
}

async function loadAttendanceInterface() {
    const container = document.getElementById('attendance-main-interface');
    if (!container) return;

    const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', currentUser.id);
    const today = new Date().toISOString().split('T')[0];
    const { data: todayWaivers } = await _supabase.from('attendance_waivers').select('school_code, grade, section, status').eq('teacher_id', currentUser.id).eq('date', today);

    const { count: waiverCount } = await _supabase.from('attendance_waivers').select('*', { count: 'exact', head: true }).eq('teacher_id', currentUser.id);
    const hasWaivers = (waiverCount || 0) > 0;
    const safeAssignments = assignments || [];

    container.innerHTML = `
    <!-- SCANNER SECTION -->
    <div class="glass-card p-6 md:p-10 overflow-hidden relative border-none bg-white dark:bg-slate-900 shadow-xl">
        <div class="relative z-10">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-slate-50 dark:border-slate-800 pb-8">
                <div>
                    <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-1 uppercase tracking-tighter flex items-center gap-3">
                        Biometría QR <span class="text-[0.6rem] bg-emerald-500 text-white px-3 py-1 rounded-full animate-pulse tracking-widest font-black">ACTIVO</span>
                    </h3>
                    <p class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest">Sincronización en tiempo real con la nube.</p>
                </div>
                
                <div class="w-full md:w-80">
                    <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block ml-1">Equipo en Aula</label>
                    <select id="attendance-assignment" class="input-field-tw border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20" onchange="loadStudentsForAttendance()">
                        <option value="" class="dark:bg-slate-900">Seleccionar Equipo...</option>
                        ${safeAssignments.map((a, index) => {
        const schoolWaiver = todayWaivers?.find(w => w.school_code === a.school_code && w.grade === null);
        const groupWaiver = todayWaivers?.find(w => w.school_code === a.school_code && w.grade === a.grade && w.section === a.section);
        const isSuspended = schoolWaiver || groupWaiver;
        return `<option value="${index}" class="dark:bg-slate-900" data-school="${a.school_code}" data-grade="${a.grade || ''}" data-section="${a.section || ''}" ${isSuspended ? 'disabled' : ''}>
                               ${sanitizeInput(a.schools?.name || 'Establecimiento')} - ${sanitizeInput(a.grade || '')} ${sanitizeInput(a.section || '')} ${isSuspended ? '(SUSPENDIDO)' : ''}
                           </option>`;
    }).join('')}
                    </select>
                </div>
            </div>

            <div id="qr-scanner-section" class="hidden animate-slideUp">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    <div class="lg:col-span-4 flex flex-col items-center">
                        <div id="qr-video-container" class="hidden relative w-full aspect-square rounded-[2rem] overflow-hidden border-8 border-slate-900 shadow-2xl bg-black">
                            <video id="qr-video" class="w-full h-full object-cover"></video>
                            <div class="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                                <div class="w-full h-full border-2 border-emerald-400 border-dashed rounded-2xl animate-pulse"></div>
                            </div>
                        </div>
                        
                        <div class="mt-6 flex flex-col gap-3 w-full">
                            <button onclick="startQRScanner()" id="btn-start-scanner" class="btn-primary-tw bg-emerald-500 hover:bg-emerald-600 h-12 uppercase tracking-widest text-xs font-black">
                                <i class="fas fa-camera"></i> ACTIVAR CÁMARA
                            </button>
                            <button onclick="stopQRScanner()" id="btn-stop-scanner" class="hidden btn-secondary-tw bg-rose-500 text-white border-none h-12 uppercase tracking-widest text-xs font-black">
                                <i class="fas fa-stop"></i> DETENER
                            </button>
                            <div id="scan-result" class="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 min-h-[40px] flex items-center justify-center">
                                <span class="text-[0.55rem] font-black text-slate-400 tracking-widest uppercase">Listo para registro</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="lg:col-span-8">
                        <div id="attendance-students-list" class="bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] p-6 max-h-[500px] overflow-y-auto custom-scroll border border-slate-100 dark:border-slate-800">
                            <div class="flex flex-col items-center justify-center py-20 text-slate-300">
                                <i class="fas fa-users text-4xl mb-4 opacity-10"></i>
                                <p class="font-black uppercase tracking-widest text-[0.6rem] text-center">La lista aparecerá al seleccionar un equipo</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- UTILITIES -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="glass-card p-5 flex items-center justify-between border-none bg-white dark:bg-slate-900 shadow-lg">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center text-lg"><i class="fas fa-calendar-times"></i></div>
                <div>
                    <h4 class="text-sm font-black text-slate-800 dark:text-white leading-none">Suspensiones</h4>
                    <p class="text-[0.5rem] font-bold text-slate-400 uppercase tracking-widest mt-1">Reportar Ausencia</p>
                </div>
            </div>
            <button onclick="openWaiverModal()" class="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-500 transition-all flex items-center justify-center border border-slate-100 dark:border-slate-800"><i class="fas fa-plus text-xs"></i></button>
        </div>

        <div class="glass-card p-5 flex items-center justify-between border-none bg-white dark:bg-slate-900 shadow-lg">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center text-lg"><i class="fas fa-file-csv"></i></div>
                <div>
                    <h4 class="text-sm font-black text-slate-800 dark:text-white leading-none">Auditoría</h4>
                    <p class="text-[0.5rem] font-bold text-slate-400 uppercase tracking-widest mt-1">Exportar CSV/PDF</p>
                </div>
            </div>
            <button onclick="exportAttendanceCSV()" ${!hasWaivers ? 'disabled' : ''} class="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all flex items-center justify-center border border-slate-100 dark:border-slate-800 ${!hasWaivers ? 'opacity-30 cursor-not-allowed' : ''}"><i class="fas fa-download text-xs"></i></button>
        </div>

        <div class="glass-card p-5 flex items-center justify-between border-none bg-white dark:bg-slate-900 shadow-lg">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center text-lg"><i class="fas fa-id-card"></i></div>
                <div>
                    <h4 class="text-sm font-black text-slate-800 dark:text-white leading-none">Impresión</h4>
                    <p class="text-[0.5rem] font-bold text-slate-400 uppercase tracking-widest mt-1">Credenciales QR</p>
                </div>
            </div>
            <button onclick="printSectionQRs()" class="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-all flex items-center justify-center border border-slate-100 dark:border-slate-800"><i class="fas fa-print text-xs"></i></button>
        </div>
    </div>
  `;
}

// SCANNER LOGIC RESTORED
let qrStream = null;
let qrScanning = false;
let lastScannedIds = {};
const SCAN_COOLDOWN = 5000;

async function startQRScanner() {
    const video = document.getElementById('qr-video');
    const container = document.getElementById('qr-video-container');
    const btnStart = document.getElementById('btn-start-scanner');
    const btnStop = document.getElementById('btn-stop-scanner');

    if (!video || !container) return;

    try {
        qrScanning = true;
        qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = qrStream;
        video.play();
        container.classList.remove('hidden');
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');

        tickScanner();
    } catch (err) {
        console.error(err);
        showToast('❌ Error de cámara', 'error');
        qrScanning = false;
    }
}

function stopQRScanner() {
    if (qrStream) qrStream.getTracks().forEach(t => t.stop());
    qrScanning = false;
    const container = document.getElementById('qr-video-container');
    const btnStart = document.getElementById('btn-start-scanner');
    const btnStop = document.getElementById('btn-stop-scanner');

    if (container) container.classList.add('hidden');
    if (btnStart) btnStart.classList.remove('hidden');
    if (btnStop) btnStop.classList.add('hidden');
}

function tickScanner() {
    if (!qrScanning) return;
    const video = document.getElementById('qr-video');
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
            if (code) handleQRCodeDetected(code.data);
        }
    }
    requestAnimationFrame(tickScanner);
}

async function handleQRCodeDetected(data) {
    try {
        const parsed = JSON.parse(data);
        const id = parsed.id || parsed.student_id;
        if (!id || (lastScannedIds[id] && Date.now() - lastScannedIds[id] < SCAN_COOLDOWN)) return;

        lastScannedIds[id] = Date.now();

        const resultDiv = document.getElementById('scan-result');
        if (resultDiv) resultDiv.innerHTML = `<span class="text-emerald-500 font-black text-[0.6rem] animate-bounce">REGISTRO EXITOSO</span>`;

        const select = document.getElementById('attendance-assignment');
        const opt = select.options[select.selectedIndex];

        const { error } = await _supabase.from('attendance').upsert({
            student_id: id,
            teacher_id: currentUser.id,
            school_code: opt.dataset.school,
            grade: opt.dataset.grade,
            section: opt.dataset.section,
            date: new Date().toISOString().split('T')[0],
            status: 'present'
        });

        if (!error) {
            showToast('✅ Asistencia registrada', 'success');
            loadStudentsForAttendance();
        }
    } catch (e) { }
}

async function loadStudentsForAttendance() {
    const select = document.getElementById('attendance-assignment');
    const container = document.getElementById('attendance-students-list');
    const section = document.getElementById('qr-scanner-section');
    if (!select || !container || !section) return;

    const opt = select.options[select.selectedIndex];
    if (!opt.value) return section.classList.add('hidden');

    section.classList.remove('hidden');
    container.innerHTML = '<div class="flex flex-col items-center py-10 opacity-50"><i class="fas fa-circle-notch fa-spin mb-2"></i></div>';

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: students } = await _supabase.from('students').select('id, full_name, username').eq('school_code', opt.dataset.school).eq('grade', opt.dataset.grade).eq('section', opt.dataset.section).order('full_name');
        const { data: att } = await _supabase.from('attendance').select('student_id').eq('date', today);
        const presentIds = new Set(att.map(a => a.student_id));

        container.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">${students.length} ESTUDIANTES</span>
            <span class="bg-emerald-500/10 text-emerald-500 text-[0.55rem] font-black px-2 py-0.5 rounded-full">${presentIds.size} PRESENTES</span>
        </div>
        <div class="space-y-2">
            ${students.map(s => {
            const isP = presentIds.has(s.id);
            return `
                    <div class="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border ${isP ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-100 dark:border-slate-800'} transition-all">
                        <div class="w-8 h-8 rounded-lg ${isP ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-slate-800'} text-white flex items-center justify-center text-xs">
                            <i class="fas ${isP ? 'fa-check' : 'fa-user'}"></i>
                        </div>
                        <div class="grow min-w-0">
                            <p class="text-[0.7rem] font-black text-slate-800 dark:text-slate-100 truncate leading-none mb-1">${sanitizeInput(s.full_name)}</p>
                            <p class="text-[0.5rem] font-bold text-slate-400 uppercase tracking-widest">@${s.username}</p>
                        </div>
                    </div>
                `;
        }).join('')}
        </div>
    `;
    } catch (e) { console.error(e); }
}

// WAIVER MODAL
async function openWaiverModal() {
    const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', currentUser.id);
    const safeAssignments = assignments || [];
    const schools = [...new Set(safeAssignments.map(a => JSON.stringify({ code: a.school_code, name: a.schools.name })))].map(s => JSON.parse(s));

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-10 animate-slideUp">
          <div class="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 class="text-2xl font-black text-amber-600 dark:text-amber-400 uppercase tracking-tighter">Gestionar Ausencia</h3>
              <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-rose-500 font-bold text-2xl">×</button>
          </div>
          <div class="space-y-6">
              <div>
                  <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Alcance</label>
                  <select id="waiver-type" class="input-field-tw" onchange="toggleWaiverType()">
                      <option value="group">Solo un Equipo (Grado/Sección)</option>
                      <option value="school">Todo el Establecimiento</option>
                  </select>
              </div>

              <div id="waiver-school-div" style="display:none">
                  <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Seleccionar Planta</label>
                  <select id="waiver-school" class="input-field-tw">
                      ${schools.map(s => `<option value="${s.code}">${sanitizeInput(s.name)}</option>`).join('')}
                  </select>
              </div>

              <div id="waiver-group-div">
                  <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Seleccionar Equipo</label>
                  <select id="waiver-group" class="input-field-tw">
                      ${safeAssignments.map(a => `<option value="${a.school_code}|${a.grade}|${a.section}">${sanitizeInput(a.schools.name)} - ${a.grade} ${a.section}</option>`).join('')}
                  </select>
              </div>

              <div>
                  <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Motivo Oficial</label>
                  <textarea id="waiver-reason" class="input-field-tw h-24" placeholder="Ej: Feriado, Incidente, etc."></textarea>
              </div>
              
              <button onclick="submitWaiver()" id="btn-submit-waiver" class="btn-primary-tw bg-amber-500 hover:bg-amber-600 w-full h-14 uppercase tracking-widest"><i class="fas fa-paper-plane shadow-none"></i> SOLICITAR EXENCIÓN</button>
          </div>
      </div>
    `;
    document.body.appendChild(modal);
}

function toggleWaiverType() {
    const type = document.getElementById('waiver-type').value;
    document.getElementById('waiver-group-div').style.display = type === 'group' ? 'block' : 'none';
    document.getElementById('waiver-school-div').style.display = type === 'school' ? 'block' : 'none';
}

async function submitWaiver() {
    const type = document.getElementById('waiver-type').value;
    const reason = document.getElementById('waiver-reason').value.trim();
    if (!reason) return showToast('❌ Indica el motivo', 'error');

    let payload = {
        teacher_id: currentUser.id,
        reason: reason,
        date: new Date().toISOString().split('T')[0],
        status: 'pending'
    };

    if (type === 'group') {
        const [s, g, sec] = document.getElementById('waiver-group').value.split('|');
        payload.school_code = s; payload.grade = g; payload.section = sec;
    } else {
        payload.school_code = document.getElementById('waiver-school').value;
        payload.grade = null; payload.section = null;
    }

    try {
        const { error } = await _supabase.from('attendance_waivers').insert(payload);
        if (error) throw error;
        showToast('✅ Solicitud enviada', 'success');
        document.querySelector('.fixed').remove();
        loadAttendanceInterface();
    } catch (e) { showToast('❌ Error en el proceso', 'error'); }
}

// REAL EXPORT CSV
async function exportAttendanceCSV() {
    const select = document.getElementById('attendance-assignment');
    const opt = select?.options[select.selectedIndex];
    if (!opt || !opt.value) return showToast('❌ Selecciona un equipo primero', 'error');

    showToast('📊 Generando reporte...', 'info');

    try {
        const { data } = await _supabase.from('attendance')
            .select('*, students(full_name)')
            .eq('school_code', opt.dataset.school)
            .eq('grade', opt.dataset.grade)
            .eq('section', opt.dataset.section);

        let csv = 'Fecha,Alumno,Estado,Hora\n';
        data.forEach(a => {
            csv += `${a.date},${a.students.full_name},${a.status},${a.time || 'N/A'}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asistencia_${opt.dataset.school}_${opt.dataset.grade}_${opt.dataset.section}.csv`;
        a.click();
        showToast('✅ Reporte descargado', 'success');
    } catch (e) { showToast('❌ Error al exportar', 'error'); }
}

async function printSectionQRs() {
    const select = document.getElementById('attendance-assignment');
    const opt = select?.options[select.selectedIndex];
    if (!opt || !opt.value) return showToast('❌ Selecciona un equipo primero', 'error');

    showToast('🖨️ Generando credenciales...', 'info');

    const { data: students } = await _supabase.from('students')
        .select('id, full_name, username')
        .eq('school_code', opt.dataset.school)
        .eq('grade', opt.dataset.grade)
        .eq('section', opt.dataset.section);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
    <html>
      <head>
        <title>Credenciales - ${opt.text}</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
        <style>
            body { font-family: sans-serif; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 40px; }
            .card { border: 2px solid #000; padding: 20px; text-align: center; border-radius: 15px; page-break-inside: avoid; }
            .qr { margin: 10px auto; width: 128px; height: 128px; }
            h2 { font-size: 14px; margin: 10px 0 5px; }
            p { font-size: 10px; color: #666; margin: 0; }
        </style>
      </head>
      <body>
        ${students.map(s => `
            <div class="card">
                <div id="qr-${s.id}" class="qr"></div>
                <h2>${s.full_name}</h2>
                <p>@${s.username}</p>
                <p>${opt.text}</p>
            </div>
        `).join('')}
        <script>
            setTimeout(() => {
                ${students.map(s => `
                    new QRCode(document.getElementById('qr-${s.id}'), {
                        text: JSON.stringify({id: '${s.id}', username: '${s.username}'}),
                        width: 128, height: 128
                    });
                `).join('')}
                setTimeout(() => window.print(), 1000);
            }, 500);
        </script>
      </body>
    </html>
  `);
}

console.log('✅ attendance.js restablecido y mejorado (Premium Edition)');
