// ================================================
// SISTEMA DE ONBOARDING - ProjectX
// ================================================

// Slides para Estudiantes
const STUDENT_ONBOARDING_SLIDES = [
  {
    icon: '🚀',
    title: '¡Bienvenido Estudiante!',
    description: 'ProjectX es tu espacio para mostrar tus talentos, aprender haciendo y competir sanamente.',
    color: 'linear-gradient(135deg, #00bcd4 0%, #00acc1 100%)'
  },
  {
    icon: '📤',
    title: 'Sube tus Proyectos',
    description: 'Comparte videos de tus creaciones. ¡Cada proyecto te ayuda a mejorar!',
    features: [
      '✅ Graba y sube tus videos',
      '✅ Describe tu trabajo',
      '✅ Gana puntos de experiencia (XP)',
      '✅ Desbloquea insignias'
    ],
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  },
  {
    icon: '🏆',
    title: 'Ranking y Metas',
    description: 'Mira cómo vas en comparación con otros y alcanza el primer lugar.',
    features: [
      '📊 Ranking por grado y sección',
      '🏅 Comparativa global',
      '✨ Niveles de usuario',
      '🎁 Recompensas digitales'
    ],
    color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
  },
  {
    icon: '✨',
    title: '¡A Innovar!',
    description: 'Estás listo para comenzar tu viaje en ProjectX. ¡El cielo es el límite!',
    cta: true,
    color: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
  }
];

