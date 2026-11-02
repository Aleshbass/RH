/**
 * Offline mode on "pilot": only accounts an admin put in the pilot keep anything on the phone, and
 * taking someone out wipes their phone's offline copy and stored pages the next time they're online.
 * (Build with NEXT_PUBLIC_OFFLINE_MODE=pilot.)
 */
import { expect, test, type Page } from '@playwright/test';
import { PHYSIO_ID, cacheNames, clearTestDevices, setPilot, signIn, snoozeAppSetup, startWebsite, stopWebsite, visitAndStore } from './helpers';

const PIN = '246810';

async function vaultCount(page: Page): Promise<number> {
  return page
    .evaluate(
      () =>
        new Promise<number>((resolve) => {
          const request = indexedDB.open('rehabify-vault');
          request.onsuccess = () => {
            const db = request.result;
            // Closed straight after, or this connection would hold up the app's wipe
            const done = (value: number) => {
              db.close();
              resolve(value);
            };
            try {
              const count = db.transaction('vaults').objectStore('vaults').count();
              count.onsuccess = () => done(count.result);
              count.onerror = () => done(-1);
            } catch {
              done(0);
            }
          };
          request.onerror = () => resolve(-1);
        })
    )
    .catch(() => -1);
}

test('not in the pilot: nothing kept, no PIN offer, offline shows the offline page', async ({ page, context }) => {
  setPilot(PHYSIO_ID, false);
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  await visitAndStore(page, '/dashboard/physiotherapist', { offline: false });
  await page.waitForTimeout(5000);
  await expect(page.getByRole('dialog', { name: 'Use Rehabify without internet' })).toHaveCount(0);
  expect((await cacheNames(page)).some((name) => name.startsWith('rh-pages-')), 'no pages stored').toBe(false);
  expect(await vaultCount(page)).toBeLessThanOrEqual(0);

  await context.setOffline(true);
  stopWebsite();
  try {
    await page.goto('/dashboard/physiotherapist').catch(() => undefined);
    expect(await page.title()).toMatch(/You're offline/);
  } finally {
    await startWebsite();
    await context.setOffline(false);
    // The other tests run with the test accounts in the pilot
    setPilot(PHYSIO_ID, true);
  }
});

test('in the pilot, then taken out: the phone wipes its offline copy and pages', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  setPilot(PHYSIO_ID, true);
  try {
    await snoozeAppSetup(page);
    await signIn(page, PHYSIO_ID);
    await page.goto('/dashboard/physiotherapist');
    // In the pilot: the PIN offer appears
    const dialog = page.getByRole('dialog', { name: 'Use Rehabify without internet' });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await dialog.getByLabel('New PIN').fill(PIN);
    await dialog.getByLabel('Type it again').fill(PIN);
    await dialog.getByRole('button', { name: 'Turn on' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await visitAndStore(page, '/dashboard/physiotherapist');
    await expect.poll(() => vaultCount(page), { timeout: 30_000 }).toBe(1);
    expect((await cacheNames(page)).some((name) => name.startsWith('rh-pages-'))).toBe(true);

    // An admin takes them out of the pilot: next time online, everything offline goes
    setPilot(PHYSIO_ID, false);
    await page.reload();
    await expect.poll(() => vaultCount(page), { timeout: 60_000 }).toBeLessThanOrEqual(0);
    await expect
      .poll(async () => (await cacheNames(page)).some((name) => name.startsWith('rh-pages-')), { timeout: 60_000 })
      .toBe(false);
  } finally {
    setPilot(PHYSIO_ID, true);
  }
});
