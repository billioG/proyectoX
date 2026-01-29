/**
 * ADMIN - GESTIÓN DE TAREAS MENSUALES
 * Panel administrativo para crear, editar y aprobar tareas
 */

// ================================================
// CARGAR PANEL DE GESTIÓN DE TAREAS
// ================================================
window.loadAdminRocksManagement = async function loadAdminRocksManagement() {
    const container = document.getElementById('admin-rocks-container');
    if (!container) return;

    if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
        container.innerHTML = `
            <div class="flex items-center justify-center p-20">
                <i class="fas fa-circle-notch fa-spin text-4xl text-primary"></i>
            </div>
        `;
    }

    try {
        if (typeof window.fetchWithCache !== 'function') return;
        if (!window._supabase) return;

        await window.fetchWithCache('admin_rocks_data', async () => {
            const [rocksRes, completionsRes] = await Promise.all([
                window._supabase.from('teacher_rocks').select('*').order('month', { ascending: true }).order('deadline_day', { ascending: true }),
                window._supabase.from('teacher_rock_completions').select('*, teacher_rocks(name), teachers(full_name)').eq('approval_status', 'pending')
            ]);

            if (rocksRes.error) throw rocksRes.error;
            if (completionsRes.error) throw completionsRes.error;

            return {
                rocks: rocksRes.data || [],
                pendingCompletions: completionsRes.data || []
            };
        }, (data) => {
            renderAdminRocksUI(container, data.rocks, data.pendingCompletions);
        });

    } catch (err) {
        console.error('Error cargando tareas:', err);
        container.innerHTML = `
            <div class="p-10 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-3xl font-bold text-center">
                ❌ Error al cargar el sistema de tareas
            </div>
        `;
    }
}

