import { defineConfig, devices } from '@playwright/test';

/**
 * Offline tests: a local production build with NEXT_PUBLIC_OFFLINE_MODE=on, signed in through the
 * Clerk DEVELOPMENT instance against the isolated Convex test project (fake data only). Offline
 * steps stop the local website too: Playwright's offline switch doesn't cover the service worker.
 *   pnpm build && pnpm start -p 3100
 *   pnpm test:offline
 * Needs in .env.local: CLERK_SECRET_KEY=sk_test_..., OFFLINE_TEST_PHYSIO_CLERK_ID, OFFLINE_TEST_CLINIC_CLERK_ID.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.offline\.ts/,
  timeout: 480_000,
  // One retry: this machine's network is flaky; anything that only passes on retry is reported as "flaky"
  retries: 1,
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/offline',
  use: {
    baseURL: 'http://localhost:3100',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
});
