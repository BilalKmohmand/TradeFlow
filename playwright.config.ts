import { defineConfig } from '@playwright/test';

// E2E_PORT lets several checkouts (e.g. parallel worktrees) run the suite at once without
// one run silently reusing another checkout's preview server.
const PORT = Number(process.env.E2E_PORT || 4175);

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
    reuseExistingServer: !process.env.E2E_PORT,
    timeout: 30_000,
  },
});
