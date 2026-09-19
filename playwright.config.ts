import { defineConfig } from '@playwright/test';

/** E2E_PORT lets several checkouts run the suite side by side without sharing a preview server. */
const PORT = Number(process.env.E2E_PORT) || 4175;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1360, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
