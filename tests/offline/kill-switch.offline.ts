/**
 * Kill switch: turning offline mode off wipes the stored pages at once, and offline the app then
 * shows the "You're offline" page. The service worker stays installed (push keeps working).
 */
import { expect, test } from '@playwright/test';
import { PHYSIO_ID, cacheNames, signIn, snoozePrompts, startWebsite, stopWebsite, visitAndStore } from './helpers';

test('turning offline mode off wipes stored pages and keeps the worker', async ({ page, context }) => {
  await snoozePrompts(page);
  await signIn(page, PHYSIO_ID);
  await visitAndStore(page, '/dashboard/physiotherapist');
  expect((await cacheNames(page)).some((name) => name.startsWith('rh-pages-')), 'page stored while on').toBe(true);

  await page.evaluate(() =>
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'rehabify:offline-pages', on: false }))
  );
  await expect
    .poll(async () => (await cacheNames(page)).some((name) => name.startsWith('rh-pages-')), { timeout: 10_000 })
    .toBe(false);

  await context.setOffline(true);
  stopWebsite();
  try {
    await page.goto('/dashboard/physiotherapist').catch(() => undefined);
    expect(await page.title()).toMatch(/You're offline/);
    const active = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration('/').then((reg) => Boolean(reg?.active))
    );
    expect(active, 'service worker still installed for push').toBe(true);
  } finally {
    await startWebsite();
    await context.setOffline(false);
  }
});
