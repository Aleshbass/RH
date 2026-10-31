/**
 * Cache audit: after a normal session, nothing on the "never store" list is in Cache Storage
 * (sign-in, Clerk, Convex, /api, payments, Google, patient files, online-only pages, RSC fetches),
 * and everything stored is a plain 200 from our own site.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLINIC_OWNER_ID, PHYSIO_ID, cachedEntries, signIn, visitAndStore } from './helpers';

const NEVER_STORED: [string, RegExp][] = [
  ['API route', /\/api\//],
  ['Clerk', /clerk/i],
  ['Convex', /convex\.(cloud|site)/],
  ['Paystack', /paystack/i],
  ['Google', /google(apis)?\.com/],
  ['private files', /imagekit\.io/],
  ['sign-in pages', /\/sign-(in|up)/],
  ['RSC fetch', /[?&]_rsc=/],
];
const ONLINE_ONLY_PAGE = /\/(billing|payments?|payouts?|checkout|agreements?|messages|call|video)(\/|$)/;

async function audit(page: Page) {
  const entries = await cachedEntries(page);
  const problems: string[] = [];
  for (const entry of entries) {
    const url = new URL(entry.url);
    if (url.origin !== 'http://localhost:3100') problems.push(`other site stored: ${entry.url}`);
    if (entry.status !== 200) problems.push(`non-200 (${entry.status}) stored: ${url.pathname}`);
    // Hashed app code files (e.g. the sign-in page's JS) hold no data; the rules are about data and pages
    if (url.pathname.startsWith('/_next/static/')) continue;
    for (const [label, pattern] of NEVER_STORED) {
      if (pattern.test(entry.url)) problems.push(`${label} stored: ${url.pathname}${url.search}`);
    }
    if (entry.cache.startsWith('rh-pages-')) {
      if (ONLINE_ONLY_PAGE.test(url.pathname)) problems.push(`online-only page stored: ${url.pathname}`);
      if (!/^\/dashboard\/(physiotherapist|clinic|patient\/)/.test(url.pathname)) problems.push(`non-dashboard page stored: ${url.pathname}`);
    }
  }
  const byCache: Record<string, number> = {};
  for (const entry of entries) byCache[entry.cache] = (byCache[entry.cache] ?? 0) + 1;
  console.log(JSON.stringify({ byCache, pages: entries.filter((e) => e.cache.startsWith('rh-pages-')).map((e) => new URL(e.url).pathname) }, null, 2));
  return problems;
}

test('physio session stores nothing it must not', async ({ page }) => {
  await signIn(page, PHYSIO_ID);
  for (const path of [
    '/dashboard/physiotherapist',
    '/dashboard/physiotherapist/patients',
    '/dashboard/physiotherapist/appointments',
    '/dashboard/physiotherapist/messages',
    '/dashboard/physiotherapist/billing',
  ]) {
    await visitAndStore(page, path);
  }
  // Open a patient's record from the list
  await page.goto('/dashboard/physiotherapist/patients');
  const patientLink = page.locator('a[href*="/dashboard/physiotherapist/patients/"]').filter({ visible: true }).first();
  if (await patientLink.count()) {
    await patientLink.click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.reload();
    await page.waitForTimeout(1500);
  }
  expect(await audit(page)).toEqual([]);
});

test('clinic owner session stores nothing it must not', async ({ page }) => {
  await signIn(page, CLINIC_OWNER_ID);
  for (const path of [
    '/dashboard/clinic',
    '/dashboard/clinic/patients',
    '/dashboard/clinic/appointments',
    '/dashboard/clinic/billing',
    '/dashboard/clinic/settings',
  ]) {
    await visitAndStore(page, path);
  }
  expect(await audit(page)).toEqual([]);
});
