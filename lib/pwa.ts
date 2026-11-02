'use client';

/**
 * The installable app (public/manifest.json + public/sw.js) and web push, on the browser side.
 *
 * PwaRegister (root layout) registers the service worker and keeps the browser's install
 * prompt for later; components/pwa/AppSetup.tsx shows it and turns notifications on.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { wipeAll } from '@/lib/offline/vault';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaState = {
  /** The browser can show its own install dialog (Chrome, Edge, Samsung Internet) */
  canPrompt: boolean;
  /** Installed during this visit */
  justInstalled: boolean;
  /** The app setup dialog is open */
  setupOpen: boolean;
  /** Bumped when notification settings change, so every screen re-checks them */
  revision: number;
  /** A new version of the app is installed and waiting for the person to switch */
  updateReady: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let state: PwaState = { canPrompt: false, justInstalled: false, setupOpen: false, revision: 0, updateReady: false };
const listeners = new Set<() => void>();
const SERVER_STATE: PwaState = { canPrompt: false, justInstalled: false, setupOpen: false, revision: 0, updateReady: false };

function update(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function openAppSetup() {
  update({ setupOpen: true });
}

export function closeAppSetup() {
  update({ setupOpen: false });
}

/** Notifications were turned on or off: screens showing the setup state check again. */
export function refreshAppSetup() {
  update({ revision: state.revision + 1 });
}

let started = false;

/** Once per page load: keep the install prompt and register the service worker. */
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Shown from our own dialog instead of the browser's mini bar
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    update({ canPrompt: false, justInstalled: true });
  });

  // A tapped notification asks an open window to show its page (public/sw.js)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as { type?: string; url?: unknown } | null;
      if (data?.type !== 'rehabify:open' || typeof data.url !== 'string') return;
      try {
        const url = new URL(data.url, window.location.origin);
        if (url.origin === window.location.origin) window.location.assign(url.href);
      } catch {
        // Not a link we open
      }
    });
  }

  if ('serviceWorker' in navigator && (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === '1')) {
    // Returning visitors: watch for new versions straight away. Registering waits for the page's
    // "load", which a slow script on a weak connection can hold back for a long time.
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => {
        if (!reg) return;
        watchForUpdates(reg);
        void sendOfflineSwitch();
      })
      .catch(() => undefined);
    const register = () =>
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          watchForUpdates(reg);
          void sendOfflineSwitch();
        })
        .catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

const watched = new WeakSet<ServiceWorkerRegistration>();

/**
 * A new version installs in the background and waits; the person chooses when to switch
 * (applyUpdate), so a reload never interrupts something they're typing or syncing.
 */
function watchForUpdates(reg: ServiceWorkerRegistration) {
  if (watched.has(reg)) return;
  watched.add(reg);
  const offer = () => {
    if (reg.waiting && navigator.serviceWorker.controller) update({ updateReady: true });
  };
  offer();
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    next?.addEventListener('statechange', () => {
      if (next.state === 'installed') offer();
    });
  });
  // Long-lived home-screen apps: look for a new version when brought back to the front
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60 * 1000) return;
    lastCheck = Date.now();
    reg.update().catch(() => undefined);
  });
}

/**
 * Switches to the waiting version and reloads once it has taken over. Never leaves the person
 * stuck: if another tab already switched, or the switch doesn't confirm in 10 seconds, it reloads.
 */
export async function applyUpdate() {
  const reg = await navigator.serviceWorker.getRegistration('/').catch(() => undefined);
  if (!reg?.waiting) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  window.setTimeout(reload, 10_000);
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

const PILOT_KEY = 'rh_offline_pilot';
let pilot: boolean | null = null;
const offlineModeListeners = new Set<() => void>();

function pilotOn(): boolean {
  if (pilot === null) {
    try {
      pilot = window.localStorage.getItem(PILOT_KEY) === '1';
    } catch {
      pilot = false;
    }
  }
  return pilot;
}

/**
 * Whether this device keeps pages and data for offline use. NEXT_PUBLIC_OFFLINE_MODE is the master
 * switch: "on" for everyone, "pilot" only for accounts an admin put in the pilot (users.offlinePilot,
 * remembered here so it holds offline), anything else off. Off is also the kill switch: stored
 * pages and the encrypted copy are wiped, and only push and the "You're offline" page remain.
 */
export function offlineModeOn(): boolean {
  const mode = process.env.NEXT_PUBLIC_OFFLINE_MODE;
  if (mode === 'on') return true;
  if (mode === 'pilot') return typeof window !== 'undefined' && pilotOn();
  return false;
}

/** The signed-in account's pilot switch, seen online (components/offline/OfflineBridge.tsx). */
export function setOfflinePilot(on: boolean) {
  if (typeof window === 'undefined' || pilotOn() === on) return;
  pilot = on;
  try {
    if (on) window.localStorage.setItem(PILOT_KEY, '1');
    else window.localStorage.removeItem(PILOT_KEY);
  } catch {
    // Storage blocked: it holds for this visit only
  }
  offlineModeListeners.forEach((listener) => listener());
  void sendOfflineSwitch();
}

export function useOfflineMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      offlineModeListeners.add(listener);
      return () => offlineModeListeners.delete(listener);
    },
    offlineModeOn,
    () => false
  );
}

