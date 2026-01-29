// ================================================
// SERVICE WORKER - PROJECTX PWA
// ================================================

const CACHE_NAME = 'projectx-v1.0.3';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/sync-manager.js',
  '/js/auth.js',
  '/js/main.js',
  '/js/students.js',
  '/js/teachers.js',
  '/js/schools.js',
  '/js/groups.js',
  '/js/projects.js',
  '/js/evaluation.js',
  '/js/profile.js',
  '/js/ranking.js',
  '/js/badges.js',
  '/js/csv.js',
  '/js/pdf-processor.js',
  '/js/attendance.js',
  '/js/admin-dashboard.js',
  '/js/admin-reports.js',
  '/js/admin-success.js',
  '/js/admin-evaluations.js',
  '/js/admin-attendance.js',
  '/js/attendance-summary-view.js',
  '/js/team-performance-widget.js',
  '/js/kpi-engine.js',
  '/js/activity-tracker.js',
  '/js/ai-service.js',
  '/js/mascot-widget.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: Instalando v1.0.3...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Caché abierto');
        return cache.addAll(urlsToCache);
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
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de caché: Network First, fallback a Cache
self.addEventListener('fetch', event => {
  const { request } = event;

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar requests de Supabase (siempre necesitan red)
  if (request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // Si la respuesta es válida, guardar en caché
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, buscar en caché
        return caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('📂 Sirviendo desde caché:', request.url);
            return cachedResponse;
          }

          // Si no está en caché, mostrar página offline para documentos o un error para otros
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }

          // MUY IMPORTANTE: Retornar una respuesta de error válida en lugar de undefined
          return new Response('Network error and no cache available', {
            status: 404,
            statusText: 'Not Found'
          });
        });
      })
  );
});

// Escuchar mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ Service Worker cargado');
