/**
 * EVALUATION NOTIFICATIONS - Gestión de alertas y badges de proyectos pendientes
 */

window.loadTeacherNotifications = async function loadTeacherNotifications() {
    const userRole = window.userRole;
    const _supabase = window._supabase;
    const currentUser = window.currentUser;

    if (userRole !== 'docente') return;

    try {
        const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', currentUser.id);
        if (!assignments || assignments.length === 0) return window.updateNotificationBadge(0);

        const { data: projects } = await _supabase.from('projects').select(`id, score, students!inner(school_code, grade, section), evaluations(id)`);

        const pendingCount = projects.filter(p => {
            const isEvaluated = (p.evaluations && p.evaluations.length > 0) || (p.score > 0);
            if (isEvaluated) return false;
            return assignments.some(a => p.students?.school_code === a.school_code && p.students?.grade === a.grade && p.students?.section === a.section);
        }).length;

        window.updateNotificationBadge(pendingCount);
    } catch (err) { console.error('Error notif:', err); }
}

window.updateNotificationBadge = function updateNotificationBadge(count) {
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.textContent.includes('Evaluar')) {
            const existing = item.querySelector('.notification-badge');
            if (existing) existing.remove();
            if (count > 0) {
                item.style.position = 'relative';
                const badge = document.createElement('span');
                badge.className = 'notification-badge';
                badge.textContent = count;
                item.appendChild(badge);
            }
        }
    });
}
