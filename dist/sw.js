/* Nirapotta Service Worker — CAP alert push notifications */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CAP_ALERT') {
    const { identifier, headline, instruction, severity, event: eventName } = event.data;

    const vibrationMap = {
      Extreme: [200, 100, 200, 100, 200],
      Severe:  [200, 100, 200],
      Moderate: [200],
      Minor:   [100],
    };

    self.registration.showNotification(headline || eventName || 'Emergency Alert', {
      body: instruction || 'Check the app for details.',
      icon: '/vite.svg',
      badge: '/vite.svg',
      vibrate: vibrationMap[severity] || [200],
      requireInteraction: severity === 'Extreme' || severity === 'Severe',
      tag: identifier,
      data: { identifier, severity },
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/community');
    })
  );
});
