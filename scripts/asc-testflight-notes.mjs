import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-tf-screenshots";
fs.mkdirSync(SS, { recursive: true });

// TestFlight build 10 — What to Test notes
const WHAT_TO_TEST = `RestoreAssist 1.0 (Build 10) — Key areas to test:

1. SIGN IN: Test email/password sign-in and Google sign-in
2. NEW INSPECTION: Create a new inspection, fill in property details, use GPS auto-fill
3. MOISTURE READINGS: Add moisture readings to rooms
4. PHOTOS: Capture photos and attach to inspection
5. REPORT: Generate a PDF report and use the share sheet to send it
6. SETTINGS: Verify Delete Account button works on iPad (tap it, modal opens, then cancel)
7. OFFLINE: Enable airplane mode — existing jobs should still be visible with offline banner
8. BILLING: Confirm no subscription/pricing CTAs appear anywhere in the app

Reviewer account: reviewer@restoreassist.app
Password: LX8#xHDHKTB^&$DHN7Au`;

const TESTFLIGHT_URL = "https://appstoreconnect.apple.com/apps/6761808113/testflight/ios";

async function ss(page, name) {
  await page.screenshot({ path: `${SS}/${name}.png`, fullPage: true }).catch(() => {});
  console.log("[tf] screenshot: " + name);
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome", headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.goto(TESTFLIGHT_URL, { timeout: 30000, waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);

if (page.url().includes("login") || page.url().includes("FAILED")) {
  console.log("[tf] sign in please...");
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    if (!page.url().includes("login") && !page.url().includes("FAILED")) {
      await page.goto(TESTFLIGHT_URL, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log("[tf] signed in");
      break;
    }
    process.stdout.write(".");
  }
  console.log("");
}

await ss(page, "01-testflight");
console.log("[tf] URL:", page.url());

// Find build 10 in the list
console.log("[tf] looking for build 10...");
const build10Links = await page.locator("a, td, tr").all();
for (const el of build10Links) {
  const txt = (await el.textContent().catch(() => "")).trim();
  if (txt.includes("1.0 (10)") || txt.match(/\b10\b/) && txt.includes("1.0")) {
    await el.click();
    console.log("[tf] clicked build 10:", txt.slice(0, 60));
    await page.waitForTimeout(3000);
    break;
  }
}
await ss(page, "02-build10");
console.log("[tf] URL:", page.url());

// Find "What to Test" textarea
const tas = await page.locator("textarea").all();
console.log(`[tf] found ${tas.length} textareas`);
let filled = false;
for (const ta of tas) {
  const ph = (await ta.getAttribute("placeholder").catch(() => "") || "");
  const label = (await ta.getAttribute("aria-label").catch(() => "") || "");
  console.log(`  textarea: placeholder="${ph}" label="${label}"`);
  if (ph.toLowerCase().includes("test") || label.toLowerCase().includes("test") || tas.length === 1) {
    await ta.click();
    await page.keyboard.selectAll();
    await ta.fill(WHAT_TO_TEST);
    filled = true;
    console.log("[tf] filled What to Test");
    break;
  }
}

if (!filled) {
  console.log("[tf] no textarea found — check screenshots");
  await ss(page, "02b-no-textarea");
  await page.waitForTimeout(120000);
  await browser.close();
  process.exit(1);
}
await ss(page, "03-filled");

// Save
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (await saveBtn.isVisible({ timeout: 5000 })) {
  await saveBtn.click(); await page.waitForTimeout(3000);
  console.log("[tf] saved");
}
await ss(page, "04-saved");
console.log("[tf] done — URL:", page.url());
await page.waitForTimeout(120000);
await browser.close();
