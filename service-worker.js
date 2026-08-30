// ================================================
// SERVICE WORKER - PROJECTX PWA
// ================================================

const CACHE_NAME = 'projectx-v1.0.42';
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
