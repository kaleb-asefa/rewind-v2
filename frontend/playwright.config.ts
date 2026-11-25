import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a real backend (isolated sessions dir, no catalog,
 * no outbound cover lookups) and the Vite dev server. Synthetic Spotify exports
 * are generated in globalSetup, so no personal data is needed.
 */
const API = 'http://127.0.0.1:8010'
const WEB = 'http://localhost:5180'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: WEB, trace: 'retain-on-failure', acceptDownloads: true },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command:
        'uv run --project ../backend uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8010',
      url: `${API}/api/health`,
      env: {
        REWIND_SESSIONS_DIR: 'test-results/e2e-sessions',
        REWIND_CATALOG_PATH: '/nonexistent/catalog.parquet',
        REWIND_COVERS_ENABLED: 'false',
        REWIND_TZ_OFFSET_HOURS: '0',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5180 --strictPort',
      url: WEB,
      env: { REWIND_API: API },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
