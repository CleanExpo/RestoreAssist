/**
 * Playwright config for the three-persona walkthrough. Runs against an already-running
 * local server (PLAYWRIGHT_BASE_URL, default http://localhost:3000) and never starts one.
 *
 *   npx playwright test -c e2e/walkthrough/walkthrough.config.ts
 *
 * The owner journey runs first and hands the technician and client journeys what they
 * need (invite links, job ids) through state.json in the results folder.
 */
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error(`walkthrough refuses non-local base URL ${baseURL}`);
}

// One run id per `playwright test` invocation, inherited by every worker, so the three
// projects write to one runs/<runId>/ directory and a later invocation cannot append to
// it. Claiming the id per results-directory instead let an interrupted rerun adopt an
// earlier run's id and borrow its coverage. Assigned only if absent, so a worker that
// re-evaluates this config keeps the id it inherited.
process.env.WALKTHROUGH_RUN =
  process.env.WALKTHROUGH_RUN ||
  `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 60 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "owner", testMatch: /owner\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "technician",
      testMatch: /technician\.spec\.ts/,
      dependencies: ["owner"],
      use: { ...devices["Pixel 7"], geolocation: { latitude: -27.4698, longitude: 153.0251 }, permissions: ["geolocation"] },
    },
    // iPhone-sized screen on Chromium (only Chromium is installed for this run).
    { name: "client", testMatch: /client\.spec\.ts/, dependencies: ["owner"], use: { ...devices["iPhone 14"], browserName: "chromium" } },
  ],
});
