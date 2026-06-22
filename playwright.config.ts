import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for RestoreAssist E2E Tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    // RA-6764: run auth.setup once (logs in → storageState) before the specs.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // Responsive coverage: run the @smoke subset across phone + tablet
    // viewports so critical flows are verified at mobile/tablet/desktop.
    // Chromium-based emulation keeps CI to a single browser binary.
    {
      name: "mobile-chrome",
      testIgnore: /auth\.setup\.ts/,
      grep: /@smoke/,
      use: { ...devices["Pixel 5"] },
      dependencies: ["setup"],
    },
    {
      name: "tablet-chrome",
      testIgnore: /auth\.setup\.ts/,
      grep: /@smoke/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 }, // iPad Air portrait
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ["setup"],
    },
  ],

  /* Start a local dev server unless an external target is supplied.
   * smoke-prod sets PLAYWRIGHT_BASE_URL (prod) → no local server (unchanged).
   * The RA-6764 e2e job leaves it unset → boots the app locally in CI. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000, // CI cold compile can exceed 120s
      },
});
