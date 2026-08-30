/**
 * CENTRO DE NOTIFICACIONES -- punto único para refrescar todos los badges
 * (campana de avisos, rocas, evaluar, duelos 1v1). Antes cada uno se
 * disparaba desde un lugar distinto (login, boot de app.js, o recién al
 * abrir un módulo lazy-loaded), así que un badge podía quedar
 * desactualizado según por dónde entrara el usuario -- ej. el punto rojo
 * de duelos solo se actualizaba si el alumno ya había abierto el Centro
 * de Juego alguna vez en la sesión. refreshAllBadges() los dispara todos
 * juntos, en el mismo momento (login y cada vez que tenga sentido
 * refrescar), sin tocar la lógica interna de cada uno.
 */
window.refreshAllBadges = function refreshAllBadges() {
  if (typeof window.loadAnnouncementsUnreadCount === 'function') window.loadAnnouncementsUnreadCount();

  if (window.userRole === 'docente' || window.userRole === 'admin') {
    if (typeof window.checkRocksNotifications === 'function') window.checkRocksNotifications();
    if (typeof window.updateRocksNotificationBadge === 'function') window.updateRocksNotificationBadge();
  }
  if (window.userRole === 'docente') {
    if (typeof window.loadTeacherNotifications === 'function') window.loadTeacherNotifications();
  }
  // Duelos vive en gamification.js/duels.js, que se cargan lazy -- si
  // todavía no cargaron, no hay nada que refrescar (no es un error, el
  // badge se pone al día apenas el alumno abra el Centro de Juego).
  if (window.userRole === 'estudiante' && typeof window.updateDuelPendingBadge === 'function') {
    window.updateDuelPendingBadge();
  }
};

// Resumen liviano de "no leídos" para un futuro inbox unificado -- lee los
// badges YA renderizados en pantalla en vez de repetir cada consulta a
// Supabase (llamar después de refreshAllBadges() para que estén al día).
window.getUnreadSummary = function getUnreadSummary() {
  const readBadgeCount = (selector) => {
    const el = document.querySelector(selector);
    const n = parseInt(el?.textContent, 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    announcements: readBadgeCount('#announcements-unread-badge'),
    rocks: readBadgeCount('#rocks-notification-badge'),
    evaluations: readBadgeCount('.nav-item .notification-badge'),
    duels: readBadgeCount('#duel-pending-badge'),
  };
};
