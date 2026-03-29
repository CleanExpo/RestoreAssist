import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright Configuration for RestoreAssist E2E Tests
 * Updated: RA2-055 (RA-125) — V2 workflow + iPad + auth project
 * @see https://playwright.dev/docs/test-configuration
 */

export default defineConfig({
  testDir: "./e2e",
  /** Run tests in files in parallel */
  fullyParallel: true,
  /** Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /** Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /** Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /** Reporter */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // ── Auth setup (runs first, saves cookie state) ───────────
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // ── Desktop Chrome ────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Public pages (navigation, health) need no auth
      testIgnore: /v2-sketch-workflow/,
    },

    // ── Authenticated Chrome (V2 workflow tests) ──────────────
    {
      name: "chromium-auth",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      testMatch: /v2-sketch-workflow/,
      dependencies: ["setup"],
    },

    // ── iPad Pro (V2 mobile tests, authenticated) ──────────────
    {
      name: "ipad-pro",
      use: {
        ...devices["iPad Pro"],
        storageState: "playwright/.auth/user.json",
      },
      // Only run the V2 workflow spec on iPad; it has its own tablet section
      testMatch: /v2-sketch-workflow/,
      dependencies: ["setup"],
    },
  ],

  /** Run dev server unless on CI */
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
