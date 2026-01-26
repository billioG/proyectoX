/**
 * SISTEMA DE BONOS DIAMANTE V2 - 1BOT EDITION
 * Gestión de remuneración basada en méritos, proporcionalidad y transparencia total.
 */

// ================================================
// COMPONENTES GLOBALES (ONBOARDING DETALLADO)
// ================================================

function openBonusOnboarding() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-0 shadow-2xl animate-slideUp border-primary/20">
            <div class="p-10 text-center bg-gradient-to-br from-primary to-indigo-700 text-white relative">
                 <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                 <div class="w-16 h-16 rounded-3xl bg-white/20 flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
                    <i class="fas fa-magic"></i>
                 </div>
                 <h2 class="text-2xl font-black uppercase tracking-tighter">¡Tu Guía Máxica para Ganar!</h2>
                 <p class="text-indigo-100 text-xs mt-1 font-bold">Es tan fácil como jugar, ¡mira cómo se hace!</p>
            </div>
            
            <div class="p-10 space-y-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <div class="flex gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0"><i class="fas fa-map-marker-alt text-2xl"></i></div>
                    <div>
                        <h3 class="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">1. Pasando Asistencia (Check-in)</h3>
                        <p class="text-[0.7rem] text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Porque si no llegas, ¡tus alumnos se quedan sin su guía!". Es tu forma de decir: ¡Aquí estoy para mi equipo!</p>
                        <p class="text-[0.65rem] text-slate-400 font-bold uppercase tracking-tighter">Solo eliges tu colegio y nivel, presionas el botón y ¡listo!.</p>
                    </div>
                </div>

                <div class="flex gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><i class="fas fa-camera-retro text-2xl"></i></div>
                    <div>
                        <h3 class="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">2. Contando Aventuras (Evidencia)</h3>
                        <p class="text-[0.7rem] text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Para que todos vean la magia que haces con los kits y cuidemos nuestras herramientas". </p>
                        <p class="text-[0.65rem] text-slate-400 font-bold uppercase tracking-tighter">Tomas una foto de tus alumnos con sus tablets, nos cuentas qué aprendieron y si hubo algún problema.</p>
                    </div>
                </div>

                <div class="flex gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0"><i class="fas fa-trophy text-2xl"></i></div>
                    <div>
                        <h3 class="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">3. El Cofre del Tesoro (Bonos)</h3>
                        <p class="text-[0.7rem] text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Porque en 1bot valoramos tu esfuerzo y queremos que seas el mejor del mundo". </p>
                        <p class="text-[0.65rem] text-slate-400 font-bold uppercase tracking-tighter">Entre más logres, ¡más grande será tu tesoro al final del mes! 💰</p>
                    </div>
                </div>
            </div>
            
            <div class="p-10 space-y-12 bg-white dark:bg-slate-900">
                <!-- Seccion 1: Como se gana -->
                <section>
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                        <span class="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs">1</span>
                        Comprendiendo tu Remuneración
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                            <h4 class="text-xs font-black text-primary uppercase mb-3">💰 Salario Proporcional</h4>
                            <p class="text-[0.7rem] text-slate-500 leading-relaxed mb-4">A diferencia de otros empleos, aquí cada acción tiene un valor monetario directo. Si haces un 80% de tus tareas, ganas el 80% de tu bono. <b>¡No pierdes todo por un error!</b></p>
                            <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-[0.6rem] border-l-4 border-emerald-500">
                                <b>EJEMPLO:</b> Si tu bono admin es de Q400 y subes 3 de 4 evidencias, recibirás Q300. Cada evidencia te dio Q75 reales.
                            </div>
                        </div>
                        <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                            <h4 class="text-xs font-black text-indigo-500 uppercase mb-3">🚀 Impacto Educativo</h4>
                            <p class="text-[0.7rem] text-slate-500 leading-relaxed mb-4">Este bono mide cuánto logras que tus alumnos aprendan. Entre más alumnos usen la plataforma, tu barra de ingresos sube.</p>
                            <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-[0.6rem] border-l-4 border-indigo-500">
                                <b>EJEMPLO:</b> No importa si subes 100 fotos. Si tus alumnos no entran a su sesión, este bono no subirá. Tu meta es liderar el uso digital.
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Seccion 2: Acciones Diarias -->
                <section>
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                        <span class="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs">2</span>
                        Tus tareas críticas
                    </h3>
                    <div class="space-y-4">
                        <div class="flex items-start gap-4 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-all">
                             <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0"><i class="fas fa-map-marker-alt"></i></div>
                             <div>
                                <h4 class="text-xs font-black uppercase text-slate-700 dark:text-white">Check-in GPS (Diario)</h4>
                                <p class="text-[0.65rem] text-slate-500 mt-1">Debes hacerlo al llegar físicamente al colegio. El sistema valida que estés a menos de 150m de la ubicación oficial.</p>
                             </div>
                        </div>
                        <div class="flex items-start gap-4 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-all">
                             <div class="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0"><i class="fas fa-camera"></i></div>
                             <div>
                                <h4 class="text-xs font-black uppercase text-slate-700 dark:text-white">Evidencia y Auditoría (Semanal)</h4>
                                <p class="text-[0.65rem] text-slate-500 mt-1">Toma una foto real de tus alumnos trabajando o de los kits/tablets. Esta acción cumple con dos metas a la vez: Evidencia Académica y Auditoría de Activos.</p>
                             </div>
                        </div>
                        <div class="flex items-start gap-4 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-all">
                             <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><i class="fas fa-file-invoice"></i></div>
                             <div>
                                <h4 class="text-xs font-black uppercase text-slate-700 dark:text-white">Informe Mensual (Cierre)</h4>
                                <p class="text-[0.65rem] text-slate-500 mt-1">Se envía antes del 26 de cada mes. Es tu resumen ejecutivo de metas alcanzadas.</p>
                             </div>
                        </div>
                    </div>
                </section>
                
                <div class="p-8 bg-slate-900 rounded-[2.5rem] text-center">
                    <p class="text-[0.6rem] text-emerald-400 font-black uppercase tracking-[0.4em] mb-4">¿Listo para empezar tu camino al éxito?</p>
                    <button class="btn-primary-tw px-12 h-14 text-xs font-black uppercase tracking-widest rounded-2xl shadow-2xl" onclick="closeBonusOnboarding()">
                        ¡ENTENDIDO, VAMOS POR LA EXCELENCIA!
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeBonusOnboarding() {
    localStorage.setItem(`onboarding_bonus_v2_${currentUser.id}`, 'true');
    const modal = document.querySelector('.fixed.z-\\[500\\]');
    if (modal) modal.remove();
}

// ================================================
// LÓGICA DE NEGOCIO Y DATOS
// ================================================

