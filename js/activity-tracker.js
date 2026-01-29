/**
 * ACTIVITY TRACKER - Seguimiento de tiempo de uso (Premium)
 * Registra el tiempo que estudiantes y docentes pasan activos en la plataforma.
 */

const ActivityTracker = {
    interval: null,
    heartbeatSeconds: 30,
    lastSync: Date.now(),
    isActive: true,

    init() {
        console.log('⏱️ ActivityTracker: Iniciando...');

        // Detectar si el usuario está activo (visibilidad)
        document.addEventListener('visibilitychange', () => {
            this.isActive = !document.hidden;
            if (this.isActive) {
                console.log('⏱️ ActivityTracker: Usuario regresó, reiniciando cronómetro');
                this.startHeartbeat();
            } else {
                console.log('⏱️ ActivityTracker: Usuario inactivo (pestaña oculta)');
                this.stopHeartbeat();
            }
        });

        // Iniciar primer ciclo
        this.startHeartbeat();
    },

    startHeartbeat() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.sendHeartbeat(), this.heartbeatSeconds * 1000);
    },

    stopHeartbeat() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    },

    async sendHeartbeat() {
        const user = window.currentUser;
        if (typeof window._supabase === 'undefined' || !user) return;
        if (!this.isActive) return;

        try {
            const role = window.userRole || 'estudiante';
            const dataUser = window.userData;
            let schoolCode = null;

            if (role === 'estudiante') {
                schoolCode = dataUser?.school_code || null;
            } else if (role === 'docente') {
                if (dataUser?.teacher_assignments && dataUser.teacher_assignments.length > 0) {
                    schoolCode = dataUser.teacher_assignments[0].school_code;
                }
            }

            const today = new Date().toISOString().split('T')[0];
            const safeSchoolCode = schoolCode || 'GENERAL';

            const { data, error } = await window._supabase
                .from('active_time_tracking')
                .select('total_seconds')
                .eq('user_id', user.id)
                .eq('school_code', safeSchoolCode)
                .eq('activity_date', today)
                .maybeSingle();

            if (error) throw error;

            const currentTotal = data ? data.total_seconds : 0;
            const newTotal = currentTotal + this.heartbeatSeconds;

            await window._supabase
                .from('active_time_tracking')
                .upsert({
                    user_id: user.id,
                    school_code: safeSchoolCode,
                    role: role,
                    activity_date: today,
                    total_seconds: newTotal,
                    last_heartbeat: new Date().toISOString()
                }, { onConflict: 'user_id, school_code, activity_date' });

        } catch (err) {
            console.error('❌ ActivityTracker Error:', err);
        }
    }
};

window.ActivityTracker = ActivityTracker;
