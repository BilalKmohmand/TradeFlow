import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4175',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1360, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