// Slides para Docentes y Admins
const TEACHER_ONBOARDING_SLIDES = [
  {
    icon: '👨‍🏫',
    title: '¡Bienvenido, Docente!',
    description: 'ProjectX es tu herramienta aliada para la gestión académica y el seguimiento de proyectos.',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  {
    icon: '📋',
    title: 'Gestión y Evaluación',
    description: 'Administra tus grupos y evalúa el desempeño de tus estudiantes de forma sencilla.',
    features: [
      '✅ Crea y edita grupos de trabajo',
      '✅ Evalúa proyectos con rúbricas',
      '✅ Toma asistencia digital',
      '✅ Gestiona datos de alumnos'
    ],
    color: 'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)'
  },
  {
    icon: '📈',
    title: 'Analítica en Tiempo Real',
    description: 'Visualiza reportes de asistencia y rendimiento académico de manera instantánea.',
    features: [
      '📊 Reportes de participación',
      '📉 Alertas de bajo rendimiento',
      '📅 Historial de asistencia',
      '🎓 Dashboard administrativo'
    ],
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  },
  {
    icon: '✨',
    title: '¡Transformemos la Educación!',
    description: 'Ya puedes empezar a gestionar tus secciones y motivar a tus estudiantes.',
    cta: true,
    color: 'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)'
  }
];

let ACTIVE_SLIDES = [];

function shouldShowOnboarding() {
  if (!currentUser) {
    console.warn('⚠️ No hay usuario actual para verificar onboarding');
    return false;
  }

  // La combinación de id de usuario y localStorage garantiza que se muestre en cada dispositivo nuevo
  const key = `onboarding_seen_${currentUser.id}`;
  const hasSeenOnboarding = localStorage.getItem(key);

  console.log(`🧐 Verificando onboarding para ${currentUser.id}: ${hasSeenOnboarding ? 'VISTO' : 'PENDIENTE'}`);
  return !hasSeenOnboarding;
}

function showOnboarding() {
  if (!shouldShowOnboarding()) {
    return;
  }

  // Establecer slides según el rol
  if (userRole === 'estudiante') {
    ACTIVE_SLIDES = STUDENT_ONBOARDING_SLIDES;
  } else {
    ACTIVE_SLIDES = TEACHER_ONBOARDING_SLIDES;
  }

  console.log('🚀 Mostrando onboarding...');
  const modal = document.createElement('div');
  modal.className = 'modal active onboarding-modal';
  modal.id = 'onboarding-modal';
  modal.style.zIndex = '10000';

  modal.innerHTML = `
    <div class="onboarding-container">
      <div class="onboarding-content">
        <button class="onboarding-skip" onclick="skipOnboarding()">
          Saltar <i class="fas fa-times"></i>
        </button>
        
        <div class="onboarding-slides" id="onboarding-slides">
          <!-- Las slides se generarán dinámicamente -->
        </div>

        <div class="onboarding-navigation">
          <button class="btn-secondary" id="onboarding-prev" onclick="previousSlide()" style="visibility: hidden;">
            <i class="fas fa-chevron-left"></i> Anterior
          </button>
          
          <div class="onboarding-dots" id="onboarding-dots">
            <!-- Los dots se generarán dinámicamente -->
          </div>
          
          <button class="btn-primary" id="onboarding-next" onclick="nextSlide()">
            Siguiente <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Generar slides
  generateSlides();

  // Mostrar primera slide
  currentSlideIndex = 0;
  showSlide(0);
}

let currentSlideIndex = 0;

function generateSlides() {
  const slidesContainer = document.getElementById('onboarding-slides');
  const dotsContainer = document.getElementById('onboarding-dots');

  if (!slidesContainer || !dotsContainer) return;

  slidesContainer.innerHTML = ACTIVE_SLIDES.map((slide, index) => `
    <div class="onboarding-slide" data-index="${index}" style="display: none;">
      <div class="onboarding-slide-header" style="background: ${slide.color};">
        <div class="onboarding-icon">${slide.icon}</div>
      </div>
      
      <div class="onboarding-slide-body">
        <h2 class="onboarding-title">${slide.title}</h2>
        <p class="onboarding-description">${slide.description}</p>
        
        ${slide.features ? `
          <div class="onboarding-features">
            ${slide.features.map(feature => `
              <div class="onboarding-feature">
                <span>${feature}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${slide.cta ? `
          <div style="margin-top: 30px;">
            <button class="btn-primary btn-lg" onclick="completeOnboarding()" style="font-size: 1.1rem; padding: 15px 40px;">
              <i class="fas fa-rocket"></i> ¡Empezar Ahora!
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  dotsContainer.innerHTML = ACTIVE_SLIDES.map((_, index) => `
    <span class="onboarding-dot" data-index="${index}" onclick="goToSlide(${index})"></span>
  `).join('');
}

function showSlide(index) {
  const slides = document.querySelectorAll('.onboarding-slide');
  const dots = document.querySelectorAll('.onboarding-dot');
  const prevBtn = document.getElementById('onboarding-prev');
  const nextBtn = document.getElementById('onboarding-next');

  // Ocultar todas las slides
  slides.forEach(slide => slide.style.display = 'none');

  // Mostrar slide actual
  if (slides[index]) {
    slides[index].style.display = 'block';
    slides[index].style.animation = 'slideIn 0.5s ease-out';
  }

  // Actualizar dots
  dots.forEach((dot, i) => {
    if (i === index) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Actualizar botones de navegación
  if (index === 0) {
    prevBtn.style.visibility = 'hidden';
  } else {
    prevBtn.style.visibility = 'visible';
  }

  if (index === ACTIVE_SLIDES.length - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = 'block';
    nextBtn.innerHTML = 'Siguiente <i class="fas fa-chevron-right"></i>';
  }

  currentSlideIndex = index;
}

function nextSlide() {
  if (currentSlideIndex < ACTIVE_SLIDES.length - 1) {
    showSlide(currentSlideIndex + 1);
  }
}

function previousSlide() {
  if (currentSlideIndex > 0) {
    showSlide(currentSlideIndex - 1);
  }
}

function goToSlide(index) {
  showSlide(index);
}

function skipOnboarding() {
  if (confirm('¿Estás seguro de que quieres saltar el tutorial? Puedes verlo más tarde desde tu perfil.')) {
    completeOnboarding();
  }
}

function completeOnboarding() {
  // Marcar como visto
  localStorage.setItem(`onboarding_seen_${currentUser?.id}`, 'true');

  // Cerrar modal con animación
  const modal = document.getElementById('onboarding-modal');
  if (modal) {
    modal.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      modal.remove();
      showToast('✅ ¡Bienvenido a ProjectX!', 'success');
    }, 300);
  }
}

function resetOnboarding() {
  console.log('🔄 Reiniciando onboarding...');
  if (!currentUser) {
    showToast('⚠️ Error: Usuario no identificado', 'error');
    return;
  }
  const key = `onboarding_seen_${currentUser.id}`;
  localStorage.removeItem(key);
  showOnboarding();
}

// Inicializar onboarding cuando el usuario inicia sesión
function initOnboarding() {
  // Esperar un poco después del login para mostrar el onboarding
  setTimeout(() => {
    if (shouldShowOnboarding()) {
      showOnboarding();
    }
  }, 1000);
}

console.log('✅ onboarding.js cargado correctamente');
