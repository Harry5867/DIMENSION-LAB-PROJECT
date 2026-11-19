import { defineConfig } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD } from './packages/contracts/src/demo';

const apiPort = process.env.LAB_E2E_API_PORT || '5000';
const webPort = process.env.LAB_E2E_WEB_PORT || '3000';
const baseURL = `http://127.0.0.1:${webPort}`;
const historyMongoPort = process.env.LAB_E2E_HISTORY_MONGO_PORT;
if (historyMongoPort && !/^\d{1,5}$/.test(historyMongoPort)) throw new Error('Expected a local MongoDB port.');

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
      name: historyMongoPort ? 'Account history API' : 'Demo API',
      command: 'npm exec -- tsx backend/src/index.ts',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: apiPort,
        LAB_BIND_HOST: '127.0.0.1',
        LAB_STORAGE_MODE: 'demo',
        LAB_AUTH_EMAIL: DEMO_EMAIL,
        LAB_AUTH_PASSWORD: DEMO_PASSWORD,
        ...(historyMongoPort && {
          LAB_STORAGE_MODE: 'atlas',
          LAB_ALLOWED_ORIGIN: baseURL,
          MONGODB_URI: `mongodb://127.0.0.1:${historyMongoPort}`,
          MONGODB_DB: 'history_browser_test',
        }),
      },
    },
    {
      name: 'Vite',
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: baseURL,
      env: { LAB_API_PORT: apiPort },
      reuseExistingServer: false,
    },
  ],
});
