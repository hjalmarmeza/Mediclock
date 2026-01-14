self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('Service Worker instalado');
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  console.log('Service Worker activado');
});

// Background Sync para verificación de alarmas
self.addEventListener('sync', event => {
  if (event.tag === 'alarm-check') {
    event.waitUntil(checkAlarmsInBackground());
  }
});

async function checkAlarmsInBackground() {
  console.log('🔄 Verificando alarmas en segundo plano');

  // Obtener medicamentos del almacenamiento
  const clientsList = await clients.matchAll();
  for (const client of clientsList) {
    client.postMessage({ type: 'CHECK_ALARMS' });
  }
}

// Notificaciones push
self.addEventListener('push', event => {
  console.log('Push recibido:', event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.log('Error parsing push data:', e);
  }

  const options = {
    body: data.body || 'Hora de medicación',
    icon: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'mediclock-alarm',
    requireInteraction: true,
    renotify: true,
    silent: false,
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

// Manejo de clics en notificaciones
self.addEventListener('notificationclick', event => {
  console.log('Notificación clickeada:', event.notification.tag);
  event.notification.close();

  const action = event.action;

  if (action === 'take') {
    // Enviar mensaje a la app para registrar la toma
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          if (clientList.length > 0) {
            const client = clientList[0];
            client.postMessage({
              type: 'TAKE_MEDICATION',
              data: event.notification.data
            });
            return client.focus();
          }
          return clients.openWindow('/');
        })
    );
  } else {
    // Abrir la app
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

// Manejo de mensajes desde la app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'TRIGGER_ALARM') {
    const meds = event.data.meds || [];
    const count = meds.length;
    let body = event.data.body || 'Hora de medicación';
    if (count > 0) {
      body = `Tomar: ${meds.map(m => m.nombre).join(', ')}`;
    }

    const vibrationPattern = [500, 100, 500, 100, 500, 100, 1000, 200, 1000, 200, 500, 100, 500, 100, 500];

    event.waitUntil(
      self.registration.showNotification(event.data.title || '🚨 ALARMA MEDICLOCK', {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png',
        vibrate: vibrationPattern,
        tag: 'mediclock-alarm-urgent',
        requireInteraction: true,
        renotify: true,
        data: event.data,
        actions: [
          { action: 'take', title: '✓ MARCAR COMO TOMADO' },
          { action: 'close', title: 'Cerrar Alerta' }
        ]
      })
    );
  }
});