async function loadBonusSystem() {
    const container = document.getElementById('main-content-area-bonus');
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-40 text-slate-400">
            <i class="fas fa-coins fa-spin text-5xl mb-6 text-amber-400"></i>
            <span class="font-black tracking-[0.3em] uppercase text-[0.6rem] animate-pulse">Sincronizando Liquidación...</span>
        </div>
    `;

    try {
        const tutorId = currentUser?.id;
        if (!tutorId) throw new Error("Sesión requerida");

        if (!localStorage.getItem(`onboarding_bonus_v2_${tutorId}`)) {
            setTimeout(openBonusOnboarding, 500);
        }

        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [teacherRes, kpisRes, manualRes, assignmentsRes, attendanceRes, reportsRes, evidenceRes, challengeRes, historyRes, krMetrics, tasksRes, completionsRes] = await Promise.all([
            _supabase.from('teachers').select('*').eq('id', tutorId).single(),
            _supabase.from('dynamic_kpis').select('*').eq('is_active', true),
            _supabase.from('manual_kpi_entries').select('*').eq('teacher_id', tutorId).eq('period_month', period),
            _supabase.from('teacher_assignments').select('school_code, grade, section, schools(*)').eq('teacher_id', tutorId),
            _supabase.from('tutor_attendance').select('id, check_in').eq('tutor_id', tutorId).gte('check_in', startOfMonth),
            _supabase.from('teacher_monthly_reports').select('id').eq('teacher_id', tutorId).eq('month', now.getMonth() + 1).eq('year', now.getFullYear()),
            _supabase.from('weekly_evidence').select('id').eq('teacher_id', tutorId).gte('created_at', startOfMonth),
            _supabase.from('teacher_challenges').select('id').eq('teacher_id', tutorId).gte('created_at', startOfMonth),
            _supabase.from('payouts').select('*').eq('teacher_id', tutorId).order('period_month', { ascending: false }).limit(6),
            calculateMetrics(tutorId),
            _supabase.from('kpi_tasks').select('*'),
            _supabase.from('kpi_task_completions').select('*').eq('teacher_id', tutorId).eq('period_month', period)
        ]);

        const teacher = teacherRes.data;
        const allKpis = kpisRes.data || [];
        const manualEntries = manualRes.data || [];
        const assignments = assignmentsRes.data || [];
        const history = historyRes.data || [];
        const allTasks = tasksRes.data || [];
        const completions = completionsRes.data || [];

        const processedKpis = allKpis.map(kpi => {
            let progress = 0;
            let detail = '';

            // Si tiene tareas asignadas (globales o específicas), el progreso se calcula por las tareas verificadas
            const kpiTasks = allTasks.filter(t => t.kpi_id === kpi.id && (t.teacher_id === null || t.teacher_id === tutorId));
            if (kpiTasks.length > 0) {
                const done = completions.filter(c => kpiTasks.some(t => t.id === c.task_id) && c.is_verified).length;
                progress = done / kpiTasks.length;
                detail = `${done}/${kpiTasks.length} tareas validadas`;
            } else {
                switch (kpi.metric_source) {
                    case 'gps': progress = (attendanceRes.data?.length || 0) / 20; detail = `${attendanceRes.data?.length || 0}/20 días`; break;
                    case 'reports': progress = (reportsRes.data?.length || 0) > 0 ? 1 : 0; detail = progress ? 'Enviado' : 'Pendiente'; break;
                    case 'weekly_evidence': progress = (evidenceRes.data?.length || 0) / 4; detail = `${evidenceRes.data?.length || 0}/4 evidencias`; break;
                    case 'challenges': progress = (challengeRes.data?.length || 0) / 1; detail = progress ? 'Completado' : 'Pendiente'; break;
                    case 'digitalization': progress = krMetrics.digi / 100; detail = `${krMetrics.act} alumnos act.`; break;
                    case 'portfolio': progress = krMetrics.port / 100; detail = `${krMetrics.up} con proy.`; break;
                    case 'manual':
                        const m = manualEntries.find(e => e.kpi_id === kpi.id);
                        progress = m ? m.progress_value : 0; detail = 'Asignado Admin'; break;
                }
            }
            return { ...kpi, progress: Math.min(1, progress), detail, tasks: kpiTasks, completions: completions.filter(c => kpiTasks.some(t => t.id === c.task_id)) };
        });

        // Inteligencia de Distribución: Normalización de Pesos para que siempre sumen 100%
        const challengeKpi = processedKpis.find(k => k.metric_source === 'challenges');
        const wildcardValue = (challengeKpi?.progress || 0) * 0.05; // El comodín vale 5% neto de la categoría

        const adminKpis = processedKpis.filter(k => k.category === 'administrative' && k.metric_source !== 'challenges');
        const prodKpis = processedKpis.filter(k => k.category === 'productivity');

        // Sumar pesajes reales asignados por el Admin
        const totalAdminWeight = adminKpis.reduce((acc, k) => acc + (k.weight_percentage || 0), 0);
        const totalProdWeight = prodKpis.reduce((acc, k) => acc + (k.weight_percentage || 0), 0);

        // Calcular progreso normalizado (independientemente de si sumaron 100 en total)
        let adminProg = adminKpis.reduce((acc, k) => {
            const normalizedWeight = (k.weight_percentage / (totalAdminWeight || 1));
            return acc + (k.progress * normalizedWeight);
        }, 0);

        let prodProg = prodKpis.reduce((acc, k) => {
            const normalizedWeight = (k.weight_percentage / (totalProdWeight || 1));
            return acc + (k.progress * normalizedWeight);
        }, 0);

        // Aplicar comodín si falta puntuación
        if (adminProg < 1) {
            const needed = 1 - adminProg;
            const applied = Math.min(wildcardValue, needed);
            adminProg += applied;
        } else if (prodProg < 1) {
            const needed = 1 - prodProg;
            const applied = Math.min(wildcardValue, needed);
            prodProg += applied;
        }

        renderTutorView(container, teacher, processedKpis, assignments, history, { adminProg, prodProg });
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="p-10 text-rose-500 font-bold text-center">❌ Error Sinc: ${err.message}</div>`;
    }
}

async function calculateMetrics(tutorId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: asg } = await _supabase.from('teacher_assignments').select('school_code').eq('teacher_id', tutorId);
    const codes = [...new Set(asg?.map(a => a.school_code) || [])];
    const { data: stds } = await _supabase.from('students').select('id, last_login').in('school_code', codes);
    if (!stds?.length) return { digi: 0, port: 0, act: 0, up: 0 };
    const act = stds.filter(s => s.last_login && s.last_login >= thirtyDaysAgo).length;
    const { data: prj } = await _supabase.from('projects').select('user_id').gte('created_at', startOfMonth).in('user_id', stds.map(s => s.id));
    const up = [...new Set(prj?.map(p => p.user_id) || [])].length;
    return { digi: (act / stds.length) * 100, port: (up / stds.length) * 100, act, up };
}

// ================================================
// UI RENDERING
// ================================================

