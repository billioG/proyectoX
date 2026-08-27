// ================================================
// FILTRO DE CUENTAS DE PRUEBA -- excluye a los usuarios/establecimiento de
// prueba interna de TODAS las métricas y reportes de admin, para que no
// contaminen los números reales (Customer Success, Desempeño Docente,
// Desempeño de Equipo, Dashboard Ejecutivo, Resultados Académicos).
//
// "Modo Dev" (toggle en el header, solo admin) desactiva este filtro para
// poder ver/depurar la cuenta de prueba cuando hace falta, sin tener que
// tocar código -- por default queda oculta (producción real).
// ================================================

const TEST_TEACHER_EMAILS = ['profebillio@gmail.com', 'billy@1bot.org'];
const TEST_SCHOOL_NAME_PATTERN = /1bot/i;
const DEV_MODE_KEY = 'PX_DEV_MODE';

window.isDevModeEnabled = function isDevModeEnabled() {
  return localStorage.getItem(DEV_MODE_KEY) === 'true';
};

window.toggleDevMode = function toggleDevMode() {
  const next = !window.isDevModeEnabled();
  localStorage.setItem(DEV_MODE_KEY, next ? 'true' : 'false');
  window.showToast?.(
    next
      ? '<i class="fas fa-flask"></i> Modo Dev activado -- las métricas ahora incluyen cuentas de prueba'
      : '<i class="fas fa-flask"></i> Modo Dev desactivado -- cuentas de prueba excluidas de nuevo',
    'info'
  );
  window.renderDevModeToggle?.();
  // Los reportes cachean su propia respuesta ya filtrada -- recargar es lo
  // más simple para garantizar que todos reflejen el nuevo estado.
  setTimeout(() => window.location.reload(), 600);
};

window.renderDevModeToggle = function renderDevModeToggle() {
  const btn = document.getElementById('dev-mode-toggle');
  if (!btn) return;
  if (window.userRole !== 'admin') { btn.style.display = 'none'; return; }

  btn.style.display = 'flex';
  const on = window.isDevModeEnabled();
  btn.classList.toggle('text-fuchsia-500', on);
  btn.classList.toggle('bg-fuchsia-500/10', on);
  btn.classList.toggle('text-slate-400', !on);
};

window.isTestTeacherEmail = function isTestTeacherEmail(email) {
  if (window.isDevModeEnabled()) return false;
  return !!email && TEST_TEACHER_EMAILS.includes(email.toLowerCase());
};

window.isTestSchool = function isTestSchool(school) {
  if (window.isDevModeEnabled()) return false;
  return !!school?.name && TEST_SCHOOL_NAME_PATTERN.test(school.name);
};

// Los códigos de establecimiento no siempre llegan con el mismo tipo/formato
// entre tablas (ej. "001" vs "1") -- se normaliza todo a string para que
// las comparaciones con .has() no fallen en silencio.
window.getTestSchoolCodes = function getTestSchoolCodes(schools) {
  if (window.isDevModeEnabled()) return new Set();
  return new Set((schools || []).filter(window.isTestSchool).map(s => String(s.code)));
};

window.isTestSchoolCode = function isTestSchoolCode(testSchoolCodes, code) {
  if (window.isDevModeEnabled()) return false;
  return code != null && testSchoolCodes.has(String(code));
};
