/**
 * PROFILE - Gestión de perfiles (Tailwind Edition)
 */

async function loadProfile() {
    const profileContent = document.getElementById('profile-content');
    if (!profileContent) return;

    profileContent.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-black uppercase text-xs tracking-widest">Sincronizando Perfil...</span>
    </div>
  `;

    try {
        if (userRole === 'estudiante') await loadStudentProfile();
        else if (userRole === 'docente') await loadTeacherProfile();
        else if (userRole === 'admin') await loadAdminProfile();
    } catch (err) {
        console.error(err);
        profileContent.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold">❌ Error al cargar perfil</div>';
    }
}

async function loadStudentProfile() {
    const container = document.getElementById('profile-content');
    const { data: student } = await _supabase.from('students').select('*, schools(*)').eq('id', currentUser.id).single();

    const [projectsRes, badgesRes, assignmentRes, xpData] = await Promise.all([
        _supabase.from('projects').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
        _supabase.from('student_badges').select('badge_id, earned_at').eq('student_id', currentUser.id),
        _supabase.from('teacher_assignments').select('*, teachers(*)').eq('school_code', student.school_code).eq('grade', student.grade).eq('section', student.section).maybeSingle(),
        calculateStudentXP(student.id)
    ]);

    const projects = projectsRes.data || [];
    const earnedBadgeIds = (badgesRes.data || []).map(b => b.badge_id);
    const myTeacher = assignmentRes.data?.teachers || null;

    renderStudentProfileUI(container, student, projects, earnedBadgeIds, myTeacher, xpData);
}

function renderStudentProfileUI(container, student, projects, earnedBadgeIds, myTeacher, xpData) {
    const avgScore = projects.length > 0 ? (projects.reduce((s, p) => s + (p.score || 0), 0) / projects.length).toFixed(1) : 0;

    container.innerHTML = `
    <div class="flex flex-col md:flex-row gap-8 mb-12 items-center text-center md:text-left animate-slideUp">
        <div class="relative group">
            <div class="w-32 h-32 rounded-[2rem] bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-5xl shadow-xl border-4 border-white dark:border-slate-900 group-hover:rotate-3 transition-transform duration-500 overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800">
                ${student.profile_photo_url ? `<img src="${student.profile_photo_url}" class="w-full h-full object-cover">` : '🎓'}
            </div>
            <button onclick="openUploadPhotoModal()" class="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg transform hover:scale-110 transition-all border-2 border-white dark:border-slate-900">
                <i class="fas fa-camera text-sm"></i>
            </button>
        </div>
        <div class="grow">
            <div class="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
                <span class="px-3 py-1 bg-primary/10 text-primary font-bold rounded-lg text-[0.65rem] uppercase tracking-[0.2em] shadow-sm">${sanitizeInput(student.schools?.name || 'Academia 1Bot')}</span>
                <span class="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold rounded-lg text-[0.65rem] uppercase tracking-widest leading-none flex items-center">${sanitizeInput(student.grade || 'Grado')} ${sanitizeInput(student.section || 'Sección')}</span>
            </div>
            <h2 class="text-4xl font-bold text-slate-800 dark:text-white tracking-tight leading-none mb-2">${sanitizeInput(student.full_name || 'Nombre Estudiante')}</h2>
            <div class="flex items-center justify-center md:justify-start gap-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                <i class="fas fa-id-card text-primary text-sm opacity-50"></i>
                <span class="opacity-80">ID: ${student.username || 'N/A'}</span>
            </div>
        </div>
        <div class="flex gap-2">
            <button onclick="window.print()" class="btn-secondary-tw h-11 px-5 text-[0.8rem] uppercase font-bold tracking-widest hidden">
                <i class="fas fa-print opacity-50"></i> PDF
            </button>
        </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <div class="glass-card p-6 border-b-4 border-indigo-500 hover:translate-y-[-4px] transition-transform">
            <div class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest mb-1">Nivel Actual</div>
            <div class="text-4xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1">${xpData?.level || 1} <span class="text-xs text-indigo-500 opacity-60">RANK</span></div>
        </div>
        <div class="glass-card p-6 border-b-4 border-primary hover:translate-y-[-4px] transition-transform">
            <div class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest mb-1">Experiencia</div>
            <div class="text-4xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1">${xpData?.totalXP || 0} <span class="text-xs text-primary opacity-60">XP</span></div>
        </div>
        <div class="glass-card p-6 border-b-4 border-rose-500 hover:translate-y-[-4px] transition-transform">
            <div class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest mb-1">Inspiraciones</div>
            <div class="text-4xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1">${projects.length} <span class="text-xs text-rose-500 opacity-60">PROY</span></div>
        </div>
        <div class="glass-card p-6 border-b-4 border-emerald-500 hover:translate-y-[-4px] transition-transform">
            <div class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest mb-1">Reputación</div>
            <div class="text-4xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1">${avgScore} <span class="text-xs text-emerald-500 opacity-60">AVG</span></div>
        </div>
    </div>

    ${myTeacher ? `
        <div class="glass-card p-8 bg-gradient-to-br from-primary/5 to-transparent border border-primary/10 flex flex-col md:flex-row justify-between items-center gap-6 mb-12 relative overflow-hidden">
            <div class="absolute -right-12 -bottom-12 opacity-5 pointer-events-none">
                <i class="fas fa-chalkboard-teacher text-[12rem]"></i>
            </div>
            <div class="relative z-10 text-center md:text-left">
                <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2 flex items-center justify-center md:justify-start gap-3">
                    <span class="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm shadow-lg shadow-primary/30">
                        <i class="fas fa-user-tie"></i>
                    </span>
                    Mi Mentor: ${sanitizeInput(myTeacher.full_name)}
                </h3>
                <p class="text-[0.9rem] font-medium text-slate-500 dark:text-slate-400">¿Tienes alguna duda o sugerencia sobre los retos de esta semana?</p>
            </div>
            <button onclick="openSuggestionModal()" class="btn-primary-tw h-12 px-8 uppercase tracking-[0.2em] relative z-10 text-[0.8rem] whitespace-nowrap">
                <i class="fas fa-paper-plane mr-2 shadow-none"></i> Enviar Feedback
            </button>
        </div>
    ` : ''}

    <div class="mb-12">
        <div class="flex items-center justify-between mb-8">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                <i class="fas fa-medal text-amber-500 text-2xl"></i> Vitrina de Logros
            </h3>
            <span class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest">${earnedBadgeIds.length} / ${BADGES.length} Desbloqueados</span>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            ${BADGES.map(b => {
        const isEarned = earnedBadgeIds.includes(b.id);
        return `
                <div class="glass-card p-4 text-center group relative ${isEarned ? 'border-primary/20 bg-primary/5' : 'grayscale opacity-30 hover:opacity-50'} transition-all cursor-help" 
                     onclick="showBadgeDetailsModal(${JSON.stringify(b).replace(/"/g, '&quot;')}, ${isEarned})">
                    <div class="text-3xl mb-2 transform group-hover:scale-125 group-hover:rotate-12 transition-transform duration-500">${b.icon}</div>
                    <div class="text-[0.55rem] font-bold uppercase text-slate-600 dark:text-slate-300 tracking-tighter leading-tight">${b.name}</div>
                    ${isEarned ? `<div class="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[0.5rem] shadow-lg"><i class="fas fa-check"></i></div>` : ''}
                </div>
              `;
    }).join('')}
        </div>
    </div>
  `;
}

function showBadgeDetailsModal(badge, isEarned) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 dark:bg-slate-900 border border-primary/20">
      <div class="bg-gradient-to-br ${isEarned ? 'from-primary/20 to-indigo-500/20' : 'from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900'} p-8 text-center relative overflow-hidden">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
           <i class="fas fa-certificate text-[12rem] absolute -bottom-10 -right-10"></i>
        </div>
        <div class="text-7xl mb-4 relative z-10 animate-bounce">${badge.icon}</div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white uppercase tracking-tight relative z-10">${badge.name}</h2>
        ${isEarned ? `
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500 text-white text-[0.6rem] font-bold uppercase tracking-widest rounded-full mt-2 relative z-10 shadow-lg shadow-emerald-500/20">
            <i class="fas fa-check-circle"></i>¡Logro Desbloqueado!
          </div>
        ` : `
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-slate-500/20 text-slate-500 dark:text-slate-400 text-[0.6rem] font-bold uppercase tracking-widest rounded-full mt-2 relative z-10">
            <i class="fas fa-lock"></i> Bloqueado
          </div>
        `}
      </div>
      
      <div class="p-8">
        <div class="mb-6">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest block mb-1">Descripción</label>
          <p class="text-slate-600 dark:text-slate-300 font-medium text-sm leading-relaxed">${badge.description}</p>
        </div>
        
        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs shadow-inner"><i class="fas fa-question-circle"></i></div>
            <span class="text-[0.7rem] font-bold uppercase text-slate-700 dark:text-slate-200 tracking-widest">¿Cómo se gana?</span>
          </div>
          <p class="text-[0.8rem] text-slate-500 dark:text-slate-400 font-medium leading-tight">
            ${getBadgeAwardLogic(badge.id)}
          </p>
        </div>

        <button onclick="this.closest('.fixed').remove()" class="btn-primary-tw w-full h-12 mt-8 text-[0.8rem] uppercase tracking-widest">
          ¡ENTENDIDO!
        </button>
      </div>
    </div>
  `;
    document.body.appendChild(modal);
}

