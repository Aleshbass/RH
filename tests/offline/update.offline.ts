/**
 * Safe updates: a new version installs and waits; the page is never reloaded on its own; the person
 * sees "A new version of Rehabify is ready" and only their "Refresh" switches versions.
 * The new version is simulated by changing public/sw.js on disk (restored afterwards).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PHYSIO_ID, signIn, visitAndStore } from './helpers';

const SW_FILE = 'public/sw.js';

test('a new version waits for Refresh and never reloads by itself', async ({ page }) => {
  await signIn(page, PHYSIO_ID);
  await visitAndStore(page, '/dashboard/physiotherapist');
  const original = readFileSync(SW_FILE, 'utf8');
  try {
    // Something the person is in the middle of: a marker that a reload would wipe
    await page.evaluate(() => ((window as any).__rhUnsaved = 'typing a note'));

    writeFileSync(SW_FILE, `${original}\n// test update ${Date.now()}\n`);
    await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((reg) => reg?.update()));

    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((reg) => Boolean(reg?.waiting))), {
        timeout: 60_000,
      })
      .toBe(true);
    const prompt = page.getByText('A new version of Rehabify is ready').first();
    await expect(prompt).toBeVisible({ timeout: 30_000 });

    // Nothing happens on its own
    await page.waitForTimeout(10_000);
    expect(await page.evaluate(() => (window as any).__rhUnsaved)).toBe('typing a note');

    // The person taps Refresh: the new version takes over and the page reloads once
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect
      .poll(
        // Mid-reload the page can't be read yet: keep asking until the new page answers
        () => page.evaluate(() => (window as any).__rhUnsaved ?? null).catch(() => 'reloading'),
        { timeout: 60_000 }
      )
      .toBe(null);
    await page.waitForLoadState('load');
    const state = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration('/').then((reg) => ({ waiting: Boolean(reg?.waiting), active: reg?.active?.state }))
    );
    expect(state).toEqual({ waiting: false, active: 'activated' });
  } finally {
    writeFileSync(SW_FILE, original);
  }
});
