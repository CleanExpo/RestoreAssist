import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_ORIGIN, LOCAL_PORT } from "../e2e/helpers/local-origin";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "..");

/**
 * RA-8110: the report theme canary. Its own config because it needs no login,
 * no database and no seeded account: the page it drives answers only when the
 * test-helper switch is on, and renders the synthetic scenario only. No retries:
 * a canary that retries hides the flake it exists to find.
 */
export default defineConfig({
  testDir: path.join(repoRoot, "e2e", "report-canary"),
  outputDir: path.join(repoRoot, "test-results", "report-canary"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  reporter: [["list"], ["html", { outputFolder: path.join(repoRoot, "playwright-report", "report-canary"), open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || LOCAL_ORIGIN,
    screenshot: "off",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: LOCAL_ORIGIN + "/dev/report-experience/canary",
        env: { PORT: LOCAL_PORT, ALLOW_TEST_HELPERS: "true" },
        reuseExistingServer: false,
        timeout: 240_000,
        cwd: repoRoot,
      },
});
