/*
  [2.36.5] Сетевой fetch для навигаций (HTML) в обход кэша +
           очистка всех старых кэшей на activate.
           Закрывает класс багов «застряли на boot splash из-за
           устаревшего Service Worker / disk cache у Android Chrome».
  [2.32.18] push → postMessage всем живым окнам PWA, чтобы поставили бейдж
            (iOS не даёт setAppBadge из SW — только из окна)
  [2.19.0] Web Push: слушаем push, показываем уведомление, обновляем бейдж.
  [2.28.0] Service Worker для PWA.
*/

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // [2.36.5] Сносим все старые кэши без исключений.
    // Раньше кэша не было, но если что-то завалялось от старых
    // версий — оно мешает. Удаление чужого кэша безопасно.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch { /* noop */ }

    await self.clients.claim();
  })());
});

/*
  [2.36.5] Для HTML-навигаций — fetch с no-store.
  Chrome не отдаёт HTML из кэша, а идёт в сеть. Остальные запросы
  пропускаем как раньше — браузер работает штатно.
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigate =
    req.mode === 'navigate' ||
    req.destination === 'document';

  if (isNavigate) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => fetch(req))
    );
    return;
  }

  // Прочие запросы — как есть, без вмешательства.
});

/* ===== [2.19.0] PUSH ===== */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'banjoboy\'s crew', body: 'Новое сообщение' };
  }

  const title = data.title || "banjoboy's crew";
  const body = data.body || 'Новое сообщение';
  const url = data.url || '/';
  const tag = data.tag || 'crew-msg';

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      data: { url },
      renotify: true,
    });

    try {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      clientList.forEach(c => c.postMessage({ type: 'push-received' }));
    } catch { /* noop */ }
  })());
});

/* ===== [2.19.0] КЛИК ПО УВЕДОМЛЕНИЮ ===== */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of clientList) {
      if ('focus' in client) {
        try {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(url); } catch { /* noop */ }
          }
          return;
        } catch { /* noop */ }
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })());
});