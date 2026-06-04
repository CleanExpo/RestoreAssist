/**
 * Capture real RestoreAssist UI screenshots for Remotion video production.
 *
 * Captures at 1920x1080 (16:9) for standard videos and 1080x1920 (9:16) for shorts.
 * Outputs to: public/screenshots/ra-ui/
 *
 * Run:
 *   npx tsx scripts/capture-video-screenshots.ts
 *
 * Requires dev server running on http://localhost:3000
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEADLESS = process.env.HEADLESS !== "false";
const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL ?? "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;

const outDir = path.join(process.cwd(), "public", "screenshots", "ra-ui");
fs.mkdirSync(outDir, { recursive: true });

// Viewports for different video formats
const VIEWPORT_16_9 = { width: 1920, height: 1080 };
const VIEWPORT_9_16 = { width: 1080, height: 1920 };

async function login(page: any) {
  console.log("[capture] Signing in...");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // Check if already logged in
  if (page.url().includes("/dashboard")) {
    console.log("[capture] Already authenticated");
    return;
  }
  
  await page.fill('input[type="email"]', REVIEWER_EMAIL);
  await page.fill('input[type="password"]', REVIEWER_PASSWORD ?? "restoration2024");
  await page.click('button:has-text("Sign In")');
  
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    console.log("[capture] Authenticated successfully");
  } catch (e) {
    console.error("[capture] Login failed — capturing public pages only");
  }
  await page.waitForTimeout(2000);
}

interface Shot {
  name: string;
  url: string;
  viewport?: typeof VIEWPORT_16_9;
  waitFor?: string;
  click?: string;
  fill?: Record<string, string>;
  fullPage?: boolean;
}

const SHOTS: Shot[] = [
  // Auth
  { name: "sign-in", url: "/login", viewport: VIEWPORT_16_9 },
  { name: "sign-up", url: "/signup", viewport: VIEWPORT_16_9 },

  // Dashboard
  { name: "dashboard", url: "/dashboard", viewport: VIEWPORT_16_9, waitFor: "[data-testid='dashboard-stats']" },

  // Inspections
  { name: "inspections-list", url: "/dashboard/inspections", viewport: VIEWPORT_16_9 },
  { name: "inspection-new", url: "/dashboard/inspections/new", viewport: VIEWPORT_16_9 },
  { name: "inspection-detail", url: "/dashboard/inspections", viewport: VIEWPORT_16_9, click: "a[href*='/inspections/']" },

  // Reports
  { name: "reports-list", url: "/dashboard/reports", viewport: VIEWPORT_16_9 },
  { name: "report-builder", url: "/dashboard/reports/new", viewport: VIEWPORT_16_9 },

  // Evidence
  { name: "evidence-capture", url: "/dashboard/inspections", viewport: VIEWPORT_16_9, click: "button:has-text('Capture')" },
  { name: "moisture-mapping", url: "/dashboard/inspections", viewport: VIEWPORT_16_9, click: "button:has-text('Moisture')" },

  // Team & Clients
  { name: "team-management", url: "/dashboard/team", viewport: VIEWPORT_16_9 },
  { name: "client-portal", url: "/dashboard/clients", viewport: VIEWPORT_16_9 },

  // Business
  { name: "analytics-overview", url: "/dashboard/analytics", viewport: VIEWPORT_16_9 },
  { name: "compliance-checklists", url: "/dashboard/compliance", viewport: VIEWPORT_16_9 },
  { name: "invoice-generator", url: "/dashboard/invoices", viewport: VIEWPORT_16_9 },
  { name: "quote-builder", url: "/dashboard/quotes", viewport: VIEWPORT_16_9 },

  // Settings & Integrations
  { name: "settings-profile", url: "/dashboard/settings", viewport: VIEWPORT_16_9 },
  { name: "settings-notifications", url: "/dashboard/settings/notifications", viewport: VIEWPORT_16_9 },
  { name: "settings-billing", url: "/dashboard/settings/billing", viewport: VIEWPORT_16_9 },
  { name: "integration-connect", url: "/dashboard/integrations", viewport: VIEWPORT_16_9 },

  // Pricing (marketing page)
  { name: "pricing-page", url: "/pricing", viewport: VIEWPORT_16_9 },

  // Mobile workflow (9:16)
  { name: "mobile-dashboard", url: "/dashboard", viewport: VIEWPORT_9_16 },
  { name: "mobile-inspection", url: "/dashboard/inspections/new", viewport: VIEWPORT_9_16 },

  // LinkedIn shorts (9:16)
  { name: "short-admin-stat", url: "/dashboard", viewport: VIEWPORT_9_16 },
  { name: "short-claim-story", url: "/dashboard/inspections", viewport: VIEWPORT_9_16 },
];

async function clearOverlays(page: any) {
  await page.evaluate(() => {
    const selectors = [
      '[class*="toast"]', '[class*="Toast"]', '[role="status"]', '[role="alert"]',
      '[data-sonner-toast]', '[data-sonner-toaster]',
      '[class*="sync-indicator"]', '[class*="trial-banner"]', '[class*="upgrade"]',
      '[class*="chat-bubble"]', '[class*="intercom-launcher"]',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    }
  }).catch(() => {});
  await page.waitForTimeout(300);
}

async function capture(page: any, shot: Shot) {
  const url = shot.url.startsWith("http") ? shot.url : `${BASE}${shot.url}`;
  console.log(`[capture] ${shot.name} → ${url}`);

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);

    if (shot.waitFor) {
      await page.waitForSelector(shot.waitFor, { timeout: 10000 }).catch(() => {});
    }

    if (shot.fill) {
      for (const [sel, val] of Object.entries(shot.fill)) {
        await page.fill(sel, val).catch(() => {});
      }
      await page.waitForTimeout(500);
    }

    if (shot.click) {
      const el = page.locator(shot.click).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    await clearOverlays(page);

    const outPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({
      path: outPath,
      fullPage: shot.fullPage ?? false,
    });

    const stats = fs.statSync(outPath);
    console.log(`  ✓ ${shot.name}.png (${Math.round(stats.size / 1024)} KB)`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${shot.name}: ${e}`);
    return false;
  }
}

async function main() {
  console.log(`[capture] Output: ${outDir}`);
  console.log(`[capture] Base URL: ${BASE}`);
  console.log(`[capture] Headless: ${HEADLESS}\n`);

  const browser = await chromium.launch({ headless: HEADLESS });

  // Create authenticated context for dashboard shots
  const authContext = await browser.newContext({ viewport: VIEWPORT_16_9 });
  const authPage = await authContext.newPage();
  await login(authPage);

  let ok = 0;
  let fail = 0;

  for (const shot of SHOTS) {
    const isPublic = shot.url === "/pricing" || shot.url === "/login" || shot.url === "/signup";
    
    if (isPublic) {
      // Public pages: fresh context
      const context = await browser.newContext({
        viewport: shot.viewport ?? VIEWPORT_16_9,
      });
      const page = await context.newPage();
      const success = await capture(page, shot);
      success ? ok++ : fail++;
      await context.close();
    } else {
      // Authenticated pages: reuse auth context with new viewport
      const context = await browser.newContext({
        viewport: shot.viewport ?? VIEWPORT_16_9,
        storageState: await authContext.storageState(),
      });
      const page = await context.newPage();
      const success = await capture(page, shot);
      success ? ok++ : fail++;
      await context.close();
    }
  }

  await authContext.close();
  await browser.close();

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Captured: ${ok} / ${SHOTS.length}`);
  console.log(`  Failed:   ${fail}`);
  console.log(`  Output:   ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
