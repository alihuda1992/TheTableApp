import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    // Simulate iPhone 14 Pro — the primary target device
    ...devices['iPhone 14 Pro'],
    headless: true,
  },
  webServer: {
    command: 'npx serve . --listen 8080 --no-clipboard',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
