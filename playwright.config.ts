import { defineConfig } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD } from './packages/contracts/src/demo';

const baseURL = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'Demo API',
      command: 'npm exec -- tsx backend/src/index.ts',
      url: 'http://127.0.0.1:5000/api/health',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '5000',
        LAB_BIND_HOST: '127.0.0.1',
        LAB_STORAGE_MODE: 'demo',
        LAB_AUTH_EMAIL: DEMO_EMAIL,
        LAB_AUTH_PASSWORD: DEMO_PASSWORD,
      },
    },
    {
      name: 'Vite',
      command: 'npm run dev -- --host 127.0.0.1 --strictPort',
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
});
