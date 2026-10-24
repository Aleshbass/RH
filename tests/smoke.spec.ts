import { expect, test } from '@playwright/test';

// Read-only checks that the deployed site is up and its safety rails hold. No sign-in, no
// bookings, no payments: safe to run against production.

const PUBLIC_PAGES = ['/', '/find-a-physio', '/pricing', '/about', '/contact', '/learn', '/privacy-policy', '/terms-and-conditions'];

for (const path of PUBLIC_PAGES) {
  test(`public page loads: ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText('Application error');
  });
}

test('unknown pages show the branded 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-smoke');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /can.t find that page/i })).toBeVisible();
});

test('portals send signed-out visitors to sign-in', async ({ page }) => {
  for (const path of ['/dashboard/physiotherapist', '/dashboard/patient', '/dashboard/clinic', '/dashboard/admin']) {
    await page.goto(path);
    await expect(page, `${path} should redirect`).toHaveURL(/sign-in/);
  }
});

test('Learn course page offers signed-out physios a one-tap email link', async ({ page }) => {
  await page.goto('/learn/course');
  await expect(page.getByRole('heading', { name: 'Open your course' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /email me my course link/i })).toBeVisible();
});

test('unknown Learn course links say so', async ({ page }) => {
  await page.goto('/learn/start/notarealcodenotarealcode1234');
  await expect(page.getByRole('heading', { name: 'Link not recognised' })).toBeVisible({ timeout: 20_000 });
});

test('certificate check says when a number does not exist', async ({ page }) => {
  await page.goto('/learn/verify/RHL-ZZZZ-ZZZZ');
  await expect(page.getByText('No certificate with this number')).toBeVisible({ timeout: 20_000 });
});

test('debug routes are gone', async ({ request }) => {
  for (const path of ['/server', '/test/sentry']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test('/support redirects to the contact page', async ({ page }) => {
  await page.goto('/support');
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { name: 'Contact us' })).toBeVisible();
});

test('robots.txt lists the sitemap and keeps private areas out', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Sitemap:');
  expect(body).toContain('Disallow: /dashboard');
});

test('analytics endpoints reject oversized payloads', async ({ request }) => {
  const response = await request.post('/api/analytics/track', {
    data: { event: 'smoke', properties: { blob: 'x'.repeat(20_000) } },
  });
  expect(response.status()).toBeGreaterThanOrEqual(400);
});
