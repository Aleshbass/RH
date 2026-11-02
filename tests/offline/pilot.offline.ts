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

test('the PIN offer and the app setup prompt take turns; tapping one never dismisses the other', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  // A real first visit: nothing snoozed
  await signIn(page, PHYSIO_ID);
  await page.goto('/dashboard/physiotherapist');
  // Prompts and the welcome tour (its dialog has no data-state)
  const openDialogs = page.locator('[role="dialog"]:visible');
  const pinOffer = page.getByRole('dialog', { name: 'Use Rehabify without internet' });
  const tour = page.locator('[role="dialog"][aria-labelledby="physio-tour-title"]');
  const reminder = page.getByRole('dialog', { name: /book you yet|Almost ready/ });
  const neverTwoAtOnce = async (seconds: number) => {
    for (let second = 0; second < seconds; second++) {
      expect(await openDialogs.count(), 'one prompt at a time').toBeLessThanOrEqual(1);
      await page.waitForTimeout(1000);
    }
  };
  await expect(openDialogs.first()).toBeVisible({ timeout: 90_000 });
  await neverTwoAtOnce(8);

  // The welcome tour and the setup reminder may come first (depends on the account); they take
  // turns with the other prompts too
  for (let round = 0; round < 3; round++) {
    const first = (await tour.isVisible()) ? tour : (await reminder.isVisible()) ? reminder : null;
    if (!first) break;
    await first.getByRole('button', { name: first === tour ? 'Not now' : 'Later' }).click();
    await expect(first).toBeHidden({ timeout: 10_000 });
    await expect(openDialogs.first(), 'the next prompt comes after it').toBeVisible({ timeout: 30_000 });
    await neverTwoAtOnce(6);
  }

  if (await pinOffer.isVisible()) {
    // PIN first: the app setup prompt waits until the PIN is set
    await pinOffer.getByLabel('New PIN').fill(PIN);
    await pinOffer.getByLabel('Type it again').fill(PIN);
    await pinOffer.getByRole('button', { name: 'Turn on' }).click();
    await expect(pinOffer).toBeHidden({ timeout: 60_000 });
    await expect(openDialogs.first(), 'app setup prompt comes next').toBeVisible({ timeout: 30_000 });
  } else {
    // App setup first: working with it doesn't touch the PIN offer, which comes right after
    await openDialogs.first().click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Escape');
    await expect(pinOffer, 'PIN offer comes next, not snoozed').toBeVisible({ timeout: 30_000 });
  }
  expect(await openDialogs.count()).toBeLessThanOrEqual(1);
});
