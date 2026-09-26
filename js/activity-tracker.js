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

    // Rol, escuela, fecha y los +30s los decide el servidor -- antes el
    // cliente escribía total_seconds directo y se podía inflar.
    async sendHeartbeat() {
        const user = window.currentUser;
        if (typeof window._supabase === 'undefined' || !user) return;
        if (!this.isReallyActive()) return;
        // Punto verde de "conectado" para los retos 1v1 (idempotente).
        window.GameArena?.syncPresence?.();

        try {
            const { error } = await window._supabase.rpc('record_active_heartbeat');
            if (error) throw error;
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
