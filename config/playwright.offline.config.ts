import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * RA-7877 — cold start with the network off.
 *
 * The service worker registers only in a production build
 * (components/nir-offline-provider.tsx), so this journey cannot run under the
 * `npm run dev` server that config/playwright.config.ts boots. It builds and
 * serves the production app on its own port instead.
 *
 * The browser reaches the app as offline-e2e.localhost: Chromium treats every
 * *.localhost name as loopback and a secure context, while public/sw.js
 * self-destructs on the exact hostnames "localhost" and "127.0.0.1".
 *
 *   npm run test:e2e:offline
 *   OFFLINE_E2E_REUSE_SERVER=1 npm run test:e2e:offline   # server already running
 */
const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "..");
const PORT = process.env.OFFLINE_E2E_PORT || "3107";
// Once the service worker controls the page, /api requests are sent by the worker,
// and Playwright's route() does not see worker requests unless this is set.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

export default defineConfig({
  testDir: path.join(repoRoot, "e2e", "offline-cold-start"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://offline-e2e.localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: `npm run build && npx --no-install next start -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    reuseExistingServer: process.env.OFFLINE_E2E_REUSE_SERVER === "1",
    timeout: 900_000,
    cwd: repoRoot,
  },
});
