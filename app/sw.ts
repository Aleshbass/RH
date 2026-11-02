/// <reference lib="webworker" />
/*
 * Rehabify service worker (built by Serwist into public/sw.js): installs the app, keeps dashboard
 * pages for offline use and shows push notifications.
 *
 * Caching rules (offline plan, risk register C1-C10):
 * - Only same-origin, plain 200 responses are ever stored; never redirects, errors or other sites.
 * - Dashboard pages are stored only while offline mode is on for this device (the page sends the
 *   switch, lib/pwa.ts). Turning it off wipes them: that is also the remote kill switch.
 * - Stored pages are per build and per person: the page wipes them on sign-out or when someone
 *   else signs in. They hold no patient data (those pages fetch it in the browser).
 * - Never stored: /api, sign-in, Clerk, Convex, payments, patient files (Convex storage, private
 *   ImageKit links), React Server Component fetches (offline, Next falls back to a full page load,
 *   which is served from the stored page), and online-only pages (money, e-signing, chat, calls).
 * - A new version takes over quietly as soon as it's installed, without reloading anything: open
 *   pages carry on as they are, and the next page load is the new version (no prompt).
 */
import type { PrecacheEntry, RouteHandlerCallbackOptions, SerwistGlobalConfig } from 'serwist';
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const manifest = self.__SW_MANIFEST ?? [];

/** Next's build ID, read from the precache list (/_next/static/<buildId>/_buildManifest.js). */
const BUILD_ID =
  manifest
    .map((entry) => (typeof entry === 'string' ? entry : entry.url))
    .map((url) => /\/_next\/static\/([^/]+)\/_buildManifest\.js/.exec(url)?.[1])
    .find(Boolean) ?? 'dev';

const PAGE_CACHE = `rh-pages-${BUILD_ID}`;
const CONFIG_CACHE = 'rh-config';
const OFFLINE_PAGES_KEY = '/__rehabify/offline-pages';
const PORTAL_HOME_KEY = '/__rehabify/portal-home';
const OFFLINE_URL = '/offline.html';

/**
 * Pages the app opens on that aren't stored: /dashboard (the app's start page, which only sends
 * people to their portal) and the patient home (its patient data is in the page itself). Offline,
 * they go to the stored home of the portal last used instead.
 */
const LAUNCH_PAGES = new Set(['/dashboard', '/dashboard/patient']);

/** Dashboard pages that open offline with their last-loaded data (physio, clinic, patient portals). */
const OFFLINE_PAGES = [/^\/dashboard\/physiotherapist(\/|$)/, /^\/dashboard\/clinic(\/|$)/, /^\/dashboard\/patient\/.+/];

/**
 * Pages under the offline routes that stay online-only: money, e-signing and live chat or calls.
 * Offline they show the "You're offline" page instead of a screen that can't load.
 */
const ONLINE_ONLY_PAGES = [
  /\/billing(\/|$)/,
  /\/payments?(\/|$)/,
  /\/payouts?(\/|$)/,
  /\/checkout(\/|$)/,
  /\/agreements?(\/|$)/,
  /\/messages(\/|$)/,
  /\/call(\/|$)/,
  /\/video(\/|$)/,
];

function isOfflinePage(pathname: string) {
  return OFFLINE_PAGES.some((page) => page.test(pathname)) && !ONLINE_ONLY_PAGES.some((page) => page.test(pathname));
}

function isRscRequest(request: Request, url: URL) {
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
}

/** Bearer-style links to patient files: never stored on the device unencrypted. */
function isPrivateFile(url: URL) {
  if (url.hostname.endsWith('.convex.cloud') || url.hostname.endsWith('.convex.site')) return true;
  if (url.hostname.endsWith('imagekit.io')) return true;
  if (url.pathname === '/_next/image') {
    const source = url.searchParams.get('url') ?? '';
    return /convex\.(cloud|site)|imagekit\.io/.test(source);
  }
  return false;
}

// ---- The offline-mode switch (sent by the page; off until it says otherwise) ----

let offlinePages: boolean | null = null;

async function offlinePagesOn(): Promise<boolean> {
  if (offlinePages !== null) return offlinePages;
  try {
    const saved = await (await caches.open(CONFIG_CACHE)).match(OFFLINE_PAGES_KEY);
    offlinePages = saved ? ((await saved.json()) as { on?: boolean }).on === true : false;
  } catch {
    offlinePages = false;
  }
  return offlinePages;
}

async function deleteCaches(match: (name: string) => boolean) {
  const keys = await caches.keys();
  await Promise.all(keys.filter(match).map((key) => caches.delete(key)));
}

async function setOfflinePages(on: boolean) {
  offlinePages = on;
  const cache = await caches.open(CONFIG_CACHE);
  await cache.put(OFFLINE_PAGES_KEY, new Response(JSON.stringify({ on }), { headers: { 'Content-Type': 'application/json' } }));
  if (!on) await deleteCaches((key) => key.startsWith('rh-pages-'));
}

// ---- Strategies ----

/** Stores only plain 200 responses from our own origin. */
const okOnly = new CacheableResponsePlugin({ statuses: [200] });
const notRedirected = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.redirected || response.type !== 'basic' ? null : response,
};

const storedPage = new NetworkFirst({
  cacheName: PAGE_CACHE,
  // On a weak connection, show the stored page instead of a long blank wait
  networkTimeoutSeconds: 6,
  matchOptions: { ignoreSearch: true },
  plugins: [okOnly, notRedirected, new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 14 * 24 * 60 * 60 })],
});
const networkOnly = new NetworkOnly();

