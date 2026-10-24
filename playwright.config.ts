import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against a deployed site (production by default). CI runs them after each
 * successful Vercel production deploy (.github/workflows/ci.yml); locally:
 *   pnpm test:install && pnpm test
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app pnpm test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://physioaroundme.com',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
