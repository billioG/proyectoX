/**
 * SISTEMA DE TAREAS MENSUALES - Gestión de Objetivos Especiales
 * Complementa el sistema de KPIs con metas específicas por mes
 */

// ================================================
// OBTENER TAREAS DEL MES ACTUAL
// ================================================
window.getMonthlyRocks = async function getMonthlyRocks(teacherId = null) {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const user = window.currentUser;
        if (!user || !window._supabase) return [];

        const userId = teacherId || user.id;

        const { data, error } = await window._supabase
            .rpc('get_teacher_rocks', {
                p_teacher_id: userId,
                p_month: currentMonth,
                p_year: currentYear
            });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error cargando tareas:', err);
        return [];
    }
}

// ================================================
// CALCULAR XP DE TAREAS
// ================================================
window.calculateRocksXP = async function calculateRocksXP(teacherId = null, month = null, year = null) {
    try {
        const now = new Date();
        const currentMonth = month || (now.getMonth() + 1);
        const currentYear = year || now.getFullYear();
        const user = window.currentUser;
        if (!user || !window._supabase) return { total_rocks: 0, completed_rocks: 0, total_xp: 0 };

        const userId = teacherId || user.id;

        const { data, error } = await window._supabase
            .rpc('calculate_rocks_xp', {
                p_teacher_id: userId,
                p_month: currentMonth,
                p_year: currentYear
            });

        if (error) throw error;
        return data && data.length > 0 ? data[0] : { total_rocks: 0, completed_rocks: 0, total_xp: 0 };
    } catch (err) {
        console.error('Error calculando XP de tareas:', err);
        return { total_rocks: 0, completed_rocks: 0, total_xp: 0 };
    }
}

// ================================================
// COMPLETAR UNA TAREA
// ================================================
window.completeRock = async function completeRock(rockId, evidenceUrl = null, notes = null) {
    try {
        const user = window.currentUser;
        if (!user || !window._supabase) return null;

        const { data, error } = await window._supabase
            .from('teacher_rock_completions')
            .insert({
                teacher_id: user.id,
                rock_id: rockId,
                evidence_url: evidenceUrl,
                notes: notes,
                requires_approval: evidenceUrl ? true : false,
                approval_status: evidenceUrl ? 'pending' : 'approved',
                xp_awarded: 0
            })
            .select()
            .single();

        if (error) throw error;

        if (typeof window.showToast === 'function') window.showToast('✅ Tarea completada exitosamente', 'success');

        if (typeof window.loadRocksWidget === 'function') {
            await window.loadRocksWidget();
        }
        return data;
    } catch (err) {
        console.error('Error completando tarea:', err);
        if (typeof window.showToast === 'function') window.showToast('❌ Error al completar la tarea', 'error');
        return null;
    }
}

// ================================================
// APROBAR/RECHAZAR TAREA (ADMIN)
// ================================================
window.approveRock = async function approveRock(completionId, approved = true, rejectionReason = null) {
    try {
        const user = window.currentUser;
        if (!user || !window._supabase) return null;

        const { data: completion, error: fetchError } = await window._supabase
            .from('teacher_rock_completions')
            .select('*, teacher_rocks(xp_value)')
            .eq('id', completionId)
            .single();

        if (fetchError) throw fetchError;

        const updateData = {
            approval_status: approved ? 'approved' : 'rejected',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            xp_awarded: approved ? completion.teacher_rocks.xp_value : 0
        };

        if (!approved && rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        }

        const { data, error } = await window._supabase
            .from('teacher_rock_completions')
            .update(updateData)
            .eq('id', completionId)
            .select()
            .single();

        if (error) throw error;

        if (typeof window.showToast === 'function') {
            window.showToast(approved ? '✅ Tarea aprobada' : '❌ Tarea rechazada', approved ? 'success' : 'warning');
        }
        return data;
    } catch (err) {
        console.error('Error aprobando/rechazando tarea:', err);
        if (typeof window.showToast === 'function') window.showToast('❌ Error al procesar la tarea', 'error');
        return null;
    }
}

// ================================================
// WIDGET DE TAREAS (VISTA DOCENTE)
// ================================================
window.loadRocksWidget = async function loadRocksWidget(containerId = 'rocks-widget-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
        container.innerHTML = `
            <div class="flex items-center justify-center p-8">
                <i class="fas fa-circle-notch fa-spin text-2xl text-primary"></i>
            </div>
        `;
    }

    try {
        const user = window.currentUser;
        if (!user) return;
        const cacheKey = `teacher_rocks_snapshot_${user.id}`;

        if (typeof window.fetchWithCache === 'function') {
            await window.fetchWithCache(cacheKey, async () => {
                const [rocks, rocksXP] = await Promise.all([
                    window.getMonthlyRocks(),
                    window.calculateRocksXP()
                ]);
                const now = new Date();
                const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                return { rocks, rocksXP, monthName };
            }, (data) => {
                renderRocksWidget(container, data.rocks, data.rocksXP, data.monthName);
            });
        }
    } catch (err) {
        console.error('Error cargando widget de tareas:', err);
        container.innerHTML = `<div class="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-xl text-center font-bold">Error cargando tareas</div>`;
    }
}

