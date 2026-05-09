import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-submit-screenshots";
fs.mkdirSync(SS, { recursive: true });

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";
const REVIEW_NOTES = "Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.\n\n3.1.1(a): All billing CTAs removed from iOS shell.\n3.1.1(b): Subscription/credits panel fully hidden on iOS via BillingGate.\n3.1.1(b) B2B: Subscriptions contracted at business level via web portal, not in-app.\n4.2: Native GPS, share sheet, haptics, local notifications, Bluetooth meter bridge, offline job cache.\n2.1(a): Delete Account button fixed with type=button and touch-manipulation on iPad.\n\nReviewer account: reviewer@restoreassist.app / see Sign-In Information above.";

async function ss(page, name) {
  await page.screenshot({ path: SS + "/" + name + ".png" }).catch(() => {});
  console.log("[asc] screenshot: " + name);
}

console.log("[asc] launching Chrome — DO NOT close the browser window");
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome", headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.goto("https://appstoreconnect.apple.com/apps", { timeout: 30000 }).catch(() => {});
await ss(page, "01-start");

// Poll every 5s for up to 5 minutes for login
console.log("[asc] waiting for you to sign in (up to 5 minutes)...");
let loggedIn = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(5000);
  const url = page.url();
  if (url.includes("appstoreconnect.apple.com") && !url.includes("login") && !url.includes("FAILED")) {
    loggedIn = true;
    console.log("[asc] logged in: " + url);
    break;
  }
  process.stdout.write(".");
}
console.log("");

if (!loggedIn) {
  console.log("[asc] timed out");
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(3000);
await ss(page, "02-logged-in");

// Find RestoreAssist
console.log("[asc] finding RestoreAssist...");
const allLinks = await page.locator("a").all();
for (const link of allLinks) {
  const txt = (await link.textContent().catch(() => "")).trim();
  if (txt === "RestoreAssist") { await link.click(); break; }
}
await page.waitForTimeout(3000);
await ss(page, "03-app");
console.log("[asc] URL: " + page.url());

// Find 1.0 version link
const v10 = page.getByRole("link", { name: /1\.0/ }).first();
if (await v10.isVisible({ timeout: 8000 })) { await v10.click(); await page.waitForTimeout(3000); }
await ss(page, "04-version");

// Remove from Review
const removeBtn = page.getByRole("button", { name: /Remove from Review/i });
if (await removeBtn.isVisible({ timeout: 5000 })) {
  await removeBtn.click(); await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) { await ok.click(); await page.waitForTimeout(3000); }
  console.log("[asc] removed from review");
}
await ss(page, "05-status");

// Build area
await ss(page, "06-build-area");

// Click add build (+) button
const addBuild = page.getByRole("button", { name: /Add Build/i }).first();
if (await addBuild.isVisible({ timeout: 5000 })) {
  await addBuild.click(); await page.waitForTimeout(3000);
}
await ss(page, "07-picker");

// Select build 10
const rows = await page.locator("td, tr, li, [role='row'], [role='option']").all();
for (const row of rows) {
  const txt = await row.textContent().catch(() => "");
  if (txt.includes("1.0 (10)") || (txt.includes("1.0") && txt.includes("(10)"))) {
    await row.click(); await page.waitForTimeout(1000); break;
  }
}

// Done
const done = page.getByRole("button", { name: /Done|Select/i }).first();
if (await done.isVisible({ timeout: 3000 })) { await done.click(); await page.waitForTimeout(2000); }
await ss(page, "08-build-done");

// Credentials
console.log("[asc] filling credentials...");
const inputs = await page.locator("input").all();
for (const inp of inputs) {
  const ph = (await inp.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  const type = (await inp.getAttribute("type").catch(() => "") || "").toLowerCase();
  const lbl = (await inp.getAttribute("aria-label").catch(() => "") || "").toLowerCase();
  if ((ph + lbl).match(/username|email|user name/) && type !== "password") {
    await inp.clear(); await inp.fill(REVIEWER_EMAIL);
  }
  if (type === "password" || (ph + lbl).includes("password")) {
    await inp.clear(); await inp.fill(REVIEWER_PASSWORD);
  }
}

// Notes
const tas = await page.locator("textarea").all();
for (const ta of tas) {
  const ph = (await ta.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  const lbl = (await ta.getAttribute("aria-label").catch(() => "") || "").toLowerCase();
  if ((ph + lbl).match(/notes|comment/) || tas.length === 1) {
    await ta.click(); await page.keyboard.selectAll(); await ta.fill(REVIEW_NOTES); break;
  }
}
await ss(page, "09-filled");

// Save
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (await saveBtn.isVisible({ timeout: 5000 })) { await saveBtn.click(); await page.waitForTimeout(3000); }
await ss(page, "10-saved");

// Submit
const submitBtn = page.getByRole("button", { name: /Submit for Review|Add for Review/i }).first();
if (await submitBtn.isVisible({ timeout: 10000 })) {
  await submitBtn.click(); await page.waitForTimeout(3000);
  const confirmBtn = page.getByRole("button", { name: /Submit|Confirm/i }).first();
  if (await confirmBtn.isVisible({ timeout: 3000 })) { await confirmBtn.click(); await page.waitForTimeout(3000); }
  console.log("[asc] SUBMITTED FOR REVIEW");
} else {
  console.log("[asc] Submit button not found — check screenshots");
}
await ss(page, "11-done");
console.log("[asc] final URL: " + page.url());
await page.waitForTimeout(60000);
await browser.close();