function getBadgeAwardLogic(badgeId) {
    const logic = {
        1: "Sube tu primer proyecto individual o grupal al portal.",
        2: "Recibe al menos 10 'Me Gusta' de la comunidad en tus proyectos.",
        3: "Logra una calificación perfecta de 90 puntos o más en cualquier proyecto.",
        5: "Mantén tu constancia subiendo un total de 5 o más proyectos aprobados.",
        6: "Conviértete en un líder de la comunidad alcanzando 50+ 'Me Gusta' totales.",
        7: "Demuestra maestría logrando 3 o más proyectos con nota superior a 85.",
        8: "Tu proyecto debe ser seleccionado como el más innovador del bimestre por los jueces.",
        9: "Completa el ciclo escolar anual con un mínimo de 10 proyectos publicados.",
        10: "Publica al menos un proyecto cada mes durante 3 meses seguidos.",
        11: "Participa activamente apoyando a tus compañeros: vota por 20 proyectos ajenos.",
        12: "Demuestra ser un gran colaborador trabajando en 3 grupos diferentes este año.",
        13: "Desempéñate como 'Planner' en tu equipo y obtén 3 éxitos rotundos.",
        14: "Destaquémonos como buen 'Speaker' presentando tus proyectos con éxito 3 veces.",
        15: "¡No te rindas al final! Sube al menos un proyecto durante el mes de Noviembre."
    };
    return logic[badgeId] || "Criterio de evaluación académica establecido por 1Bot.";
}