/** Tells the service worker whether to keep pages (it remembers, so a cold start offline works). */
async function sendOfflineSwitch() {
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 15000, 'The service worker');
    reg.active?.postMessage({ type: 'rehabify:offline-pages', on: offlineModeOn() });
  } catch {
    // Not running yet: it starts with offline mode off
  }
}

/**
 * "Reset offline data": clears every copy this device keeps (pages, app files, images) and reloads.
 * For a stuck or broken cache; sign-in and notifications are kept, and the encrypted offline copy
 * is saved again as pages are opened. (Once offline changes can be queued, unsynced ones must be
 * sent or confirmed first.)
 */
export async function resetOfflineData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'rehabify:clear-pages' });
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => /^rh-(pages|static|images|assets)/.test(key)).map((key) => caches.delete(key))
    );
  } catch {
    // No Cache Storage here: nothing was kept
  }
  // The encrypted copy is all on the server too: it's saved again as pages are opened
  await wipeAll().catch(() => undefined);
  window.location.reload();
}

/** The portal in use (its home page): opening the app offline goes there (app/sw.ts). */
export function usePortalHome(path: string) {
  useEffect(() => {
    if (!offlineModeOn() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'rehabify:portal-home', path }))
      .catch(() => undefined);
  }, [path]);
}

/** Removes the dashboard pages kept for offline use (sign-out, or someone else signed in). */
export async function clearStoredPages() {
  if (typeof window === 'undefined') return;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'rehabify:clear-pages' });
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rh-pages-')).map((key) => caches.delete(key)));
  } catch {
    // No Cache Storage here: nothing was kept
  }
}

/** Shows the browser's install dialog. True if the app was installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  update({ canPrompt: false });
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') update({ justInstalled: true });
  return outcome === 'accepted';
}

/** Running as the home-screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Device = {
  platform: 'ios' | 'android' | 'desktop';
  /** WhatsApp, Instagram, Facebook... browsers inside other apps can't install anything */
  inAppBrowser: boolean;
};

export function detectDevice(): Device {
  if (typeof navigator === 'undefined') return { platform: 'desktop', inAppBrowser: false };
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|WhatsApp|LinkedInApp|; wv\)/i.test(ua);
  return { platform: ios ? 'ios' : android ? 'android' : 'desktop', inAppBrowser };
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((byte, i) => byte === b[i]);
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} didn't start in time`)), ms)),
  ]);
}

/** The service worker, registered if needed. Fails instead of waiting forever. */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) return existing;
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return withTimeout(navigator.serviceWorker.ready, 15000, 'The service worker');
}

/** What went wrong the last time notifications were turned on (shown in "Details for support"). */
let lastPushProblem: string | null = null;

function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 200);
}

/**
 * Notification permission, preferring the live answer: a page that was open while the setting
 * changed can keep reporting the old Notification.permission.
 */
export async function livePermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
    return status.state === 'prompt' ? 'default' : status.state;
  } catch {
    return Notification.permission;
  }
}

function browserName(): string {
  const ua = navigator.userAgent;
  const match =
    /SamsungBrowser\/([\d.]+)/.exec(ua)?.[0] ??
    /EdgA?\/([\d.]+)/.exec(ua)?.[0] ??
    /OPR\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /CriOS\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    (/Version\/([\d.]+).*Safari/.exec(ua) ? `Safari/${/Version\/([\d.]+)/.exec(ua)?.[1]}` : null);
  const os = /Android [\d.]+/.exec(ua)?.[0] ?? /(iPhone|CPU) OS [\d_]+/.exec(ua)?.[0]?.replace(/_/g, '.') ?? '';
  return [match ?? 'Unknown browser', os].filter(Boolean).join(' · ');
}

