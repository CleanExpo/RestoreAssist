/**
 * asc-submit.mjs — Autonomous App Store Connect submission swap
 * Removes build 7, selects build 10, updates reviewer creds, submits for review.
 */
import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SCREENSHOTS = "/tmp/asc-submit-screenshots";
fs.mkdirSync(SCREENSHOTS, { recursive: true });

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";
const REVIEW_NOTES = `Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.

3.1.1(a): All billing CTAs removed from iOS shell — nav, settings sidebar, credits page.
3.1.1(b): Subscription/credits panel fully hidden on iOS via BillingGate component.
3.1.1(b) B2B: Subscriptions contracted at business level via web portal, not in-app.
4.2: Native GPS, share sheet, haptics, local notifications, Bluetooth meter bridge, offline job cache.
2.1(a): Delete Account button fixed — type="button" + touch-manipulation on iPad.

Reviewer account: reviewer@restoreassist.app / see Sign-In Information above.`;

async function screenshot(page, name) {
  const p = `${SCREENSHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[screenshot] ${p}`);
}

console.log("[asc] launching Chrome...");
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

// ── 1. Navigate to App Store Connect ──────────────────────────────────────────
console.log("[asc] navigating to appstoreconnect.apple.com...");
await page.goto("https://appstoreconnect.apple.com/apps", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForTimeout(3000);
await screenshot(page, "01-landing");
console.log("[asc] URL:", page.url());

// Handle Apple ID login if needed
if (page.url().includes("appleid") || page.url().includes("signin") || page.url().includes("auth")) {
  console.log("[asc] Apple ID sign-in detected — waiting up to 60s for manual login...");
  await page.waitForURL("**/appstoreconnect.apple.com/**", { timeout: 60000 });
  await page.waitForTimeout(3000);
}
await screenshot(page, "02-apps-list");

// ── 2. Find RestoreAssist ──────────────────────────────────────────────────────
console.log("[asc] looking for RestoreAssist...");
const appLink = page.locator('text=RestoreAssist').first();
if (await appLink.isVisible({ timeout: 10000 })) {
  await appLink.click();
  await page.waitForTimeout(3000);
} else {
  // Try direct navigation
  await page.goto("https://appstoreconnect.apple.com/apps", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const links = await page.locator('a').all();
  for (const link of links) {
    const text = await link.textContent().catch(() => "");
    if (text?.includes("RestoreAssist")) {
      await link.click();
      await page.waitForTimeout(3000);
      break;
    }
  }
}
await screenshot(page, "03-app-page");
console.log("[asc] URL:", page.url());

// ── 3. Navigate to iOS version / Prepare for Submission ───────────────────────
console.log("[asc] navigating to iOS app version...");
// Look for the version link (1.0 Prepare for Submission or similar)
const versionLink = page.locator('text=Prepare for Submission, text=1.0, a[href*="version"]').first();
if (await versionLink.isVisible({ timeout: 8000 })) {
  await versionLink.click();
  await page.waitForTimeout(3000);
}
await screenshot(page, "04-version");
console.log("[asc] URL:", page.url());

// If still in review, click Remove from Review
const removeBtn = page.locator('button:has-text("Remove from Review"), a:has-text("Remove from Review")').first();
if (await removeBtn.isVisible({ timeout: 5000 })) {
  console.log("[asc] removing from review...");
  await removeBtn.click();
  await page.waitForTimeout(2000);
  // Confirm dialog if it appears
  const confirmBtn = page.locator('button:has-text("Remove"), button:has-text("Confirm"), button:has-text("OK")').first();
  if (await confirmBtn.isVisible({ timeout: 3000 })) {
    await confirmBtn.click();
    await page.waitForTimeout(3000);
  }
  await screenshot(page, "05-removed-from-review");
  console.log("[asc] removed from review");
}

// ── 4. Remove build 7, add build 10 ───────────────────────────────────────────
console.log("[asc] looking for build selector...");
await screenshot(page, "06-before-build-change");

// Find and click the minus button next to the current build
const minusBtn = page.locator('[aria-label="Remove Build"], button[class*="remove"][class*="build"], .build-remove, button:near(:text("1.0 (7)"))').first();
if (await minusBtn.isVisible({ timeout: 5000 })) {
  console.log("[asc] removing build 7...");
  await minusBtn.click();
  await page.waitForTimeout(2000);
}

// Click + to add a build
const addBuildBtn = page.locator('button[aria-label*="Add Build"], button:has-text("+ Add"), a:has-text("Add Build"), button[class*="add-build"]').first();
if (await addBuildBtn.isVisible({ timeout: 5000 })) {
  console.log("[asc] clicking add build...");
  await addBuildBtn.click();
  await page.waitForTimeout(3000);
  // Select build 10
  const build10 = page.locator('text=1.0 (10)').first();
  if (await build10.isVisible({ timeout: 5000 })) {
    console.log("[asc] selecting build 10...");
    await build10.click();
    await page.waitForTimeout(1000);
    const doneBtn = page.locator('button:has-text("Done"), button:has-text("Select")').first();
    if (await doneBtn.isVisible({ timeout: 3000 })) {
      await doneBtn.click();
      await page.waitForTimeout(2000);
    }
  }
}
await screenshot(page, "07-after-build-change");

// ── 5. Update reviewer sign-in credentials ────────────────────────────────────
console.log("[asc] updating reviewer credentials...");
const emailField = page.locator('input[placeholder*="Username"], input[placeholder*="Email"], label:has-text("User Name") + input').first();
if (await emailField.isVisible({ timeout: 5000 })) {
  await emailField.triple_click();
  await emailField.fill(REVIEWER_EMAIL);
}
const passwordField = page.locator('input[placeholder*="Password"], label:has-text("Password") + input').first();
if (await passwordField.isVisible({ timeout: 5000 })) {
  await passwordField.triple_click();
  await passwordField.fill(REVIEWER_PASSWORD);
}
await screenshot(page, "08-reviewer-creds");

// ── 6. Update review notes ────────────────────────────────────────────────────
console.log("[asc] updating review notes...");
const notesField = page.locator('textarea[placeholder*="Notes"], label:has-text("Notes") + textarea, #notes').first();
if (await notesField.isVisible({ timeout: 5000 })) {
  await notesField.click();
  await page.keyboard.selectAll();
  await notesField.fill(REVIEW_NOTES);
}
await screenshot(page, "09-review-notes");

// ── 7. Save ────────────────────────────────────────────────────────────────────
console.log("[asc] saving...");
const saveBtn = page.locator('button:has-text("Save")').first();
if (await saveBtn.isVisible({ timeout: 5000 })) {
  await saveBtn.click();
  await page.waitForTimeout(3000);
}
await screenshot(page, "10-saved");

// ── 8. Submit for Review ──────────────────────────────────────────────────────
console.log("[asc] submitting for review...");
const submitBtn = page.locator('button:has-text("Submit for Review"), button:has-text("Add for Review")').first();
if (await submitBtn.isVisible({ timeout: 8000 })) {
  await submitBtn.click();
  await page.waitForTimeout(3000);
  // Handle any confirmation dialog
  const confirmSubmit = page.locator('button:has-text("Submit"), button:has-text("Confirm")').first();
  if (await confirmSubmit.isVisible({ timeout: 3000 })) {
    await confirmSubmit.click();
    await page.waitForTimeout(3000);
  }
  console.log("[asc] ✅ SUBMITTED FOR REVIEW");
} else {
  console.log("[asc] ⚠️  Submit button not found — check screenshots");
}

await screenshot(page, "11-final");
console.log("[asc] URL:", page.url());
console.log("[asc] screenshots saved to", SCREENSHOTS);

await browser.close();
console.log("[asc] done");
