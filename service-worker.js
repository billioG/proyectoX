// ================================================
// SERVICE WORKER - PROJECTX PWA
// ================================================

const CACHE_NAME = 'projectx-v1.0.4';
// Rutas RELATIVAS (sin "/" inicial) -- con "/" apuntaban siempre a la raíz
// del dominio, lo cual rompe el sitio cuando se sirve desde un subpath
// (ej. billiog.github.io/proyectoX/) porque pedía billiog.github.io/js/...
// en vez de billiog.github.io/proyectoX/js/... (404 silencioso en cada
// archivo, visible en Network como "Initiator: service-worker.js").
// Lista corta a propósito: el resto de los archivos se cachean solos en
// tiempo de ejecución vía el handler `fetch` de abajo (network-first).
const urlsToCache = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
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
            return caches.match('./index.html');
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
