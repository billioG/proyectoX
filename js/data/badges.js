// ================================================
// INSIGNIAS - DATA CENTRALIZADA (Versión Clásica)
// ================================================

export const BADGES = [
    { id: 1, name: 'Primera Publicación', description: 'Subiste tu primer proyecto', icon: '<i class="fas fa-bullseye"></i>', condition: 'first_project' },
    { id: 2, name: 'Estrella Brillante', description: 'Obtuviste 10+ Me Gusta', icon: '⭐', condition: '10_likes' },
    { id: 3, name: 'Excelencia', description: 'Proyecto calificado con 90+', icon: '<i class="fas fa-trophy"></i>', condition: 'score_90' },
    { id: 5, name: 'Constancia', description: 'Subiste 5+ proyectos', icon: '<i class="fas fa-fire"></i>', condition: '5_projects' },
    { id: 6, name: 'Popular', description: 'Obtuviste 50+ Me Gusta', icon: '<i class="fas fa-star"></i>', condition: '50_likes' },
    { id: 7, name: 'Maestro', description: '3 proyectos con 85+', icon: '<i class="fas fa-crown"></i>', condition: '3_high_scores' },
    { id: 8, name: 'Innovador', description: 'Proyecto destacado del mes', icon: '<i class="fas fa-lightbulb"></i>', condition: 'featured' },
    { id: 9, name: 'Veterano', description: 'Subiste 10 proyectos en el año', icon: '<i class="fas fa-medal"></i>️', condition: '10_projects' },
    { id: 10, name: 'Imparable', description: 'Subiste proyectos 3 meses seguidos', icon: '<i class="fas fa-rocket"></i>', condition: 'streak_3_months' },
    { id: 11, name: 'Crítico', description: 'Votaste por 20 proyectos', icon: '<i class="fas fa-eye"></i>', condition: '20_votes_given' },
    { id: 12, name: 'Buen Compañero', description: 'Participaste en 3 grupos diferentes', icon: '<i class="fas fa-handshake"></i>', condition: '3_groups' },
    { id: 13, name: 'Mente Maestra', description: 'Fuiste Planner exitoso 3 veces', icon: '<i class="fas fa-brain"></i>', condition: 'role_planner_3' },
    { id: 14, name: 'La Voz', description: 'Fuiste Speaker destacado 3 veces', icon: '<i class="fas fa-comment-dots"></i>️', condition: 'role_speaker_3' },
    { id: 15, name: 'Sprint Final', description: 'Subiste proyecto en Noviembre', icon: '<i class="fas fa-flag-checkered"></i>', condition: 'november_project' }
];

export const TEACHER_BADGES = [
    { id: 101, name: 'Evaluador Veloz', description: 'Evaluaste 10 proyectos en menos de una semana', icon: '<i class="fas fa-bolt"></i>', condition: 'eval_10' },
    { id: 102, name: 'Mentor de Oro', description: 'Tus grupos han subido 5 proyectos aprobados', icon: '<i class="fas fa-medal"></i>', condition: 'mentor_5' },
    { id: 103, name: 'Guía Maestro', description: 'Creaste 5 grupos de trabajo exitosos', icon: '<i class="fas fa-chalkboard-user"></i>‍<i class="fas fa-school"></i>', condition: 'groups_5' },
    { id: 104, name: 'Feedback de Calidad', description: 'Escribiste retroalimentaciones detalladas en 20 proyectos', icon: '<i class="fas fa-pen-to-square"></i>', condition: 'feedback_20' },
    { id: 200, name: 'Maestro Legendario', description: 'Completaste todos los retos de crecimiento personal del año', icon: '<i class="fas fa-trophy"></i>', condition: 'full_year' }
];

window.BADGES = BADGES;
window.TEACHER_BADGES = TEACHER_BADGES;
