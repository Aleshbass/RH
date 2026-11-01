/**
 * With the website really down: opened dashboard pages come from the stored copy; pages never
 * opened, and online-only pages, show the "You're offline" page (never the browser's error screen).
 */
import { expect, test, type Page } from '@playwright/test';
import { CLINIC_OWNER_ID, PHYSIO_ID, signIn, snoozePrompts, startWebsite, stopWebsite, visitAndStore, websiteUp } from './helpers';

async function offlineCheck(page: Page, opened: string, neverOpened: string, onlineOnly: string) {
  await page.context().setOffline(true);
  stopWebsite();
  try {
    expect(await websiteUp(), 'website must really be down').toBe(false);

    const stored = await page.goto(opened);
    expect(stored?.fromServiceWorker(), 'opened page comes from the service worker').toBe(true);
    expect(await page.title()).not.toMatch(/offline/i);
    expect(new URL(page.url()).pathname).toBe(opened);

    await page.goto(neverOpened).catch(() => undefined);
    expect(await page.title(), 'never-opened page shows the offline page').toMatch(/You're offline/);

    await page.goto(onlineOnly).catch(() => undefined);
    expect(await page.title(), 'online-only page shows the offline page').toMatch(/You're offline/);
  } finally {
    await startWebsite();
    await page.context().setOffline(false);
  }
}

test('physio pages offline', async ({ page }) => {
  await snoozePrompts(page);
  await signIn(page, PHYSIO_ID);
  await visitAndStore(page, '/dashboard/physiotherapist');
  await offlineCheck(
    page,
    '/dashboard/physiotherapist',
    '/dashboard/physiotherapist/appointments',
    '/dashboard/physiotherapist/billing'
  );
});

test('clinic pages offline', async ({ page }) => {
  await snoozePrompts(page);
  await signIn(page, CLINIC_OWNER_ID);
  await visitAndStore(page, '/dashboard/clinic');
  await offlineCheck(page, '/dashboard/clinic', '/dashboard/clinic/appointments', '/dashboard/clinic/billing');
});
