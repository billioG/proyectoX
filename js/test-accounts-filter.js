// ================================================
// FILTRO DE CUENTAS DE PRUEBA -- excluye a los usuarios/establecimiento de
// prueba interna de TODAS las métricas y reportes de admin, para que no
// contaminen los números reales (Customer Success, Desempeño Docente,
// Desempeño de Equipo).
// ================================================

const TEST_TEACHER_EMAILS = ['profebillio@gmail.com', 'billy@1bot.org'];
const TEST_SCHOOL_NAME_PATTERN = /1bot/i;

window.isTestTeacherEmail = function isTestTeacherEmail(email) {
  return !!email && TEST_TEACHER_EMAILS.includes(email.toLowerCase());
};

window.isTestSchool = function isTestSchool(school) {
  return !!school?.name && TEST_SCHOOL_NAME_PATTERN.test(school.name);
};

// Los códigos de establecimiento no siempre llegan con el mismo tipo/formato
// entre tablas (ej. "001" vs "1") -- se normaliza todo a string para que
// las comparaciones con .has() no fallen en silencio.
window.getTestSchoolCodes = function getTestSchoolCodes(schools) {
  return new Set((schools || []).filter(window.isTestSchool).map(s => String(s.code)));
};

window.isTestSchoolCode = function isTestSchoolCode(testSchoolCodes, code) {
  return code != null && testSchoolCodes.has(String(code));
};
