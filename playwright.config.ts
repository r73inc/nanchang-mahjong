import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for production smoke tests.
 *
 * Tests run against WEB_URL and API_URL environment variables, which are
 * set by the GitHub Actions deploy workflow after a successful deployment.
 *
 * Run locally: WEB_URL=https://your-domain.com API_URL=https://your-domain.com/api pnpm exec playwright test
 */

const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',

  /* Maximum time each test can run. */
  timeout: 30_000,

  /* Retry once on CI to absorb transient flakiness. */
  retries: process.env.CI ? 1 : 0,

  /* Run tests sequentially in CI (no worker parallelism needed for smoke tests). */
  workers: process.env.CI ? 1 : undefined,

  reporter: [['list'], ['html', { outputFolder: 'test/e2e/report', open: 'never' }]],

  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 }, // iPhone 14 — app is mobile-first
      },
    },
  ],

  /* Pass API URL to tests via env. */
  globalSetup: undefined,
});

export { apiUrl };
