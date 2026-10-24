import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js', fullyParallel: true,
  timeout: 25000, expect: { timeout: 5000 }, workers: 3,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', viewport: { width: 1280, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
