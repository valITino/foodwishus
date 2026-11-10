import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// The installed-app tests: offline start, the update note and notifications, run against
// `vite preview` of the production build, because only a real build has a service worker.
// Build first:  npm run build && npm run e2e:pwa
//
// The production build is wired to the real cloud, so every test here blocks all traffic
// that does not go to the preview server (tests/pwa/fixtures.ts). Nothing reaches Supabase.
const port = Number(process.env.FOODWISHUS_PORT ?? 5173) - 1000
const base = process.env.FOODWISHUS_BASE ?? '/foodwishus/'
const url = `http://127.0.0.1:${port}${base}`

if (!existsSync('dist/sw.js')) throw new Error('No production build with a service worker found. Run "npm run build" first.')

export default defineConfig({
  testDir: 'tests/pwa',
  outputDir: 'test-results/pwa',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: url,
    ...devices['Pixel 7'],
    // The full browser in its new headless mode. The slimmer headless shell (Playwright's
    // default) refuses every notification, and these tests need to see some.
    channel: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
