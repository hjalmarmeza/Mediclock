// sw.js - Service Worker para MediClock Neo
const CACHE_NAME = 'mediclock-neo-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalación: cachear recursos esenciales
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caché abierto, agregando recursos');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Instalación completa');
        return self.skipWaiting(); // Activar inmediatamente
      })
  );
});

// Activación: limpiar cachés antiguos
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Borrando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Listo para controlar clientes');
      return self.clients.claim(); // Tomar control inmediato
    })
  );
});

// Estrategia: cache-first con fallback a red
self.addEventListener('fetch', event => {
  // Ignorar solicitudes no-GET
  if (event.request.method !== 'GET') return;

  // Ignorar solicitudes a APIs externas (sonidos, imágenes, etc.)
  if (event.request.url.startsWith('http') && !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si está en caché, devolverlo
        if (response) {
          return response;
        }

        // Si no, ir a red
        return fetch(event.request).then(networkResponse => {
          // No cachear errores o respuestas no válidas
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Cachear respuesta válida
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseToCache))
            .catch(err => console.warn('[SW] Error al cachear:', err));

          return networkResponse;
        }).catch(() => {
          // Si falla red y no hay caché, devolver index.html (offline fallback)
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// 👇 Opcional: si en el futuro usas notificaciones push, descomenta esto
/*
self.addEventListener('push', event => {
  // ... tu lógica de push aquí
});

self.addEventListener('notificationclick', event => {
  // ... tu lógica de clic aquí
});
*/
