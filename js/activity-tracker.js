/**
 * ACTIVITY TRACKER - Seguimiento de tiempo de uso (Premium)
 * Registra el tiempo que estudiantes y docentes pasan activos en la plataforma.
 */

const ActivityTracker = {
    interval: null,
    heartbeatSeconds: 30,
    lastSync: Date.now(),
    isActive: true,
    // Antes "activo" solo significaba "la pestaña está visible" -- si el
    // usuario dejaba la pestaña abierta y se iba, el tiempo seguía sumando
    // como si estuviera usando la plataforma. Ahora también exige haber
    // interactuado (mouse/teclado/touch/scroll) en los últimos 2 minutos.
    lastInteraction: Date.now(),
    IDLE_THRESHOLD_MS: 2 * 60 * 1000,

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

        const markInteraction = () => { this.lastInteraction = Date.now(); };
        ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
            document.addEventListener(evt, markInteraction, { passive: true });
        });

        // Iniciar primer ciclo
        this.startHeartbeat();
    },

    isReallyActive() {
        return this.isActive && (Date.now() - this.lastInteraction) < this.IDLE_THRESHOLD_MS;
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
        if (!this.isReallyActive()) return;

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
            // El heartbeat es "best effort" -- corre cada 30s solo, así que
            // un fallo de red transitorio (conexión cerrada, timeout) no
            // necesita loguearse como error real, el próximo ciclo reintenta
            // solo. Sí se loguean errores reales (permisos, columna
            // inexistente, etc.) para no esconder un bug de verdad.
            const isNetworkBlip = err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError') || err?.name === 'TypeError';
            if (!isNetworkBlip) console.error('❌ ActivityTracker Error:', err);
        }
    }
};

window.ActivityTracker = ActivityTracker;
