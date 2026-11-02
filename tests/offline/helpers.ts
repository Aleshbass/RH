import { execFileSync, execSync, spawn } from 'node:child_process';
import type { Locator, Page } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SECRET = process.env.CLERK_SECRET_KEY ?? '';
if (!SECRET.startsWith('sk_test_')) {
  throw new Error('Offline tests only run against the Clerk DEVELOPMENT instance (CLERK_SECRET_KEY=sk_test_...)');
}

export const PORT = 3100;
export const PHYSIO_ID = process.env.OFFLINE_TEST_PHYSIO_CLERK_ID ?? '';
export const CLINIC_OWNER_ID = process.env.OFFLINE_TEST_CLINIC_CLERK_ID ?? '';

/**
 * Runs the Convex CLI against the isolated offline test project and returns what it printed.
 * On Windows, Node sometimes crashes while the CLI exits ("UV_HANDLE_CLOSING"), after the work is
 * done: a printed result counts, otherwise it tries again.
 */
function convexCli(args: string[]): string {
  if (!(process.env.CONVEX_DEPLOYMENT ?? '').startsWith('dev:energized-mosquito')) {
    throw new Error('Refusing: CONVEX_DEPLOYMENT is not the isolated offline test project');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return execFileSync(process.execPath, ['node_modules/convex/bin/main.js', ...args], { encoding: 'utf8', timeout: 180_000 });
    } catch (error) {
      lastError = error;
      const failed = error as { stdout?: string; stderr?: string };
      const crashedOnExit = /UV_HANDLE_CLOSING/.test(`${failed.stderr ?? ''}${String(error)}`);
      if (crashedOnExit && failed.stdout?.trim()) return failed.stdout;
      if (!crashedOnExit) throw error;
    }
  }
  throw lastError;
}

/** Runs a Convex function as a test user (isolated offline test project only). */
function convexRunAs(clerkUserId: string, fn: string, args: Record<string, unknown>): string {
  return convexCli(['run', '--identity', JSON.stringify({ subject: clerkUserId }), fn, JSON.stringify(args)]);
}

/**
 * Each test run is a fresh browser, so a new "device": switch the test user's devices off first,
 * or repeated runs reach the 10-device limit (convex/offline.ts).
 */
export function clearTestDevices(clerkUserId: string) {
  const devices = JSON.parse(convexRunAs(clerkUserId, 'offline:listMyDevices', {}) || '[]') as { deviceId: string }[];
  for (const device of devices) convexRunAs(clerkUserId, 'offline:revokeDevice', { deviceId: device.deviceId });
}

/** Puts a test account in or out of the offline pilot (local test helper convex/testOnlyOffline.ts). */
export function setPilot(clerkUserId: string, on: boolean) {
  convexCli(['run', 'testOnlyOffline:setPilotByClerkId', JSON.stringify({ clerkId: clerkUserId, on })]);
}

/** Signs in with a one-time Clerk ticket (no password or email code needed). */
export async function signIn(page: Page, clerkUserId: string) {
  if (!clerkUserId) throw new Error('Missing test user id in .env.local');
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 300 }),
  });
  if (!res.ok) throw new Error(`Clerk sign_in_tokens ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  await page.goto('/sign-in');
  await page.waitForFunction(() => (window as any).Clerk?.loaded === true, null, { timeout: 90_000 });
  await page.evaluate(async (ticket) => {
    const clerk = (window as any).Clerk;
    const attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket });
    await clerk.setActive({ session: attempt.createdSessionId });
  }, token);
}

/**
 * The welcome tours count as already seen on this phone, and the physio setup reminder as already
 * shown this visit (prompts take turns with them).
 */
export async function skipTours(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('rehabify:physio-tour-version', '99');
    localStorage.setItem('rehabify:clinic-tour-version', '99');
    sessionStorage.setItem('rehabify:physio-setup-reminder', '1');
  });
}

/**
 * For tests that aren't about them: the self-opening prompts (offline PIN, app install) start
 * snoozed, as after "Not now", and the welcome tours as seen.
 */
export async function snoozePrompts(page: Page) {
  await skipTours(page);
  await page.addInitScript(() => {
    const day = String(Date.now() + 24 * 60 * 60 * 1000);
    localStorage.setItem('rh_offline_pin_snoozed_until_v2', day);
    localStorage.setItem('rh_app_setup_snoozed_until', day);
  });
}

/** Only the app-install prompt starts snoozed (the offline PIN prompt still opens); tours seen. */
export async function snoozeAppSetup(page: Page) {
  await skipTours(page);
  await page.addInitScript(() => {
    localStorage.setItem('rh_app_setup_snoozed_until', String(Date.now() + 24 * 60 * 60 * 1000));
  });
}

/**
 * Opens a page twice: the first visit installs the service worker, the second is stored by it.
 * With offline mode on "pilot", offline use starts a moment after sign-in (once the account's pilot
 * switch has loaded), so it waits for that first, unless the account isn't expected to be in it.
 */
export async function visitAndStore(page: Page, path: string, { offline = true }: { offline?: boolean } = {}) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (offline && process.env.NEXT_PUBLIC_OFFLINE_MODE === 'pilot') {
    await page.waitForFunction(() => localStorage.getItem('rh_offline_pilot') === '1', null, { timeout: 60_000 });
  }
  if (offline) {
    // The service worker has the switch (it keeps it in rh-config), so this reload is stored
    await page.waitForFunction(
      async () => {
        const saved = await (await caches.open('rh-config')).match('/__rehabify/offline-pages');
        return saved ? ((await saved.json()) as { on?: boolean }).on === true : false;
      },
      null,
      { timeout: 60_000, polling: 500 }
    );
  }
  await page.reload();
  // Let the service worker hear the offline-mode switch and store the page
  await page.waitForTimeout(1500);
}

/** True once the element shows up within the time limit. */
export const shows = (locator: Locator, timeout: number) =>
  locator.waitFor({ state: 'visible', timeout }).then(
    () => true,
    () => false
  );

/** Real offline for the service worker too: the local website is switched off. */
export function stopWebsite() {
  execSync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`,
    { stdio: 'ignore' }
  );
}

export async function websiteUp() {
  return fetch(`http://localhost:${PORT}/offline.html`).then(
    (r) => r.ok,
    () => false
  );
}

export async function startWebsite() {
  if (await websiteUp()) return;
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 90; i++) {
    if (await websiteUp()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('website did not come back');
}

/** Every URL in every Cache Storage cache, with its status. */
export async function cachedEntries(page: Page) {
  return page.evaluate(async () => {
    const out: { cache: string; url: string; status: number }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        out.push({ cache: name, url: request.url, status: response?.status ?? 0 });
      }
    }
    return out;
  });
}

export async function cacheNames(page: Page) {
  return page.evaluate(() => caches.keys());
}