function renderRocksWidget(container, rocks, rocksXP, monthName) {
    const progress = rocksXP.total_rocks > 0 ? (rocksXP.completed_rocks / rocksXP.total_rocks) * 100 : 0;
    container.innerHTML = `
        <div class="glass-card p-6 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <i class="fas fa-flag-checkered"></i>
                    </div>
                    <div>
                        <h3 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider leading-none">Tareas del Mes</h3>
                        <p class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mt-1">${monthName}</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-amber-500">${rocksXP.completed_rocks}/${rocksXP.total_rocks}</div>
                    <div class="text-[0.6rem] font-bold text-slate-400 uppercase">Completadas</div>
                </div>
            </div>
            <div class="mb-6">
                <div class="flex justify-between text-xs font-bold mb-2">
                    <span class="text-slate-600 dark:text-slate-400">Progreso</span>
                    <span class="text-amber-500">${Math.round(progress)}%</span>
                </div>
                <div class="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                ${rocks.length === 0 ? `
                    <div class="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                        <i class="fas fa-check-circle text-4xl text-emerald-500 mb-3 opacity-50"></i>
                        <p class="text-slate-600 dark:text-slate-400 font-bold">No hay tareas asignadas este mes</p>
                    </div>
                ` : rocks.map(rock => renderRockItem(rock)).join('')}
            </div>
        </div>
    `;
}

function renderRockItem(rock) {
    const isCompleted = rock.is_completed;
    const isApproved = isCompleted && rock.approval_status === 'approved';
    const isPending = isCompleted && rock.approval_status === 'pending';
    const isRejected = isCompleted && rock.approval_status === 'rejected';

    let icon = '<i class="fas fa-flag text-slate-400 text-xl"></i>';
    let badge = '';
    if (isApproved) { icon = '<i class="fas fa-check-circle text-emerald-500 text-xl"></i>'; badge = '<span class="text-[0.6rem] font-black px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-full uppercase">Aprobada</span>'; }
    else if (isPending) { icon = '<i class="fas fa-clock text-amber-500 text-xl"></i>'; badge = '<span class="text-[0.6rem] font-black px-2 py-1 bg-amber-500/10 text-amber-500 rounded-full uppercase">Pendiente</span>'; }
    else if (isRejected) { icon = '<i class="fas fa-times-circle text-rose-500 text-xl"></i>'; badge = '<span class="text-[0.6rem] font-black px-2 py-1 bg-rose-500/10 text-rose-500 rounded-full uppercase">Rechazada</span>'; }

    return `
        <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-primary/30 transition-all">
            <div class="flex items-start gap-3">
                <div class="shrink-0 mt-1">${icon}</div>
                <div class="flex-1">
                    <div class="flex justify-between mb-1">
                        <h4 class="text-sm font-black text-slate-800 dark:text-white">${rock.rock_name || rock.name}</h4>
                        ${badge}
                    </div>
                    <p class="text-xs text-slate-500 mb-3">${rock.rock_description || rock.description}</p>
                    ${!isCompleted ? `
                        <button onclick="window.openCompleteRockModal('${rock.rock_id || rock.id}')" class="px-3 py-1 bg-primary text-white text-[0.6rem] font-black rounded-lg">COMPLETAR</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// ================================================
// MODAL PARA COMPLETAR TAREA
// ================================================
window.openCompleteRockModal = async function (rockId) {
    if (!window._supabase) return;
    const { data: rock } = await window._supabase.from('teacher_rocks').select('*').eq('id', rockId).single();
    if (!rock) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md';
    modal.innerHTML = `
        <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div class="p-6 bg-amber-500 text-white flex justify-between">
                <h2 class="font-black uppercase">${rock.name}</h2>
                <button onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-6">
                <form onsubmit="window.submitRockCompletion(event, '${rockId}', ${rock.requires_evidence})">
                    ${rock.requires_evidence ? '<input type="file" id="rock-evidence" required class="w-full mb-4">' : ''}
                    <textarea id="rock-notes" class="w-full p-3 border mb-4 rounded-xl dark:bg-slate-800" placeholder="Notas..."></textarea>
                    <button type="submit" class="w-full py-3 bg-amber-500 text-white font-black rounded-xl">ENVIAR</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.submitRockCompletion = async function (event, rockId, requiresEvidence) {
    event.preventDefault();
    const notes = document.getElementById('rock-notes')?.value || '';
    let evidenceUrl = null;

    if (requiresEvidence) {
        const file = document.getElementById('rock-evidence')?.files[0];
        if (!file) return;
        const fileName = `rocks/${window.currentUser.id}/${Date.now()}_${file.name}`;
        await window._supabase.storage.from('teacher-evidence').upload(fileName, file);
        const { data } = window._supabase.storage.from('teacher-evidence').getPublicUrl(fileName);
        evidenceUrl = data.publicUrl;
    }

    await window.completeRock(rockId, evidenceUrl, notes);
    event.target.closest('.fixed').remove();
}

// ================================================
// INICIALIZACIÓN
// ================================================
console.log('✅ teacher-rocks.js listo.');
