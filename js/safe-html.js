// Escapes puros (sin DOM) para armar HTML con datos que escribe un usuario. utils.js los publica como window.safeUrl.
// Regla: todo dato de usuario que entra a una plantilla HTML pasa por sanitizeInput (texto), sanitizeAttr (dentro de comillas) o safeUrl (src/href).

/** Escapa &, <, >, comillas dobles y simples: sirve para texto y para atributos entrecomillados. */
export function escapeHtmlAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Dirección segura para src/href: solo http(s), blob:, imágenes data: (png/jpeg/gif/webp en base64) y rutas relativas.
 * Todo lo demás (javascript:, vbscript:, data:text/html, esquemas escondidos con tabuladores o saltos de línea) devuelve '' para que el atributo quede vacío.
 * El resultado ya viene escapado para ir dentro de comillas: usarlo tal cual, sin escapar otra vez.
 */
export function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  // Los navegadores ignoran espacios y caracteres de control dentro del esquema ("java\tscript:"): se comprueba sin ellos.
  const compact = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (scheme) {
    const ok = /^(https?|blob):/i.test(compact) || /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(compact);
    if (!ok) return '';
  }
  return escapeHtmlAttr(raw);
}
