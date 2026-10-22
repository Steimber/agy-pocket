const CACHE_NAME = 'agy-pocket-v3';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});

self.addEventListener('push', event => {
  let payload = {
    title: 'Antigravity',
    body: 'Tarea completada en tu PC.',
    conversationId: null,
    tag: 'agy-task-done'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Antigravity', {
      body: payload.body || 'Tarea completada en tu PC.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'agy-task-done',
      renotify: true,
      data: {
        conversationId: payload.conversationId || null
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const convId = event.notification.data?.conversationId || '';
  const targetUrl = convId
    ? `/?conversationId=${encodeURIComponent(convId)}`
    : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'AGY_OPEN_CONVERSATION',
              conversationId: convId
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      })
  );
});
