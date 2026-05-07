/**
 * Capture iPad-Pro-13" screenshots of the prod web app for App Store submission.
 *
 * Apple's required dimensions for 13-inch iPad displays:
 *   - 2064 × 2752 px (portrait) — what we'll capture
 *
 * Outputs to: scripts/ipad-screenshots/{1-login,2-dashboard,3-inspections,4-inspection-detail,5-reports}.png
 *
 * Run:
 *   npx tsx scripts/capture-ipad-screenshots.ts
 *
 * Then drag-drop the PNGs into App Store Connect → Previews and Screenshots → iPad tab.
 *
 * Reviewer creds are read from REVIEWER_EMAIL + REVIEWER_PASSWORD env vars (NOT hard-coded).
 *   REVIEWER_EMAIL=reviewer@restoreassist.app REVIEWER_PASSWORD='...' \
 *     npx tsx scripts/capture-ipad-screenshots.ts
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.BASE_URL ?? "https://restoreassist.app";
const REVIEWER_EMAIL =
  process.env.REVIEWER_EMAIL ?? "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;

if (!REVIEWER_PASSWORD) {
  console.error(
    "ERROR: set REVIEWER_PASSWORD env var (the reviewer-account password)",
  );
  process.exit(1);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(scriptDir, "ipad-screenshots");
fs.mkdirSync(outDir, { recursive: true });

// iPad Pro 13" portrait (Apple required dimensions)
const VIEWPORT = { width: 2064 / 2, height: 2752 / 2 }; // device pixel ratio 2 = display dimensions
const DPR = 2;

async function main() {
  console.log(
    `[ipad] Launching browser at viewport ${VIEWPORT.width}x${VIEWPORT.height} DPR ${DPR}`,
  );
  console.log(`[ipad] Output: ${outDir}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  // Helper: dismiss any toast/modal/notification badge that might be visible.
  // App Review (1.0.2) flagged "non-iOS status bar images" — likely the small
  // green check badges in the top-right of the dashboard, plus toasts. We
  // nuke the entire top-right badge cluster + Sync indicator before snap.
  async function clearOverlays() {
    // Click "Got it" or "Dismiss" buttons on any open release-notes modal
    for (const label of ["Got it", "Dismiss", "Close", "OK", "×"]) {
      const btn = page.locator(`button:has-text("${label}")`).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    // Hide all known noise-makers via JS
    await page
      .evaluate(() => {
        const selectors = [
          // Standard toast/notification containers
          '[class*="toast"]',
          '[class*="Toast"]',
          '[role="status"]',
          '[role="alert"]',
          '[class*="notification"]:not([class*="page"]):not([class*="-page"])',
          '[class*="banner"]:not([class*="page"]):not([class*="-page"])',
          // Sonner toasts
          "[data-sonner-toast]",
          "[data-sonner-toaster]",
          // Sync indicator chip ("Synced" pill in top header)
          '[class*="sync-indicator"]',
          '[class*="SyncIndicator"]',
          // Trial-banner / upgrade prompts
          '[class*="trial-banner"]',
          '[class*="TrialBanner"]',
          '[class*="upgrade"]',
          // Generic green status dots near user menu (these caused the App Review rejection)
          '[class*="status-dot"]',
          '[class*="StatusDot"]',
          '[class*="status-badge"]',
          '[class*="StatusBadge"]',
          // Notifications icon badge
          'button[aria-label*="notification" i] [class*="badge"]',
          'button[aria-label*="Notifications" i]',
          // Floating chat bubbles (Intercom, Crisp, etc.)
          '[class*="chat-bubble"]',
          '[class*="ChatBubble"]',
          '[class*="intercom-launcher"]',
        ];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
          });
        }
        // Apple App Review (1.0.2) flagged "non-iOS status bar images" — most
        // likely the stacked green check pills next to the user avatar in the
        // top header. Inject CSS that hides any "pill" / "badge" element with
        // a green-ish background, regardless of class name.
        const styleEl = document.createElement("style");
        styleEl.id = "__claude_screenshot_styles__";
        styleEl.textContent = `
        /* Hide PWA install badges, sync chips, online indicators */
        [class*="install" i][class*="badge" i],
        [class*="sync" i][class*="indicator" i],
        [class*="online" i][class*="indicator" i],
        [class*="pwa" i][class*="prompt" i],
        [aria-label*="install" i],
        [aria-label*="sync" i][role="status"],
        [aria-label*="online" i][role="status"],
        [aria-label*="connection" i][role="status"] {
          display: none !important;
          visibility: hidden !important;
        }
      `;
        document.head.appendChild(styleEl);
      })
      .catch(() => {});
    await page.waitForTimeout(500);
  }

  try {
    // Login (no screenshot — Apple usually rejects login as primary marketing image)
    console.log("[ipad] going to login...");
    await page.goto(`${BASE}/login`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    console.log("[ipad] signing in as reviewer...");
    await page.fill('input[type="email"]', REVIEWER_EMAIL);
    await page.fill('input[type="password"]', REVIEWER_PASSWORD);
    await page.click('button:has-text("Sign In")');
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    } catch (e) {
      await page.screenshot({
        path: path.join(outDir, "DEBUG-login-failure.png"),
        fullPage: true,
      });
      console.error(`[ipad] LOGIN TIMEOUT — page still at: ${page.url()}`);
      throw e;
    }
    await page.waitForTimeout(3000); // let toasts appear so we can dismiss them
    await clearOverlays();

    // 1. Dashboard
    console.log("[ipad] 1/5 dashboard...");
    await page.screenshot({
      path: path.join(outDir, "1-dashboard.png"),
      fullPage: false,
    });

    // 2. Inspections list
    console.log("[ipad] 2/5 inspections list...");
    await page.goto(`${BASE}/dashboard/inspections`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2500);
    await clearOverlays();
    await page.screenshot({
      path: path.join(outDir, "2-inspections.png"),
      fullPage: false,
    });

    // 3. Inspection detail
    // Apply a more robust selector — find rows with NIR-... text + arrow icon
    console.log("[ipad] 3/5 inspection detail...");
    let detailCaptured = false;
    const linkPatterns = [
      "text=/NIR-\\d{4}-\\d{2}-/",
      'a:has-text("47 Demo Avenue")',
      'a:has-text("12 Sample Street")',
    ];
    for (const sel of linkPatterns) {
      const link = page.locator(sel).first();
      if (await link.isVisible().catch(() => false)) {
        try {
          await link.click({ timeout: 5000 });
          await page.waitForLoadState("networkidle", { timeout: 20000 });
          // Wait for the loading spinner to disappear (specific to this app's UX)
          await page.waitForTimeout(8000);
          // Wait for ANY heading element to appear — confirms the page actually rendered
          await page
            .waitForSelector('h1, h2, [class*="heading"]', { timeout: 10000 })
            .catch(() => {});
          await clearOverlays();
          await page.screenshot({
            path: path.join(outDir, "3-inspection-detail.png"),
            fullPage: false,
          });
          detailCaptured = true;
          break;
        } catch {}
      }
    }
    if (!detailCaptured) {
      console.log(
        "[ipad]   couldn't open inspection detail — capturing /dashboard/clients instead",
      );
      await page.goto(`${BASE}/dashboard/clients`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(2000);
      await clearOverlays();
      await page.screenshot({
        path: path.join(outDir, "3-inspection-detail.png"),
        fullPage: false,
      });
    }

    // 4. New Inspection / Inspection wizard
    console.log("[ipad] 4/5 new inspection wizard...");
    await page.goto(`${BASE}/dashboard/inspections/new`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2500);
    await clearOverlays();
    await page.screenshot({
      path: path.join(outDir, "4-new-inspection.png"),
      fullPage: false,
    });

    // 5. Reports page
    console.log("[ipad] 5/5 reports...");
    await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await clearOverlays();
    await page.screenshot({
      path: path.join(outDir, "5-reports.png"),
      fullPage: false,
    });

    console.log(`\n✓ Captured 5 screenshots to ${outDir}`);
    console.log(`  Open Finder there with: open ${outDir}`);
    console.log(`  Then drag-drop into App Store Connect → iPad tab.`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