function renderTutorView(container, teacher, kpis, assignments, history, calculatedProgs) {
    const base = parseFloat(teacher.base_salary || 0);
    const maxAdmin = parseFloat(teacher.bonus_admin_max || 0);
    const maxProd = parseFloat(teacher.bonus_prod_max || 0);
    const maxCoord = teacher.is_coordinator ? parseFloat(teacher.bonus_coordinator_max || 0) : 0;

    const { adminProg, prodProg } = calculatedProgs;

    // Redefinir para la UI filtrando de la lista completa de kpis
    const adminKpis = kpis.filter(k => k.category === 'administrative');
    const prodKpis = kpis.filter(k => k.category === 'productivity');

    const curAdmin = maxAdmin * adminProg;
    const curProd = maxProd * prodProg;
    const curCoord = maxCoord; // Pago al 100% por ser coordinador
    const currentTotal = base + curAdmin + curProd + curCoord;

    container.innerHTML = `
        <div class="animate-fadeIn space-y-10">
            <!-- WIDGET SUPERIOR (VALOR) -->
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div class="lg:col-span-3 glass-card p-10 bg-slate-900 text-white relative overflow-hidden flex flex-col justify-between h-[340px]">
                    <div class="absolute right-[-30px] top-[-30px] opacity-10 text-[18rem] rotate-12 pointer-events-none text-emerald-500"><i class="fas fa-hand-holding-usd"></i></div>
                    
                    <div class="relative z-10">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-[0.6rem] font-black uppercase tracking-[0.4em] text-emerald-400">Retribución Mensual Estimada</span>
                                    <div class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[0.5rem] font-black uppercase tracking-widest">${teacher.rank_title || 'Tutor Junior'}</div>
                                </div>
                                <div class="text-6xl font-black tracking-tighter">Q${currentTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <button onclick="openBonusOnboarding()" class="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-xl" title="Ayuda y Onboarding">
                                <i class="fas fa-question"></i>
                            </button>
                        </div>
                    </div>

                    <div class="relative z-10 grid grid-cols-3 gap-8 pt-8 border-t border-slate-800">
                        <div>
                            <div class="text-[0.55rem] font-black text-slate-500 uppercase tracking-widest mb-1">Base Fijo</div>
                            <div class="text-xl font-black">Q${base.toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-[0.55rem] font-black text-rose-500 uppercase tracking-widest mb-1">Bono Administrativo</div>
                            <div class="text-xl font-black">Q${curAdmin.toFixed(2)} <small class="opacity-30">/ Q${maxAdmin.toFixed(0)}</small></div>
                        </div>
                        <div>
                            <div class="text-[0.55rem] font-black text-indigo-500 uppercase tracking-widest mb-1">Bono Impacto STEEAM</div>
                            <div class="text-xl font-black">Q${curProd.toFixed(2)} <small class="opacity-30">/ Q${maxProd.toFixed(0)}</small></div>
                        </div>
                        ${teacher.is_coordinator ? `
                        <div>
                            <div class="text-[0.55rem] font-black text-amber-500 uppercase tracking-widest mb-1">Bono Coordinador</div>
                            <div class="text-xl font-black">Q${curCoord.toFixed(2)} <small class="opacity-30">/ Q${maxCoord.toFixed(0)}</small></div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="glass-card p-8 flex flex-col justify-between items-center text-center">
                    <div class="w-full">
                        <div class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-6">Eficiencia Global</div>
                        <div class="relative w-36 h-36 mx-auto">
                            <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <circle class="text-slate-100 dark:text-slate-800 stroke-current" stroke-width="2.5" fill="none" cx="18" cy="18" r="16" />
                                <circle class="text-emerald-500 stroke-current transition-all duration-[2s]" stroke-width="2.5" stroke-dasharray="${Math.round(((adminProg + prodProg) / 2) * 100)}, 100" stroke-linecap="round" fill="none" cx="18" cy="18" r="16" />
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <span class="text-3xl font-black animate-pulse">${Math.round(((adminProg + prodProg) / 2) * 100)}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-emerald-500 text-[0.6rem] font-black uppercase tracking-widest">Estado: ${adminProg > 0.9 && prodProg > 0.9 ? 'Excepcional' : 'En Progreso'}</div>
                </div>
            </div>

            <!-- CV DIGITAL Y SIMULADOR DE CARRERA -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="glass-card p-8 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-l-8 border-l-indigo-500">
                    <h2 class="text-xs font-black uppercase text-indigo-600 mb-6 tracking-widest flex items-center gap-2">
                        <i class="fas fa-medal"></i> CV Digital de Impacto (Valor Mercado)
                    </h2>
                    <div class="grid grid-cols-2 gap-6">
                        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                            <div class="text-[0.55rem] font-black text-slate-400 uppercase mb-1">Puntos de Certificación</div>
                            <div class="text-2xl font-black text-slate-800 dark:text-white">${teacher.certification_points || 0} XP</div>
                        </div>
                        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                            <div class="text-[0.55rem] font-black text-slate-400 uppercase mb-1">Rango Actual</div>
                            <div class="text-sm font-black text-indigo-600 uppercase mt-1">${teacher.rank_title || 'Tutor Junior'}</div>
                        </div>
                    </div>
                    <p class="text-[0.6rem] text-slate-500 mt-6 leading-relaxed font-medium italic">
                        "Tus KPIs no solo generan dinero, construyen tu marca profesional en el ecosistema STEEAM de 1bot."
                    </p>
                </div>

                <div class="glass-card p-8 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-l-8 border-l-emerald-500">
                    <h2 class="text-xs font-black uppercase text-emerald-600 mb-4 tracking-widest flex items-center gap-2">
                        <i class="fas fa-magic"></i> Simulador de Carrera (Siguiente Nivel)
                    </h2>
                    <div class="space-y-4">
                        <div class="flex justify-between text-[0.6rem] font-black uppercase">
                            <span>Progreso a Tutor Senior</span>
                            <span>${Math.min(100, (teacher.certification_points / 500) * 100).toFixed(0)}%</span>
                        </div>
                        <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-500 transition-all duration-1000" style="width: ${Math.min(100, (teacher.certification_points / 500) * 100)}%"></div>
                        </div>
                        <p class="text-[0.6rem] text-slate-500 font-medium">
                            <i class="fas fa-info-circle mr-1"></i> Al llegar a <b>Tutor Senior</b>, tu base fija aumenta un 15% automáticamente.
                        </p>
                    </div>
                </div>
            </div>

            <!-- DASHBOARD DE ACCIONES UNIFICADO -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- PANEL DE GESTIÓN OPERATIVA -->
                <div class="space-y-6">
                    <div class="glass-card p-8 border-t-8 border-t-rose-500 relative overflow-hidden group">
                        <h2 class="text-lg font-black uppercase mb-8 flex items-center gap-3">
                            <i class="fas fa-clipboard-check text-rose-500"></i> Metas Operativas
                        </h2>
                        <div class="space-y-6">
                            ${adminKpis.map(k => renderKpiProgressTile(k)).join('')}
                        </div>
                    </div>

                    <div class="glass-card p-8 flex flex-col md:flex-row items-center gap-8 border-2 border-primary/20">
                        <div class="grow w-full">
                             <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-3 block">Establecimiento para Check-in</label>
                             <select id="bonus-school-picker" class="input-field-tw font-bold text-xs h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none shadow-inner">
                             ${(() => {
            const uniqueLevels = new Map();
            assignments.forEach(a => {
                if (a.schools) {
                    const key = `${a.schools.id}_${a.schools.level}`;
                    if (!uniqueLevels.has(key)) {
                        uniqueLevels.set(key, { id: a.schools.id, name: a.schools.name, level: a.schools.level });
                    }
                }
            });
            return Array.from(uniqueLevels.values()).map(s => `
                                     <option value="${s.id}">
                                         ${s.name} - ${s.level || 'Sin Nivel'}
                                     </option>
                                 `).join('');
        })()}
                         </select>
                        </div>
                        <button class="btn-primary-tw h-14 px-10 text-[0.65rem] font-black uppercase tracking-widest shrink-0 rounded-2xl shadow-xl shadow-primary/20" 
                                onclick="handleTutorCheckIn(document.getElementById('bonus-school-picker').value)">
                            <i class="fas fa-check-double mr-3"></i> Registrar GPS
                        </button>
                    </div>

                    <!-- BOTON UNIFICADO (EVIDENCIA + AUDITORIA) -->
                    <button class="w-full btn-secondary-tw h-20 text-[0.7rem] font-black uppercase tracking-widest rounded-2xl border-2 flex items-center justify-center gap-4 group" onclick="openEvidenceAuditModal()">
                        <i class="fas fa-camera-retro text-2xl group-hover:scale-110 transition-transform"></i>
                        <div class="text-left">
                            <div class="leading-none mb-1">Subir Evidencia Semanal</div>
                            <div class="text-[0.55rem] font-bold text-slate-400">Cumple meta de Auditoría y Fotos Académicas</div>
                        </div>
                    </button>
                </div>

                <!-- PANEL DE IMPACTO EDUCATIVO + HISTORIAL -->
                <div class="space-y-6">
                    <div class="glass-card p-8 border-t-8 border-t-indigo-500 relative overflow-hidden group">
                        <h2 class="text-lg font-black uppercase mb-8 flex items-center gap-3">
                            <i class="fas fa-bolt text-indigo-500"></i> Impacto STEEAM
                        </h2>
                        <div class="space-y-6">
                            ${prodKpis.map(k => renderKpiProgressTile(k)).join('')}
                        </div>
                    </div>

                    <!-- HISTORIAL DE PAGOS -->
                    <div class="glass-card p-8">
                        <h2 class="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-6 flex items-center gap-2">
                            <i class="fas fa-history text-slate-400"></i> Historial de Liquidaciones
                        </h2>
                        ${history.length > 0 ? `
                            <div class="space-y-3">
                                ${history.map(p => `
                                    <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <div>
                                            <div class="text-[0.65rem] font-black uppercase text-slate-600 dark:text-white">${new Date(p.period_month + '-02').toLocaleString('es', { month: 'long', year: 'numeric' })}</div>
                                            <div class="text-[0.55rem] font-bold text-slate-400 uppercase">Procesado el ${new Date(p.processed_at).toLocaleDateString()}</div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-sm font-black text-emerald-500">Q${parseFloat(p.total_paid).toFixed(2)}</div>
                                            <div class="text-[0.5rem] font-black bg-emerald-500/10 text-emerald-500 px-2 rounded uppercase">Liquiado</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-10 opacity-30">
                                <i class="fas fa-folder-open text-4xl mb-4"></i>
                                <p class="text-[0.6rem] font-black uppercase">Sin historial de pagos registrados</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>

            ${userRole === 'admin' ? `
                <div class="flex justify-center pt-10">
                     <button class="btn-primary-tw bg-slate-900 hover:bg-black border-none px-12 h-16 text-xs font-black uppercase tracking-[0.3em] shadow-2xl rounded-2xl" onclick="openAdminKpiManager()">
                        <i class="fas fa-shield-alt mr-3 text-emerald-400"></i> Gestión de Salarios y Desempeño
                     </button>
                </div>
            ` : ''}
        </div>
    `;
}

function renderKpiProgressTile(kpi) {
    const isDone = kpi.progress >= 0.95;
    const hasTasks = kpi.tasks && kpi.tasks.length > 0;

    return `
        <div class="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-50 dark:border-slate-800 shadow-sm">
            <div class="flex justify-between items-end mb-4">
                <div class="max-w-[70%]">
                    <div class="text-[0.7rem] font-black uppercase text-slate-800 dark:text-white tracking-tight mb-1">${kpi.title}</div>
                    <div class="text-[0.6rem] font-bold text-slate-400 uppercase">${kpi.detail}</div>
                </div>
                <div class="text-right">
                    <div class="text-xl font-black ${isDone ? 'text-emerald-500' : 'text-slate-400'} leading-none">${(kpi.progress * 100).toFixed(0)}%</div>
                </div>
            </div>
            
            <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-6">
                <div class="h-full bg-gradient-to-r ${isDone ? 'from-emerald-500 to-teal-400' : 'from-slate-300 to-slate-400'} transition-all duration-1000" style="width: ${kpi.progress * 100}%"></div>
            </div>

            ${hasTasks ? `
                <div class="space-y-3 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div class="text-[0.5rem] font-black text-slate-400 uppercase tracking-widest mb-2">Checklist de Cumplimiento</div>
                    ${kpi.tasks.map(task => {
        const comp = kpi.completions?.find(c => c.task_id === task.id);
        const isCompleted = comp?.is_completed;
        const isVerified = comp?.is_verified;

        return `
                            <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 group/task">
                                <div class="flex items-center gap-3">
                                    <button onclick="toggleTaskCompletion('${task.id}', ${!isCompleted})" 
                                            class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all 
                                            ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 dark:border-slate-700 hover:border-primary'}">
                                        ${isCompleted ? '<i class="fas fa-check text-[0.6rem]"></i>' : ''}
                                    </button>
                                    <div class="text-[0.65rem] font-bold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}">${task.title}</div>
                                </div>
                                ${isVerified ? `
                                    <span class="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[0.5rem] font-black uppercase">Validado Admin</span>
                                ` : (isCompleted ? `
                                    <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[0.5rem] font-black uppercase italic animate-pulse">Pendiente Validación</span>
                                ` : '')}
                            </div>
                        `;
    }).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// ================================================
// LÓGICA DE CONTROL OPERATIVO REPETITIVA
// ================================================

async function handleTutorCheckIn(schoolId) {
    if (!schoolId) return showToast('❌ Selecciona un colegio', 'error');
    const btn = event.currentTarget;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Validando...';

    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const { latitude, longitude } = pos.coords;
            const { data: sch } = await _supabase.from('schools').select('*').eq('id', schoolId).single();
            if (!sch) throw new Error("Colegio no encontrado.");
            const dist = calculateDist(latitude, longitude, sch.latitude, sch.longitude);
            if (dist > (sch.geofence_radius || 150)) throw new Error(`Fuera de rango (${Math.round(dist)}m)`);
            const { error } = await _supabase.from('tutor_attendance').insert({ tutor_id: currentUser.id, school_id: schoolId, latitude, longitude, distance_meters: dist, is_valid_entry: true });
            if (error) throw error;
            showToast('✅ Asistencia confirmada', 'success');
            loadBonusSystem();
        } catch (err) { showToast('❌ ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = orig; }
    }, (err) => { showToast('❌ GPS Requerido', 'error'); btn.disabled = false; btn.innerHTML = orig; }, { enableHighAccuracy: true });
}

function calculateDist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================================================
// MODAL UNIFICADO (EVIDENCIA + AUDITORIA)
// ================================================

function openEvidenceAuditModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl p-0 overflow-hidden animate-slideUp border border-primary/20 flex flex-col max-h-[90vh]">
            <div class="bg-gradient-to-br from-primary to-indigo-700 p-8 text-center shrink-0">
                <h2 class="text-2xl font-black text-white uppercase tracking-tighter">Documentación Semanal</h2>
                <p class="text-indigo-100 text-[0.6rem] font-bold uppercase tracking-[0.2em] mt-1 italic">Evidencia Académica + Auditoría de Activos</p>
            </div>
            
            <div class="p-8 overflow-y-auto space-y-6">
                <div class="space-y-4">
                    <div>
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Título de la Actividad</label>
                        <input type="text" id="doc-title" class="input-field-tw h-12 text-sm" placeholder="Ej: Taller de Electrónica Básica" required>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">¿Qué aprendieron hoy?</label>
                            <textarea id="doc-results" class="input-field-tw text-xs" rows="3" placeholder="Resultados alcanzados..."></textarea>
                        </div>
                        <div>
                            <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">¿Hubo algún problema?</label>
                            <textarea id="doc-challenges" class="input-field-tw text-xs" rows="3" placeholder="Inconvenientes externos..."></textarea>
                        </div>
                    </div>

                    <div>
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block">Acciones y Conclusión</label>
                        <textarea id="doc-desc" class="input-field-tw text-xs" rows="3" placeholder="Describe cómo se resolvió y el impacto final..."></textarea>
                    </div>
                </div>

                <div class="p-10 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2rem] flex flex-col items-center justify-center text-slate-400 group cursor-pointer hover:border-primary transition-all duration-500" id="photo-dropzone" onclick="document.getElementById('audit-photo').click()">
                    <i class="fas fa-camera text-5xl mb-3 group-hover:text-primary transition-colors"></i>
                    <span class="text-[0.65rem] font-black uppercase tracking-widest">Tomar Foto con Alumnos y Kits</span>
                    <input type="file" id="audit-photo" accept="image/*" capture="camera" class="hidden" onchange="handleDocPhotoSelect(this)">
                </div>

                <div id="doc-preview-container" class="hidden">
                     <img id="doc-preview" class="w-full aspect-video object-cover rounded-[1.5rem] shadow-2xl border-4 border-white dark:border-slate-800">
                </div>
            </div>

            <div class="p-8 bg-slate-50 dark:bg-slate-800/50 flex gap-4 shrink-0">
                 <button class="flex-1 btn-secondary-tw h-14 text-[0.65rem] font-black uppercase tracking-widest rounded-2xl" onclick="this.closest('.fixed').remove()">Cancelar</button>
                 <button class="flex-[2] btn-primary-tw h-14 text-[0.65rem] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20" id="btn-save-doc" disabled>SUBIR TODO</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function handleDocPhotoSelect(input) {
    if (!input.files?.[0]) return;
    const file = input.files[0];
    const preview = document.getElementById('doc-preview');
    const container = document.getElementById('doc-preview-container');
    const dropzone = document.getElementById('photo-dropzone');
    const btn = document.getElementById('btn-save-doc');

    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        container.classList.remove('hidden');
        dropzone.classList.add('hidden');
        btn.disabled = false;
        btn.onclick = async () => {
            const title = document.getElementById('doc-title').value;
            if (!title) return showToast('❌ Agrega un título a la actividad', 'error');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
            try {
                const combinedDesc = `Resultados: ${document.getElementById('doc-results').value}\nInconvenientes: ${document.getElementById('doc-challenges').value}\nImpacto: ${document.getElementById('doc-desc').value}`;

                // 1. Insertar en weekly_evidence
                const { error: err1 } = await _supabase.from('weekly_evidence').insert({
                    teacher_id: currentUser.id,
                    title: title,
                    description: combinedDesc,
                    photo_url: 'simulated_storage_url',
                    created_at: new Date().toISOString()
                });

                // 2. Insertar en asset_audits
                const { error: err2 } = await _supabase.from('asset_audits').insert({
                    tutor_id: currentUser.id,
                    photo_url: 'simulated_storage_url',
                    status: 'valid'
                });

                if (err1 || err2) throw (err1 || err2);
                showToast('🚀 Registro completo y bonos actualizados', 'success');
                loadBonusSystem();
                document.querySelector('.fixed.z-\\[600\\]')?.remove();
            } catch (e) { showToast('❌ Error al subir: ' + e.message, 'error'); btn.disabled = false; btn.innerHTML = 'REINTENTAR'; }
        }
    };
    reader.readAsDataURL(file);
}


// ================================================
// ADMINISTRACIÓN MASTER (UI ADMIN) - MANTENER IGUAL
// ================================================

async function openAdminKpiManager() {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [teachersRes, pendingRes] = await Promise.all([
        _supabase.from('teachers').select('id, full_name, base_salary, bonus_admin_max, bonus_prod_max').order('full_name'),
        _supabase.from('kpi_task_completions').select('teacher_id').eq('period_month', period).eq('is_completed', true).eq('is_verified', false)
    ]);

    const teachers = teachersRes.data;
    const pendingData = pendingRes.data || [];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-6xl h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp border-primary/20">
            <div class="bg-slate-900 text-white p-10 flex justify-between items-center shrink-0">
                <div>
                   <h2 class="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <i class="fas fa-shield-alt text-emerald-400"></i> Control de Pagos y Metas
                   </h2>
                   <p class="text-[0.6rem] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">Configuración Salarial y Cumplimiento</p>
                </div>
                <div class="flex gap-4">
                     <button class="px-6 py-2 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-xl text-[0.6rem] font-black uppercase tracking-widest transition-all" onclick="renderValidationInbox()">
                        <i class="fas fa-envelope-open-text mr-2"></i> Bandeja de Validación
                     </button>
                     <button class="px-6 py-2 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-xl text-[0.6rem] font-black uppercase tracking-widest transition-all" onclick="renderGlobalKpiManager()">
                        <i class="fas fa-tasks mr-2"></i> Metas Globales (Rocas)
                     </button>
                     <button onclick="this.closest('.fixed').remove()" class="w-12 h-12 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center"><i class="fas fa-times text-2xl"></i></button>
                </div>
            </div>
            
            <div class="flex flex-1 overflow-hidden">
                <div class="w-80 border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto p-6 space-y-3" id="admin-payees-list">
                    <div class="text-[0.55rem] font-black text-slate-400 uppercase tracking-[0.4em] mb-6 px-4">Payees Activos</div>
                    ${renderTeacherListItems(teachers, pendingData)}
                </div>
                
                <div class="flex-1 overflow-y-auto" id="kpi-editor-container">
                    <div class="flex flex-col items-center justify-center h-full text-slate-300 p-20 text-center">
                        <div class="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-8 opacity-50"><i class="fas fa-user-edit text-4xl"></i></div>
                        <h3 class="text-lg font-black uppercase tracking-tighter">Selección de Docente</h3>
                        <p class="text-xs font-medium text-slate-500 mt-2 max-w-xs">Elige a un docente para gestionar su salario o usa la <b>Bandeja de Validación</b> para aprobar tareas pendientes.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function selectTeacherForManager(teacherId) {
    const container = document.getElementById('kpi-editor-container');
    const { data: teacher } = await _supabase.from('teachers').select('*').eq('id', teacherId).single();
    const { data: kpis } = await _supabase.from('dynamic_kpis').select('*');
    const { data: allTasks } = await _supabase.from('kpi_tasks').select('*');
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { data: manualEntries } = await _supabase.from('manual_kpi_entries').select('*').eq('teacher_id', teacherId).eq('period_month', period);
    const { data: completions } = await _supabase.from('kpi_task_completions').select('*').eq('teacher_id', teacherId).eq('period_month', period);

    // Enriquecer KPIs con sus tareas (Globales + Específicas de este docente)
    const kpisWithTasks = kpis.map(k => ({
        ...k,
        tasks: allTasks.filter(t => t.kpi_id === k.id && (t.teacher_id === null || t.teacher_id === teacherId))
    }));

    container.innerHTML = `
        <div class="animate-fadeIn p-14 space-y-14">
            <div class="flex justify-between items-end border-b-2 border-slate-50 dark:border-slate-800 pb-8">
                <div>
                    <h2 class="text-4xl font-black uppercase tracking-tighter">${teacher.full_name}</h2>
                    <p class="text-xs font-bold text-primary uppercase tracking-[0.2em] mt-2">ID Fiscal: ${teacherId.substring(0, 8)}</p>
                </div>
            </div>
            
            <section class="space-y-6">
                <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Estructura Salarial (Quetzales)</div>
                <div class="grid grid-cols-3 gap-8">
                    <div class="space-y-2">
                        <label class="text-[0.55rem] font-black uppercase block ml-1 text-slate-500">Sueldo Base Mensual</label>
                        <input type="number" id="edit-base" class="input-field-tw font-black text-lg h-16 rounded-2xl" value="${teacher.base_salary}">
                    </div>
                    <div class="space-y-2">
                        <label class="text-[0.55rem] font-black uppercase block ml-1 text-rose-500">Bono Admin Máximo</label>
                        <input type="number" id="edit-admin" class="input-field-tw font-black text-lg h-16 rounded-2xl" value="${teacher.bonus_admin_max}">
                    </div>
                    <div class="space-y-2">
                        <label class="text-[0.55rem] font-black uppercase block ml-1 text-indigo-500">Bono Prod Máximo</label>
                        <input type="number" id="edit-prod" class="input-field-tw font-black text-lg h-16 rounded-2xl" value="${teacher.bonus_prod_max}">
                    </div>
                </div>

                <div class="p-8 rounded-[2rem] bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <input type="checkbox" id="edit-is-coord" class="w-6 h-6 rounded-lg accent-amber-500" ${teacher.is_coordinator ? 'checked' : ''}>
                        <div>
                            <div class="text-xs font-black uppercase">¿Es Coordinador/a?</div>
                            <div class="text-[0.6rem] font-medium text-amber-600 uppercase">Habilita el bono extra de coordinación</div>
                        </div>
                    </div>
                    <div class="w-64">
                         <label class="text-[0.55rem] font-black text-slate-400 uppercase mb-2 block tracking-widest">Bono Coordinación Máximo</label>
                         <input type="number" id="edit-bonus-coord" class="input-field-tw font-black text-sm h-12 rounded-xl" value="${teacher.bonus_coordinator_max || 0}">
                    </div>
                </div>

                <button class="btn-primary-tw w-full h-16 text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 mt-4" onclick="saveTeacherFinance('${teacherId}')">
                   <i class="fas fa-save mr-2"></i> Guardar Perfil Financiero
                </button>
            </section>

            <!-- KPIs y Metas -->
            <section class="space-y-8">
                <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Gestión de Metas y Tareas</div>
                <div class="grid grid-cols-1 gap-6">
                    ${kpisWithTasks.filter(k => k.metric_source === 'manual' || k.tasks.length > 0).map(k => {
        const entry = manualEntries.find(m => m.kpi_id === k.id);
        return `
                            <div class="p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-6">
                                <div class="flex items-center gap-10">
                                    <div class="grow">
                                        <div class="font-black text-sm uppercase tracking-tighter">${k.title}</div>
                                        <div class="text-[0.55rem] font-medium text-slate-400 mt-1 uppercase">${k.description || 'Cumplimiento estratégico por objetivos'}</div>
                                    </div>
                                    <div class="px-6 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                                         <div class="text-[0.5rem] font-black text-slate-400 uppercase mb-1">Impacto en Bono</div>
                                         <div class="text-xs font-black text-primary">${k.weight_percentage}%</div>
                                    </div>
                                </div>
                                
                                ${k.tasks && k.tasks.length > 0 ? `
                                    <div class="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <div class="text-[0.55rem] font-black text-slate-400 uppercase tracking-widest mb-4">Verificación de Tareas (${teacher.full_name})</div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            ${k.tasks.map(task => {
            const comp = completions.find(c => c.task_id === task.id && c.teacher_id === teacherId);
            const isDone = comp?.is_completed;
            const isVerified = comp?.is_verified;
            return `
                                                    <div class="flex items-center justify-between p-3 rounded-xl ${isDone ? 'bg-white dark:bg-white/5' : 'opacity-40'} border border-slate-100 dark:border-slate-800/50">
                                                            <div class="w-2 h-2 rounded-full ${isDone ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}"></div>
                                                            <div>
                                                                <div class="text-[0.65rem] font-bold uppercase ${isDone ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}">${task.title}</div>
                                                                <div class="text-[0.4rem] font-black uppercase ${task.teacher_id ? 'text-indigo-400' : 'text-slate-300'}">${task.teacher_id ? 'Personalizada' : 'Global (Para todos)'}</div>
                                                            </div>
                                                        </div>
                                                        <button onclick="verifyTaskCompletion('${task.id}', '${teacherId}', ${!isVerified})"
                                                                class="px-3 py-1 rounded-lg text-[0.5rem] font-black uppercase transition-all
                                                                ${isVerified ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-blue-500'}">
                                                            ${isVerified ? 'VERIFICADO' : 'VALIDAR'}
                                                        </button>
                                                    </div>
                                                `;
        }).join('')}
                                        </div>
                                        <button class="mt-4 w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[0.55rem] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all" 
                                                onclick="showAddTaskModal('${k.id}', '${teacherId}')">
                                            <i class="fas fa-plus mr-2"></i> AGREGAR TAREA ESPECÍFICA PARA ${teacher.full_name}
                                        </button>
                                    </div>
                                ` : `
                                    <div class="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button class="w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[0.55rem] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all" 
                                                onclick="showAddTaskModal('${k.id}', '${teacherId}')">
                                            <i class="fas fa-plus mr-2"></i> ASIGNAR TAREA PERSONALIZADA
                                        </button>
                                    </div>
                                `}
                            </div>
                        `;
    }).join('')}
                </div>
            </section>
        </div>
    `;
}

async function saveTeacherFinance(teacherId) {
    const base_salary = parseFloat(document.getElementById('edit-base').value);
    const bonus_admin_max = parseFloat(document.getElementById('edit-admin').value);
    const bonus_prod_max = parseFloat(document.getElementById('edit-prod').value);
    const is_coordinator = document.getElementById('edit-is-coord').checked;
    const bonus_coordinator_max = parseFloat(document.getElementById('edit-bonus-coord').value);

    const { error } = await _supabase.from('teachers').update({
        base_salary,
        bonus_admin_max,
        bonus_prod_max,
        is_coordinator,
        bonus_coordinator_max
    }).eq('id', teacherId);

    if (!error) {
        showToast('🚀 Economía del docente actualizada', 'success');
        loadBonusSystem();
    }
}

async function updateManualKpi(teacherId, kpiId, val) {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { error } = await _supabase.from('manual_kpi_entries').upsert({
        teacher_id: teacherId, kpi_id: kpiId, period_month: period, progress_value: parseFloat(val)
    }, { onConflict: 'kpi_id, teacher_id, period_month' });

    if (!error) showToast('🎯 Mérito manual actualizado', 'success');
}

async function submitChallengeEvidence(challengeId) {
    const comment = document.getElementById('challenge-comment')?.value.trim();
    if (!comment) return showToast('❌ Cuéntanos un poco sobre tu experiencia', 'error');

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';

    try {
        const { error } = await _supabase.from('teacher_challenges').insert({
            teacher_id: currentUser.id,
            challenge_id: challengeId,
            comment: comment,
            created_at: new Date().toISOString()
        });

        if (error) throw error;

        showToast('🎯 ¡Reto completado! Tu bono comodín se ha activado.', 'success');
        document.querySelector('.fixed.z-\\[100\\]')?.remove();
        loadBonusSystem();
    } catch (err) {
        console.error(err);
        showToast('❌ Error: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function renderGlobalKpiManager() {
    const container = document.getElementById('kpi-editor-container');
    const { data: kpis } = await _supabase.from('dynamic_kpis').select('*').order('category');

    container.innerHTML = `
        <div class="animate-fadeIn p-14 space-y-10">
            <div class="flex justify-between items-center">
                <h2 class="text-3xl font-black uppercase tracking-tighter">Metas Globales (Rocas)</h2>
                <button class="btn-primary-tw px-8 h-12 text-[0.6rem] font-black uppercase tracking-widest rounded-xl" onclick="showAddKpiModal()">
                    <i class="fas fa-plus mr-2"></i> Nueva Meta
                </button>
            </div>

            <div class="grid grid-cols-1 gap-4">
                ${kpis.map(k => `
                    <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-${k.category === 'administrative' ? 'rose' : 'indigo'}-500/10 text-${k.category === 'administrative' ? 'rose' : 'indigo'}-500 flex items-center justify-center">
                                <i class="fas fa-${k.category === 'administrative' ? 'clipboard-list' : 'bolt'}"></i>
                            </div>
                            <div>
                                <div class="text-sm font-black uppercase tracking-tighter">${k.title}</div>
                                <div class="text-[0.6rem] font-bold text-slate-400 uppercase">${k.category} • Peso: ${k.weight_percentage}%</div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                             <button class="w-10 h-10 rounded-xl hover:bg-rose-500/10 text-slate-300 hover:text-rose-500 transition-all flex items-center justify-center" onclick="deleteDynamicKpi('${k.id}')">
                                <i class="fas fa-trash-alt"></i>
                             </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="p-8 bg-blue-500/5 rounded-[2rem] border border-blue-500/20">
                <p class="text-[0.6rem] text-blue-600 dark:text-blue-400 font-medium leading-relaxed italic">
                    <i class="fas fa-info-circle mr-2"></i> <b>Inteligencia de Distribución Activa:</b> No te preocupes por los porcentajes exactos. El sistema sumará todos los pesos de la categoría y distribuirá el bono automáticamente de forma proporcional.
                </p>
            </div>
        </div>
    `;
}

function showAddKpiModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[700] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-lg p-10 animate-slideUp">
            <h2 class="text-xl font-black uppercase tracking-tighter mb-8 italic">Configurar Nueva Meta</h2>
            <form onsubmit="saveNewKpi(event)" class="space-y-6">
                <div>
                    <label class="text-[0.6rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Título de la Meta</label>
                    <input type="text" name="title" class="input-field-tw" required>
                </div>
                <div>
                    <label class="text-[0.6rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Categoría</label>
                    <select name="category" class="input-field-tw">
                        <option value="administrative">Administrativa (Operativa)</option>
                        <option value="productivity">Productividad (Impacto STEEAM)</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Fuente de Métrica</label>
                        <select name="metric_source" class="input-field-tw">
                            <option value="manual">Manual (Admin asigna %)</option>
                            <option value="weekly_evidence">Evidencia Semanal</option>
                            <option value="gps">Asistencia GPS</option>
                            <option value="reports">Reporte Mensual</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Peso Sugerido (%)</label>
                        <input type="number" name="weight" class="input-field-tw" value="20" required>
                    </div>
                </div>
                <div class="flex gap-4 pt-4">
                    <button type="button" class="flex-1 btn-secondary-tw h-12" onclick="this.closest('.fixed').remove()">Cerrar</button>
                    <button type="submit" class="flex-[2] btn-primary-tw h-12">Crear Meta</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveNewKpi(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await _supabase.from('dynamic_kpis').insert({
        title: f.get('title'),
        category: f.get('category'),
        metric_source: f.get('metric_source'),
        weight_percentage: parseInt(f.get('weight')),
        is_active: true
    });

    if (!error) {
        showToast('🚀 Nueva Roca configurada', 'success');
        e.target.closest('.fixed').remove();
        renderGlobalKpiManager();
        loadBonusSystem();
    }
}

async function deleteDynamicKpi(id) {
    if (!confirm('¿Seguro que deseas eliminar esta meta global?')) return;
    const { error } = await _supabase.from('dynamic_kpis').delete().eq('id', id);
    if (!error) {
        showToast('🗑️ Meta eliminada', 'default');
        renderGlobalKpiManager();
        loadBonusSystem();
    }
}

async function toggleTaskCompletion(taskId, isCompleted) {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { error } = await _supabase.from('kpi_task_completions').upsert({
        task_id: taskId,
        teacher_id: currentUser.id,
        period_month: period,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null
    }, { onConflict: 'task_id, teacher_id, period_month' });

    if (!error) {
        showToast(isCompleted ? '🚩 Tarea marcada como hecha' : '🔄 Tarea revertida', 'success');
        loadBonusSystem();
    }
}

async function renderGlobalKpiManager() {
    const container = document.getElementById('kpi-editor-container');
    const { data: kpis } = await _supabase.from('dynamic_kpis').select('*').order('category');

    container.innerHTML = `
        <div class="animate-fadeIn p-14 space-y-10">
            <div class="flex justify-between items-center">
                <h2 class="text-3xl font-black uppercase tracking-tighter">Metas Globales (Rocas)</h2>
                <button class="btn-primary-tw px-8 h-12 text-[0.6rem] font-black uppercase tracking-widest rounded-xl" onclick="showAddKpiModal()">
                    <i class="fas fa-plus mr-2"></i> Nueva Roca
                </button>
            </div>

            <div class="grid grid-cols-1 gap-6">
                ${kpis.map(k => `
                    <div class="glass-card p-0 overflow-hidden border border-slate-100 dark:border-slate-800">
                        <div class="p-6 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-xl bg-${k.category === 'administrative' ? 'rose' : 'indigo'}-500/10 text-${k.category === 'administrative' ? 'rose' : 'indigo'}-500 flex items-center justify-center">
                                    <i class="fas fa-${k.category === 'administrative' ? 'clipboard-list' : 'bolt'}"></i>
                                </div>
                                <div>
                                    <div class="text-sm font-black uppercase tracking-tighter">${k.title}</div>
                                    <div class="text-[0.6rem] font-bold text-slate-400 uppercase">${k.category} • Fuente: ${k.metric_source}</div>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                 <button class="btn-secondary-tw px-4 h-9 text-[0.5rem] font-black" onclick="showAddTaskModal('${k.id}')">
                                    <i class="fas fa-plus mr-1"></i> AGREGAR TAREA
                                 </button>
                                 <button class="w-9 h-9 rounded-xl hover:bg-rose-500/10 text-slate-300 hover:text-rose-500 transition-all flex items-center justify-center" onclick="deleteDynamicKpi('${k.id}')">
                                    <i class="fas fa-trash-alt"></i>
                                 </button>
                            </div>
                        </div>
                        <div class="p-4 bg-white dark:bg-slate-950" id="tasks-for-${k.id}">
                            <div class="text-center py-4 text-slate-400 text-[0.5rem] font-black uppercase tracking-widest italic animate-pulse">Cargando Tareas...</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Cargar solo tareas globales (sin teacher_id)
    kpis.forEach(k => loadKpiTasksForAdmin(k.id, null));
}

async function loadKpiTasksForAdmin(kpiId, teacherId = null) {
    const { data: tasks } = await _supabase.from('kpi_tasks')
        .select('*')
        .eq('kpi_id', kpiId)
        .eq('teacher_id', teacherId); // Filtro estricto para diferenciar global de específica
    const container = document.getElementById(`tasks-for-${kpiId}`);
    if (!container) return;

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-slate-300 text-[0.5rem] font-black uppercase uppercase tracking-widest">Sin tareas específicas</div>';
        return;
    }

    container.innerHTML = `
        <div class="space-y-2">
            ${tasks.map(t => `
                <div class="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 group/item transition-all">
                    <div class="flex items-center gap-3">
                         <div class="w-1.5 h-1.5 rounded-full bg-primary/30"></div>
                         <div class="text-[0.7rem] font-bold text-slate-600 dark:text-slate-400 uppercase">${t.title}</div>
                    </div>
                    <button class="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-all" onclick="deleteKpiTask('${t.id}', '${kpiId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function showAddTaskModal(kpiId, teacherId = null) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[750] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-sm p-10 animate-slideUp">
            <h2 class="text-sm font-black uppercase tracking-widest mb-6">${teacherId ? 'Tarea Personalizada' : 'Nueva Tarea Global'}</h2>
            <input type="text" id="new-task-title" class="input-field-tw mb-6" placeholder="Nombre de la acción...">
            <div class="flex gap-3">
                <button class="flex-1 btn-secondary-tw h-12" onclick="this.closest('.fixed').remove()">Cerrar</button>
                <button class="flex-[2] btn-primary-tw h-12" onclick="saveKpiTask('${kpiId}', ${teacherId ? `'${teacherId}'` : 'null'})">Crear Tarea</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveKpiTask(kpiId, teacherId = null) {
    const title = document.getElementById('new-task-title').value.trim();
    if (!title) return;

    const { error } = await _supabase.from('kpi_tasks').insert({ kpi_id: kpiId, title, teacher_id: teacherId });
    if (!error) {
        showToast('✅ Tarea agregada', 'success');
        document.querySelector('.fixed.z-\\[750\\]')?.remove();
        if (teacherId) {
            selectTeacherForManager(teacherId); // Refrescar vista de docente
        } else {
            loadKpiTasksForAdmin(kpiId, null); // Refrescar vista global
        }
        loadBonusSystem();
    }
}

async function deleteKpiTask(taskId, kpiId) {
    const { error } = await _supabase.from('kpi_tasks').delete().eq('id', taskId);
    if (!error) {
        loadKpiTasksForAdmin(kpiId);
        loadBonusSystem();
    }
}

async function renderValidationInbox() {
    const container = document.getElementById('kpi-editor-container');
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // Fetch all pending completions with teacher and task details
    const { data: pending } = await _supabase
        .from('kpi_task_completions')
        .select('*, teachers(full_name), kpi_tasks(title, kpi_id, dynamic_kpis(title))')
        .eq('period_month', period)
        .eq('is_completed', true)
        .eq('is_verified', false)
        .order('completed_at', { ascending: false });

    container.innerHTML = `
        <div class="animate-fadeIn p-14 space-y-10">
            <div class="flex justify-between items-end border-b-2 border-slate-50 dark:border-slate-800 pb-8">
                <div>
                    <h2 class="text-4xl font-black uppercase tracking-tighter">Bandeja de Validación</h2>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Tareas esperando aprobación oficial</p>
                </div>
            </div>

            ${!pending || pending.length === 0 ? `
                <div class="flex flex-col items-center justify-center py-20 text-center opacity-30">
                    <i class="fas fa-check-circle text-7xl mb-6 text-emerald-500"></i>
                    <h3 class="text-lg font-black uppercase">¡Todo al día!</h3>
                    <p class="text-xs font-medium uppercase mt-2">No hay tareas pendientes de validación para este mes.</p>
                </div>
            ` : `
                <div class="grid grid-cols-1 gap-6">
                    ${pending.map(p => `
                        <div class="p-8 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:shadow-xl transition-all">
                            <div class="flex items-center gap-8">
                                <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex flex-col items-center justify-center shrink-0">
                                     <i class="fas fa-user-clock text-xl mb-1"></i>
                                     <span class="text-[0.4rem] font-black uppercase">Espera</span>
                                </div>
                                <div>
                                    <div class="text-[0.55rem] font-black text-primary uppercase tracking-widest mb-1">${p.kpi_tasks?.dynamic_kpis?.title || 'Roca Global'}</div>
                                    <div class="text-lg font-black uppercase tracking-tighter text-slate-800 dark:text-white leading-none">${p.kpi_tasks?.title}</div>
                                    <div class="flex items-center gap-3 mt-3">
                                         <div class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[0.6rem] font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <i class="fas fa-user-circle"></i> ${p.teachers?.full_name}
                                         </div>
                                         <div class="text-[0.55rem] font-medium text-slate-400 uppercase">
                                            Enviado: ${new Date(p.completed_at).toLocaleString()}
                                         </div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex gap-3">
                                 <button class="px-8 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[0.6rem] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all"
                                         onclick="bulkVerifyTask('${p.task_id}', '${p.teacher_id}')">
                                    <i class="fas fa-check-double mr-2"></i> VALIDAR AHORA
                                 </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}

            <div class="p-8 bg-blue-500/5 rounded-[2rem] border border-blue-500/20 mt-10">
                <p class="text-[0.6rem] text-blue-600 dark:text-blue-400 font-medium leading-relaxed italic">
                    <i class="fas fa-history mr-2"></i> <b>Historial de Integridad:</b> Cada validación queda registrada con fecha y hora. El bono del tutor se actualizará en tiempo real al aprobar estas acciones.
                </p>
            </div>
        </div>
    `;
}

async function bulkVerifyTask(taskId, teacherId) {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { error } = await _supabase.from('kpi_task_completions').update({
        is_verified: true,
        verified_at: new Date().toISOString()
    }).eq('task_id', taskId).eq('teacher_id', teacherId).eq('period_month', period);

    if (!error) {
        showToast('💎 Tarea Validada', 'success');
        refreshAdminBadges();
        renderValidationInbox();
        loadBonusSystem();
    }
}

async function verifyTaskCompletion(taskId, teacherId, isVerified) {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { error } = await _supabase.from('kpi_task_completions').update({
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null
    }).eq('task_id', taskId).eq('teacher_id', teacherId).eq('period_month', period);

    if (!error) {
        showToast(isVerified ? '💎 Tarea verificada oficialmente' : '🔄 Verificación removida', 'success');
        refreshAdminBadges();
        selectTeacherForManager(teacherId);
        loadBonusSystem();
    } else {
        showToast('❌ El tutor aún no ha marcado esta tarea como hecha', 'error');
    }
}

function renderTeacherListItems(teachers, pendingData) {
    return `
        <div class="text-[0.55rem] font-black text-slate-400 uppercase tracking-[0.4em] mb-6 px-4">Payees Activos</div>
        ${teachers.map(t => {
        const count = pendingData.filter(p => p.teacher_id === t.id).length;
        return `
                <button class="w-full text-left p-5 rounded-[1.5rem] hover:bg-white dark:hover:bg-slate-900 transition-all group border border-transparent hover:border-slate-200 dark:hover:border-slate-800 relative" onclick="selectTeacherForManager('${t.id}')">
                    <div class="font-black text-xs uppercase group-hover:text-primary transition-colors">${t.full_name}</div>
                    <div class="text-[0.55rem] font-bold text-slate-400 mt-1 uppercase">Base: Q${t.base_salary.toFixed(0)}</div>
                    ${count > 0 ? `<div class="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-[0.6rem] font-black shadow-lg shadow-emerald-500/30 animate-bounce">${count}</div>` : ''}
                </button>
            `;
    }).join('')}
    `;
}

async function refreshAdminBadges() {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [teachersRes, pendingRes] = await Promise.all([
        _supabase.from('teachers').select('id, full_name, base_salary').order('full_name'),
        _supabase.from('kpi_task_completions').select('teacher_id').eq('period_month', period).eq('is_completed', true).eq('is_verified', false)
    ]);

    const sidebar = document.getElementById('admin-payees-list');
    if (sidebar) {
        sidebar.innerHTML = renderTeacherListItems(teachersRes.data, pendingRes.data || []);
    }
}