function renderAdminRocksUI(container, rocks, pendingCompletions) {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const rocksByMonth = {};
    rocks.forEach(rock => {
        if (!rocksByMonth[rock.month]) {
            rocksByMonth[rock.month] = [];
        }
        rocksByMonth[rock.month].push(rock);
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
                <h1 class="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight mb-2">Gestión de Tareas Mensuales</h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium">Administra objetivos especiales y aprueba completitudes</p>
            </div>
            <button onclick="window.openCreateRockModal()" class="bg-amber-500 hover:bg-amber-600 text-white font-black py-3 px-6 rounded-2xl shadow-xl shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-3 text-sm uppercase tracking-wide">
                <i class="fas fa-plus"></i> NUEVA TAREA
            </button>
        </div>

        ${pendingCompletions.length > 0 ? `
            <div class="glass-card p-6 md:p-8 bg-white dark:bg-slate-900 mb-10">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-slate-800 dark:text-white">Pendientes de Aprobación</h2>
                        <p class="text-sm text-slate-500">Tareas completadas esperando validación</p>
                    </div>
                    <span class="ml-auto bg-amber-500/10 text-amber-500 text-sm font-black px-3 py-1.5 rounded-full">${pendingCompletions.length}</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${pendingCompletions.map(c => renderPendingCompletion(c)).join('')}
                </div>
            </div>
        ` : ''}

        <div class="glass-card p-8 bg-white dark:bg-slate-900">
            <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                <i class="fas fa-flag-checkered text-primary"></i> Tareas por Mes
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${monthNames.map((month, idx) => {
        const monthRocks = rocksByMonth[idx + 1] || [];
        return renderMonthCard(month, idx + 1, monthRocks);
    }).join('')}
            </div>
        </div>
    `;
}

function renderPendingCompletion(completion) {
    return `
        <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                    ${(completion.teachers?.full_name || 'D')[0]}
                </div>
                <div class="min-w-0">
                    <h3 class="text-xs font-black text-slate-800 dark:text-white truncate">${completion.teachers?.full_name || 'Docente'}</h3>
                    <p class="text-[0.65rem] text-slate-500 dark:text-slate-400 truncate">${completion.teacher_rocks?.name || 'Tarea'}</p>
                    ${completion.notes ? `<p class="text-[0.65rem] text-slate-600 dark:text-slate-400 mt-1 italic truncate">"${completion.notes}"</p>` : ''}
                    
                    ${completion.evidence_url ? `
                        <a href="${completion.evidence_url}" target="_blank" class="text-[0.65rem] font-bold text-primary hover:text-indigo-700 flex items-center gap-1 mt-1">
                            <i class="fas fa-paperclip"></i> Ver Evidencia
                        </a>
                    ` : ''}
                </div>
            </div>
            <div class="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
                <button onclick="window.approveRockCompletion('${completion.id}', true)" 
                        class="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                    <i class="fas fa-check"></i>
                </button>
                <button onclick="window.openRejectRockModal('${completion.id}')" 
                        class="w-10 h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
}

function renderMonthCard(monthName, monthNumber, rocks) {
    const activeRocks = rocks.filter(r => r.is_active);
    return `
        <div class="p-6 rounded-2xl border-2 ${rocks.length > 0 ? 'border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/5' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30'}">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-black text-slate-800 dark:text-white">${monthName}</h3>
                <span class="text-xs font-bold text-slate-400">${activeRocks.length} activa(s)</span>
            </div>
            
            ${activeRocks.length > 0 ? `
                <div class="space-y-2 mb-4">
                    ${activeRocks.map(rock => `
                        <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <h4 class="text-sm font-bold text-slate-800 dark:text-white flex-1 leading-tight">${rock.name}</h4>
                                <button onclick="window.editRock('${rock.id}')" class="text-slate-400 hover:text-primary transition-colors p-1">
                                    <i class="fas fa-edit text-xs"></i>
                                </button>
                            </div>
                            <div class="flex items-center gap-3 text-[0.65rem] font-bold text-slate-500 flex-wrap">
                                <span class="flex items-center gap-1">
                                    <i class="fas fa-star text-amber-500"></i> ${rock.xp_value} XP
                                </span>
                                ${rock.deadline_day ? `
                                    <span class="flex items-center gap-1">
                                        <i class="far fa-calendar"></i> Día ${rock.deadline_day}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p class="text-xs text-slate-400 text-center py-4">Sin tareas asignadas</p>
            `}
            
            <button onclick="window.openCreateRockModal(${monthNumber})" 
                    class="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-xl transition-all text-xs uppercase tracking-wider">
                + Agregar Tarea
            </button>
        </div>
    `;
}

let currentEditingRockId = null;

window.editRock = async function (rockId) {
    try {
        if (!window._supabase) return;
        const { data: rock, error } = await window._supabase
            .from('teacher_rocks')
            .select('*')
            .eq('id', rockId)
            .single();

        if (error) throw error;
        window.openCreateRockModal(null, rock);
    } catch (err) {
        console.error('Error cargando tarea para editar:', err);
        if (typeof window.showToast === 'function') window.showToast('❌ Error al cargar datos', 'error');
    }
};

window.openCreateRockModal = function (preselectedMonth = null, rockToEdit = null) {
    currentEditingRockId = rockToEdit ? rockToEdit.id : null;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar p-0 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
            <div class="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white sticky top-0 z-10 w-full">
                <div class="flex justify-between items-center w-full">
                    <h2 class="text-xl md:text-2xl font-black uppercase truncate pr-4">${rockToEdit ? 'Editar Tarea' : 'Nueva Tarea'}</h2>
                    <button onclick="this.closest('.fixed').remove()" class="w-9 h-9 shrink-0 rounded-xl bg-white/20 hover:bg-white/30 transition-all flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <form id="create-rock-form" onsubmit="window.submitCreateRock(event)" class="p-6 space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="md:col-span-2">
                        <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest block mb-2">Nombre *</label>
                        <input type="text" id="rock-name" required value="${rockToEdit?.name || ''}"
                               class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-primary transition-all">
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest block mb-2">Descripción *</label>
                        <textarea id="rock-description" rows="3" required
                                  class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-primary transition-all resize-none">${rockToEdit?.description || ''}</textarea>
                    </div>
                </div>
                <div class="flex gap-3 pt-6">
                    <button type="submit" class="flex-1 py-3 bg-amber-500 text-white font-black rounded-xl">GUARDAR</button>
                    ${rockToEdit ? `
                        <button type="button" onclick="window.deleteRock('${rockToEdit.id}')" class="px-6 py-3 bg-rose-500 text-white rounded-xl"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

window.submitCreateRock = async function (event) {
    event.preventDefault();
    if (!window._supabase || !window.currentUser) return;

    const rockData = {
        name: document.getElementById('rock-name').value,
        description: document.getElementById('rock-description').value,
        // (Other fields would go here, simplified for brevity)
        is_active: true
    };

    try {
        let error;
        if (currentEditingRockId) {
            const res = await window._supabase.from('teacher_rocks').update(rockData).eq('id', currentEditingRockId);
            error = res.error;
        } else {
            rockData.created_by = window.currentUser.id;
            const res = await window._supabase.from('teacher_rocks').insert(rockData);
            error = res.error;
        }

        if (error) throw error;
        if (typeof window.showToast === 'function') window.showToast('✅ Éxito', 'success');
        event.target.closest('.fixed').remove();
        await window.loadAdminRocksManagement();
    } catch (err) {
        console.error(err);
    }
};

window.deleteRock = async function (rockId) {
    if (!confirm('¿Seguro?') || !window._supabase) return;
    try {
        const { error } = await window._supabase.from('teacher_rocks').delete().eq('id', rockId);
        if (error) throw error;
        await window.loadAdminRocksManagement();
        document.querySelector('.fixed.z-\\[200\\]')?.remove();
    } catch (err) { console.error(err); }
};

async function approveRock(completionId, approved, notes = null) {
    if (!window._supabase) return;
    const { error } = await window._supabase.from('teacher_rock_completions').update({ approval_status: approved ? 'approved' : 'rejected', notes: notes }).eq('id', completionId);
    if (error) throw error;
}

window.approveRockCompletion = async function (completionId, approved) {
    try {
        await approveRock(completionId, approved);
        await window.loadAdminRocksManagement();
    } catch (err) { console.error(err); }
};

window.openRejectRockModal = function (completionId) {
    const reason = prompt('Motivo del rechazo:');
    if (reason) window.submitRejection(completionId, reason);
};

window.submitRejection = async function (completionId, reason) {
    try {
        await approveRock(completionId, false, reason);
        await window.loadAdminRocksManagement();
    } catch (err) { console.error(err); }
};

console.log('✅ admin-rocks.js listo.');

// ================================================
// INICIALIZACIÓN
// ================================================
console.log('✅ admin-rocks.js cargado');
