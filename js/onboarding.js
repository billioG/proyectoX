// ================================================
// ONBOARDING -- Tour guiado con driver.js (señala elementos reales de la
// UI en vez del carrusel de slides genéricas que había antes). El tour
// navega solo entre las secciones de la plataforma mientras explica.
// ================================================

// Los contenedores de cada vista (#eval-projects-container, #groups-container,
// etc.) ya existen SIEMPRE en el DOM como <div> vacíos -- nav() solo cambia
// su display, y el fetch de datos real corre en una promesa aparte que nav()
// no expone. Esperar solo "existe en el DOM" resolvía al instante contra un
// div de 0x0 antes de que cargara el contenido real: driver.js no podía
// calcular una posición válida y el popover caía siempre a la esquina
// superior izquierda -- y una vez que eso pasaba una vez, el estado interno
// de driver.js quedaba desincronizado para el resto del tour. Por eso ahora
// se espera a que el elemento tenga tamaño real o hijos renderizados.
function waitForSelector(selector, timeout = 5000) {
  return new Promise((resolve) => {
    if (!selector) return resolve(null);
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      const ready = el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.children.length > 0);
      if (ready || Date.now() - start > timeout) return resolve(el);
      setTimeout(check, 120);
    };
    check();
  });
}

// Cada paso puede traer `before` (nav() u otra acción a ejecutar ANTES de
// resaltar su propio elemento) -- se corre al hacer click en "Siguiente"
// del paso anterior, así el elemento ya existe en el DOM cuando driver.js
// intenta encontrarlo.
const STUDENT_TOUR_STEPS = [
  {
    before: () => window.nav('feed'),
    title: '¡Bienvenido a Quetzal LMS! <i class="fas fa-hand-sparkles"></i>',
    description: 'Te muestro rápido cada parte de la plataforma. Podés salir cuando quieras con la X.',
  },
  {
    element: '#nav-est-home',
    title: 'Inicio',
    description: 'Acá volvés siempre a ver los proyectos que suben tus compañeros.',
  },
  {
    element: '#feed-container',
    title: 'Proyectos de la comunidad',
    description: 'Mirá lo que hicieron otros estudiantes y dale like a los que más te gusten.',
  },
  {
    element: '#nav-est-lessons',
    title: 'Cursos',
    description: 'Acá tu docente publica videos, PDFs, actividades interactivas (H5P) y quizzes.',
  },
  {
    before: () => window.nav('lessons'),
    element: '#lessons-container',
    title: 'Tus cursos',
    description: 'Elegí un curso para ver sus recursos en orden -- cada uno se desbloquea al completar el anterior. En cada recurso podés dejar una nota personal (privada) y comentar con tu equipo.',
  },
  {
    element: '#nav-est-upload',
    title: 'Subir Proyecto',
    description: 'Subí el video de tu proyecto para que tu docente lo evalúe.',
  },
  {
    before: () => window.nav('upload'),
    element: '#project-title',
    title: 'Título de tu proyecto',
    description: 'Poné un nombre claro y llamativo -- es lo primero que va a ver la comunidad.',
  },
  {
    element: '#project-description',
    title: 'Inspiración y Retos',
    description: 'Contá qué problema resuelve tu proyecto y qué materiales usaste. Mientras más detalle, mejor lo va a poder evaluar tu docente.',
  },
  {
    element: '#project-bimestre',
    title: 'Bimestre',
    description: 'Elegí el bimestre al que corresponde esta entrega.',
  },
  {
    element: '#project-group',
    title: 'Individual o en equipo',
    description: 'Si trabajaste con tu equipo, seleccionalo acá -- el proyecto va a quedar publicado a nombre de todos.',
  },
  {
    element: '#project-video',
    title: 'Demostración en Video',
    description: 'Subí un video mostrando tu proyecto funcionando (máx 150MB). Es obligatorio para poder publicar.',
  },
  {
    element: '#btn-upload-project',
    title: 'Publicar',
    description: 'Cuando todo esté listo, tocá acá para publicar tu proyecto y que lo vea toda la comunidad.',
  },
  {
    element: '#nav-est-ranking',
    title: 'Ranking',
    description: 'Compará tu score y tus likes con el resto de tu grado y sección.',
  },
  {
    before: () => window.nav('ranking'),
    element: '#ranking-container',
    title: 'Hall de la Fama',
    description: 'Los proyectos con más impacto del bimestre. Los likes los ve todo el mundo, pero el score solo lo ven el dueño, su equipo y el docente.',
  },
  {
    element: '#nav-est-suggestions',
    title: 'Buzón de Sugerencias',
    description: 'Si tenés una idea para mejorar la plataforma, contanosla acá.',
  },
  {
    element: '#announcements-bell',
    title: 'Avisos',
    description: 'Notificaciones de tu docente, encuestas y respuestas a tus comentarios -- el punto rojo indica que hay algo nuevo sin ver.',
  },
  {
    element: '#open-game-center-btn',
    title: 'Centro de Juego',
    description: 'Retá a un compañero a un Duelo 1v1 apostando gemas y mirá cómo evoluciona tu mascota con las que ganás.',
  },
  {
    element: '#mascot-widget-container',
    // La mascota fuerza pointer-events:auto !important sobre sí misma (para
    // que siempre se pueda tocar), lo que gana incluso a disableActiveInteraction.
    // Con side:'right' (default) el popover y su botón "Listo" quedaban
    // encima del propio widget en la esquina inferior derecha -- el click
    // en "Listo" lo interceptaba la mascota (abría su chat) en vez de
    // cerrar el tour, y solo la X (arriba del popover) funcionaba.
    side: 'left',
    title: 'Tu mascota',
    description: 'Te acompaña, te motiva y podés hablarle -- es tu coach educativo y emocional. Tocala cuando quieras.',
  },
];

