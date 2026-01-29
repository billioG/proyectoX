/**
 * SISTEMA DE BONOS DIAMANTE V2 - 1BOT EDITION
 * Gestión de remuneración basada en méritos, proporcionalidad y transparencia total.
 */

// ================================================
// COMPONENTES GLOBALES (ONBOARDING DETALLADO)
// ================================================

window.openBonusOnboarding = function openBonusOnboarding() {
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
                        <h3 class="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">1. Pasando Asistencia (Check-in)</h3>
                        <p class="text-sm text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Porque si no llegas, ¡tus alumnos se quedan sin su guía!". Es tu forma de decir: ¡Aquí estoy para mi equipo!</p>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-tighter">Solo eliges tu colegio y nivel, presionas el botón y ¡listo!.</p>
                    </div>
                </div>

                <div class="flex gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><i class="fas fa-camera-retro text-2xl"></i></div>
                    <div>
                        <h3 class="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">2. Contando Aventuras (Evidencia)</h3>
                        <p class="text-sm text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Para que todos vean la magia que haces con los kits y cuidemos nuestras herramientas". </p>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-tighter">Tomas una foto de tus alumnos con sus tablets, nos cuentas qué aprendieron y si hubo algún problema.</p>
                    </div>
                </div>

                <div class="flex gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0"><i class="fas fa-trophy text-2xl"></i></div>
                    <div>
                        <h3 class="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white mb-1">3. El Cofre del Tesoro (Bonos)</h3>
                        <p class="text-sm text-slate-500 leading-relaxed italic mb-2">"¿Por qué? Porque en 1bot valoramos tu esfuerzo y queremos que seas el mejor del mundo". </p>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-tighter">Entre más logres, ¡más grande será tu tesoro al final del mes! 💰</p>
                    </div>
                </div>
            </div>
            
            <div class="p-10 space-y-12 bg-white dark:bg-slate-900">
                <!-- Seccion 1: Como se gana -->
                <section>
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
            <div class="w-full max-w-2xl p-10 transform scale-100 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-primary to-indigo-500"></div>
                
                <button onclick="window.closeBonusOnboarding()" class="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:rotate-90 transition-all flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>

                <div class="text-center mb-10">
                    <div class="inline-block p-4 rounded-3xl bg-emerald-500/10 text-emerald-500 mb-6 shadow-lg shadow-emerald-500/20">
                         <i class="fas fa-rocket text-5xl animate-bounce"></i>
                    </div>
                    <h2 class="text-3xl font-black uppercase tracking-tighter text-slate-800 dark:text-white mb-4">
                        Tu Nuevo Sistema de <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-primary">Incentivos</span>
                    </h2>
                    <p class="text-sm font-medium text-slate-500 max-w-md mx-auto leading-relaxed">
                        Hemos rediseñado totalmente la forma en que mides tu impacto. Ahora todo está conectado: tu asistencia, tus tareas y tus resultados.
                    </p>
                </div>

                <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 relative group hover:-translate-y-1 transition-transform cursor-default">
                        <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                            <i class="fas fa-tasks"></i>
                        </div>
                        <h3 class="text-sm font-black uppercase text-slate-700 dark:text-white mb-2">1. Rocas Mensuales</h3>
                        <p class="text-xs text-slate-500 leading-snug">
                            Tus objetivos clave del mes. Deben completarse para activar tus bonos.
                        </p>
                    </div>

                    <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 relative group hover:-translate-y-1 transition-transform cursor-default">
                         <div class="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <h3 class="text-sm font-black uppercase text-slate-700 dark:text-white mb-2">2. Check-in GPS</h3>
                        <p class="text-xs text-slate-500 leading-snug">
                            Registra tu llegada en el colegio. Es tu prueba de asistencia operativa.
                        </p>
                    </div>

                    <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 relative group hover:-translate-y-1 transition-transform cursor-default">
                         <div class="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                            <i class="fas fa-camera"></i>
                        </div>
                        <h3 class="text-sm font-black uppercase text-slate-700 dark:text-white mb-2">3. Evidencia</h3>
                        <p class="text-xs text-slate-500 leading-snug">
                            Sube foto de tu clase y auditoría de kits semanalmente. ¡Suma puntos extra!
                        </p>
                    </div>
                </section>
                
                <div class="p-8 bg-slate-900 rounded-[2.5rem] flex flex-col items-center justify-center text-center shadow-xl shadow-slate-900/20">
                    <p class="text-xs text-emerald-400 font-black uppercase tracking-[0.4em] mb-6">¿Listo para empezar tu camino al éxito?</p>
                    <button class="btn-primary-tw px-12 h-16 text-sm font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all" onclick="window.closeBonusOnboarding()">
                        ¡ENTENDIDO, VAMOS POR LA EXCELENCIA!
                    </button>
                </div>
            </div>
    `;
    document.body.appendChild(modal);
}

window.closeBonusOnboarding = function closeBonusOnboarding() {
    localStorage.setItem(`onboarding_bonus_v2_${window.currentUser.id}`, 'true');
    const modal = document.querySelector('.fixed.z-\\[500\\]');
    if (modal) modal.remove();
}

window.loadBonusSystem = async function loadBonusSystem() {
    const container = document.getElementById('main-content-area-bonus');
    if (!container) return;

    const _supabase = window._supabase;
    const currentUser = window.currentUser;
    const fetchWithCache = window.fetchWithCache;

    if (!container.innerHTML || container.innerHTML.includes('fa-spin')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                <i class="fas fa-coins fa-spin text-5xl mb-4 text-amber-400"></i>
                <span class="font-black tracking-[0.3em] uppercase text-[0.6rem] animate-pulse">Sincronizando Datos...</span>
            </div>
        `;
    }

    try {
        const tutorId = currentUser?.id;
        if (!tutorId) throw new Error("Sesión requerida");

        if (!localStorage.getItem(`onboarding_bonus_v2_${tutorId}`)) {
            setTimeout(openBonusOnboarding, 500);
        }

        const cacheKey = `teacher_bonus_snapshot_${tutorId}`;

        const data = await fetchWithCache(cacheKey, async () => {
            const now = new Date();
            const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const [teacherRes, kpisRes, manualRes, assignmentsRes, attendanceRes, reportsRes, evidenceRes, challengeRes, historyRes, krMetrics, tasksRes, completionsRes, rocksRes, rockCompletionsRes] = await Promise.all([
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
                _supabase.from('kpi_task_completions').select('*').eq('teacher_id', tutorId).eq('period_month', period),
                _supabase.from('teacher_rocks').select('*').eq('month', now.getMonth() + 1).eq('is_active', true),
                _supabase.from('teacher_rock_completions').select('*').eq('teacher_id', tutorId).eq('approval_status', 'approved')
            ]);

            return {
                teacher: teacherRes.data,
                allKpis: kpisRes.data || [],
                manualEntries: manualRes.data || [],
                assignments: assignmentsRes.data || [],
                attendance: attendanceRes.data || [],
                reports: reportsRes.data || [],
                evidence: evidenceRes.data || [],
                challenges: challengeRes.data || [],
                history: historyRes.data || [],
                krMetrics,
                allTasks: tasksRes.data || [],
                completions: completionsRes.data || [],
                rocks: rocksRes.data || [],
                rockCompletions: rockCompletionsRes.data || []
            };
        }, (res) => {
            processAndRenderBonus(container, res);
        });

        // Si fetchWithCache terminó pero el banner de "Sincronizando" sigue (por ejemplo, error en ambos intentos)
        if (!data && (container.innerHTML.includes('fa-spin'))) {
            throw new Error("No se pudo sincronizar información. Reintente más tarde.");
        }

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="p-10 text-rose-500 font-bold text-center">❌ Error Sinc: ${err.message}</div>`;
    }
}

window.processAndRenderBonus = function processAndRenderBonus(container, data) {
    const { teacher, allKpis, manualEntries, assignments, attendance, reports, evidence, challenges, history, krMetrics, allTasks, completions, rocks, rockCompletions } = data;
    const tutorId = currentUser.id;
    const now = new Date();

    // Procesar Rocas
    const activeRocks = (rocks || []).filter(r => {
        if (!r.school_code) return true;
        return assignments.some(a => a.school_code === r.school_code);
    });

    const rocksCompletedCount = activeRocks.reduce((acc, rock) => {
        const isDone = (rockCompletions || []).some(c => c.rock_id === rock.id);
        return acc + (isDone ? 1 : 0);
    }, 0);

    const rocksProgress = activeRocks.length > 0 ? (rocksCompletedCount / activeRocks.length) : 1;

    const processedKpis = allKpis.map(kpi => {
        let progress = 0;
        let detail = '';
        const kpiTasks = allTasks.filter(t => t.kpi_id === kpi.id && (t.teacher_id === null || t.teacher_id === tutorId));
        if (kpiTasks.length > 0) {
            const done = completions.filter(c => kpiTasks.some(t => t.id === c.task_id) && c.is_verified).length;
            progress = done / kpiTasks.length;
            detail = `${done}/${kpiTasks.length} tareas validadas`;
        } else {
            switch (kpi.metric_source) {
                case 'gps': progress = (attendance?.length || 0) / 20; detail = `${attendance?.length || 0}/20 días`; break;
                case 'reports': progress = (reports?.length || 0) > 0 ? 1 : 0; detail = progress ? 'Enviado' : 'Pendiente'; break;
                case 'weekly_evidence': progress = (evidence?.length || 0) / 4; detail = `${evidence?.length || 0}/4 evidencias`; break;
                case 'challenges': progress = (challenges?.length || 0) / 1; detail = progress ? 'Completado' : 'Pendiente'; break;
                case 'digitalization': progress = krMetrics.digi / 100; detail = `${krMetrics.act} alumnos act.`; break;
                case 'portfolio': progress = krMetrics.port / 100; detail = `${krMetrics.up} con proy.`; break;
                case 'manual':
                    const m = manualEntries.find(e => e.kpi_id === kpi.id);
                    progress = m ? m.progress_value : 0; detail = 'Asignado Admin'; break;
            }
        }
        return { ...kpi, progress: Math.min(1, progress), detail, tasks: kpiTasks, completions: completions };
    });

    let adminKpis = processedKpis.filter(k => k.category === 'administrative' && k.metric_source !== 'challenges');
    let prodKpis = processedKpis.filter(k => k.category === 'productivity');

    const uniqueProdSources = new Set();
    prodKpis = prodKpis.filter(k => {
        if (uniqueProdSources.has(k.metric_source)) return false;
        uniqueProdSources.add(k.metric_source);
        return true;
    });

    const totalAdminWeight = adminKpis.reduce((acc, k) => acc + (k.weight_percentage || 0), 0);
    let adminProg = adminKpis.reduce((acc, k) => {
        const normalizedWeight = (k.weight_percentage / (totalAdminWeight || 1));
        return acc + (k.progress * normalizedWeight);
    }, 0);

    const ROCKS_WEIGHT = 0.25;
    if (activeRocks.length > 0) {
        adminProg = (adminProg * (1 - ROCKS_WEIGHT)) + (rocksProgress * ROCKS_WEIGHT);
        adminKpis.push({
            title: 'Rocas del Mes',
            detail: `${rocksCompletedCount}/${activeRocks.length} metas cumplidas`,
            progress: rocksProgress,
            category: 'administrative',
            weight_percentage: 25,
            id: 'virtual-rocks-kpi',
            isVirtual: true
        });
    }

    const totalProdWeight = prodKpis.reduce((acc, k) => acc + (k.weight_percentage || 0), 0);
    let prodProg = prodKpis.reduce((acc, k) => {
        const normalizedWeight = (k.weight_percentage / (totalProdWeight || 1));
        return acc + (k.progress * normalizedWeight);
    }, 0);

    const challengeKpi = processedKpis.find(k => k.metric_source === 'challenges');
    const wildcardValue = (challengeKpi?.progress || 0) * 0.05;

    if (adminProg < 1) adminProg = Math.min(1, adminProg + wildcardValue);
    else if (prodProg < 1) prodProg = Math.min(1, prodProg + wildcardValue);

    window.renderTutorView(container, teacher, [...adminKpis, ...prodKpis], assignments, history, { adminProg, prodProg });
}

window.calculateMetrics = async function calculateMetrics(tutorId) {
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
// ...(calculateMetrics sigue igual)...

// ================================================
// UI RENDERING
// ================================================

window.renderTutorView = function renderTutorView(container, teacher, kpis, assignments, history, calculatedProgs) {
    const base = parseFloat(teacher.base_salary || 0);
    const maxAdmin = parseFloat(teacher.bonus_admin_max || 0);
    const maxProd = parseFloat(teacher.bonus_prod_max || 0);
    const maxCoord = teacher.is_coordinator ? parseFloat(teacher.bonus_coordinator_max || 0) : 0;

    const { adminProg, prodProg } = calculatedProgs;

    // Filtrar de nuevo para UI (ya vienen procesados y limpiados desde loadBonusSystem)
    const adminKpis = kpis.filter(k => k.category === 'administrative');
    const prodKpis = kpis.filter(k => k.category === 'productivity');

    const curAdmin = maxAdmin * adminProg;
    const curProd = maxProd * prodProg;
    const curCoord = maxCoord;
    const currentTotal = base + curAdmin + curProd + curCoord;

    container.innerHTML = `
        <div class="animate-fadeIn space-y-6">
            <!-- WIDGET SUPERIOR (VALOR) -->
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div class="lg:col-span-3 glass-card p-8 bg-slate-900 text-white relative overflow-hidden flex flex-col justify-between h-[300px]">
                    <div class="absolute right-[-30px] top-[-30px] opacity-10 text-[18rem] rotate-12 pointer-events-none text-emerald-500"><i class="fas fa-hand-holding-usd"></i></div>
                    
                    <div class="relative z-10">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-black uppercase tracking-[0.4em] text-emerald-400">${teacher.is_1bot_team ? 'Retribución Mensual Estimada' : 'Resumen de Desempeño'}</span>
                                    <div class="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[0.65rem] font-black uppercase tracking-widest">${teacher.rank_title || 'Tutor Junior'}</div>
                                </div>
                                ${teacher.is_1bot_team ? `
                                    <div class="text-6xl font-black tracking-tighter">Q${currentTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                ` : `
                                    <div class="text-4xl font-black tracking-tighter uppercase">Equipo 1bot</div>
                                `}
                            </div>
                            <button onclick="openBonusOnboarding()" class="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-2xl" title="Ayuda y Onboarding">
                                <i class="fas fa-question"></i>
                            </button>
                        </div>
                    </div>

                    ${teacher.is_1bot_team ? `
                    <div class="relative z-10 grid grid-cols-3 gap-6 pt-6 border-t border-slate-800">
                        <div>
                            <div class="text-[0.7rem] font-black text-slate-500 uppercase tracking-widest mb-1">Base Fijo</div>
                            <div class="text-2xl font-black">Q${base.toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-[0.7rem] font-black text-rose-500 uppercase tracking-widest mb-1">Bono Administrativo</div>
                            <div class="text-2xl font-black">Q${curAdmin.toFixed(2)} <small class="opacity-30 text-xs">/ Q${maxAdmin.toFixed(0)}</small></div>
                        </div>
                        <div>
                            <div class="text-[0.7rem] font-black text-indigo-500 uppercase tracking-widest mb-1">Bono Impacto</div>
                            <div class="text-2xl font-black">Q${curProd.toFixed(2)} <small class="opacity-30 text-xs">/ Q${maxProd.toFixed(0)}</small></div>
                        </div>
                    </div>
                    ` : `
                    <div class="relative z-10 p-6 bg-white/5 rounded-2xl border border-white/10">
                        <p class="text-sm italic text-indigo-200">"Tu desempeño construye la marca ProjectX. Enfócate en la calidad y el impacto de tus estudiantes."</p>
                    </div>
                    `}
                </div>

                <div class="glass-card p-8 flex flex-col justify-between items-center text-center">
                    <div class="w-full">
                        <div class="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">Eficiencia Global</div>
                        <div class="relative w-36 h-36 mx-auto">
                            <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <circle class="text-slate-100 dark:text-slate-800 stroke-current" stroke-width="2.5" fill="none" cx="18" cy="18" r="16" />
                                <circle class="text-emerald-500 stroke-current transition-all duration-[2s]" stroke-width="2.5" stroke-dasharray="${Math.round(((adminProg + prodProg) / 2) * 100)}, 100" stroke-linecap="round" fill="none" cx="18" cy="18" r="16" />
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <span class="text-4xl font-black animate-pulse">${Math.round(((adminProg + prodProg) / 2) * 100)}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-emerald-500 text-xs font-black uppercase tracking-widest">Estado: ${adminProg > 0.9 && prodProg > 0.9 ? 'Excepcional' : 'En Progreso'}</div>
                </div>
            </div>

            <!-- CV DIGITAL Y SIMULADOR DE CARRERA -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="glass-card p-6 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-l-8 border-l-indigo-500">
                    <h2 class="text-xs font-black uppercase text-indigo-600 mb-4 tracking-widest flex items-center gap-2">
                        <i class="fas fa-medal"></i> CV Digital de Impacto
                    </h2>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                            <div class="text-[0.55rem] font-black text-slate-400 uppercase mb-1">Certificación</div>
                            <div class="text-xl font-black text-slate-800 dark:text-white">${teacher.certification_points || 0} XP</div>
                        </div>
                        <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                            <div class="text-[0.55rem] font-black text-slate-400 uppercase mb-1">Rango</div>
                            <div class="text-xs font-black text-indigo-600 uppercase mt-1">${teacher.rank_title || 'Tutor Junior'}</div>
                        </div>
                    </div>
                </div>

                <div class="glass-card p-6 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-l-8 border-l-emerald-500">
                    <h2 class="text-xs font-black uppercase text-emerald-600 mb-3 tracking-widest flex items-center gap-2">
                        <i class="fas fa-magic"></i> Siguiente Nivel
                    </h2>
                    <div class="space-y-3">
                        <div class="flex justify-between text-xs font-black uppercase">
                            <span>Progreso a Senior</span>
                            <span>${Math.min(100, (teacher.certification_points / 500) * 100).toFixed(0)}%</span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-500 transition-all duration-1000" style="width: ${Math.min(100, (teacher.certification_points / 500) * 100)}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- DASHBOARD DE ACCIONES UNIFICADO -->
            <div class="space-y-4 max-w-4xl mx-auto">
                
                <!-- 1. TAREAS DEL MES (ACORDEÓN) -->
                <div class="glass-card p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <button onclick="window.toggleBonusAccordion('rocks')" class="w-full flex items-center justify-between p-6 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <h2 class="text-lg font-black uppercase flex items-center gap-4 text-slate-800 dark:text-white tracking-tight">
                            <span class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 flex items-center justify-center">
                                <i class="fas fa-tasks"></i>
                            </span>
                            Tareas del Mes
                        </h2>
                        <i id="icon-rocks" class="fas fa-chevron-down text-slate-400 transition-transform duration-300"></i>
                    </button>
                    <div id="accordion-rocks" class="hidden border-t border-slate-100 dark:border-slate-800">
                        <div class="p-6 bg-white dark:bg-slate-900">
                            <div id="rocks-widget-container-bonus"></div>
                        </div>
                    </div>
                </div>

                <!-- 2. METAS OPERATIVAS (ACORDEÓN) -->
                <div class="glass-card p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <button onclick="window.toggleBonusAccordion('ops')" class="w-full flex items-center justify-between p-6 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <h2 class="text-lg font-black uppercase flex items-center gap-4 text-slate-800 dark:text-white tracking-tight">
                            <span class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-500 flex items-center justify-center">
                                <i class="fas fa-clipboard-check"></i>
                            </span>
                            Metas Operativas
                        </h2>
                        <i id="icon-ops" class="fas fa-chevron-down text-slate-400 transition-transform duration-300"></i>
                    </button>
                    <div id="accordion-ops" class="hidden border-t border-slate-100 dark:border-slate-800">
                        <div class="p-6 bg-rose-50/10 space-y-6">
                            ${adminKpis.map(k => renderKpiProgressTile(k)).join('')}
                        </div>
                    </div>
                </div>

                <!-- 3. IMPACTO STEEAM (ACORDEÓN) - Debajo de operativas -->
                <div class="glass-card p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <button onclick="window.toggleBonusAccordion('impact')" class="w-full flex items-center justify-between p-6 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <h2 class="text-lg font-black uppercase flex items-center gap-4 text-slate-800 dark:text-white tracking-tight">
                            <span class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center">
                                <i class="fas fa-bolt"></i>
                            </span>
                            Impacto STEEAM
                        </h2>
                        <i id="icon-impact" class="fas fa-chevron-down text-slate-400 transition-transform duration-300"></i>
                    </button>
                    <div id="accordion-impact" class="hidden border-t border-slate-100 dark:border-slate-800">
                         <div class="p-6 bg-emerald-50/10 space-y-6">
                            ${prodKpis.map(k => renderKpiProgressTile(k)).join('')}
                        </div>
                    </div>
                </div>

                <!-- HERRAMIENTAS DE GESTIÓN (Siempre visibles) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <div class="glass-card p-6 flex flex-col justify-between border-2 border-primary/20 bg-primary/5">
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-3 block">Establecimiento para Check-in</label>
                        <div class="flex gap-2">
                            <select id="bonus-school-picker" class="input-field-tw font-bold text-xs h-12 rounded-xl bg-white dark:bg-slate-800 border-none shadow-sm grow">
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
                            <button class="btn-primary-tw w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20" 
                                    onclick="window.handleTutorCheckIn(document.getElementById('bonus-school-picker').value)" title="Registrar GPS">
                                <i class="fas fa-map-marker-alt"></i>
                            </button>
                        </div>
                    </div>

                    <button class="glass-card p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group border-2 border-slate-200 dark:border-slate-800 hover:border-primary/50" onclick="window.openEvidenceAuditModal()">
                        <div class="flex items-center gap-4 mb-2">
                             <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors">
                                <i class="fas fa-camera"></i>
                             </div>
                             <div class="text-sm font-black uppercase">Subir Evidencia</div>
                        </div>
                        <div class="text-[0.6rem] font-bold text-slate-400 pl-14">Cumple meta de Auditoría y Fotos Académicas</div>
                    </button>
                </div>
                
                 <!-- HISTORIAL DE PAGOS (Visible al final) -->
                ${teacher.is_1bot_team ? `
                <div class="glass-card p-6 mt-6">
                    <h2 class="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-4 flex items-center gap-2">
                        <i class="fas fa-history text-slate-400"></i> Historial de Liquidaciones
                    </h2>
                    ${history.length > 0 ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${history.map(p => `
                                <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <div>
                                        <div class="text-xs font-black uppercase text-slate-600 dark:text-white">${new Date(p.period_month + '-02').toLocaleString('es', { month: 'long', year: 'numeric' })}</div>
                                        <div class="text-[0.6rem] font-bold text-slate-400 uppercase">Procesado el ${new Date(p.processed_at).toLocaleDateString()}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-base font-black text-emerald-500">Q${parseFloat(p.total_paid).toFixed(2)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="text-center py-6 opacity-30">
                            <i class="fas fa-folder-open text-3xl mb-2"></i>
                            <p class="text-[0.6rem] font-black uppercase">Sin historial</p>
                        </div>
                    `}
                </div>
                ` : ''}

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

    // Cargar widget de rocas mensuales
    setTimeout(() => {
        if (typeof loadRocksWidget === 'function') {
            loadRocksWidget('rocks-widget-container-bonus');
        }
    }, 100);
}

