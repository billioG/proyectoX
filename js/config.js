// ================================================
// CONFIGURACIÓN GLOBAL - ACTUALIZADO V2
// ================================================

export const SUPABASE_URL = 'https://vyptkxudkmlpyfosppzh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5cHRreHVka21scHlmb3NwcHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTExMTIsImV4cCI6MjA4NDMyNzExMn0._tD_y_ZRniaembs5LKSDUmIjvLDmiXwWoq4uVBAqgy4';

export const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado Global (Manejado vía objeto para permitir mutación sincronizada entre módulos)
const AppState = {
  currentUser: null,
  userRole: 'estudiante',
  userData: null,
  REVIEW_DAYS_THRESHOLD: 15
};

// Proxies para compatibilidad legacy y acceso rápido
export let currentUser = AppState.currentUser;
export let userRole = AppState.userRole;
export let userData = AppState.userData;

export function updateAppState(key, value) {
  AppState[key] = value;
  // Sincronizar con window para scripts legacy
  window[key] = value;
  // Nota: Los exports de variables primitivas no se actualizan automáticamente 
  // si se reasignan internamente, por lo que es mejor usar window o getters.
}

// Inicializar window para acceso inmediato
window.currentUser = AppState.currentUser;
window.userRole = AppState.userRole;
window.userData = AppState.userData;
window._supabase = _supabase;

// Sectores de establecimientos
export const SCHOOL_SECTORS = ['Oficial', 'Privado', 'Cooperativa', 'NUFED', 'Otro'];

// Niveles educativos
export const EDUCATION_LEVELS = ['Primaria', 'Básico', 'Diversificado'];

// Jornadas
export const SCHEDULES = ['Matutina', 'Vespertina', 'Nocturna', 'Doble'];

// Áreas
export const AREAS = ['Rural', 'Urbana'];

// Grados por nivel
export const GRADES_BY_LEVEL = {
  'Primaria': ['1ro Primaria', '2do Primaria', '3ro Primaria', '4to Primaria', '5to Primaria', '6to Primaria'],
  'Básico': ['1ro Básico', '2do Básico', '3ro Básico'],
  'Diversificado': ['4to Diversificado', '5to Diversificado', '6to Diversificado']
};

// Secciones disponibles
export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Roles de grupo
export const GROUP_ROLES = [
  { value: 'planner', label: 'Planner (Planificador)' },
  { value: 'maker', label: 'Maker (Creador)' },
  { value: 'speaker', label: 'Speaker (Presentador)' },
  { value: 'helper', label: 'Helper (Ayudante)' }
];

// Criterios de evaluación
export const EVALUATION_CRITERIA = [
  { id: 1, name: 'Creatividad e Innovación', max_score: 20 },
  { id: 2, name: 'Claridad de Presentación', max_score: 20 },
  { id: 3, name: 'Funcionalidad del Proyecto', max_score: 20 },
  { id: 4, name: 'Trabajo en Equipo', max_score: 20 },
  { id: 5, name: 'Impacto Social', max_score: 20 }
];

// 5. Los datos de INSIGNIAS (BADGES) y RETOS (MONTHLY_CHALLENGES)
// han sido movidos a js/data/badges.js y js/data/challenges.js
// para mejorar la organización del proyecto.

console.log('✅ config.js cargado correctamente (Core Config Only)');