const TEACHER_TOUR_STEPS = [
  {
    before: () => window.nav('feed'),
    title: '¡Bienvenido, Docente! <i class="fas fa-hand-sparkles"></i>',
    description: 'Te muestro cada sección para que aproveches la plataforma desde el día uno.',
  },
  {
    element: '#nav-doc-home',
    title: 'Inicio',
    description: 'Tu resumen: evidencia semanal, informe mensual y el reto docente del mes.',
  },
  {
    element: '#challenge-indicator-slot',
    title: 'Reto del Mes',
    description: 'Cada mes hay un reto de crecimiento profesional -- respondelo con una reflexión concreta para ganar XP extra.',
  },
  {
    element: '#nav-doc-lessons',
    title: 'Cursos',
    description: 'Armá cursos con videos, PDFs, actividades interactivas (H5P), SCORM y quizzes para tus clases.',
  },
  {
    before: () => window.nav('lessons'),
    element: '#lessons-container',
    title: 'Gestioná tus cursos',
    description: 'Creá recursos, ordenalos, y previsualizalos como los ve el alumno. También podés compartir un curso con otros docentes desde la Biblioteca Compartida.',
  },
  {
    element: '#nav-doc-evaluate',
    title: 'Evaluar Proyectos',
    description: 'Calificá los proyectos que suben tus estudiantes con una rúbrica.',
  },
  {
    before: () => window.nav('evaluate'),
    element: '#eval-projects-container',
    title: 'Cola de evaluación',
    description: 'Los proyectos pendientes aparecen acá. Evaluar equipos DISTINTOS es lo que cuenta para tu métrica mensual -- evaluar varios proyectos del mismo equipo no suma más de una vez.',
  },
  {
    element: '#nav-doc-groups',
    title: 'Gestionar Equipos',
    description: 'Armá los equipos de proyecto de tu clase, a mano o automático.',
  },
  {
    before: () => window.nav('groups'),
    element: '#groups-container',
    title: 'Tus equipos',
    description: 'Cada equipo puede subir proyectos juntos y comentar en los recursos del curso.',
  },
  {
    element: '#nav-doc-attendance',
    title: 'Tomar Asistencia',
    description: 'Pasá lista por código QR en cada sesión de clase.',
  },
  {
    before: () => window.nav('attendance'),
    element: '#attendance-container',
    title: 'Asistencia',
    description: 'Generá el QR de la sesión y mirá el historial de tus clases.',
  },
  {
    element: '#nav-doc-students',
    title: 'Gestionar Estudiantes',
    description: 'Consultá y editá los datos de tus alumnos.',
  },
  {
    before: () => window.nav('students'),
    element: '#students-container',
    title: 'Tus alumnos',
    description: 'Buscá por nombre, usuario o CUI, y filtrá por clase.',
  },
  {
    element: '#nav-doc-ranking',
    title: 'Ranking',
    description: 'El Hall de la Fama de proyectos, filtrable por establecimiento, grado y bimestre.',
  },
  {
    before: () => window.nav('ranking'),
    element: '#ranking-container',
    title: 'Hall de la Fama',
    description: 'Como docente ves el score real de todos los equipos de tu clase, no solo los tuyos.',
  },
  {
    element: '#nav-doc-bonus',
    title: 'Bonos y Desempeño',
    description: 'Seguí tu XP mensual, tus insignias y el estado de tu bono comodín.',
  },
  {
    before: () => window.nav('bonus-system'),
    element: '#main-content-area-bonus',
    title: 'Tu desempeño',
    description: 'Asistencia, evaluación, evidencia semanal e informe mensual -- cada uno con su propia meta.',
  },
  {
    element: '#announcements-bell',
    title: 'Avisos',
    description: 'Notificaciones de administración, encuestas y respuestas a tus comentarios.',
  },
  {
    element: '#mascot-widget-container',
    // La mascota fuerza pointer-events:auto !important sobre sí misma (para
    // que siempre se pueda tocar), lo que gana incluso a disableActiveInteraction.
    // Con side:'right' (default) el popover y su botón "Listo" quedaban
    // encima del propio widget en la esquina inferior derecha -- el click
    // en "Listo" lo interceptaba la mascota (abría su chat) en vez de
    // cerrar el tour, y solo la X (arriba del popover) funcionaba.
    side: 'left',
    title: 'Tu mascota',
    description: 'Te acompaña y te da apoyo -- tocala cuando quieras hablar con ella.',
  },
];

