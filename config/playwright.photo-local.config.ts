import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

// Synthetic browser controls only. Physical iPhone/Capacitor picker proof is separate.
export default defineConfig({
  testDir: "../tests/browser",
  testMatch: "inspection-photo-upload.spec.ts",
  workers: 1,
  timeout: 90_000,
  outputDir: "./test-results/photo-upload",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
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
    command: "node node_modules/next/dist/bin/next dev --webpack -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/login",
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXTAUTH_SECRET: "synthetic-local-browser-secret",
      NEXTAUTH_URL: "http://127.0.0.1:3100",
      DATABASE_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
