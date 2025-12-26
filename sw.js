self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Hora de medicación',
    icon: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'mediclock-alarm',
    requireInteraction: true,
    data: data,
    actions: [
      { action: 'take', title: '✓ Tomado', icon: '/icon-take.png' },
      { action: 'close', title: 'Cerrar', icon: '/icon-close.png' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MediClock Neo', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  
  if (action === 'take') {
    // Enviar mensaje a la app para registrar la toma
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          if (clientList.length > 0) {
            let client = clientList[0];
            for (let i = 0; i < clientList.length; i++) {
              if (clientList[i].focused) {
                client = clientList[i];
              }
            }
            // Enviar mensaje a la ventana
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              action: 'take',
              data: event.notification.data
            });
            return client.focus();
          }
          return clients.openWindow('/');
        })
    );
  } else {
    // Abrir la app normalmente
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          if (clientList.length > 0) {
            let client = clientList[0];
            for (let i = 0; i < clientList.length; i++) {
              if (clientList[i].focused) {
                client = clientList[i];
              }
            }
            return client.focus();
          }
          return clients.openWindow('/');
        })
    );
  }
});
