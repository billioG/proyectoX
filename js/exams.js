/**
 * EXÁMENES CON HOJA DE RESPUESTAS (estilo ZipGrade)
 * El docente crea el examen (con su clave A-E), imprime una hoja por alumno
 * (nombre + QR) y la califica escaneándola con la cámara. La nota va aparte de
 * los cursos, con su propio punteo. La lectura de las burbujas vive en
 * js/omr-core.js; las tablas y permisos en migrations/exams.sql.
 * No se guarda ninguna foto: solo las respuestas leídas y la nota.
 */
const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
const QUESTION_CHOICES = [20, 25, 30, 40, 50, 60, 75, 100];

const S = { exams: [], exam: null, students: [], results: new Map(), stream: null, review: null };

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(v) : String(v ?? ''));
const escA = (v) => (window.sanitizeAttr ? window.sanitizeAttr(v) : String(v ?? ''));
const toast = (m, t) => window.showToast?.(m, t);
const sb = () => window._supabase;
const fmt = (n) => (Math.round(Number(n) * 100) / 100).toString().replace('.', ',');

// ---------- QR: UUID <-> texto corto (22 caracteres cada uno) ----------
function uuidToB64u(uuid) {
  const hex = uuid.replace(/-/g, '');
  let bin = '';
  for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToUuid(s) {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length !== 16) return null;
    const hex = [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch { return null; }
}
const qrPayload = (examId, studentId) => `Q1.${uuidToB64u(examId)}${studentId ? '.' + uuidToB64u(studentId) : ''}`;
function parseQr(text) {
  // Hoja por alumno: examen + alumno. Hoja genérica (fotocopias): solo examen.
  const m = /^Q1\.([A-Za-z0-9_-]{22})(?:\.([A-Za-z0-9_-]{22}))?$/.exec(String(text || '').trim());
  return m ? { examId: b64uToUuid(m[1]), studentId: m[2] ? b64uToUuid(m[2]) : null } : null;
}

function qrMatrix(text) {
  const holder = document.createElement('div');
  const qr = new window.QRCode(holder, { text, width: 128, height: 128, correctLevel: window.QRCode.CorrectLevel.M });
  const o = qr._oQRCode, n = o.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => o.isDark(r, c)));
}

