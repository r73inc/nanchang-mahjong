/**
 * Nanchang Mahjong — Service Worker
 *
 * Handles:
 *   fetch             → pass-through (required for PWA installability)
 *   push              → show a notification
 *   notificationclick → focus the matching game tab or open the app
 *   pushsubscriptionchange → re-subscribe when the push endpoint expires
 */

/* eslint-disable no-restricted-globals */

// Pass-through fetch handler — required for Chrome to consider the PWA installable.
// No caching strategy yet; offline support can be layered on top in Phase 12B.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  /** @type {{ title?: string; body?: string; gameId?: string }} */
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Nanchang Mahjong';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.gameId ? `game-${data.gameId}` : 'nanchang',
    renotify: true,
    data: { gameId: data.gameId },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const gameId = event.notification.data && event.notification.data.gameId;
  const targetUrl = gameId ? `/game/${gameId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already showing this game, focus it.
      for (const client of clientList) {
        if (gameId && client.url.includes(gameId) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The push service rotated our endpoint — re-subscribe using the same options
  // and push the new subscription to the API so the server stays in sync.
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((newSub) =>
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSub.toJSON()),
        credentials: 'include',
      }),
    ),
  );
});
