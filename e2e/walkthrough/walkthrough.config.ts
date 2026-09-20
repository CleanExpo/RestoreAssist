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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claimRunId } from "./run-identity";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error(`walkthrough refuses non-local base URL ${baseURL}`);
}

// One run directory per `playwright test` invocation, claimed exclusively here in the
// coordinator and inherited by every worker. Honouring an inherited WALKTHROUGH_RUN
// without claiming the directory let an exported variable merge two invocations into one
// apparently complete run; the exclusive mkdir in claimRunId() is what prevents that.
claimRunId();

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