// jsQR sobre una copia grande (el lector de burbujas usa una más chica): el QR
// es pequeño en la hoja y necesita resolución.
function decodeQr(src) {
  const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
  const k = Math.min(1, 1800 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return window.jsQR?.(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

// ---------- Datos ----------
async function myClasses() {
  const u = window.currentUser;
  if (window.userRole === 'admin') {
    const { data } = await sb().from('students').select('school_code, grade, section, schools(name)');
    const seen = new Set();
    return (data || []).filter((s) => {
      const k = `${s.school_code}|${s.grade}|${s.section}`;
      if (!s.school_code || !s.grade || !s.section || seen.has(k)) return false;
      seen.add(k); return true;
    }).map((s) => ({ school_code: s.school_code, grade: s.grade, section: s.section, school: s.schools?.name || s.school_code }));
  }
  const { data } = await sb().from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', u.id);
  return (data || []).map((a) => ({ school_code: a.school_code, grade: a.grade, section: a.section, school: a.schools?.name || a.school_code }));
}

async function loadExamList() {
  const key = `exams_list_${window.currentUser.id}`;
  await window.fetchWithCache(key, async () => {
    const { data, error } = await sb().from('exams').select('*, exam_results(count)').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }, (data) => { S.exams = data || []; if (!S.exam) renderList(); });
}

async function loadClassStudents(exam) {
  const key = `exam_students_${exam.school_code}_${exam.grade}_${exam.section}`;
  await window.fetchWithCache(key, async () => {
    const { data, error } = await sb().from('students').select('id, full_name, status')
      .eq('school_code', exam.school_code).eq('grade', exam.grade).eq('section', exam.section).order('full_name');
    if (error) throw error;
    return data;
  }, (data) => { S.students = (data || []).filter((s) => s.status !== 'baja' && s.status !== 'egresado'); });
}

async function loadResults(exam) {
  const { data } = await sb().from('exam_results').select('*').eq('exam_id', exam.id);
  S.results = new Map((data || []).map((r) => [r.student_id, r]));
}

// ---------- Vista: lista ----------
window.loadExams = async function loadExams() {
  stopCamera();
  S.exam = null;
  const box = document.getElementById('exams-container');
  if (!box) return;
  box.innerHTML = '<div class="glass-card p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin"></i></div>';
  await loadExamList();
  renderList();
};

function renderList() {
  const box = document.getElementById('exams-container');
  if (!box || S.exam) return;
  const cards = S.exams.map((e) => {
    const done = e.exam_results?.[0]?.count || 0;
    return `
      <button class="glass-card p-5 text-left hover:border-primary/40 transition-colors w-full" onclick="window.openExam('${e.id}')">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm font-black text-slate-800 dark:text-white truncate">${esc(e.title)}</h3>
            <p class="text-[0.7rem] text-slate-400 mt-1">${esc(e.grade)} ${esc(e.section)} · ${e.bimestre}º Bimestre · ${e.question_count} preguntas · vale ${fmt(e.points)} pts</p>
          </div>
          <span class="shrink-0 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[0.65rem] font-black uppercase">${done} calificados</span>
        </div>
      </button>`;
  }).join('');
  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <p class="text-xs text-slate-400 max-w-xl">Crea un examen con su clave, imprime una hoja por alumno y califícalo escaneándola con la cámara. Esta nota va aparte de los cursos.</p>
      <button class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.openExamModal()"><i class="fas fa-plus"></i> Nuevo examen</button>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${cards || '<div class="glass-card p-10 text-center text-slate-400 text-sm col-span-full">Todavía no tienes exámenes. Crea el primero.</div>'}</div>`;
}

// ---------- Crear / editar ----------
window.openExamModal = async function openExamModal(examId) {
  const editing = S.exams.find((e) => e.id === examId) || null;
  const classes = await myClasses();
  if (!classes.length) return toast('<i class="fas fa-circle-xmark"></i> No tienes clases asignadas todavía', 'error');
  const sel = editing ? classes.findIndex((c) => c.school_code === editing.school_code && c.grade === editing.grade && c.section === editing.section) : 0;

  const modal = document.createElement('div');
  modal.id = 'exam-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[88vh] flex flex-col p-8 shadow-2xl">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-5 shrink-0"><i class="fas fa-file-circle-check text-primary mr-2"></i> ${editing ? 'Editar examen' : 'Nuevo examen'}</h2>
      <div class="space-y-4 overflow-y-auto custom-scrollbar pr-1 -mr-1">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
          <select id="ex-class" class="input-field-tw h-11 text-sm" ${editing ? 'disabled' : ''}>
            ${classes.map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(c.school)} · ${esc(c.grade)} ${esc(c.section)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input id="ex-title" class="input-field-tw h-11 text-sm" maxlength="120" value="${editing ? escA(editing.title) : ''}" placeholder="Ej: Examen de unidad 2">
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Preguntas</label>
            <select id="ex-n" class="input-field-tw h-11 text-sm" ${editing ? 'disabled' : ''}>
              ${QUESTION_CHOICES.map((n) => `<option ${((editing?.question_count || 40) === n) ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Bimestre</label>
            <select id="ex-bim" class="input-field-tw h-11 text-sm">${[1, 2, 3, 4].map((b) => `<option value="${b}" ${(editing?.bimestre || 1) === b ? 'selected' : ''}>${b}º</option>`).join('')}</select>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Punteo</label>
            <input id="ex-points" type="number" min="1" max="1000" step="0.5" class="input-field-tw h-11 text-sm" value="${editing?.points ?? 10}">
          </div>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clave de respuestas *</label>
          <textarea id="ex-key" class="input-field-tw text-sm h-24 resize-none font-mono tracking-widest" placeholder="Escribe una letra A–E por pregunta. Ej: ABCDEABCDE...">${editing ? esc(editing.answer_key) : ''}</textarea>
          <p id="ex-key-info" class="text-[0.65rem] text-slate-400 mt-1"></p>
        </div>
      </div>
      <div class="flex gap-3 mt-6 shrink-0">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="document.getElementById('exam-modal').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="ex-save">${editing ? 'Guardar cambios' : 'Crear examen'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const cleanKey = () => document.getElementById('ex-key').value.toUpperCase().replace(/[^A-E]/g, '');
  const info = () => {
    const n = parseInt(document.getElementById('ex-n').value, 10), len = cleanKey().length;
    const el = document.getElementById('ex-key-info');
    el.textContent = `${len} de ${n} respuestas`;
    el.className = `text-[0.65rem] mt-1 ${len === n ? 'text-emerald-500 font-bold' : 'text-slate-400'}`;
  };
  document.getElementById('ex-key').oninput = info;
  document.getElementById('ex-n').onchange = info;
  info();

  document.getElementById('ex-save').onclick = async () => {
    const title = document.getElementById('ex-title').value.trim();
    const n = parseInt(document.getElementById('ex-n').value, 10);
    const key = cleanKey();
    const points = parseFloat(document.getElementById('ex-points').value);
    if (!title) return toast('<i class="fas fa-circle-xmark"></i> Ponle un título al examen', 'error');
    if (key.length !== n) return toast(`<i class="fas fa-circle-xmark"></i> La clave tiene ${key.length} respuestas y el examen ${n}. Deben coincidir.`, 'error');
    if (!(points > 0)) return toast('<i class="fas fa-circle-xmark"></i> El punteo debe ser mayor que 0', 'error');
    const btn = document.getElementById('ex-save'); btn.disabled = true;
    const row = { title, question_count: n, answer_key: key, points, bimestre: parseInt(document.getElementById('ex-bim').value, 10) };
    let error;
    if (editing) {
      ({ error } = await sb().from('exams').update(row).eq('id', editing.id));
    } else {
      const c = classes[parseInt(document.getElementById('ex-class').value, 10)];
      ({ error } = await sb().from('exams').insert({ ...row, teacher_id: window.currentUser.id, school_code: c.school_code, grade: c.grade, section: c.section }));
    }
    btn.disabled = false;
    if (error) return toast(`<i class="fas fa-circle-xmark"></i> ${esc(error.message)}`, 'error');
    document.getElementById('exam-modal').remove();
    toast('<i class="fas fa-circle-check"></i> Examen guardado', 'success');
    if (editing && S.exam?.id === editing.id) {
      // Si ya tenía notas y cambió la clave, hay que recalificar: se avisa.
      if (S.results.size) toast('<i class="fas fa-triangle-exclamation"></i> Cambiaste la clave: las notas ya guardadas no se recalculan solas. Vuelve a escanear las hojas.', 'info');
    }
    S.exam = null;
    await loadExamList();
    if (editing) window.openExam(editing.id); else renderList();
  };
};

// ---------- Detalle ----------
window.openExam = async function openExam(id) {
  stopCamera();
  const exam = S.exams.find((e) => e.id === id);
  if (!exam) return;
  S.exam = exam;
  const box = document.getElementById('exams-container');
  box.innerHTML = '<div class="glass-card p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin"></i></div>';
  await Promise.all([loadClassStudents(exam), loadResults(exam)]);
  renderDetail();
};

function renderDetail() {
  const e = S.exam, box = document.getElementById('exams-container');
  const scored = [...S.results.values()];
  const avg = scored.length ? scored.reduce((a, r) => a + Number(r.score), 0) / scored.length : null;
  const rows = S.students.map((s) => {
    const r = S.results.get(s.id);
    return `<tr class="border-b border-slate-100 dark:border-slate-800">
      <td class="py-2 pr-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200">${esc(s.full_name)}</td>
      <td class="py-2 px-2 text-center text-xs font-black ${r ? 'text-primary' : 'text-slate-300'}">${r ? fmt(r.score) + ' / ' + fmt(e.points) : '—'}</td>
      <td class="py-2 px-2 text-center text-[0.7rem] text-slate-400">${r ? `${r.correct}✔ ${r.wrong}✖ ${r.blank}○` : 'sin escanear'}</td>
      <td class="py-2 pl-2 text-right">${r ? `<button class="text-slate-300 hover:text-rose-500" title="Quitar nota" onclick="window.deleteExamResult('${s.id}')"><i class="fas fa-trash-alt text-xs"></i></button>` : ''}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <button class="text-xs font-bold text-slate-400 hover:text-primary mb-4" onclick="window.loadExams()"><i class="fas fa-arrow-left"></i> Mis exámenes</button>
    <div class="glass-card p-6 mb-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-black text-slate-800 dark:text-white">${esc(e.title)}</h3>
          <p class="text-xs text-slate-400 mt-1">${esc(e.grade)} ${esc(e.section)} · ${e.bimestre}º Bimestre · ${e.question_count} preguntas · vale ${fmt(e.points)} pts</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary-tw h-9 px-3 text-[0.65rem] uppercase font-bold" onclick="window.openExamModal('${e.id}')"><i class="fas fa-pen"></i> Editar</button>
          <button class="h-9 px-3 rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white text-[0.65rem] uppercase font-bold" onclick="window.deleteExam('${e.id}')"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 mt-5">
        <button class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.printGenericExamSheet()"><i class="fas fa-copy"></i> Hoja para fotocopiar (1 hoja)</button>
        <button class="btn-secondary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.printExamSheets()"><i class="fas fa-print"></i> Una por alumno (${S.students.length})</button>
        <button class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.openExamScanner()"><i class="fas fa-camera"></i> Escanear y calificar</button>
        <button class="btn-secondary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.exportExamCsv()"><i class="fas fa-download"></i> Exportar</button>
      </div>
      <p class="text-[0.65rem] text-slate-400 mt-3"><b>Para fotocopiar:</b> imprime UNA hoja y saca las copias; cada alumno escribe su nombre y, al escanear, eliges de quién es. <b>Una por alumno:</b> sale con su nombre y QR, y la nota se guarda sola en su nombre (más cómodo, pero hay que imprimir todas). Imprime en Carta al 100 %, sin "ajustar a página", y que las copias salgan limpias (ni muy claras ni muy oscuras).</p>
    </div>
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-black uppercase tracking-widest text-slate-400">Resultados</h4>
        <span class="text-xs font-bold text-slate-500">${scored.length} de ${S.students.length} calificados${avg !== null ? ` · promedio ${fmt(avg)} / ${fmt(e.points)}` : ''}</span>
      </div>
      <div class="overflow-x-auto"><table class="w-full">${rows || '<tr><td class="text-center text-slate-400 text-sm py-6">Esta clase no tiene alumnos activos.</td></tr>'}</table></div>
    </div>`;
}

window.deleteExam = async function deleteExam(id) {
  if (!confirm('¿Eliminar este examen y todas sus notas? No se puede deshacer.')) return;
  const { error } = await sb().from('exams').delete().eq('id', id);
  if (error) return toast(`<i class="fas fa-circle-xmark"></i> ${esc(error.message)}`, 'error');
  toast('<i class="fas fa-trash-alt"></i> Examen eliminado', 'success');
  window.loadExams();
};

window.deleteExamResult = async function deleteExamResult(studentId) {
  if (!confirm('¿Quitar la nota de este alumno? Podrás volver a escanear su hoja.')) return;
  const { error } = await sb().from('exam_results').delete().eq('exam_id', S.exam.id).eq('student_id', studentId);
  if (error) return toast(`<i class="fas fa-circle-xmark"></i> ${esc(error.message)}`, 'error');
  S.results.delete(studentId);
  renderDetail();
};

// ---------- Imprimir ----------
let printStyleAdded = false;

// Una hoja por alumno (nombre + QR propio) o UNA hoja genérica para fotocopiar
// (QR solo del examen: el alumno escribe su nombre y al escanear se elige).
window.printExamSheets = function printExamSheets() {
  const e = S.exam;
  if (!S.students.length) return toast('<i class="fas fa-circle-xmark"></i> Esta clase no tiene alumnos', 'error');
  printSheetList(S.students.map((s) => window.OMR.svgSheet({
    n: e.question_count, title: e.title, group: `${e.grade} ${e.section}`, studentName: s.full_name, qr: qrMatrix(qrPayload(e.id, s.id)),
  })));
};

window.printGenericExamSheet = function printGenericExamSheet() {
  const e = S.exam;
  printSheetList([window.OMR.svgSheet({
    n: e.question_count, title: e.title, group: `${e.grade} ${e.section}`, qr: qrMatrix(qrPayload(e.id, null)),
  })]);
};

function printSheetList(svgs) {
  if (!window.OMR || !window.QRCode) return toast('<i class="fas fa-circle-xmark"></i> Todavía se está cargando el generador de hojas. Intenta de nuevo.', 'error');
  if (!printStyleAdded) {
    const st = document.createElement('style');
    st.textContent = `
      #exam-print-area { display:none; }
      @page { size: Letter; margin: 0; }
      @media print {
        body > *:not(#exam-print-area) { display:none !important; }
        #exam-print-area { display:block !important; }
        .exam-sheet { page-break-after: always; break-after: page; }
        .exam-sheet svg { width:215.9mm; height:279.4mm; display:block; }
      }`;
    document.head.appendChild(st);
    printStyleAdded = true;
  }
  const area = document.createElement('div');
  area.id = 'exam-print-area';
  area.innerHTML = svgs.map((svg) => `<div class="exam-sheet">${svg}</div>`).join('');
  document.body.appendChild(area);
  const cleanup = () => { area.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// ---------- Escanear y calificar ----------
function stopCamera() {
  if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
  S.stream = null;
}

window.openExamScanner = function openExamScanner() {
  const e = S.exam;
  document.getElementById('exam-scan-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'exam-scan-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-start justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-sm overflow-y-auto';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-3xl p-5 sm:p-6 shadow-2xl my-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-black uppercase tracking-widest text-slate-500">Calificar · ${esc(e.title)}</h3>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500" onclick="window.closeExamScanner()"><i class="fas fa-times"></i></button>
      </div>
      <div id="sc-msg" class="hidden mb-3 p-3 rounded-xl text-xs font-bold"></div>
      <div id="sc-capture">
        <video id="sc-video" class="w-full max-h-[60vh] bg-black rounded-xl hidden" playsinline muted></video>
        <div class="flex flex-wrap gap-2 mt-3">
          <button id="sc-open" class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold" onclick="window.startExamCamera()"><i class="fas fa-camera"></i> Abrir cámara</button>
          <button id="sc-snap" class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold hidden" onclick="window.snapExamSheet()"><i class="fas fa-circle-dot"></i> Tomar foto</button>
          <label class="btn-secondary-tw h-11 px-5 text-xs uppercase font-bold inline-flex items-center gap-2 cursor-pointer"><i class="fas fa-image"></i> Subir foto
            <input type="file" accept="image/*" class="hidden" onchange="window.scanExamFile(this)">
          </label>
        </div>
        <p class="text-[0.65rem] text-slate-400 mt-2">Hoja plana, con buena luz y sin sombras encima. Deben verse las 4 marcas negras de las esquinas y el QR.</p>
      </div>
      <div id="sc-review" class="hidden"></div>
    </div>`;
  document.body.appendChild(modal);
  // nav() borra los modales al cambiar de vista: que la cámara no quede prendida.
  const obs = new MutationObserver(() => {
    if (!document.getElementById('exam-scan-modal')) { stopCamera(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true });
};

window.closeExamScanner = function closeExamScanner() {
  stopCamera();
  document.getElementById('exam-scan-modal')?.remove();
  S.review = null;
  if (S.exam) renderDetail();
};

function scMsg(text, kind = 'err') {
  const el = document.getElementById('sc-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = `mb-3 p-3 rounded-xl text-xs font-bold ${text ? '' : 'hidden'} ${kind === 'err' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30' : 'bg-primary/10 text-primary'}`;
}

window.startExamCamera = async function startExamCamera() {
  scMsg('');
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
  } catch (err) { return scMsg('No se pudo abrir la cámara. Revisa el permiso del navegador o usa "Subir foto".'); }
  const v = document.getElementById('sc-video');
  v.srcObject = S.stream; await v.play();
  v.classList.remove('hidden');
  document.getElementById('sc-snap').classList.remove('hidden');
  document.getElementById('sc-open').classList.add('hidden');
};

// takePhoto() entrega la foto a la resolución completa del sensor (el cuadro de
// video suele ser 1080p y el QR de la hoja queda chico); si el navegador no lo
// tiene, se usa el cuadro de video.
window.snapExamSheet = async function snapExamSheet() {
  const track = S.stream?.getVideoTracks()[0];
  if (track && 'ImageCapture' in window) {
    try {
      const blob = await new window.ImageCapture(track).takePhoto();
      const img = new Image();
      img.onload = () => { analyzeSheet(img); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(blob);
      return;
    } catch (e) { /* cae al cuadro de video */ }
  }
  analyzeSheet(document.getElementById('sc-video'));
};

window.scanExamFile = function scanExamFile(input) {
  const f = input.files[0]; input.value = '';
  if (!f) return;
  const img = new Image();
  img.onload = () => { analyzeSheet(img); URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(f);
};

function analyzeSheet(src) {
  scMsg('');
  const e = S.exam;
  const res = window.OMR.scanSource(src, e.question_count);
  if (!res.ok) return scMsg(res.error);

  // Quién es el alumno: por el QR; si no se lee, se elige a mano.
  const text = decodeQr(src);
  const qr = parseQr(text);
  let studentId = null;
  if (qr) {
    if (qr.examId !== e.id) return scMsg('Esta hoja es de OTRO examen. Verifica que sea la hoja de "' + e.title + '".');
    // Hoja por alumno: el QR trae al alumno. Hoja genérica (fotocopia): solo
    // trae el examen y el alumno se elige abajo, sin mensaje de error.
    if (qr.studentId) {
      if (S.students.some((s) => s.id === qr.studentId)) studentId = qr.studentId;
      else scMsg('El alumno de esta hoja no está en la clase. Elígelo a mano abajo.', 'info');
    }
  } else {
    scMsg('No se pudo leer el QR de la hoja. Elige al alumno a mano abajo.', 'info');
  }

  S.review = { res, studentId };
  stopCamera();
  renderReview();
}

function gradeCurrent() {
  const e = S.exam, a = S.review.res.answers;
  let correct = 0, wrong = 0, blank = 0;
  a.forEach((ans, i) => {
    if (ans === null) blank++;
    else if (ans === '*') wrong++;
    else if (ans === e.answer_key[i]) correct++;
    else wrong++;
  });
  return { correct, wrong, blank, score: Math.round((e.points * correct / e.question_count) * 100) / 100 };
}

function renderReview() {
  const e = S.exam, rv = S.review, box = document.getElementById('sc-review');
  if (!box || !rv) return;
  document.getElementById('sc-capture').classList.add('hidden');
  box.classList.remove('hidden');
  const g = gradeCurrent();
  const doubts = rv.res.doubts.filter(Boolean).length;
  // Los que aún no tienen nota van primero: con fotocopias, al escanear la pila
  // hoja por hoja, lo más probable es que sea alguien pendiente.
  const ordered = [...S.students].sort((a, b) => (S.results.has(a.id) - S.results.has(b.id)) || a.full_name.localeCompare(b.full_name, 'es'));
  const students = ordered.map((s) => `<option value="${s.id}" ${s.id === rv.studentId ? 'selected' : ''}>${esc(s.full_name)}${S.results.has(s.id) ? ' (ya calificado)' : ''}</option>`).join('');
  box.innerHTML = `
    <div class="grid md:grid-cols-2 gap-4">
      <div>
        <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Alumno</label>
        <select id="rv-student" class="input-field-tw h-11 text-sm"><option value="">— Elige al alumno —</option>${students}</select>
        <div class="mt-4 text-3xl font-black text-slate-800 dark:text-white">${fmt(g.score)} <span class="text-base text-slate-400">/ ${fmt(e.points)}</span></div>
        <div class="flex flex-wrap gap-2 mt-2 text-xs font-bold">
          <span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500">✔ ${g.correct} bien</span>
          <span class="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-500">✖ ${g.wrong} mal</span>
          <span class="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500">○ ${g.blank} en blanco</span>
        </div>
        <p class="text-[0.7rem] mt-2 ${doubts ? 'text-amber-500 font-bold' : 'text-slate-400'}">${doubts ? `${doubts} pregunta(s) dudosa(s): revísalas en amarillo.` : 'Sin dudas en la lectura.'} Toca una letra para corregirla.</p>
        <div class="flex gap-2 mt-4">
          <button id="rv-save" class="btn-primary-tw h-11 px-5 text-xs uppercase font-bold flex-1"><i class="fas fa-floppy-disk"></i> Guardar nota</button>
          <button class="btn-secondary-tw h-11 px-4 text-xs uppercase font-bold" onclick="window.discardExamScan()">Descartar</button>
        </div>
      </div>
      <div class="max-h-[46vh] overflow-y-auto">
        <table class="w-full text-center text-xs"><thead><tr class="text-slate-400"><th>#</th><th>Leído</th><th>Clave</th><th></th></tr></thead><tbody>
          ${rv.res.answers.map((a, i) => {
            const key = e.answer_key[i], ok = a === key, st = ok ? 'text-emerald-500' : (a === null || a === '*') ? 'text-amber-500' : 'text-rose-500';
            return `<tr class="border-b border-slate-100 dark:border-slate-800 ${rv.res.doubts[i] ? 'bg-amber-500/10' : ''}"><td class="py-1.5">${i + 1}</td><td class="font-black cursor-pointer ${st}" data-i="${i}">${a === null ? '·' : a === '*' ? '⊗' : a}</td><td>${key}</td><td>${ok ? '✔' : ''}</td></tr>`;
          }).join('')}
        </tbody></table>
      </div>
    </div>`;
  document.getElementById('rv-student').onchange = (ev) => { rv.studentId = ev.target.value || null; };
  box.querySelectorAll('td[data-i]').forEach((td) => td.onclick = () => {
    const i = +td.dataset.i, order = [null, ...OPTIONS];
    const cur = rv.res.answers[i] === '*' ? null : rv.res.answers[i];
    rv.res.answers[i] = order[(order.indexOf(cur) + 1) % order.length];
    rv.res.doubts[i] = false;
    renderReview();
  });
  document.getElementById('rv-save').onclick = saveCurrent;
}

window.discardExamScan = function discardExamScan() {
  S.review = null;
  document.getElementById('sc-review').classList.add('hidden');
  document.getElementById('sc-capture').classList.remove('hidden');
  document.getElementById('sc-open').classList.remove('hidden');
  document.getElementById('sc-snap').classList.add('hidden');
  document.getElementById('sc-video').classList.add('hidden');
  scMsg('');
};

async function saveCurrent() {
  const e = S.exam, rv = S.review;
  if (!rv.studentId) return scMsg('Elige a qué alumno corresponde esta hoja.');
  // Con la hoja genérica es fácil elegir al alumno equivocado: si ya tenía nota, se pregunta.
  if (S.results.has(rv.studentId) && !confirm(`${S.students.find((s) => s.id === rv.studentId)?.full_name || 'Este alumno'} ya tiene nota en este examen. ¿Reemplazarla con esta hoja?`)) return;
  const g = gradeCurrent();
  const row = {
    exam_id: e.id, student_id: rv.studentId,
    answers: rv.res.answers.map((a) => (a === null ? '-' : a)).join(''),
    correct: g.correct, wrong: g.wrong, blank: g.blank, score: g.score,
    scanned_by: window.currentUser.id, scanned_at: new Date().toISOString(),
  };
  const btn = document.getElementById('rv-save'); btn.disabled = true;
  const { error } = await sb().from('exam_results').upsert(row, { onConflict: 'exam_id,student_id' });
  let queued = false;
  if (error) {
    if (!navigator.onLine && window._syncManager) { await window._syncManager.enqueue('save_exam_result', row); queued = true; }
    else { btn.disabled = false; return scMsg(error.message); }
  }
  S.results.set(row.student_id, row);
  const name = S.students.find((s) => s.id === row.student_id)?.full_name || '';
  toast(queued
    ? '<i class="fas fa-cloud-slash"></i> Nota guardada en este dispositivo: se sincroniza al reconectar'
    : `<i class="fas fa-circle-check"></i> ${esc(name.split(' ')[0])}: ${fmt(g.score)} / ${fmt(e.points)}`, 'success');
  S.review = null;
  window.discardExamScan();
  scMsg(`Guardado: ${name} · ${fmt(g.score)} / ${fmt(e.points)}. Escanea la siguiente hoja.`, 'ok');
  window.startExamCamera();
}

// ---------- Exportar ----------
window.exportExamCsv = function exportExamCsv() {
  const e = S.exam;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Alumno', 'Nota', 'Punteo', 'Correctas', 'Incorrectas', 'En blanco'].map(q).join(',')];
  S.students.forEach((s) => {
    const r = S.results.get(s.id);
    lines.push([q(s.full_name), r ? r.score : '', e.points, r ? r.correct : '', r ? r.wrong : '', r ? r.blank : ''].join(','));
  });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'examen'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
};

// Para pruebas
window._examsInternals = { qrPayload, parseQr, uuidToB64u, b64uToUuid, qrMatrix };
console.log('✅ exams.js cargado');
