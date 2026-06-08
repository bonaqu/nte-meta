import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4174',
  },
  webServer: [
    {
      command:
        'npm run test:prepare-db && npx wrangler d1 migrations apply nte-meta-db --local --persist-to .wrangler/test-state --env="" && npx wrangler dev --local --persist-to .wrangler/test-state --port 8788',
      url: 'http://127.0.0.1:8788/api/characters',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PASSWORD_PEPPER: 'playwright-only-password-pepper',
      },
    },
    {
      command: 'npm run dev -- --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8788',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
