import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
  },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:3100', reuseExistingServer: true },
})