/** Everything this device says about notifications, for "Details for support". */
export async function pushDiagnostics(): Promise<[string, string][]> {
  const rows: [string, string][] = [];
  const device = detectDevice();
  rows.push(['Browser', browserName()]);
  rows.push(['Opened as', isStandalone() ? 'Home-screen app' : device.inAppBrowser ? 'Inside another app' : 'Browser tab']);
  rows.push(['Web push', pushSupported() ? 'Supported' : 'Not supported here']);
  if ('Notification' in window) rows.push(['Permission (page)', Notification.permission]);
  try {
    const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
    rows.push(['Permission (live)', status.state]);
  } catch {
    rows.push(['Permission (live)', 'unknown']);
  }
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
    rows.push([
      'Service worker',
      reg ? (reg.active ? 'Active' : reg.installing ? 'Installing' : reg.waiting ? 'Waiting' : 'Registered') : 'Missing',
    ]);
    if (reg?.pushManager) {
      try {
        rows.push(['Push permission', await reg.pushManager.permissionState({ userVisibleOnly: true })]);
      } catch {
        // Not every browser answers this
      }
      rows.push(['Subscribed', (await reg.pushManager.getSubscription()) ? 'Yes' : 'No']);
    }
  } catch (error) {
    rows.push(['Service worker', describe(error)]);
  }
  if (lastPushProblem) rows.push(['Last problem', lastPushProblem]);
  return rows;
}

export type SavedDevice = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  installed?: boolean;
};

function toSaved(subscription: PushSubscription): SavedDevice | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
    installed: isStandalone(),
  };
}

/**
 * Asks for permission (must run from a tap) and subscribes this device.
 * Returns the device to save on the server, or why it couldn't.
 */
export async function enablePush(
  publicKey: string
): Promise<{ device: SavedDevice } | { error: 'denied' | 'dismissed' | 'unsupported' | 'failed' }> {
  if (!pushSupported()) {
    lastPushProblem = 'This browser has no web push';
    return { error: 'unsupported' };
  }
  let permission: NotificationPermission = Notification.permission;
  if (permission !== 'granted') {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      lastPushProblem = describe(error);
    }
  }
  try {
    const key = base64UrlToBytes(publicKey);
    const reg = await registration();
    if (permission !== 'granted') {
      // The page's answer can lag behind the phone's settings; the push service's own answer is live
      const pushState = await reg.pushManager
        .permissionState({ userVisibleOnly: true, applicationServerKey: key })
        .catch(() => (permission === 'denied' ? 'denied' : 'prompt'));
      if (pushState !== 'granted') {
        lastPushProblem = `Notifications ${permission} (push service says ${pushState})`;
        return { error: permission === 'denied' || pushState === 'denied' ? 'denied' : 'dismissed' };
      }
    }
    let subscription = await reg.pushManager.getSubscription();
    // Subscribed with an older key: start again
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const device = toSaved(subscription);
    if (!device) {
      lastPushProblem = 'The browser gave an incomplete subscription';
      return { error: 'failed' };
    }
    lastPushProblem = null;
    return { device };
  } catch (error) {
    lastPushProblem = describe(error);
    return { error: (error as { name?: string })?.name === 'NotAllowedError' ? 'denied' : 'failed' };
  }
}

/** This device's current subscription, if notifications are already on. */
export async function currentDevice(): Promise<SavedDevice | null> {
  if (!pushSupported() || (await livePermission()) !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const subscription = await reg?.pushManager.getSubscription();
  return subscription ? toSaved(subscription) : null;
}

/** Turns notifications off on this device. Returns the endpoint to forget on the server. */
export async function disablePush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  return endpoint;
}

/** Red count on the home-screen app icon; 0 clears it. Does nothing where unsupported. */
export function setIconBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  const update = count > 0 ? nav.setAppBadge(Math.min(count, 99)) : nav.clearAppBadge();
  update.catch(() => undefined);
}

const SNOOZE_KEY = 'rh_app_setup_snoozed_until';

/** "Not now": the setup dialog opens on its own again a day later. */
export function snoozeAppSetup(ms = 24 * 60 * 60 * 1000) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    // Storage blocked: it just asks again next visit
  }
}

export function appSetupSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}
