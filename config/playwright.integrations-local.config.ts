import { defineConfig } from "@playwright/test";
import authLocal from "./playwright.auth-local.config";

// Uses the same isolated server and desktop/mobile projects as auth recovery.
// No webServer command: the parent starts the reviewed production build with
// synthetic-local-browser-secret and no live credentials before executing this.
export default defineConfig({
  ...authLocal,
  testMatch: ["auth-recovery.spec.ts", "integrations-identity.spec.ts"],
  retries: 0,
  outputDir: "/tmp/restoreassist-integration-evidence/browser-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "/tmp/restoreassist-integration-evidence/browser-report.json" }],
  ],
});
