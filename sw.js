// Service Worker para MediClock NEO - Alarmas en background
const CACHE_NAME = 'mediclock-neo-v1';

// Instalación
self.addEventListener('install', event => {
    console.log('🚀 Service Worker MediClock NEO instalado');
    self.skipWaiting();
});

// Activación
self.addEventListener('activate', event => {
    console.log('✅ Service Worker MediClock NEO activo');
    event.waitUntil(clients.claim());
});

// Background Sync - Para alarmas periódicas
self.addEventListener('sync', event => {
    if (event.tag === 'check-meds-background') {
        console.log('⏰ Background Sync ejecutando...');
        event.waitUntil(triggerAlarmCheck());
    }
});

// Función principal para revisar alarmas
async function triggerAlarmCheck() {
    try {
        // Enviar mensaje a todas las pestañas abiertas
        const allClients = await self.clients.matchAll();
        
        if (allClients.length > 0) {
            // Hay pestañas abiertas - pedirles que revisen alarmas
            allClients.forEach(client => {
                client.postMessage({
                    type: 'TRIGGER_ALARM_CHECK',
                    timestamp: Date.now()
                });
            });
        } else {
            // No hay pestañas abiertas - mostrar notificación directamente
            await showBackgroundNotification();
        }
    } catch (error) {
        console.error('Error en background check:', error);
    }
}

// Mostrar notificación desde el Service Worker
async function showBackgroundNotification() {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    await self.registration.showNotification('💊 MediClock NEO', {
        body: `Revisión de alarmas: ${timeStr}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
        vibrate: [200, 100, 200],
        tag: 'background-check',
        requireInteraction: false
    });
}

// Manejar mensajes desde la app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'ALARM_TRIGGERED') {
        console.log('Alarma activada desde app:', event.data);
        // Podrías guardar en IndexedDB o enviar push notification
    }
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    // Abrir la app cuando se hace click en la notificación
    event.waitUntil(
        clients.openWindow('/')
    );
});

// Cache básico para funcionamiento offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Devuelve del cache si existe, sino hace fetch
                return response || fetch(event.request);
            })
    );
});
