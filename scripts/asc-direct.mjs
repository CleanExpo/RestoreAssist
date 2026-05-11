import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-submit-screenshots";
const TARGET_URL =
  "https://appstoreconnect.apple.com/apps/6761808113/distribution/ios/version/inflight";
fs.mkdirSync(SS, { recursive: true });

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";
const REVIEW_NOTES =
  "Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.\n\n3.1.1(a): All billing CTAs removed from iOS shell.\n3.1.1(b): Subscription/credits panel fully hidden on iOS via BillingGate.\n3.1.1(b) B2B: Subscriptions contracted at business level via web portal, not in-app.\n4.2: Native GPS, share sheet, haptics, local notifications, Bluetooth meter bridge, offline job cache.\n2.1(a): Delete Account button fixed with type=button and touch-manipulation on iPad.\n\nReviewer account: reviewer@restoreassist.app / see Sign-In Information above.";

async function ss(page, name) {
  await page.screenshot({ path: SS + "/" + name + ".png" }).catch(() => {});
  console.log("[asc] screenshot: " + name);
}

console.log("[asc] launching — window will open and STAY OPEN");
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--profile-directory=Default",
  ],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

// Go directly to the inflight version page
console.log("[asc] navigating directly to version page...");
await page
  .goto(TARGET_URL, { timeout: 30000, waitUntil: "domcontentloaded" })
  .catch(() => {});
await page.waitForTimeout(3000);
await ss(page, "01-version-page");
console.log("[asc] URL: " + page.url());

// If redirected to login, wait for you to sign in (up to 3 min)
if (page.url().includes("login") || page.url().includes("FAILED")) {
  console.log("[asc] login required — waiting for you to sign in...");
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    const url = page.url();
    if (!url.includes("login") && !url.includes("FAILED")) {
      console.log("[asc] logged in!");
      // Navigate to target
      await page.goto(TARGET_URL, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      break;
    }
    process.stdout.write(".");
  }
  console.log("");
}

await ss(page, "02-on-page");
console.log("[asc] URL: " + page.url());

// Remove from Review if present
const removeBtn = page.getByRole("button", { name: /Remove from Review/i });
if (await removeBtn.isVisible({ timeout: 5000 })) {
  console.log("[asc] removing from review...");
  await removeBtn.click();
  await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) {
    await ok.click();
    await page.waitForTimeout(3000);
  }
  console.log("[asc] removed from review");
  await page.waitForTimeout(2000);
}
await ss(page, "03-status");

// Scroll down to build section
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(1000);
await ss(page, "04-scrolled");

// Try to interact with build
const addBuildBtn = page.getByRole("button", { name: /Add Build/i }).first();
if (await addBuildBtn.isVisible({ timeout: 5000 })) {
  await addBuildBtn.click();
  console.log("[asc] clicked Add Build");
  await page.waitForTimeout(3000);
  await ss(page, "05-picker");
  // Look for 1.0 (10)
  const rows = await page
    .locator("td, tr, li, [role='option'], [role='row']")
    .all();
  for (const row of rows) {
    const txt = await row.textContent().catch(() => "");
    if (
      txt.includes("1.0 (10)") ||
      (txt.includes("1.0") && txt.includes("10)"))
    ) {
      await row.click();
      await page.waitForTimeout(1000);
      console.log("[asc] selected build 10");
      break;
    }
  }
  const done = page.getByRole("button", { name: /Done|Select/i }).first();
  if (await done.isVisible({ timeout: 3000 })) {
    await done.click();
    await page.waitForTimeout(2000);
  }
}
await ss(page, "06-build");

// Scroll to reviewer section
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(1000);

// Fill credentials
const inputs = await page.locator("input").all();
for (const inp of inputs) {
  const ph = (
    (await inp.getAttribute("placeholder").catch(() => "")) || ""
  ).toLowerCase();
  const type = (
    (await inp.getAttribute("type").catch(() => "")) || ""
  ).toLowerCase();
  const lbl = (
    (await inp.getAttribute("aria-label").catch(() => "")) || ""
  ).toLowerCase();
  if ((ph + lbl).match(/username|email|user.name/) && type !== "password") {
    await inp.clear();
    await inp.fill(REVIEWER_EMAIL);
    console.log("[asc] filled email");
  }
  if (type === "password" || (ph + lbl).includes("password")) {
    await inp.clear();
    await inp.fill(REVIEWER_PASSWORD);
    console.log("[asc] filled password");
  }
}

// Notes
const tas = await page.locator("textarea").all();
for (const ta of tas) {
  const ph = (
    (await ta.getAttribute("placeholder").catch(() => "")) || ""
  ).toLowerCase();
  const lbl = (
    (await ta.getAttribute("aria-label").catch(() => "")) || ""
  ).toLowerCase();
  if ((ph + lbl).match(/notes|comment/) || tas.length <= 2) {
    await ta.click();
    await page.keyboard.selectAll();
    await ta.fill(REVIEW_NOTES);
    console.log("[asc] filled notes");
    break;
  }
}
await ss(page, "07-filled");

// Save
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (await saveBtn.isVisible({ timeout: 5000 })) {
  await saveBtn.click();
  await page.waitForTimeout(3000);
  console.log("[asc] saved");
}
await ss(page, "08-saved");

// Submit
const submitBtn = page
  .getByRole("button", { name: /Submit for Review|Add for Review/i })
  .first();
if (await submitBtn.isVisible({ timeout: 10000 })) {
  await submitBtn.click();
  await page.waitForTimeout(3000);
  const confirmBtn = page
    .getByRole("button", { name: /Submit|Confirm/i })
    .first();
  if (await confirmBtn.isVisible({ timeout: 3000 })) {
    await confirmBtn.click();
    await page.waitForTimeout(3000);
  }
  console.log("[asc] *** SUBMITTED FOR REVIEW ***");
} else {
  console.log("[asc] Submit button not found — manual step needed");
}
await ss(page, "09-final");
console.log("[asc] done. URL: " + page.url());

// Keep open for you to review
console.log("[asc] keeping browser open for 2 minutes...");
await page.waitForTimeout(120000);
await browser.close();
