// ================================================
// RETOS MENSUALES DOCENTES - DATA CENTRALIZADA (Clásica)
// ================================================

export const MONTHLY_CHALLENGES = [
    { id: 'jan_2026', name: 'Enero: El Poder de la Escucha', description: 'Durante esta semana, dedicá 5 minutos al inicio de cada clase a escuchar activamente a un alumno distinto: sin interrumpir, sin corregir, solo escuchando. Al final, contanos con quién lo hiciste, qué te dijo y qué notaste diferente en esa relación.', reward: 'Growth Bonus + 10 XP', isActive: true },
    { id: 'feb_2026', name: 'Febrero: Gestión del Tiempo Consciente', description: 'Aplicá la técnica Pomodoro (25 min de trabajo enfocado + 5 de pausa) al planificar al menos 3 clases esta semana. Contanos qué materia usaste, cómo cambió el ritmo de la clase y si notaste más o menos atención de los alumnos.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'mar_2026', name: 'Marzo: Empatía Radical', description: 'Identificá al alumno con más dificultades en tu grupo y dedicale una conversación individual de al menos 5 minutos, fuera del contexto académico, para entender su situación. Contanos qué aprendiste de él/ella que no sabías antes.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'apr_2026', name: 'Abril: El Arte de Preguntar', description: 'En una clase de esta semana, transformá al menos 3 afirmaciones que normalmente harías en preguntas abiertas ("¿qué creen que pasaría si...?" en vez de "esto es así porque..."). Contanos qué preguntas usaste y cómo reaccionaron los alumnos.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'may_2026', name: 'Mayo: Bienestar Digital', description: 'Establecé una hora fija de "desconexión total" (sin celular, sin notificaciones) durante 5 días esta semana. Contanos qué hora elegiste, qué se te hizo difícil y si notaste algún cambio en tu energía o ánimo.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'jun_2026', name: 'Junio: Mentalidad de Crecimiento', description: 'Compartí con tus alumnos un error propio (académico o personal) y cómo aprendiste de él. Contanos qué error compartiste, en qué grupo lo hiciste y cómo reaccionaron.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'jul_2026', name: 'Julio: Gratitud en el Aula', description: 'Iniciá cada clase de esta semana reconociendo en voz alta un logro específico de un alumno distinto (no genérico, algo concreto que hizo). Contanos a quiénes reconociste y qué cambió en el ambiente del aula.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'aug_2026', name: 'Agosto: Comunicación No Violenta', description: 'La próxima vez que tengas un conflicto o tensión con un alumno, expresá lo que sentís usando la fórmula "Siento [emoción] cuando [situación] porque [necesidad]" en vez de acusar o etiquetar. Contanos la situación concreta y qué pasó al usar esa fórmula.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'sep_2026', name: 'Septiembre: Creatividad sin Límites', description: 'Probá un método de enseñanza que nunca hayas usado antes (gamificación, aprendizaje basado en proyectos, rotación de estaciones, etc.) en al menos una clase esta semana. Contanos qué método elegiste, con qué tema lo aplicaste y qué resultado tuvo.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'oct_2026', name: 'Octubre: Liderazgo Inspirador', description: 'Delegá una tarea de liderazgo real (coordinar un grupo, moderar una discusión, explicar un tema a sus compañeros) a un alumno que normalmente no toma ese rol. Contanos a quién elegiste, qué tarea le diste y cómo le fue.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'nov_2026', name: 'Noviembre: Resiliencia Emocional', description: 'Practicá una técnica de autorregulación (respiración 4-7-8, pausa de 10 segundos antes de responder, etc.) la próxima vez que sientas frustración en el aula, durante al menos 3 ocasiones esta semana. Contanos en qué momentos la usaste y si cambió tu reacción.', reward: 'Growth Bonus + 10 XP', isActive: false },
    { id: 'dec_2026', name: 'Diciembre: Cierre con Propósito', description: 'Reflexioná por escrito sobre el mayor impacto humano (no académico) que sentís que tuviste este año con tus alumnos. Contanos una situación concreta que lo represente y qué aprendiste vos como docente.', reward: 'Growth Bonus + 10 XP', isActive: false }
];
// Se activa automáticamente el reto que corresponde al mes calendario actual
// (el array está en orden Enero->Diciembre) -- ya no depende de que alguien
// vaya cambiando isActive a mano cada mes.
const _currentMonthIndex = new Date().getMonth();
MONTHLY_CHALLENGES.forEach((c, i) => { c.isActive = i === _currentMonthIndex; });

window.MONTHLY_CHALLENGES = MONTHLY_CHALLENGES;
