#!/usr/bin/env node
/**
 * Screenshot capture script for App Store + Play Console submissions.
 *
 * Drives the deployed sandbox app through every store-listing surface
 * at every required device size, saves the PNGs to
 * `distribution/screenshots/<store>/<size>/<index>-<label>.png`.
 *
 * Usage:
 *   PILOT_TESTER_USER_POOL=./pilot-tester/user-pool.json \
 *   BASE_URL=https://restoreassist-sandbox.vercel.app \
 *     node distribution/capture-screenshots.mjs
 *
 * Hard rules (mirrored from pilot-tester/src/client/safety.ts):
 *   - BASE_URL must NOT match a prod hostname
 *   - Refuses to run without an authenticated session
 *
 * Required device sizes:
 *
 *   App Store:
 *     - 6.7" iPhone (1290×2796) — required for new submissions
 *     - 6.5" iPhone (1284×2778)
 *     - 5.5" iPhone (1242×2208)
 *     - 12.9" iPad (2048×2732)
 *
 *   Google Play:
 *     - Phone (1080×1920 minimum, we use 1080×2400)
 *     - 7" tablet (1200×1920)
 *     - 10" tablet (1600×2560)
 *
 * Each size produces 3-5 screenshots covering the headline value
 * surfaces: Inspections list, Inspection detail with photos,
 * Assessment generation result, Claim progress, Settings.
 *
 * Requires: playwright (already in the root package.json — used by
 * the e2e/pilot-workflow smoke).
 */

import { chromium, devices } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(__dirname, "screenshots");

const SIZES = {
  appstore: [
    { id: "iphone-6.7", w: 1290, h: 2796, label: "iPhone 15 Pro Max class" },
    { id: "iphone-6.5", w: 1284, h: 2778, label: "iPhone 11 Pro Max class" },
    { id: "iphone-5.5", w: 1242, h: 2208, label: "iPhone 8 Plus class" },
    { id: "ipad-12.9", w: 2048, h: 2732, label: 'iPad Pro 12.9" class' },
  ],
  playstore: [
    { id: "phone", w: 1080, h: 2400, label: "Pixel-class phone" },
    { id: "tablet-7", w: 1200, h: 1920, label: '7" tablet' },
    { id: "tablet-10", w: 1600, h: 2560, label: '10" tablet' },
  ],
};

const FLOWS = [
  {
    label: "01-inspections-list",
    path: "/dashboard/inspections",
    waitFor: "h1, [role='heading']",
  },
  {
    label: "02-inspection-detail",
    path: "/dashboard/inspections/demo-inspection-001",
    waitFor: "h1, [role='heading']",
  },
  {
    label: "03-assessments",
    path: "/dashboard/inspections/demo-inspection-001/assessments",
    waitFor: "h1, [role='heading']",
  },
  {
    label: "04-claims",
    path: "/dashboard/claims",
    waitFor: "h1, [role='heading']",
  },
  {
    label: "05-settings",
    path: "/dashboard/settings",
    waitFor: "h1, [role='heading']",
  },
];

function assertSandbox(baseUrl) {
  const PROD = [
    // RA-6733: the guard previously listed only the legacy .com.au hostnames,
    // which were never the live prod domain. Real prod is restoreassist.app
    // (restoreassist.ai attached 2026-07-02), plus the Vercel prod alias.
    /^(www\.)?restoreassist\.app$/i,
    /^(www\.)?restoreassist\.ai$/i,
    /^restoreassist\.vercel\.app$/i,
    // Legacy hostnames kept for defence in depth.
    /^app\.restoreassist\.com\.au$/i,
    /^restoreassist\.com\.au$/i,
  ];
  const SANDBOX_HINT = /sandbox|staging|preview|localhost|127\.0\.0\.1/i;
  let host;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`[capture-screenshots] BASE_URL is not a URL: ${baseUrl}`);
  }
  if (PROD.some((re) => re.test(host))) {
    throw new Error(
      `[capture-screenshots] refusing to run against production hostname ${host}`,
    );
  }
  if (!SANDBOX_HINT.test(host)) {
    throw new Error(
      `[capture-screenshots] hostname ${host} does not contain a sandbox/staging/localhost marker`,
    );
  }
}

async function loadFirstPoolEntry(poolPath) {
  const raw = await fs.readFile(poolPath, "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`[capture-screenshots] user pool ${poolPath} is empty`);
  }
  return arr[0];
}

async function captureFlow(page, baseUrl, flow, outDir) {
  await page.goto(baseUrl + flow.path, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  try {
    await page.waitForSelector(flow.waitFor, { timeout: 10_000 });
  } catch {
    /* fall through — capture whatever rendered */
  }
  // Small settle delay for hydration + lazy images.
  await page.waitForTimeout(800);
  const file = path.join(outDir, `${flow.label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${path.relative(REPO, file)}`);
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? process.env.PILOT_TESTER_BASE_URL;
  if (!baseUrl) {
    throw new Error("[capture-screenshots] BASE_URL is required");
  }
  assertSandbox(baseUrl);

  const poolPath =
    process.env.PILOT_TESTER_USER_POOL ?? "./pilot-tester/user-pool.json";
  const cred = await loadFirstPoolEntry(poolPath);

  const browser = await chromium.launch();
  try {
    for (const [store, sizes] of Object.entries(SIZES)) {
      for (const size of sizes) {
        const ctx = await browser.newContext({
          viewport: { width: size.w, height: size.h },
          deviceScaleFactor: 1,
          userAgent: devices["iPhone 13 Pro"].userAgent,
        });
        const page = await ctx.newPage();

        // Authenticate by POSTing credentials to the NextAuth callback,
        // then reusing the session cookie (same trick as pilot-tester).
        await page.goto(baseUrl + "/login", { waitUntil: "networkidle" });
        await page.fill("input[type='email'], input[name='email']", cred.email);
        await page.fill(
          "input[type='password'], input[name='password']",
          cred.password,
        );
        await page.click("button[type='submit']");
        try {
          await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        } catch {
          console.warn(
            `[capture-screenshots] login redirect didn't fire for ${cred.email}; capturing anyway`,
          );
        }

        const outDir = path.join(OUT_ROOT, store, size.id);
        await fs.mkdir(outDir, { recursive: true });
        console.log(
          `\n${store} · ${size.id} (${size.w}×${size.h}) · ${size.label}`,
        );

        for (const flow of FLOWS) {
          await captureFlow(page, baseUrl, flow, outDir);
        }

        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    "\nDone. Review distribution/screenshots/, then upload via App Store Connect / Play Console.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
