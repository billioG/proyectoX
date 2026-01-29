// ================================================
// INSIGNIAS - DATA CENTRALIZADA (Versión Clásica)
// ================================================

export const BADGES = [
    { id: 1, name: 'Primera Publicación', description: 'Subiste tu primer proyecto', icon: '🎯', condition: 'first_project' },
    { id: 2, name: 'Estrella Brillante', description: 'Obtuviste 10+ Me Gusta', icon: '⭐', condition: '10_likes' },
    { id: 3, name: 'Excelencia', description: 'Proyecto calificado con 90+', icon: '🏆', condition: 'score_90' },
    { id: 5, name: 'Constancia', description: 'Subiste 5+ proyectos', icon: '🔥', condition: '5_projects' },
    { id: 6, name: 'Popular', description: 'Obtuviste 50+ Me Gusta', icon: '🌟', condition: '50_likes' },
    { id: 7, name: 'Maestro', description: '3 proyectos con 85+', icon: '👑', condition: '3_high_scores' },
    { id: 8, name: 'Innovador', description: 'Proyecto destacado del mes', icon: '💡', condition: 'featured' },
    { id: 9, name: 'Veterano', description: 'Subiste 10 proyectos en el año', icon: '🎖️', condition: '10_projects' },
    { id: 10, name: 'Imparable', description: 'Subiste proyectos 3 meses seguidos', icon: '🚀', condition: 'streak_3_months' },
    { id: 11, name: 'Crítico', description: 'Votaste por 20 proyectos', icon: '👀', condition: '20_votes_given' },
    { id: 12, name: 'Buen Compañero', description: 'Participaste en 3 grupos diferentes', icon: '🤝', condition: '3_groups' },
    { id: 13, name: 'Mente Maestra', description: 'Fuiste Planner exitoso 3 veces', icon: '🧠', condition: 'role_planner_3' },
    { id: 14, name: 'La Voz', description: 'Fuiste Speaker destacado 3 veces', icon: '🗣️', condition: 'role_speaker_3' },
    { id: 15, name: 'Sprint Final', description: 'Subiste proyecto en Noviembre', icon: '🏁', condition: 'november_project' }
];

export const TEACHER_BADGES = [
    { id: 101, name: 'Evaluador Veloz', description: 'Evaluaste 10 proyectos en menos de una semana', icon: '⚡', condition: 'eval_10' },
    { id: 102, name: 'Mentor de Oro', description: 'Tus grupos han subido 5 proyectos aprobados', icon: '🥇', condition: 'mentor_5' },
    { id: 103, name: 'Guía Maestro', description: 'Creaste 5 grupos de trabajo exitosos', icon: '👨‍🏫', condition: 'groups_5' },
    { id: 104, name: 'Feedback de Calidad', description: 'Escribiste retroalimentaciones detalladas en 20 proyectos', icon: '📝', condition: 'feedback_20' },
    { id: 200, name: 'Maestro Legendario', description: 'Completaste todos los retos de crecimiento personal del año', icon: '🏆', condition: 'full_year' }
];

window.BADGES = BADGES;
window.TEACHER_BADGES = TEACHER_BADGES;
