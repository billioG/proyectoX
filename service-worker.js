// ================================================
// SERVICE WORKER - PROJECTX PWA
// ================================================

const CACHE_NAME = 'projectx-v1.0.54';
// Caché de archivos de lecciones (video/PDF/imagen/paquetes SCORM-H5P) --
// separada de CACHE_NAME a propósito: CACHE_NAME se recrea y se BORRA
// entera en cada deploy (bump de versión) para forzar JS/CSS frescos, pero
// eso mismo borraría todo el contenido offline descargado por el alumno si
// compartiera el mismo nombre. Esta NO se toca en "activate" salvo que
// cambie la estrategia de cacheo en sí (no en cada feature nueva).
const MEDIA_CACHE_NAME = 'projectx-media-v1';
// Rutas RELATIVAS (sin "/" inicial) -- con "/" apuntaban siempre a la raíz
// del dominio, lo cual rompe el sitio cuando se sirve desde un subpath
// (ej. billiog.github.io/proyectoX/) porque pedía billiog.github.io/js/...
// en vez de billiog.github.io/proyectoX/js/... (404 silencioso en cada
// archivo, visible en Network como "Initiator: service-worker.js").
// Lista corta a propósito: el resto de los archivos se cachean solos en
// tiempo de ejecución vía el handler `fetch` de abajo (network-first).
// BUG REAL encontrado en producción: cada bump de versión borra CACHE_NAME
// entero en "activate", pero los módulos lazy-loaded (loadModule() en
// main.js, ej. lessons.js) NO estaban en esta lista -- solo se cacheaban
// "al vuelo" la primera vez que alguien navegaba a esa vista CON internet
// DESPUÉS del último deploy. Un alumno que descargó un curso para offline
// pero no volvió a abrir "Cursos" con internet tras el deploy siguiente se
// encontraba con "error al cargar componentes" al perder la red: el
// archivo js/lessons.js de la versión nueva nunca había llegado a
// cachearse. Ahora se precachean TODOS los módulos lazy de MODULE_MAP
// (main.js) en cada instalación, con el mismo ?v= que usa loadModule() --
// si no, el request real (con query de versión) no matchea esta entrada.
const APP_VERSION = CACHE_NAME.replace('projectx-', '');
const LAZY_MODULES = [
  'js/admin-attendance.js', 'js/admin-dashboard.js', 'js/admin-evaluations.js',
  'js/admin-performance.js', 'js/admin-reports.js', 'js/admin-success.js',
  'js/admin-waivers.js', 'js/attendance-summary-view.js', 'js/attendance.js',
  'js/badges.js', 'js/bonus-system.js', 'js/certificates.js', 'js/companion.js',
  'js/coordinator.js', 'js/data/challenges.js', 'js/debug-duel.js', 'js/duels.js',
  'js/evaluation-modals.js', 'js/evaluation-notifications.js', 'js/evaluation.js',
  'js/feed-ui.js', 'js/gamification.js', 'js/groups.js', 'js/hangman-duel.js',
  'js/kpi-engine.js', 'js/lessons.js', 'js/pdf-processor.js', 'js/practice-quiz.js',
  'js/profile-modals.js', 'js/profile.js', 'js/programs.js', 'js/project-modals.js',
  'js/projects.js', 'js/ranking.js', 'js/reports.js', 'js/schools.js',
  'js/students.js', 'js/teachers.js', 'js/team-performance-widget.js',
  'js/timed-math-duel.js', 'js/tournaments.js',
];

const urlsToCache = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  ...LAZY_MODULES.map(f => `${f}?v=${APP_VERSION}`),
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: Instalando v1.0.3...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Caché abierto');
        // cache.addAll() es todo-o-nada -- si UN solo archivo de la lista
        // (ahora con 40+ módulos lazy) da 404 o falla la red justo en ese
        // momento, la instalación entera del Service Worker fallaría y la
        // app se quedaría SIN ningún soporte offline. Con cache.add() uno
        // por uno y allSettled, un archivo que falle no tumba al resto.
        return Promise.allSettled(urlsToCache.map(url => cache.add(url).catch(e => {
          console.warn('⚠️ No se pudo precachear:', url, e);
        })));
      })
      .then(() => self.skipWaiting())
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker: Activando...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== MEDIA_CACHE_NAME) {
            console.log('🗑️ Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Archivos de lecciones (video/PDF/imagen/paquetes SCORM-H5P) viven en
// Supabase Storage -- se cachean para que el alumno pueda repasar contenido
// ya visto sin conexión (escuelas con internet inestable durante el día).
// El resto de Supabase (REST/Auth/Realtime, notas, progreso) sigue
// SIEMPRE yendo a la red -- cachear eso arriesgaría mostrar datos viejos.
function isSupabaseStorageGet(url) {
  return url.includes('supabase.co') && url.includes('/storage/v1/object/');
}

// Estrategia de caché: Network First, fallback a Cache
self.addEventListener('fetch', event => {
  const { request } = event;

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  const isMedia = isSupabaseStorageGet(request.url);

  // Ignorar el resto de requests de Supabase (siempre necesitan red)
  if (request.url.includes('supabase.co') && !isMedia) {
    return;
  }

  const targetCacheName = isMedia ? MEDIA_CACHE_NAME : CACHE_NAME;

  const fallbackToCache = () => caches.match(request).then(cachedResponse => {
    if (cachedResponse) {
      console.log('📂 Sirviendo desde caché:', request.url);
      return cachedResponse;
    }

    // Si no está en caché, mostrar página offline para documentos o un error para otros
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }

    // MUY IMPORTANTE: Retornar una respuesta de error válida en lugar de undefined
    return new Response('Network error and no cache available', {
      status: 404,
      statusText: 'Not Found'
    });
  });

  event.respondWith(
    fetch(request)
      .then(response => {
        // Si la respuesta es válida, guardar en caché
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(targetCacheName).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        }

        // Respuesta de error (ej. 503 temporal del hosting): un archivo
        // .js roto así tumba TODO el grafo de módulos ES (un solo import
        // estático que falla aborta la carga de app.js completo, aunque
        // no tenga nada que ver con ese archivo). Mejor usar la última
        // copia buena en caché que devolver el error tal cual.
        if (request.destination === 'script' || request.destination === 'document') {
          return fallbackToCache().then(cached => (cached && cached.status !== 404) ? cached : response);
        }

        return response;
      })
      .catch(fallbackToCache)
  );
});

// Escuchar mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ================================================
// PUSH NOTIFICATIONS -- eventos sorpresa nocturnos
// ================================================
self.addEventListener('push', event => {
  let data = { title: 'Quetzal LMS', body: 'Tenés novedades.', url: './' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      // "target" identifica A DÓNDE llevar dentro de la app al hacer clic
      // (ver window.routeNotificationTarget en main.js) -- antes esto no
      // existía y el clic solo enfocaba/abría la pestaña sin navegar a
      // nada puntual.
      data: { url: data.url || './', eventId: data.eventId || null, target: data.target || null },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.target || null;
  let targetUrl = event.notification.data?.url || './';
  if (target) targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'open=' + encodeURIComponent(target);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          // La pestaña ya está abierta -- no navega a targetUrl (recargar
          // rompería el estado de la SPA), así que le avisa por mensaje
          // para que ruteé sin recargar.
          if (target && 'postMessage' in client) client.postMessage({ type: 'PX_NOTIFICATION_CLICK', target });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

console.log('✅ Service Worker cargado');
