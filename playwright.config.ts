import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'npm run server',
      url: 'http://127.0.0.1:5000/api/v1/health',
      reuseExistingServer,
      timeout: 60_000,
      env: { LAB_STORAGE_MODE: 'demo', LAB_BIND_HOST: '127.0.0.1', PORT: '5000' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --strictPort',
      url: 'http://127.0.0.1:3000/',
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
