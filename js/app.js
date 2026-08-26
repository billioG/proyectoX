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
import './kolibri-sync.js';
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

    // 3. Inicializar Componentes que dependen del usuario
    if (window.MascotWidget && typeof window.MascotWidget.init === 'function') {
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
        navigator.serviceWorker.register('./service-worker.js')
            .then(r => console.log('✅ Service Worker:', r.scope))
            .catch(e => console.error('❌ Service Worker:', e));
    }

    console.log('✨ Sistema Quetzal LMS listo.');
});
