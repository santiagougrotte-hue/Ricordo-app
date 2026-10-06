// Service worker del panel: muestra los avisos de pedidos nuevos aunque el panel esté cerrado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ricordo', {
    body: d.body || 'Entró un pedido nuevo.',
    tag: d.tag,
    renotify: !!d.tag,
    icon: '/admin-icon-192.png',
    badge: '/admin-badge.png',
    data: { url: d.url || '/admin/pedidos' },
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin/pedidos', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith('/admin')) {
        await w.focus();
        if ('navigate' in w) await w.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
