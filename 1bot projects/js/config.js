// ================================================
// CONFIGURACIÓN GLOBAL - ACTUALIZADO V2
// ================================================

const SUPABASE_URL = 'https://vyptkxudkmlpyfosppzh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5cHRreHVka21scHlmb3NwcHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTExMTIsImV4cCI6MjA4NDMyNzExMn0._tD_y_ZRniaembs5LKSDUmIjvLDmiXwWoq4uVBAqgy4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userRole = 'estudiante';
let REVIEW_DAYS_THRESHOLD = 15;

// Sectores de establecimientos
const SCHOOL_SECTORS = ['Oficial', 'Privado', 'Cooperativa', 'NUFED', 'Otro'];

// Niveles educativos
const EDUCATION_LEVELS = ['Primaria', 'Básico', 'Diversificado'];

// Jornadas
const SCHEDULES = ['Matutina', 'Vespertina', 'Nocturna', 'Doble'];

// Áreas
const AREAS = ['Rural', 'Urbana'];

// Grados por nivel
const GRADES_BY_LEVEL = {
  'Primaria': ['1ro Primaria', '2do Primaria', '3ro Primaria', '4to Primaria', '5to Primaria', '6to Primaria'],
  'Básico': ['1ro Básico', '2do Básico', '3ro Básico'],
  'Diversificado': ['4to Diversificado', '5to Diversificado', '6to Diversificado']
};

// Secciones disponibles
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Roles de grupo
const GROUP_ROLES = [
  { value: 'planner', label: 'Planner (Planificador)' },
  { value: 'maker', label: 'Maker (Creador)' },
  { value: 'speaker', label: 'Speaker (Presentador)' },
  { value: 'helper', label: 'Helper (Ayudante)' }
];

// Criterios de evaluación
const EVALUATION_CRITERIA = [
  { id: 1, name: 'Creatividad e Innovación', max_score: 20 },
  { id: 2, name: 'Claridad de Presentación', max_score: 20 },
  { id: 3, name: 'Funcionalidad del Proyecto', max_score: 20 },
  { id: 4, name: 'Trabajo en Equipo', max_score: 20 },
  { id: 5, name: 'Impacto Social', max_score: 20 }
];

// Insignias del sistema (SIN COMENTARIOS)
const BADGES = [
  {
    id: 1,
    name: 'Primera Publicación',
    description: 'Subiste tu primer proyecto',
    icon: '🎯',
    condition: 'first_project'
  },
  {
    id: 2,
    name: 'Estrella Brillante',
    description: 'Obtuviste 10+ Me Gusta',
    icon: '⭐',
    condition: '10_likes'
  },
  {
    id: 3,
    name: 'Excelencia',
    description: 'Proyecto calificado con 90+',
    icon: '🏆',
    condition: 'score_90'
  },
  {
    id: 5,
    name: 'Constancia',
    description: 'Subiste 5+ proyectos',
    icon: '🔥',
    condition: '5_projects'
  },
  {
    id: 6,
    name: 'Popular',
    description: 'Obtuviste 50+ Me Gusta',
    icon: '🌟',
    condition: '50_likes'
  },
  {
    id: 7,
    name: 'Maestro',
    description: '3 proyectos con 85+',
    icon: '👑',
    condition: '3_high_scores'
  },
  {
    id: 8,
    name: 'Innovador',
    description: 'Proyecto destacado del mes',
    icon: '💡',
    condition: 'featured'
  }
];

console.log('✅ config.js cargado correctamente');
