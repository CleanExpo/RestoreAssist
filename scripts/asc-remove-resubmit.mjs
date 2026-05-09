import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-remove-screenshots";
fs.mkdirSync(SS, { recursive: true });

const TARGET = "https://appstoreconnect.apple.com/apps/6761808113/distribution/ios/version/inflight";
const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";
const REVIEW_NOTES = "Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.\n\n3.1.1(a): All billing CTAs removed from iOS shell.\n3.1.1(b): Subscription/credits panel fully hidden on iOS via BillingGate.\n3.1.1(b) B2B: Subscriptions contracted at business level via web portal, not in-app.\n4.2: Native GPS, share sheet, haptics, local notifications, Bluetooth meter bridge, offline job cache.\n2.1(a): Delete Account button fixed with type=button and touch-manipulation on iPad.\n\nReviewer: reviewer@restoreassist.app / see Sign-In Information above.";

async function ss(page, name) {
  await page.screenshot({ path: `${SS}/${name}.png`, fullPage: true }).catch(() => {});
  console.log("[asc] screenshot: " + name);
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome", headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.goto(TARGET, { timeout: 30000, waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);

if (page.url().includes("login") || page.url().includes("FAILED")) {
  console.log("[asc] sign in please (3 min timeout)...");
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    if (!page.url().includes("login") && !page.url().includes("FAILED")) {
      await page.goto(TARGET, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log("[asc] signed in");
      break;
    }
    process.stdout.write(".");
  }
  console.log("");
}

await ss(page, "01-full-page");
console.log("[asc] URL:", page.url());

// Dump ALL button text and aria-labels to find Remove from Review
const allBtns = await page.locator("button, a[role='button'], [role='button']").all();
console.log(`[asc] total interactive elements: ${allBtns.length}`);
for (const btn of allBtns) {
  const txt = (await btn.textContent().catch(() => "")).trim();
  const label = await btn.getAttribute("aria-label").catch(() => "");
  if (txt || label) console.log(`  > "${txt}" | aria="${label}"`);
}

// Find Remove from Review by text anywhere on page
const allText = await page.evaluate(() => document.body.innerText);
const hasRemove = allText.includes("Remove from Review");
console.log("[asc] 'Remove from Review' in page text:", hasRemove);

// Try clicking it by text
const removeEl = page.locator("text=Remove from Review").first();
if (await removeEl.isVisible({ timeout: 3000 })) {
  console.log("[asc] found Remove from Review — clicking...");
  await removeEl.click();
  await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) { await ok.click(); await page.waitForTimeout(3000); }
  console.log("[asc] removed from review");
  await ss(page, "02-removed");
} else {
  console.log("[asc] 'Remove from Review' not clickable — page may be locked");
  await ss(page, "02-locked");
  // Try the App Review left nav link to find the button
  const appReviewLink = page.getByRole("link", { name: /App Review/i }).first();
  if (await appReviewLink.isVisible({ timeout: 3000 })) {
    await appReviewLink.click();
    await page.waitForTimeout(2000);
    await ss(page, "02b-app-review");
    const removeEl2 = page.locator("text=Remove from Review").first();
    if (await removeEl2.isVisible({ timeout: 3000 })) {
      await removeEl2.click(); await page.waitForTimeout(2000);
      const ok2 = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
      if (await ok2.isVisible({ timeout: 3000 })) { await ok2.click(); await page.waitForTimeout(3000); }
      console.log("[asc] removed via App Review link");
      await ss(page, "02c-removed");
    }
  }
}

// Now should be Prepare for Submission — scroll to build section
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);

// Find build add button
const addBuild = page.getByRole("button", { name: /Add Build/i }).first();
if (await addBuild.isVisible({ timeout: 5000 })) {
  await addBuild.click(); await page.waitForTimeout(3000);
  await ss(page, "03-picker");
  // Select build 10
  const cells = await page.locator("td, tr, li, [role='option']").all();
  for (const cell of cells) {
    const txt = (await cell.textContent().catch(() => "")).trim();
    if (txt.includes("1.0 (10)") || txt.match(/\b10\b/) && txt.includes("1.0")) {
      await cell.click(); await page.waitForTimeout(1000);
      console.log("[asc] selected build 10");
      break;
    }
  }
  const done = page.getByRole("button", { name: /Done|Select/i }).first();
  if (await done.isVisible({ timeout: 3000 })) { await done.click(); await page.waitForTimeout(2000); }
}
await ss(page, "04-build-set");

// Fill reviewer creds and notes
const inputs = await page.locator("input").all();
for (const inp of inputs) {
  const ph = (await inp.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  const type = (await inp.getAttribute("type").catch(() => "") || "");
  if (ph.match(/username|email|user.name/) && type !== "password") {
    await inp.clear(); await inp.fill(REVIEWER_EMAIL);
  }
  if (type === "password" || ph.includes("password")) {
    await inp.clear(); await inp.fill(REVIEWER_PASSWORD);
  }
}
const tas = await page.locator("textarea").all();
for (const ta of tas) {
  const ph = (await ta.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  if (ph.match(/notes|comment/) || tas.length <= 2) {
    await ta.click(); await page.keyboard.selectAll(); await ta.fill(REVIEW_NOTES); break;
  }
}

// Save (wait for it to be enabled)
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
await saveBtn.waitFor({ state: "enabled", timeout: 10000 }).catch(() => {});
if (await saveBtn.isEnabled().catch(() => false)) {
  await saveBtn.click(); await page.waitForTimeout(3000); console.log("[asc] saved");
}
await ss(page, "05-saved");

// Submit
const submitBtn = page.getByRole("button", { name: /Submit for Review|Add for Review/i }).first();
if (await submitBtn.isVisible({ timeout: 10000 })) {
  await submitBtn.click(); await page.waitForTimeout(3000);
  const conf = page.getByRole("button", { name: /Submit|Confirm/i }).first();
  if (await conf.isVisible({ timeout: 3000 })) { await conf.click(); await page.waitForTimeout(3000); }
  console.log("[asc] *** SUBMITTED WITH BUILD 10 ***");
} else {
  console.log("[asc] no Submit button found — check screenshots");
}
await ss(page, "06-final");
console.log("[asc] final URL:", page.url());
await page.waitForTimeout(120000);
await browser.close();
