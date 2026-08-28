// ================================================
// RETOS MENSUALES ESTUDIANTES - DATA CENTRALIZADA
// Distinto del de docentes (data/challenges.js): acá el eje es gestión
// emocional y crecimiento personal, no técnica docente. Tabla separada
// (student_challenges) y namespace de ids separado (std_*) para no
// pisarse con los retos de docente aunque coincida el mes.
// ================================================

export const STUDENT_MONTHLY_CHALLENGES = [
    { id: 'std_jan_2026', name: 'Enero: Ponele Nombre', description: 'La próxima vez que sientas una emoción fuerte (enojo, tristeza, ansiedad), tomate 10 segundos para ponerle nombre en vez de reaccionar de una. Contanos qué emoción identificaste y qué hiciste distinto.', reward: '+30 XP y 10 gemas', isActive: true },
    { id: 'std_feb_2026', name: 'Febrero: Respiración 4-7-8', description: 'Probá la técnica de respirar 4 segundos inhalando, 7 aguantando y 8 exhalando, al menos 3 veces esta semana cuando te sientas estresado o nervioso. Contanos en qué momentos la usaste y si te ayudó.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_mar_2026', name: 'Marzo: Gratitud Diaria', description: 'Escribí cada día de esta semana una cosa por la que estés agradecido, por más chica que sea. Contanos cuál fue la que más te sorprendió a vos mismo.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_apr_2026', name: 'Abril: El Error que me Enseñó', description: 'Pensá en un error que cometiste este año (en el cole o fuera) y escribí qué aprendiste de él. No pasa nada si todavía te cuesta aceptarlo -- contanos igual.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_may_2026', name: 'Mayo: Desconexión', description: 'Elegí una hora del día para dejar el celular sin notificaciones durante 5 días esta semana. Contanos qué hora elegiste, qué se te hizo difícil y si notaste algún cambio.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_jun_2026', name: 'Junio: Escuchar sin Interrumpir', description: 'Elegí una conversación con un familiar o compañero y escuchá sin interrumpir ni pensar qué vas a responder mientras habla. Contanos con quién lo hiciste y qué notaste.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_jul_2026', name: 'Julio: Reconocer a Otro', description: 'Decile a un compañero o familiar algo específico que valorás de él/ella (no algo genérico como "sos buena onda"). Contanos a quién se lo dijiste y cómo reaccionó.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_aug_2026', name: 'Agosto: Decir lo que Siento', description: 'La próxima vez que tengas un conflicto con alguien, probá decir "me siento [emoción] cuando pasa [situación]" en vez de acusar o pelear. Contanos la situación y qué pasó.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_sep_2026', name: 'Septiembre: Algo Nuevo', description: 'Probá algo que nunca hayas hecho (una forma distinta de estudiar, un hobby, hablar con alguien que no conocés bien). Contanos qué probaste y qué tal te fue.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_oct_2026', name: 'Octubre: Tomar la Iniciativa', description: 'Ofrecete a liderar o ayudar en algo esta semana sin que nadie te lo pida (un trabajo en equipo, explicarle algo a un compañero). Contanos qué hiciste y cómo te sentiste.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_nov_2026', name: 'Noviembre: Pausa antes de Reaccionar', description: 'La próxima vez que sientas frustración, contá hasta 10 antes de responder, al menos 3 veces esta semana. Contanos en qué momentos lo hiciste y si cambió cómo reaccionaste.', reward: '+30 XP y 10 gemas', isActive: false },
    { id: 'std_dec_2026', name: 'Diciembre: Mi Año', description: 'Escribí sobre el mayor cambio personal que sentís que tuviste este año (no de notas, de vos como persona). Contanos una situación concreta que lo represente.', reward: '+30 XP y 10 gemas', isActive: false }
];
// Mismo criterio que el de docentes: se activa solo el que corresponde
// al mes calendario actual.
const _currentMonthIndex = new Date().getMonth();
STUDENT_MONTHLY_CHALLENGES.forEach((c, i) => { c.isActive = i === _currentMonthIndex; });

window.STUDENT_MONTHLY_CHALLENGES = STUDENT_MONTHLY_CHALLENGES;
