import { defineConfig } from '@playwright/test'

// Memakai Chrome terpasang agar tidak perlu mengunduh browser Playwright.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5207', channel: 'chrome' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5207',
    reuseExistingServer: true,
    env: { VITE_X207_API_URL: 'http://localhost:8787', VITE_X207_USE_FIXTURES: 'false' },
  },
})
