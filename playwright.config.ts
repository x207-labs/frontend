import { defineConfig } from '@playwright/test'

// Uses the installed Chrome so the Playwright browser does not need to be downloaded.
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
