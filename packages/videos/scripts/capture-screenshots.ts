/**
 * packages/videos/scripts/capture-screenshots.ts
 *
 * Captures 6 real app screenshots at 1920×1080 for the CinematicLandingV2 v3 video.
 *
 * Prerequisites:
 *   - App running at NEXTAUTH_URL (default: http://localhost:3001)
 *   - CAPTURE_EMAIL and CAPTURE_PASSWORD set in .env.local
 *   - npx playwright install chromium
 *
 * Usage:
 *   cd packages/videos
 *   NEXTAUTH_URL=http://localhost:3001 CAPTURE_EMAIL=... CAPTURE_PASSWORD=... npx ts-node scripts/capture-screenshots.ts
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3001";
const EMAIL = process.env.CAPTURE_EMAIL || "";
const PASSWORD = process.env.CAPTURE_PASSWORD || "";
const OUT_DIR = path.resolve(__dirname, "../public/screenshots/real");

interface Capture {
  name: string;
  route: string;
  output: string;
  waitFor?: string; // CSS selector to wait for
}

async function findFirstId(
  page: import("playwright").Page,
  listRoute: string,
  linkPattern: RegExp,
): Promise<string | null> {
  await page.goto(`${BASE_URL}${listRoute}`, { waitUntil: "networkidle" });
  const links = await page.$$eval("a[href]", (els) =>
    els.map((el) => el.getAttribute("href") || ""),
  );
  for (const href of links) {
    const m = href.match(linkPattern);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "[capture] Set CAPTURE_EMAIL and CAPTURE_PASSWORD in .env.local",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Login
  console.log("[capture] Logging in...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/dashboard**`, { timeout: 15000 });
  console.log("[capture] Logged in.");

  // Resolve real IDs
  const reportId = await findFirstId(
    page,
    "/dashboard/reports",
    /\/dashboard\/reports\/([a-z0-9-]+)/,
  );
  const inspectionId = await findFirstId(
    page,
    "/dashboard/inspections",
    /\/dashboard\/inspections\/([a-z0-9-]+)/,
  );

  const captures: Capture[] = [
    {
      name: "dashboard",
      route: "/dashboard",
      output: "dashboard.png",
    },
    {
      name: "scope",
      route: reportId
        ? `/dashboard/reports/${reportId}/edit`
        : "/dashboard/reports",
      output: "scope.png",
    },
    {
      name: "compliance",
      route: reportId ? `/dashboard/reports/${reportId}` : "/dashboard/reports",
      output: "compliance.png",
    },
    {
      name: "report",
      route: inspectionId
        ? `/dashboard/inspections/${inspectionId}`
        : "/dashboard/inspections",
      output: "report.png",
    },
    {
      name: "moisture",
      route: inspectionId
        ? `/dashboard/inspections/${inspectionId}/sketch-preview`
        : "/dashboard/inspections",
      output: "moisture.png",
    },
    {
      name: "invoice",
      route: "/dashboard/invoices",
      output: "invoice.png",
    },
  ];

  for (const capture of captures) {
    console.log(`[capture] ${capture.name}: ${capture.route}`);
    try {
      await page.goto(`${BASE_URL}${capture.route}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      const outPath = path.join(OUT_DIR, capture.output);
      await page.screenshot({ path: outPath, type: "png" });
      console.log(`[capture] ✓ ${capture.output}`);
    } catch (err) {
      console.warn(
        `[capture] ✗ ${capture.name} failed: ${(err as Error).message}`,
      );
    }
  }

  await browser.close();
  console.log(`\n[capture] Done. Screenshots in: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[capture] FAILED:", err);
  process.exit(1);
});