window.toggleBonusAccordion = function toggleBonusAccordion(id) {
    const content = document.getElementById(`accordion-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (content) {
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            content.classList.add('animate-slideUp');
        } else {
            content.classList.add('hidden');
            content.classList.remove('animate-slideUp');
        }
    }
    if (icon) icon.classList.toggle('rotate-180');
}

window.renderKpiProgressTile = function renderKpiProgressTile(kpi) {
    const isDone = kpi.progress >= 0.95;
    const hasTasks = kpi.tasks && kpi.tasks.length > 0;

    return `
        <div class="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-50 dark:border-slate-800 shadow-sm">
            <div class="flex justify-between items-end mb-4">
                <div class="max-w-[70%]">
                    <div class="text-sm font-black uppercase text-slate-800 dark:text-white tracking-tight mb-1">${kpi.title}</div>
                    <div class="text-xs font-bold text-slate-400 uppercase">${kpi.detail}</div>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black ${isDone ? 'text-emerald-500' : 'text-slate-400'} leading-none">${(kpi.progress * 100).toFixed(0)}%</div>
                </div>
            </div>
            
            <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-6">
                <div class="h-full bg-gradient-to-r ${isDone ? 'from-emerald-500 to-teal-400' : 'from-slate-300 to-slate-400'} transition-all duration-1000" style="width: ${kpi.progress * 100}%"></div>
            </div>

            ${hasTasks ? `
                <div class="space-y-3 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div class="text-[0.65rem] font-black text-slate-400 uppercase tracking-widest mb-2">Checklist de Cumplimiento</div>
                    ${kpi.tasks.map(task => {
        const comp = kpi.completions?.find(c => c.task_id === task.id);
        const isCompleted = comp?.is_completed;
        const isVerified = comp?.is_verified;

        return `
                            <div class="flex items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 group/task">
                                <div class="flex items-center gap-3">
                                    <button onclick="toggleTaskCompletion('${task.id}', ${!isCompleted})" 
                                            class="w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all 
                                            ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 dark:border-slate-700 hover:border-primary'}">
                                        ${isCompleted ? '<i class="fas fa-check text-xs"></i>' : ''}
                                    </button>
                                    <div class="text-sm font-bold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}">${task.title}</div>
                                </div>
                                ${isVerified ? `
                                    <span class="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-500 text-[0.65rem] font-black uppercase">Validado Admin</span>
                                ` : (isCompleted ? `
                                    <span class="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-[0.65rem] font-black uppercase italic animate-pulse">Pendiente Validación</span>
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

window.handleTutorCheckIn = async function handleTutorCheckIn(schoolId) {
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

window.calculateDist = function calculateDist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================================================
// MODAL UNIFICADO (EVIDENCIA + AUDITORIA)
// ================================================

window.openEvidenceAuditModal = function openEvidenceAuditModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-slideUp flex flex-col max-h-[90vh]">
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

window.handleDocPhotoSelect = function handleDocPhotoSelect(input) {
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
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            try {
                const combinedDesc = `Resultados: ${document.getElementById('doc-results').value}\nInconvenientes: ${document.getElementById('doc-challenges').value}\nImpacto: ${document.getElementById('doc-desc').value}`;

                // Preparar datos de evidencia semanal
                const evidenceData = {
                    teacher_id: currentUser.id,
                    title: title,
                    description: combinedDesc,
                    created_at: new Date().toISOString(),
                    _fileBlob: file
                };

                // Preparar datos de auditoría de activos
                const auditData = {
                    tutor_id: currentUser.id,
                    status: 'valid',
                    _fileBlob: file
                };

                // USAR EL GESTOR DE SINCRONIZACIÓN (MODO KOLIBRI / OFFLINE)
                await _syncManager.enqueue('submit_evidence', evidenceData);
                await _syncManager.enqueue('asset_audit', auditData);

                showToast('🚀 Evidencia guardada (Pendiente Sync)', 'success');
                loadBonusSystem();
                document.querySelector('.fixed.z-\\[600\\]')?.remove();
            } catch (e) {
                showToast('❌ Error al guardar: ' + e.message, 'error');
                btn.disabled = false;
                btn.innerHTML = 'REINTENTAR';
            }
        }
    };
    reader.readAsDataURL(file);
}


// ================================================
// ADMINISTRACIÓN MASTER (UI ADMIN) - MANTENER IGUAL
// ================================================

window.openAdminKpiManager = async function openAdminKpiManager() {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [teachersRes, pendingRes] = await Promise.all([
        _supabase.from('teachers').select('id, full_name, base_salary, bonus_admin_max, bonus_prod_max').order('full_name'),
        _supabase.from('kpi_task_completions').select('teacher_id').eq('period_month', period).eq('is_completed', true).eq('is_verified', false)
    ]);

    const teachers = teachersRes.data;
    const pendingData = pendingRes.data || [];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="w-full max-w-6xl h-[95vh] flex flex-col bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-slideUp">
            <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-10 flex justify-between items-center shrink-0 border-b border-white/5">
                <div>
                   <h2 class="text-3xl font-black uppercase tracking-tighter flex items-center gap-4 text-white">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <span class="drop-shadow-md">Control de Pagos y Metas</span>
                   </h2>
                   <p class="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-3 ml-16 opacity-80">Configuración Salarial y Cumplimiento de Objetivos</p>
                </div>
                <div class="flex gap-4">
                     <button class="px-6 h-12 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-white/10" onclick="renderValidationInbox()">
                        <i class="fas fa-envelope-open-text mr-2"></i> Bandeja
                     </button>
                     <button class="px-6 h-12 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-white/10" onclick="renderGlobalKpiManager()">
                        <i class="fas fa-tasks mr-2"></i> Rocas
                     </button>
                     <button onclick="this.closest('.fixed').remove()" class="w-12 h-12 rounded-2xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center ml-4 border border-white/10"><i class="fas fa-times text-xl"></i></button>
                </div>
            </div>
            
            <div class="flex flex-1 overflow-hidden">
                <div class="w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-8 space-y-4" id="admin-payees-list">
                    ${renderTeacherListItems(teachers, pendingData)}
                </div>
                
                <div class="flex-1 overflow-y-auto bg-white dark:bg-slate-900" id="kpi-editor-container">
                    <div class="flex flex-col items-center justify-center h-full p-20 text-center animate-fadeIn">
                        <div class="w-32 h-32 rounded-[2.5rem] bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-10 shadow-inner border border-slate-100 dark:border-slate-800">
                            <i class="fas fa-user-edit text-5xl text-slate-300 dark:text-slate-600"></i>
                        </div>
                        <h3 class="text-2xl font-black uppercase tracking-tighter text-slate-800 dark:text-white">Selección de Docente</h3>
                        <p class="text-sm font-medium text-slate-500 mt-4 max-w-sm leading-relaxed italic">
                            Elige a un docente del listado lateral para gestionar su salario personalizado o usa los botones superiores para acciones globales.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.selectTeacherForManager = async function selectTeacherForManager(teacherId) {
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
        <div class="animate-fadeIn p-16 space-y-16">
            <div class="flex justify-between items-end border-b-4 border-slate-50 dark:border-slate-800 pb-10">
                <div>
                    <h2 class="text-5xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">${teacher.full_name}</h2>
                    <p class="text-sm font-black text-primary uppercase tracking-[0.3em] mt-3">ID FISCAL: <span class="bg-primary/10 px-2 py-1 rounded-lg">${teacherId.substring(0, 8)}</span></p>
                </div>
            </div>
            
            <section class="space-y-10">
                <div class="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Estructura Salarial (Quetzales)</div>
                <div class="grid grid-cols-3 gap-8">
                    <div class="space-y-3">
                        <label class="text-xs font-black uppercase block ml-1 text-slate-500 tracking-wider">Sueldo Base Mensual</label>
                        <input type="number" id="edit-base" class="input-field-tw font-black text-2xl h-20 rounded-3xl bg-slate-50 border-none shadow-inner" value="${teacher.base_salary}">
                    </div>
                    <div class="space-y-3">
                        <label class="text-xs font-black uppercase block ml-1 text-rose-500 tracking-wider">Bono Admin Máximo</label>
                        <input type="number" id="edit-admin" class="input-field-tw font-black text-2xl h-20 rounded-3xl bg-slate-50 border-none shadow-inner" value="${teacher.bonus_admin_max}">
                    </div>
                    <div class="space-y-3">
                        <label class="text-xs font-black uppercase block ml-1 text-indigo-500 tracking-wider">Bono Prod Máximo</label>
                        <input type="number" id="edit-prod" class="input-field-tw font-black text-2xl h-20 rounded-3xl bg-slate-50 border-none shadow-inner" value="${teacher.bonus_prod_max}">
                    </div>
                </div>

                <div class="p-10 rounded-[3rem] bg-amber-500/5 dark:bg-amber-500/10 border-2 border-amber-500/20 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div class="flex items-center gap-6">
                        <div class="relative">
                            <input type="checkbox" id="edit-is-coord" class="w-8 h-8 rounded-xl accent-amber-500 cursor-pointer" ${teacher.is_coordinator ? 'checked' : ''}>
                        </div>
                        <div>
                            <div class="text-sm font-black uppercase text-slate-800 dark:text-white">¿Es Coordinador/a?</div>
                            <div class="text-xs font-bold text-amber-600 uppercase tracking-tighter mt-1">Habilita remuneración extra por liderazgo</div>
                        </div>
                    </div>
                    <div class="w-full md:w-80">
                         <label class="text-[0.65rem] font-black text-slate-400 uppercase mb-3 block tracking-widest text-center md:text-left">Monto Bono Coordinador</label>
                         <input type="number" id="edit-bonus-coord" class="input-field-tw font-black text-xl h-14 rounded-2xl bg-white dark:bg-slate-800 shadow-sm" value="${teacher.bonus_coordinator_max || 0}">
                    </div>
                </div>

                <div class="pt-4">
                    <button class="btn-primary-tw w-full h-20 text-sm font-black uppercase tracking-[0.3em] rounded-[2rem] shadow-2xl shadow-primary/30" onclick="saveTeacherFinance('${teacherId}')">
                       <i class="fas fa-save mr-3"></i> Guardar Configuración Financiera
                    </button>
                </div>
            </section>

            <!-- KPIs y Metas -->
            <section class="space-y-10">
                <div class="text-sm font-black text-primary uppercase tracking-[0.4em] mb-4">Gestión de Metas y Tareas</div>
                <div class="grid grid-cols-1 gap-10">
                    ${kpisWithTasks.filter(k => k.metric_source === 'manual' || k.tasks.length > 0).map(k => {
        const entry = manualEntries.find(m => m.kpi_id === k.id);
        return `
                            <div class="p-10 rounded-[3rem] bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-10 shadow-sm">
                                <div class="flex items-center justify-between gap-10">
                                    <div class="grow">
                                        <div class="font-black text-2xl uppercase tracking-tighter text-slate-800 dark:text-white">${k.title}</div>
                                        <div class="text-xs font-bold text-slate-400 mt-2 uppercase tracking-tight">${k.description || 'Cumplimiento estratégico por objetivos'}</div>
                                    </div>
                                    <div class="px-8 py-5 rounded-[2rem] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl text-center">
                                         <div class="text-[0.65rem] font-black text-slate-400 uppercase mb-2 tracking-widest">Impacto en Bono</div>
                                         <div class="text-3xl font-black text-primary">${k.weight_percentage}%</div>
                                    </div>
                                </div>
                                
                                ${k.tasks && k.tasks.length > 0 ? `
                                    <div class="pt-10 border-t-2 border-slate-100 dark:border-slate-800">
                                        <div class="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                            <i class="fas fa-tasks text-primary"></i> VERIFICACIÓN DE TAREAS (${teacher.full_name})
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            ${k.tasks.map(task => {
            const comp = completions.find(c => c.task_id === task.id && c.teacher_id === teacherId);
            const isDone = comp?.is_completed;
            const isVerified = comp?.is_verified;
            return `
                                                    <div class="flex items-center justify-between p-6 rounded-[1.5rem] ${isDone ? 'bg-white dark:bg-white/5 shadow-md' : 'opacity-40 bg-slate-100/50 dark:bg-slate-800/30'} border border-slate-100 dark:border-slate-800 transition-all">
                                                        <div class="flex items-center gap-4">
                                                            <div class="w-3 h-3 rounded-full ${isDone ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse' : 'bg-slate-300'}"></div>
                                                            <div>
                                                                <div class="text-sm font-black uppercase ${isDone ? 'text-slate-800 dark:text-white' : 'text-slate-400'}">${task.title}</div>
                                                                <div class="text-[0.6rem] font-black uppercase tracking-tighter ${task.teacher_id ? 'text-indigo-500' : 'text-slate-400'} mt-1">
                                                                    ${task.teacher_id ? 'Personalizada' : 'Global (Para todos)'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onclick="verifyTaskCompletion('${task.id}', '${teacherId}', ${!isVerified})"
                                                                class="px-5 h-10 rounded-xl text-xs font-black uppercase transition-all shadow-lg
                                                                ${isVerified ? 'bg-blue-500 text-white shadow-blue-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-primary hover:text-white'}">
                                                            ${isVerified ? '<i class="fas fa-check-double mr-1"></i> VERIFICADO' : 'VALIDAR'}
                                                        </button>
                                                    </div>
                                                `;
        }).join('')}
                                        </div>
                                        <button class="mt-8 w-full h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all border-2 border-transparent hover:border-primary/20 shadow-sm" 
                                                onclick="showAddTaskModal('${k.id}', '${teacherId}')">
                                            <i class="fas fa-plus mr-2"></i> AGREGAR TAREA ESPECÍFICA PARA ${teacher.full_name.split(' ')[0]}
                                        </button>
                                    </div>
                                ` : `
                                    <div class="pt-8 border-t-2 border-slate-100 dark:border-slate-800">
                                        <button class="w-full h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all" 
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

window.saveTeacherFinance = async function saveTeacherFinance(teacherId) {
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

window.updateManualKpi = async function updateManualKpi(teacherId, kpiId, val) {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { error } = await _supabase.from('manual_kpi_entries').upsert({
        teacher_id: teacherId, kpi_id: kpiId, period_month: period, progress_value: parseFloat(val)
    }, { onConflict: 'kpi_id, teacher_id, period_month' });

    if (!error) showToast('🎯 Mérito manual actualizado', 'success');
}

window.submitChallengeEvidence = async function submitChallengeEvidence(challengeId) {
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


window.showAddKpiModal = function showAddKpiModal() {
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

window.saveNewKpi = async function saveNewKpi(e) {
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

window.deleteDynamicKpi = async function deleteDynamicKpi(id) {
    if (!confirm('¿Seguro que deseas eliminar esta meta global?')) return;
    const { error } = await _supabase.from('dynamic_kpis').delete().eq('id', id);
    if (!error) {
        showToast('🗑️ Meta eliminada', 'default');
        renderGlobalKpiManager();
        loadBonusSystem();
    }
}

window.toggleTaskCompletion = async function toggleTaskCompletion(taskId, isCompleted) {
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

window.renderGlobalKpiManager = async function renderGlobalKpiManager() {
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
    kpis.forEach(k => window.loadKpiTasksForAdmin(k.id, null));
}

window.loadKpiTasksForAdmin = async function loadKpiTasksForAdmin(kpiId, teacherId = null) {
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

window.showAddTaskModal = function showAddTaskModal(kpiId, teacherId = null) {
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

window.saveKpiTask = async function saveKpiTask(kpiId, teacherId = null) {
    const title = document.getElementById('new-task-title').value.trim();
    if (!title) return;

    const { error } = await _supabase.from('kpi_tasks').insert({ kpi_id: kpiId, title, teacher_id: teacherId });
    if (!error) {
        showToast('✅ Tarea agregada', 'success');
        document.querySelector('.fixed.z-\\[750\\]')?.remove();
        if (teacherId) {
            window.selectTeacherForManager(teacherId); // Refrescar vista de docente
        } else {
            window.loadKpiTasksForAdmin(kpiId, null); // Refrescar vista global
        }
        window.loadBonusSystem();
    }
}

window.deleteKpiTask = async function deleteKpiTask(taskId, kpiId) {
    const { error } = await _supabase.from('kpi_tasks').delete().eq('id', taskId);
    if (!error) {
        window.loadKpiTasksForAdmin(kpiId);
        window.loadBonusSystem();
    }
}

window.renderValidationInbox = async function renderValidationInbox() {
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

window.bulkVerifyTask = async function bulkVerifyTask(taskId, teacherId) {
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

window.verifyTaskCompletion = async function verifyTaskCompletion(taskId, teacherId, isVerified) {
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

window.renderTeacherListItems = function renderTeacherListItems(teachers, pendingData) {
    return `
        <div class="text-xs font-black text-slate-400 uppercase tracking-[0.4em] mb-8 px-4 flex justify-between items-center">
            <span>Payees Activos</span>
            <span class="text-[0.65rem] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">${teachers.length}</span>
        </div>
        ${teachers.map(t => {
        const count = pendingData.filter(p => p.teacher_id === t.id).length;
        return `
                <button class="w-full text-left p-6 rounded-[1.5rem] hover:bg-white dark:hover:bg-slate-900 transition-all group border-2 border-transparent hover:border-primary/20 relative mb-4 shadow-sm hover:shadow-xl" onclick="selectTeacherForManager('${t.id}')">
                    <div class="font-black text-sm uppercase text-slate-700 dark:text-white group-hover:text-primary transition-colors mb-1">${t.full_name}</div>
                    <div class="text-xs font-bold text-slate-400 uppercase">Salario Base: Q${t.base_salary.toLocaleString()}</div>
                    ${count > 0 ? `
                        <div class="absolute -right-2 -top-2 w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-[0.7rem] font-black shadow-lg shadow-emerald-500/40 border-2 border-white dark:border-slate-950 animate-bounce">
                            ${count}
                        </div>
                    ` : ''}
                </button>
            `;
    }).join('')}
    `;
}

window.refreshAdminBadges = async function refreshAdminBadges() {
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [teachersRes, pendingRes] = await Promise.all([
        _supabase.from('teachers').select('id, full_name, base_salary').order('full_name'),
        _supabase.from('kpi_task_completions').select('teacher_id').eq('period_month', period).eq('is_completed', true).eq('is_verified', false)
    ]);

    const sidebar = document.getElementById('admin-payees-list');
    if (sidebar) {
        sidebar.innerHTML = window.renderTeacherListItems(teachersRes.data, pendingRes.data || []);
    }
}

