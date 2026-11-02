/**
 * Quiet updates: a new version installs and takes over by itself, with no prompt and no reload,
 * so whatever the person is doing carries on; the next page load is the new version.
 * The new version is simulated by changing public/sw.js on disk (restored afterwards).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PHYSIO_ID, signIn, snoozePrompts, visitAndStore } from './helpers';

const SW_FILE = 'public/sw.js';

test('a new version takes over quietly: no prompt, no reload', async ({ page }) => {
  await snoozePrompts(page);
  await signIn(page, PHYSIO_ID);
  await visitAndStore(page, '/dashboard/physiotherapist');
  const original = readFileSync(SW_FILE, 'utf8');
  try {
    // Something the person is in the middle of: a marker that a reload would wipe; and a flag set
    // only when a different version takes over this page
    await page.evaluate(() => {
      (window as any).__rhUnsaved = 'typing a note';
      navigator.serviceWorker.addEventListener('controllerchange', () => ((window as any).__rhNewVersion = true));
    });
    const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);

    const marker = `// test update ${Date.now()}`;
    writeFileSync(SW_FILE, `${original}\n${marker}\n`);
    await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((reg) => reg?.update()));

    // The new version takes over this page by itself (nothing left waiting), with no prompt
    await expect.poll(() => page.evaluate(() => (window as any).__rhNewVersion === true), { timeout: 60_000 }).toBe(true);
    expect(
      await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((reg) => Boolean(reg?.waiting)))
    ).toBe(false);
    await page.waitForTimeout(5_000);
    await expect(page.getByText(/new version of Rehabify/i)).toHaveCount(0);

    // And nothing was reloaded: the half-typed note is still there
    expect(await page.evaluate(() => (window as any).__rhUnsaved)).toBe('typing a note');
    expect(before).not.toBeNull();

    // The next page load is served by the new version
    await page.reload();
    const active = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration('/').then((reg) => reg?.active?.state ?? null)
    );
    expect(active).toBe('activated');
  } finally {
    writeFileSync(SW_FILE, original);
  }
});
