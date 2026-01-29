/**
 * SISTEMA DE NOTIFICACIONES DE ROCAS
 * Notifica a docentes sobre rocas nuevas, deadlines y aprobaciones
 */

// ================================================
// VERIFICAR NOTIFICACIONES DE ROCAS
// ================================================
window.checkRocksNotifications = async function checkRocksNotifications() {
    if (window.userRole !== 'docente') return;

    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const currentDay = now.getDate();

        // Obtener rocas del mes actual
        if (typeof window.getMonthlyRocks !== 'function') return;
        const rocks = await window.getMonthlyRocks();

        // 1. Notificar rocas nuevas al inicio del mes (días 1-3)
        if (currentDay <= 3) {
            await notifyNewMonthRocks(rocks, currentMonth);
        }

        // 2. Notificar deadlines próximos (3 días antes)
        await notifyUpcomingDeadlines(rocks, currentDay);

        // 3. Verificar aprobaciones/rechazos recientes
        await notifyRockApprovals();

    } catch (err) {
        console.error('Error verificando notificaciones de rocas:', err);
    }
}

async function notifyNewMonthRocks(rocks, month) {
    const notificationKey = `rocks_notified_${month}_${new Date().getFullYear()}`;
    const alreadyNotified = localStorage.getItem(notificationKey);
    if (alreadyNotified) return;
    if (rocks.length === 0) return;

    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    window.showRocksNotificationModal({
        title: `🎯 Nuevas Rocas de ${monthNames[month]}`,
        message: `Tienes ${rocks.length} roca(s) asignada(s) este mes. ¡Completa todas para ganar XP adicional!`,
        rocks: rocks,
        type: 'new-month'
    });

    localStorage.setItem(notificationKey, 'true');
}

async function notifyUpcomingDeadlines(rocks, currentDay) {
    const upcomingRocks = rocks.filter(rock => {
        if (!rock.deadline_day || rock.is_completed) return false;
        const daysUntilDeadline = rock.deadline_day - currentDay;
        return daysUntilDeadline > 0 && daysUntilDeadline <= 3;
    });

    if (upcomingRocks.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const notificationKey = `deadline_notified_${today}`;
    const alreadyNotified = localStorage.getItem(notificationKey);

    if (alreadyNotified) return;

    window.showRocksNotificationModal({
        title: '⏰ Deadlines Próximos',
        message: `Tienes ${upcomingRocks.length} roca(s) con deadline cercano. ¡No las dejes para último momento!`,
        rocks: upcomingRocks,
        type: 'deadline'
    });

    localStorage.setItem(notificationKey, 'true');
}

async function notifyRockApprovals() {
    try {
        const user = window.currentUser;
        if (!user || !window._supabase) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { data: recentCompletions, error } = await window._supabase
            .from('teacher_rock_completions')
            .select('*, teacher_rocks(name, xp_value)')
            .eq('teacher_id', user.id)
            .gte('approved_at', yesterday.toISOString())
            .in('approval_status', ['approved', 'rejected']);

        if (error) throw error;
        if (!recentCompletions || recentCompletions.length === 0) return;

        const notifiedKey = 'notified_completions';
        const notifiedIds = JSON.parse(localStorage.getItem(notifiedKey) || '[]');
        const newCompletions = recentCompletions.filter(c => !notifiedIds.includes(c.id));

        if (newCompletions.length === 0) return;

        newCompletions.forEach(completion => {
            const isApproved = completion.approval_status === 'approved';
            if (typeof window.showToast === 'function') {
                window.showToast(
                    isApproved
                        ? `✅ Tarea "${completion.teacher_rocks.name}" aprobada (+${completion.teacher_rocks.xp_value} XP)`
                        : `❌ Tarea "${completion.teacher_rocks.name}" rechazada${completion.rejection_reason ? ': ' + completion.rejection_reason : ''}`,
                    isApproved ? 'success' : 'error'
                );
            }
        });

        const updatedNotified = [...notifiedIds, ...newCompletions.map(c => c.id)];
        localStorage.setItem(notifiedKey, JSON.stringify(updatedNotified));
    } catch (err) {
        console.error('Error notificando aprobaciones:', err);
    }
}

window.showRocksNotificationModal = function showRocksNotificationModal(config) {
    const { title, message, rocks, type } = config;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
            <div class="p-6 bg-gradient-to-r ${type === 'deadline' ? 'from-rose-500 to-orange-500' : 'from-amber-500 to-orange-500'} text-white">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-2xl font-black mb-2">${title}</h2>
                        <p class="text-sm opacity-90">${message}</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 transition-all flex items-center justify-center shrink-0">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <div class="space-y-3">
                    ${rocks.map(rock => {
        const daysUntilDeadline = rock.deadline_day ? rock.deadline_day - new Date().getDate() : null;
        const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 3;
        return `
                            <div class="p-4 rounded-2xl border-2 ${isUrgent ? 'border-rose-200 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10' : 'border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/10'}">
                                <div class="flex items-start justify-between gap-3 mb-2">
                                    <h3 class="text-sm font-black text-slate-800 dark:text-white flex-1">${rock.rock_name || rock.name}</h3>
                                    ${isUrgent ? '<span class="text-xs font-black text-rose-500 uppercase">¡Urgente!</span>' : ''}
                                </div>
                                <p class="text-xs text-slate-600 dark:text-slate-400 mb-3">${rock.rock_description || rock.description}</p>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3 text-[0.65rem] font-bold text-slate-500">
                                        <span class="flex items-center gap-1">
                                            <i class="fas fa-star text-amber-500"></i> ${rock.xp_value} XP
                                        </span>
                                        ${rock.deadline_day ? `
                                            <span class="flex items-center gap-1 ${isUrgent ? 'text-rose-500' : ''}">
                                                <i class="far fa-calendar"></i> ${daysUntilDeadline > 0 ? `${daysUntilDeadline} día(s)` : 'Hoy'}
                                            </span>
                                        ` : ''}
                                    </div>
                                    ${!rock.is_completed ? `
                                        <button onclick="this.closest('.fixed').remove(); window.openCompleteRockModal('${rock.rock_id || rock.id}')" 
                                                class="px-3 py-1.5 bg-primary hover:bg-indigo-700 text-white text-[0.65rem] font-black rounded-lg transition-all">
                                            COMPLETAR
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
            
            <div class="p-6 border-t border-slate-200 dark:border-slate-800">
                <button onclick="this.closest('.fixed').remove()" 
                        class="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-500/20">
                    ENTENDIDO
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.updateRocksNotificationBadge = function updateRocksNotificationBadge() {
    if (window.userRole !== 'docente') return;
    if (typeof window.getMonthlyRocks !== 'function') return;

    window.getMonthlyRocks().then(rocks => {
        const currentDay = new Date().getDate();
        const urgentRocks = rocks.filter(rock => {
            if (!rock.deadline_day || rock.is_completed) return false;
            const daysUntilDeadline = rock.deadline_day - currentDay;
            return daysUntilDeadline > 0 && daysUntilDeadline <= 3;
        });

        const badge = document.getElementById('rocks-notification-badge');
        if (badge && urgentRocks.length > 0) {
            badge.textContent = urgentRocks.length;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }
    });
}

console.log('✅ rocks-notifications.js cargado');
