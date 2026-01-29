/**
 * ADMIN REPORTS - Generación de reportes detallados y análisis de actividad
 */

window.showTeacherDetailedReport = async function showTeacherDetailedReport(teacherId) {
    const _supabase = window._supabase;
    const fetchWithCache = window.fetchWithCache;
    const showToast = window.showToast;

    try {
        const cacheKey = `teacher_report_detail_${teacherId}`;

        await fetchWithCache(cacheKey, async () => {
            const [teacherRes, ratingsRes, evalsRes, activeRes] = await Promise.all([
                _supabase.from('teachers').select('*').eq('id', teacherId).single(),
                _supabase.from('teacher_ratings').select('*').eq('teacher_id', teacherId),
                _supabase.from('evaluations').select('total_score').eq('teacher_id', teacherId),
                _supabase.from('active_time_tracking').select('total_seconds').eq('user_id', teacherId)
            ]);

            if (teacherRes.error) throw teacherRes.error;

            return {
                teacher: teacherRes.data,
                ratings: ratingsRes.data || [],
                evals: evalsRes.data || [],
                activeSeconds: (activeRes.data || []).reduce((s, a) => s + (a.total_seconds || 0), 0)
            };
        }, (data) => {
            if (typeof window.renderTeacherReportModal === 'function') window.renderTeacherReportModal(data);
        });

    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast('❌ Error al generar reporte', 'error');
    }
}

window.renderTeacherReportModal = function renderTeacherReportModal(data) {
    const sanitizeInput = window.sanitizeInput || ((v) => v);
    const formatDate = window.formatDate || ((d) => new Date(d).toLocaleDateString());
    const { teacher, ratings, evals, activeSeconds } = data;

    // Si el modal ya existe, actualizarlo, si no, crearlo
    let modal = document.getElementById('teacher-detailed-report-modal');
    const isNew = !modal;

    if (isNew) {
        modal = document.createElement('div');
        modal.id = 'teacher-detailed-report-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn';
    }

    const avgSat = ratings.length > 0 ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : 'N/A';
    const avgAcad = evals.length > 0 ? (evals.reduce((s, e) => s + (e.total_score || 0), 0) / evals.length).toFixed(1) : 'N/A';
    const activeTimeStr = activeSeconds >= 3600 ? `${(activeSeconds / 3600).toFixed(1)}h` : `${Math.floor(activeSeconds / 60)}m`;

    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
            <div class="p-6 bg-gradient-to-r from-primary to-blue-600 flex justify-between items-center text-white">
                <h2 class="text-xl font-black uppercase tracking-tight m-0 flex items-center gap-3">
                    <i class="fas fa-chart-pie"></i> Reporte: ${teacher.full_name}
                </h2>
                <button class="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white font-bold" onclick="this.closest('.fixed').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="p-8">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-center">
                        <i class="fas fa-heart text-rose-500 text-2xl mb-2"></i>
                        <div class="text-2xl font-black text-slate-800 dark:text-white">${avgSat}</div>
                        <div class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest">Satisfacción</div>
                    </div>
                    <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-center">
                        <i class="fas fa-graduation-cap text-indigo-500 text-2xl mb-2"></i>
                        <div class="text-2xl font-black text-slate-800 dark:text-white">${avgAcad}</div>
                        <div class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest">Rendimiento</div>
                    </div>
                    <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-center">
                        <i class="fas fa-clock text-emerald-500 text-2xl mb-2"></i>
                        <div class="text-2xl font-black text-slate-800 dark:text-white">${activeTimeStr}</div>
                        <div class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest">Tiempo Activo</div>
                    </div>
                </div>
                
                <h4 class="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-widest mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                    Últimos Comentarios
                </h4>
                <div class="custom-scrollbar overflow-y-auto max-h-[300px] space-y-3 pr-2">
                    ${ratings.filter(r => r.message).map(r => `
                        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <p class="text-sm text-slate-600 dark:text-slate-300 italic mb-2">"${sanitizeInput(r.message)}"</p>
                            <div class="flex items-center gap-2 text-xs font-bold text-slate-400">
                                <i class="far fa-clock"></i> ${formatDate(r.created_at)}
                            </div>
                        </div>
                    `).join('') || '<div class="text-center py-8 text-slate-400 italic text-sm">No hay comentarios registrados por estudiantes.</div>'}
                </div>
            </div>
        </div>
    `;

    if (isNew) document.body.appendChild(modal);
}

window.showMonthlyActivityReport = async function showMonthlyActivityReport() {
    const showToast = window.showToast;
    // Implementación simplificada o extendida en el futuro
    if (typeof showToast === 'function') showToast('📈 Reporte mensual en desarrollo', 'info');
}
