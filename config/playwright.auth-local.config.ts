import { defineConfig } from "@playwright/test";

// Synthetic, local-only UI verification. No auth.setup, DB fixtures or providers.
export default defineConfig({
  testDir: "../tests/browser",
  testMatch: "auth-recovery.spec.ts",
  workers: 1,
  timeout: 45_000,
  outputDir: "/tmp/restoreassist-auth-evidence/browser-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    serviceWorkers: "block",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
});
