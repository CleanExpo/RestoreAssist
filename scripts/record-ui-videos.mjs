/**
 * Record real UI screen recordings by driving the local dev server.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   DEMO_EMAIL=demo@restoreassist.app \
 *   DEMO_PASS=demo123 \
 *   node scripts/record-ui-videos.mjs
 *
 * Flow:
 *   1. Start dev server (npm run dev)
 *   2. Login as demo user via form submit
 *   3. Navigate to each screen
 *   4. Record screen as MP4 via Playwright
 *   5. Stop dev server
 */
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO, "public/videos/screenshots");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@restoreassist.app";
const DEMO_PASS = process.env.DEMO_PASS || "demo123";

const SCREENS = [
  { slug: "login", path: "/login", waitFor: "[data-testid='login-form']", actions: [] },
  { slug: "signup", path: "/signup", waitFor: "[data-testid='signup-form']", actions: [] },
  { slug: "dashboard", path: "/dashboard", waitFor: "[data-testid='dashboard']", actions: [] },
  { slug: "inspections-list", path: "/dashboard/inspections", waitFor: "[data-testid='inspections-list']", actions: [] },
  { slug: "inspection-new", path: "/dashboard/inspections/new", waitFor: "[data-testid='new-inspection']", actions: [] },
  { slug: "reports-list", path: "/dashboard/reports", waitFor: "[data-testid='reports-list']", actions: [] },
  { slug: "report-builder", path: "/dashboard/reports/new", waitFor: "[data-testid='report-builder']", actions: [] },
  { slug: "team", path: "/dashboard/settings/team", waitFor: "[data-testid='team-settings']", actions: [] },
  { slug: "integrations", path: "/dashboard/settings/integrations", waitFor: "[data-testid='integrations']", actions: [] },
  { slug: "billing", path: "/dashboard/settings/billing", waitFor: "[data-testid='billing']", actions: [] },
  { slug: "compliance", path: "/dashboard/compliance", waitFor: "[data-testid='compliance']", actions: [] },
];

async function startDevServer() {
  console.log("[1/5] Starting dev server...");
  const proc = spawn("npm", ["run", "dev"], {
    cwd: REPO,
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "development" },
  });

  // Wait for "ready" signal
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Dev server timeout")), 120_000);
    const checkReady = (data) => {
      const text = data.toString();
      if (text.includes("Ready") || text.includes("3000")) {
        clearTimeout(timeout);
        proc.stdout.off("data", checkReady);
        console.log("[2/5] Dev server ready on port 3000");
        setTimeout(resolve, 3000); // extra settle time
      }
    };
    proc.stdout.on("data", checkReady);
    proc.stderr.on("data", (d) => {
      if (d.toString().includes("error")) console.error(d.toString().slice(0, 200));
    });
  });

  return proc;
}

async function recordScreen(page, outFile) {
  // Start screen recording using Playwright's video API
  const context = page.context();
  await context.close();

  const newContext = await chromium.launchPersistentContext("", {
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: path.dirname(outFile), size: { width: 1920, height: 1080 } },
  });

  const newPage = await newContext.newPage();
  return { page: newPage, context: newContext };
}

async function main() {
  const server = await startDevServer();

  try {
    console.log("[3/5] Launching Chromium...");
    const browser = await chromium.launch({ headless: true });

    console.log("[4/5] Recording screens...");
    await fs.mkdir(OUT_DIR, { recursive: true });

    for (const screen of SCREENS) {
      const outFile = path.join(OUT_DIR, `${screen.slug}.mp4`);

      // Skip if already exists
      try {
        await fs.access(outFile);
        console.log(`  SKIP: ${screen.slug}.mp4 (exists)`);
        continue;
      } catch { /* doesn't exist, proceed */ }

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
      });
      const page = await context.newPage();

      try {
        // Login first (only needed for protected routes)
        if (!screen.path.startsWith("/login") && !screen.path.startsWith("/signup")) {
          await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
          await page.fill("input[type='email'], input[name='email']", DEMO_EMAIL);
          await page.fill("input[type='password'], input[name='password']", DEMO_PASS);
          await page.click("button[type='submit']");
          await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        }

        // Navigate to target screen
        await page.goto(BASE_URL + screen.path, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000); // Wait for hydration

        // If selector exists, wait for it
        try {
          await page.waitForSelector(screen.waitFor, { timeout: 5000 });
        } catch {
          console.warn(`    Warning: ${screen.waitFor} not found on ${screen.path}`);
        }

        // Additional settle time for animations
        await page.waitForTimeout(3000);

        await context.close();
        console.log(`  ✓ ${screen.slug}.mp4`);
      } catch (err) {
        console.error(`  ✗ ${screen.slug}: ${err.message}`);
        await context.close().catch(() => {});
      }
    }

    await browser.close();

    // Rename videos from Playwright's naming to our slugs
    const videoFiles = await fs.readdir(OUT_DIR);
    let idx = 0;
    for (const file of videoFiles) {
      if (file.endsWith(".mp4") && !SCREENS.some((s) => `${s.slug}.mp4` === file)) {
        // This is a Playwright-generated video with random name
        if (idx < SCREENS.length) {
          const slug = SCREENS[idx].slug;
          const oldPath = path.join(OUT_DIR, file);
          const newPath = path.join(OUT_DIR, `${slug}.mp4`);
          await fs.rename(oldPath, newPath);
          idx++;
        }
      }
    }

    console.log("\n[5/5] Done. Files in public/videos/screenshots/");
  } finally {
    console.log("[Cleanup] Stopping dev server...");
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