async function loadTeacherProfile() {
    const container = document.getElementById('profile-content');
    const { data: teacher } = await _supabase.from('teachers').select('*').eq('id', currentUser.id).single();

    const [assignRes, ratingRes] = await Promise.all([
        _supabase.from('teacher_assignments').select('*, schools(name)').eq('teacher_id', currentUser.id),
        _supabase.from('teacher_ratings').select('rating').eq('teacher_id', currentUser.id)
    ]);

    const assignments = assignRes.data || [];
    const kpis = await calculateMonthlyKPIs(currentUser.id, assignments);
    const avgRating = ratingRes.data?.length > 0 ? (ratingRes.data.reduce((s, r) => s + r.rating, 0) / ratingRes.data.length).toFixed(1) : 0;

    renderTeacherProfileUI(container, teacher, assignments, kpis, avgRating, ratingRes.data?.length || 0);
}

function renderTeacherProfileUI(container, teacher, assignments, kpis, avgRating, totalRatings) {
    container.innerHTML = `
    <div class="flex flex-col md:flex-row gap-8 mb-10 items-center text-center md:text-left">
        <div class="w-32 h-32 rounded-3xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-5xl shadow-inner border border-indigo-500/20 shrink-0 overflow-hidden">
            ${teacher.profile_photo_url ? `<img src="${teacher.profile_photo_url}" class="w-full h-full object-cover">` : '👨‍🏫'}
        </div>
        <div class="grow">
            <h2 class="text-4xl font-bold text-slate-800 dark:text-white tracking-tight">${teacher.full_name}</h2>
            <p class="text-lg font-semibold text-indigo-500 mb-2">Docente Autorizado 1Bot</p>
            <div class="flex justify-center md:justify-start gap-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                <span>${assignments.length} Centros Educativos</span>
                <span>•</span>
                <span>${teacher.username}</span>
            </div>
        </div>
        <div class="flex gap-3">
            <button onclick="openUploadPhotoModal()" class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-primary transition-colors"><i class="fas fa-camera text-xl"></i></button>
            <button onclick="window.print()" class="btn-primary-tw flex items-center gap-2">
                <i class="fas fa-print"></i> EXPORTAR FICHA
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div class="glass-card p-8 overflow-hidden relative group">
            <i class="fas fa-star absolute -right-6 -bottom-6 text-8xl text-slate-50 dark:text-slate-800 transition-transform group-hover:scale-110"></i>
            <div class="relative z-10">
                <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2">Rating Estudiantes</div>
                <div class="text-4xl font-bold text-slate-800 dark:text-white flex items-baseline gap-2">${avgRating} <span class="text-amber-500 text-xl">★</span></div>
                <div class="text-xs font-semibold text-slate-500 mt-4">${totalRatings} evaluaciones recibidas</div>
            </div>
        </div>
        <div class="glass-card p-8 border-l-8 border-emerald-500">
            <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2">XP Acumulada Mes</div>
            <div class="text-4xl font-bold text-emerald-600 dark:text-emerald-400">${kpis.totalXP}</div>
            <div class="text-xs font-semibold text-slate-500 mt-4">Meta mensual: 500 XP</div>
        </div>
        <div class="glass-card p-8">
            <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2">Estado del Perfil</div>
            <div class="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tighter">Verificado</div>
            <div class="flex gap-1 mt-4 text-emerald-500 text-[0.6rem]">
                ${'<i class="fas fa-shield-alt"></i>'.repeat(3)}
            </div>
        </div>
    </div>

    <div class="glass-card p-8">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
            <i class="fas fa-tasks text-primary"></i> Objetivos del Periodo
        </h3>
        <div class="grid sm:grid-cols-2 gap-8">
            <div>
                <div class="flex justify-between text-xs font-bold uppercase text-slate-400 mb-2">
                    <span>Asistencia</span>
                    <span>${kpis.attCount} / ${kpis.attMeta}</span>
                </div>
                <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-primary" style="width: ${Math.min(100, (kpis.attCount / kpis.attMeta) * 100)}%"></div>
                </div>
            </div>
            <div>
                <div class="flex justify-between text-xs font-black uppercase text-slate-400 mb-2">
                    <span>Evaluaciones Realizadas</span>
                    <span>${kpis.evalCount} / ${kpis.evalMeta}</span>
                </div>
                <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500" style="width: ${Math.min(100, (kpis.evalCount / kpis.evalMeta) * 100)}%"></div>
                </div>
            </div>
        </div>
        <button onclick="viewAllTeacherComments()" class="w-full mt-10 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-2xl transition-all uppercase tracking-widest text-xs">
            VER FEEDBACK DETALLADO DE ESTUDIANTES
        </button>
    </div>
  `;
}

async function loadAdminProfile() {
    const container = document.getElementById('profile-content');
    container.innerHTML = `
    <div class="glass-card p-12 text-center">
        <div class="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
            <i class="fas fa-user-shield"></i>
        </div>
        <h2 class="text-3xl font-bold text-slate-800 dark:text-white mb-2">Panel Ejecutivo</h2>
        <p class="text-slate-500 dark:text-slate-400 mb-10 max-w-sm mx-auto">Tienes acceso total a la configuración del sistema y reportes de exportación masiva.</p>
        <button onclick="exportStudentsCSV()" class="btn-primary-tw w-full sm:w-auto">
            <i class="fas fa-file-csv mr-2"></i> EXPORTAR LISTADO GLOBAL DE ALUMNOS
        </button>
    </div>
  `;
}

console.log('✅ profile.js optimizado (Tailwind Edition)');
