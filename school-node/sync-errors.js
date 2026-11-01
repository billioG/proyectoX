// Mensajes que entiende un docente cuando falla una sincronización (el error técnico sigue en el registro).

export function friendlySyncError(message) {
  const m = String(message || '');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|timeout|aborted/i.test(m)) return 'No hay internet en esta computadora todavía. Conéctala a un internet que funcione y vuelve a intentar.';
  if (/token/i.test(m)) return 'La nube no reconoció el token. Revisa que lo copiaste completo o pide uno nuevo al administrador.';
  return m || 'Error desconocido';
}

// Centinela: la nube respondió pero sin "applied.projects" (la función node-sync es de una versión anterior).
export const OLD_FUNCTION = 'OLD_FUNCTION';

export function friendlyProjectError(message) {
  if (message === OLD_FUNCTION) return 'La nube todavía no acepta proyectos: pide al administrador actualizar la función node-sync.';
  return friendlySyncError(message);
}
