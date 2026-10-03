import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  testDir: "../tests/browser",
  testMatch: "room-identity.spec.ts",
  workers: 1,
  timeout: 90_000,
  outputDir: "./test-results/room-identity",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    serviceWorkers: "block",
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --webpack -p 3101 -H 127.0.0.1",
    url: "http://127.0.0.1:3101/login",
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXTAUTH_SECRET: "synthetic-local-browser-secret",
      NEXTAUTH_URL: "http://127.0.0.1:3101",
      DATABASE_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
