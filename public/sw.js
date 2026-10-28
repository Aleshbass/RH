/*
 * Rehabify service worker: makes the site installable as an app and shows push notifications.
 *
 * Pages are never cached. Navigations always go to the network; only when the device is offline
 * does it show the small offline page. Bump VERSION when this file changes.
 */
const VERSION = 'v1';
const OFFLINE_CACHE = `rehabify-offline-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(request));
      } catch {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })()
  );
});

/** Red count on the home-screen app icon (iPhone 16.4+, installed desktop apps). */
function updateIconBadge(count) {
  const nav = self.navigator;
  if (typeof count !== 'number' || !nav || typeof nav.setAppBadge !== 'function') return Promise.resolve();
  const update = count > 0 ? nav.setAppBadge(Math.min(count, 99)) : nav.clearAppBadge();
  return update.catch(() => undefined);
}

// Payload sent by convex/actions/push.ts: { title, body, url, tag, badge }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Rehabify';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || '/dashboard' },
      }),
      updateIconBadge(data.badge),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open Rehabify window (on iPhone, the home-screen app) if there is one
      const client = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!client) return self.clients.openWindow(target);
      try {
        await client.focus();
      } catch {
        // Not allowed to focus: the page below still opens the link
      }
      try {
        // navigate() only works on windows this worker controls, and not in every browser
        if (typeof client.navigate === 'function') {
          await client.navigate(target);
          return undefined;
        }
      } catch {
        // Fall back to asking the page to open it (lib/pwa.ts)
      }
      client.postMessage({ type: 'rehabify:open', url: target });
      return undefined;
    })()
  );
});
