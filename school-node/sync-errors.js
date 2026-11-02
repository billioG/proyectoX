// Mensajes que entiende un docente cuando falla una sincronización (el error técnico sigue en el registro).

export function friendlySyncError(message) {
  const m = String(message || '');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|timeout|aborted/i.test(m)) return 'Sin internet por ahora. Todo lo que se hizo está guardado y se subirá solo cuando haya conexión (cable o Wi-Fi con internet).';
  if (/token/i.test(m)) return 'La nube no reconoció el token. Revisa que lo copiaste completo o pide uno nuevo al administrador.';
  return m || 'Error desconocido';
}

// Centinela: la nube respondió pero sin "applied.projects" (la función node-sync es de una versión anterior).
export const OLD_FUNCTION = 'OLD_FUNCTION';

export function friendlyProjectError(message) {
  if (message === OLD_FUNCTION) return 'La nube todavía no acepta proyectos: pide al administrador actualizar la función node-sync.';
  return friendlySyncError(message);
}
