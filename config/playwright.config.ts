import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "..");

/**
 * Playwright Configuration for RestoreAssist E2E Tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: path.join(repoRoot, "docs/archive/playwright-e2e"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: path.join(repoRoot, "playwright-report") }],
    ["list"],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    /* RA-4987: prod smoke bypass for Vercel BotID. */
    extraHTTPHeaders: process.env.SMOKE_TEST_BOT_BYPASS_SECRET
      ? { "x-smoke-test-token": process.env.SMOKE_TEST_BOT_BYPASS_SECRET }
      : undefined,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
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
        viewport: { width: 820, height: 1180 },
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        cwd: repoRoot,
      },
});