// En móvil el sidebar vive fuera de pantalla (transform: translateX) salvo
// que el usuario lo abra con el botón hamburguesa -- driver.js no puede
// resaltar un elemento que está trasladado fuera del viewport, así que el
// spotlight fallaba silenciosamente y solo se veía el globo de texto
// flotando. Se abre/cierra el sidebar según lo que necesite cada paso, y
// se espera a que termine la transición CSS antes de medir la posición.
async function syncMobileSidebarForSelector(selector) {
  if (window.innerWidth > 768) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const toggle = document.getElementById('mobile-menu-btn');
  const shouldBeOpen = !!selector && selector.startsWith('#nav-');
  const isOpen = sidebar.classList.contains('active');
  if (shouldBeOpen === isOpen) return;

  if (shouldBeOpen) {
    sidebar.classList.add('active');
    if (toggle) toggle.innerHTML = '<i class="fas fa-times"></i>';
  } else {
    sidebar.classList.remove('active');
    if (toggle) toggle.innerHTML = '<i class="fas fa-bars"></i>';
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
}

// driver.js llama a onNextClick() SIN ARGUMENTOS (no manda {element, step,
// driver} como parecía sugerir la documentación) -- el código anterior
// desestructuraba `opts.driver` de un `opts` undefined, tiraba un
// TypeError silencioso ANTES de llegar a moveNext(), y driver.js se quedaba
// recalculando el highlight del elemento VIEJO (ya oculto por el nav() que
// sí llegó a correr) -- de ahí que todo cayera a la esquina superior
// izquierda. Se resuelve pasando la instancia por closure en vez de por
// argumento.
function buildDriverSteps(rawSteps, getDriverObj) {
  return rawSteps.map((s, i) => {
    const next = rawSteps[i + 1];
    return {
      element: s.element || undefined,
      popover: {
        title: s.title,
        description: s.description,
        side: s.side || 'right',
        align: 'start',
        // driver.js SOLO lee onNextClick/onPrevClick/onCloseClick anidados
        // dentro de `popover` (ver su función interna L(): `t?.popover
        // ?.onNextClick`) -- puesto al nivel del step (como estaba antes)
        // nunca se ejecuta y cae al avance por default, que solo mueve el
        // índice sin correr `before()` ni esperar que el elemento del
        // siguiente paso exista. Resultado: cualquier paso que dependiera
        // de un nav() previo (ir a Cursos, Ranking, etc.) se quedaba con el
        // popover flotando sin resaltar nada, porque la vista real nunca
        // cambiaba.
        onNextClick: next ? async () => {
          if (typeof next.before === 'function') {
            try { next.before(); } catch (e) { console.error('Error en paso de onboarding:', e); }
          }
          await syncMobileSidebarForSelector(next.element);
          await waitForSelector(next.element, 5000);
          getDriverObj().moveNext();
        } : undefined,
      },
    };
  });
}

async function runGuidedTour(rawSteps) {
  if (typeof window.driver === 'undefined') {
    console.warn('driver.js todavía no cargó -- no se pudo mostrar el tour');
    return;
  }

  // initOnboarding() puede dispararse más de una vez para el mismo login
  // (ej. auto-login con sesión cacheada + el propio submit del form, o un
  // re-render disparado por el service worker) -- sin este guard, cada
  // llamada creaba su PROPIA instancia de driver.js corriendo en paralelo,
  // cada una resaltando un paso distinto de la misma lista al mismo tiempo
  // (visible como dos popovers superpuestos, ej. "11 de 12" y "12 de 12"
  // a la vez).
  if (window._onboardingTourActive) return;
  window._onboardingTourActive = true;

  // El primer paso puede necesitar su propio `before` (ej. asegurar que
  // arrancamos en "feed") antes de que driver.js empiece a resaltar nada.
  if (typeof rawSteps[0]?.before === 'function') {
    try { rawSteps[0].before(); } catch (e) { console.error(e); }
    await waitForSelector(rawSteps[0].element, 2000);
  }

  let driverObj;
  driverObj = window.driver.js.driver({
    showProgress: true,
    allowClose: true,
    // driver.js deja pasar clicks al elemento resaltado por default. En los
    // pasos que resaltan un ítem de menú real (#nav-est-lessons, etc.) el
    // usuario tiende a clickear el propio menú en vez de "Siguiente" -- eso
    // navega la app de verdad pero el tour no se entera y avanza, así que
    // se queda resaltando el ítem del menú sin nunca mostrar la info del
    // siguiente paso. Se bloquea la interacción con el elemento resaltado
    // para forzar el flujo por "Siguiente".
    disableActiveInteraction: true,
    overlayColor: 'rgb(2, 6, 23)',
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Atrás',
    doneBtnText: '¡Listo! <i class="fas fa-rocket"></i>',
    progressText: '{{current}} de {{total}}',
    onDestroyed: () => { window._onboardingTourActive = false; completeOnboarding(); },
    steps: buildDriverSteps(rawSteps, () => driverObj),
  });

  driverObj.drive();
}

function shouldShowOnboarding() {
  const user = window.currentUser;
  if (!user) return false;
  const key = `onboarding_seen_${user.id}`;
  return !localStorage.getItem(key);
}

// Punto de entrada único, tanto para el disparo automático (primera vez)
// como para "Ver tutorial de nuevo" desde el perfil -- ya no hace falta
// recargar la página para volver a correr el tour.
window.startOnboardingTour = function startOnboardingTour() {
  const steps = window.userRole === 'estudiante' ? STUDENT_TOUR_STEPS : TEACHER_TOUR_STEPS;
  runGuidedTour(steps);
};

function completeOnboarding() {
  const userId = window.currentUser?.id;
  if (userId) localStorage.setItem(`onboarding_seen_${userId}`, 'true');
}

function resetOnboarding() {
  const userId = window.currentUser?.id;
  if (!userId) {
    if (typeof window.showToast === 'function') window.showToast('<i class="fas fa-triangle-exclamation"></i> Error: Usuario no identificado', 'error');
    return;
  }
  localStorage.removeItem(`onboarding_seen_${userId}`);
  window.startOnboardingTour();
}

function initOnboarding() {
  // Solo aplica a estudiante y docente -- el admin no tiene tour (fuera de alcance).
  if (window.userRole !== 'estudiante' && window.userRole !== 'docente') return;
  if (shouldShowOnboarding()) {
    setTimeout(() => window.startOnboardingTour(), 1500);
  }
}

window.completeOnboarding = completeOnboarding;
window.resetOnboarding = resetOnboarding;
window.initOnboarding = initOnboarding;

console.log('✅ onboarding.js (driver.js) cargado correctamente');
