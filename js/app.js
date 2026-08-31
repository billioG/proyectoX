/**
 * app.js - Punto de entrada ES Modules del sistema Quetzal LMS
 */
import { initAuth } from './auth.js';
import { _syncManager } from './sync-manager.js';
import { initTheme } from './main.js';

import './data/badges.js';
// js/badges.js (la LÓGICA de insignias, checkAllBadges/checkAndAwardBadges)
// solo se cargaba de forma perezosa al entrar a "Perfil". Pero se llama
// justo al hacer login (auth.js) -- si el alumno nunca había visitado su
// perfil antes, la función no existía todavía y el chequeo se saltaba en
// silencio siempre. Por eso nadie tenía insignias desbloqueadas.
import './badges.js';
import './data/quotes.js';
import './data/challenges.js';
import './data/student-challenges.js';
import './kolibri-sync.js';
import './notification-center.js';
import './test-accounts-filter.js';
import './onboarding.js';
import './birthday-logic.js';
import './teacher-rocks.js';
import './admin-rocks.js';
import './rocks-notifications.js';
import './project-modals.js';
import './ai-service.js';
import './mascot-widget.js';
import './random-events.js';
import './announcements.js';
import './surveys.js';
import './activity-tracker.js';
import './admin-dashboard.js';
import './teachers.js';
import './students.js';
import './schools.js';
import './ranking.js';
import './bonus-system.js';
import './admin-success.js';
import './evaluation.js';
import './admin-evaluations.js';
import './attendance.js';
import './groups.js';
import './gamification.js';
import './profile.js';
import './feed-ui.js';
import './utils.js';

// Inicialización global
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Quetzal LMS: Iniciando sistema de módulos...');

    // 1. Inicializar Tema (Inmediato)
    if (typeof initTheme === 'function') initTheme();

    // 2. Inicializar Autenticación (Bloqueante para asegurar que el usuario esté listo)
    await initAuth();

    // 3. Inicializar Componentes que dependen del usuario -- solo si ya
    // hay sesión (initAuth() resuelve igual aunque termine mostrando la
    // pantalla de login sin loguear a nadie; sin este chequeo la mascota
    // aparecía flotando ANTES de iniciar sesión). El caso de login recién
    // hecho se cubre desde handleSuccessfulLogin() en auth.js.
    if (window.currentUser && window.MascotWidget && typeof window.MascotWidget.init === 'function') {
        window.MascotWidget.init();
    }

    if (window.ActivityTracker && typeof window.ActivityTracker.init === 'function') {
        window.ActivityTracker.init();
        setTimeout(() => window.ActivityTracker.sendHeartbeat(), 2000);
    }

    // 4. Inicializar Notificaciones de Tareas
    if (typeof window.checkRocksNotifications === 'function') {
        window.checkRocksNotifications();
    }

    // 4. Registrar Service Worker si aplica
    if ('serviceWorker' in navigator) {
        // BUG REAL en producción: sin "updateViaCache: 'none'", el navegador
        // puede chequear si hay una versión nueva de service-worker.js
        // comparando contra una copia vieja servida desde SU PROPIO caché
        // HTTP -- nunca detecta el cambio real, y el SW (con todos los fixes
        // de este archivo) nunca se instala en el dispositivo aunque el
        // resto de la app (index.html, app.js) sí se actualice. Con esto,
        // el navegador SIEMPRE pide service-worker.js fresco por red para
        // comparar. registration.update() fuerza el chequeo de una vez,
        // sin esperar al intervalo automático del navegador (horas).
        navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
            .then(r => {
                console.log('✅ Service Worker:', r.scope);
                r.update().catch(() => {});
            })
            .catch(e => console.error('❌ Service Worker:', e));
    }

    console.log('✨ Sistema Quetzal LMS listo.');
});