async function offlineFallback(): Promise<Response> {
  return (await serwist.matchPrecache(OFFLINE_URL)) ?? Response.error();
}

async function setPortalHome(path: string) {
  if (!isOfflinePage(path)) return;
  const cache = await caches.open(CONFIG_CACHE);
  await cache.put(PORTAL_HOME_KEY, new Response(JSON.stringify({ path }), { headers: { 'Content-Type': 'application/json' } }));
}

/** Offline launch: the stored home of the portal last used, if it's stored. */
async function storedPortalHome(): Promise<string | null> {
  try {
    const saved = await (await caches.open(CONFIG_CACHE)).match(PORTAL_HOME_KEY);
    const path = saved ? ((await saved.json()) as { path?: unknown }).path : null;
    if (typeof path !== 'string' || !isOfflinePage(path)) return null;
    const stored = await (await caches.open(PAGE_CACHE)).match(path, { ignoreSearch: true });
    return stored ? path : null;
  } catch {
    return null;
  }
}

/** Every page of ours: stored copy for offline-capable pages (when on), otherwise the offline page. */
async function handlePage(options: RouteHandlerCallbackOptions): Promise<Response> {
  const { url } = options;
  const on = await offlinePagesOn();
  try {
    if (on && isOfflinePage(url.pathname)) return await storedPage.handle(options);
    return await networkOnly.handle(options);
  } catch {
    if (on && LAUNCH_PAGES.has(url.pathname)) {
      const home = await storedPortalHome();
      if (home) return Response.redirect(new URL(home, self.location.origin).href, 302);
    }
    return offlineFallback();
  }
}

const serwist = new Serwist({
  precacheEntries: manifest,
  // Quiet updates: a new version takes over at once, but never reloads a page
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    // Never stored: other sites' patient files, our /api, private files and RSC fetches
    {
      matcher: ({ url, sameOrigin }) => !sameOrigin && isPrivateFile(url),
      handler: networkOnly,
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith('/api/') || isPrivateFile(url)),
      handler: networkOnly,
    },
    {
      matcher: ({ request, url, sameOrigin }) => sameOrigin && isRscRequest(request, url),
      handler: networkOnly,
    },
    // Our pages
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
      handler: handlePage,
    },
    // Hashed build files never change
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'rh-static',
        plugins: [okOnly, new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })],
      }),
    },
    // Optimised public images (patient files excluded above)
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/_next/image',
      handler: new CacheFirst({
        cacheName: 'rh-images',
        plugins: [okOnly, new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })],
      }),
    },
    // Icons, logos, fonts and styles (the encrypted 3D exercise files have their own HTTP caching)
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && ['image', 'font', 'style'].includes(request.destination) && !url.pathname.startsWith('/exercise-library/'),
      handler: new StaleWhileRevalidate({
        cacheName: 'rh-assets',
        plugins: [okOnly, new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })],
      }),
    },
  ],
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Old caches: pages from earlier builds (their code no longer exists) and the previous worker's cache
      deleteCaches((key) => (key.startsWith('rh-pages-') && key !== PAGE_CACHE) || key.startsWith('rehabify-offline-')),
      // The previous worker turned navigation preload on; these strategies don't use it, so with it
      // left on every page would be downloaded twice
      self.registration.navigationPreload?.disable().catch(() => undefined),
    ])
  );
});

type PageMessage = { type?: string; on?: unknown; path?: unknown };

self.addEventListener('message', (event) => {
  const data = event.data as PageMessage | null;
  // Offline mode switched on or off for this device (off also wipes stored pages)
  if (data?.type === 'rehabify:offline-pages' && typeof data.on === 'boolean') {
    event.waitUntil(setOfflinePages(data.on));
  }
  // The portal being used (physio, clinic or patient): where an offline launch goes
  if (data?.type === 'rehabify:portal-home' && typeof data.path === 'string') {
    event.waitUntil(setPortalHome(data.path));
  }
  // Sign-out, or someone else signed in: their stored pages go
  if (data?.type === 'rehabify:clear-pages') {
    event.waitUntil(deleteCaches((key) => key.startsWith('rh-pages-')));
  }
});

serwist.addEventListeners();

// ---- Push notifications (payload sent by convex/actions/push.ts: { title, body, url, tag, badge }) ----

/** Red count on the home-screen app icon (iPhone 16.4+, installed desktop apps). */
function updateIconBadge(count: unknown) {
  const nav = self.navigator as WorkerNavigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof count !== 'number' || !nav.setAppBadge || !nav.clearAppBadge) return Promise.resolve();
  const update = count > 0 ? nav.setAppBadge(Math.min(count, 99)) : nav.clearAppBadge();
  return update.catch(() => undefined);
}

type PushPayload = { title?: string; body?: string; url?: string; tag?: string; badge?: number };

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
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
        // @ts-expect-error renotify is supported by browsers but missing from the TS lib
        renotify: Boolean(data.tag),
        data: { url: data.url || '/dashboard' },
      }),
      updateIconBadge(data.badge),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url || '/dashboard', self.location.origin)
    .href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open Rehabify window (on iPhone, the home-screen app) if there is one
      const client = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!client) {
        await self.clients.openWindow(target);
        return;
      }
      try {
        await client.focus();
      } catch {
        // Not allowed to focus: the page below still opens the link
      }
      try {
        // navigate() only works on windows this worker controls, and not in every browser
        if (typeof client.navigate === 'function') {
          await client.navigate(target);
          return;
        }
      } catch {
        // Fall back to asking the page to open it (lib/pwa.ts)
      }
      client.postMessage({ type: 'rehabify:open', url: target });
    })()
  );
});
