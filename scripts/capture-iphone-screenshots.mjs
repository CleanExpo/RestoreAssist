import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const BASE = "https://restoreassist.app";
const EMAIL = "reviewer@restoreassist.app";
const PASSWORD = process.env.REVIEWER_PASSWORD;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "iphone-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { id: "6.9", w: 440, h: 956, dpr: 3, label: "6.9-inch" },
  { id: "6.7", w: 430, h: 932, dpr: 3, label: "6.7-inch" },
];

const PAGES = [
  { name: "1-dashboard",      path: "/dashboard" },
  { name: "2-inspections",    path: "/dashboard/inspections" },
  { name: "3-new-inspection", path: "/dashboard/inspections/new" },
  { name: "4-reports",        path: "/dashboard/reports" },
  { name: "5-settings",       path: "/dashboard/settings" },
];

const browser = await chromium.launch({ headless: true });

for (const size of SIZES) {
  console.log(`[${size.label}] logging in...`);
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.dpr,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(3000);
  for (const p of PAGES) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const file = path.join(OUT, `${size.id}-${p.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  ✓ ${path.basename(file)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nDone → ${OUT}`);
