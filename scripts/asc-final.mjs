import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-final-screenshots";
fs.mkdirSync(SS, { recursive: true });

const REVIEW_URL = "https://appstoreconnect.apple.com/apps/6761808113/distribution/reviewsubmissions";
const VERSION_URL = "https://appstoreconnect.apple.com/apps/6761808113/distribution/ios/version/inflight";
const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";
const REVIEW_NOTES = "Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.\n\n3.1.1(a): All billing CTAs removed from iOS shell.\n3.1.1(b): Subscription/credits panel fully hidden via BillingGate.\n3.1.1(b) B2B: Subscriptions contracted at business level via web portal.\n4.2: Native GPS, share, haptics, local notifications, Bluetooth bridge, offline cache.\n2.1(a): Delete Account button fixed on iPad.\n\nReviewer: reviewer@restoreassist.app / see Sign-In Information above.";

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
await page.goto(REVIEW_URL, { timeout: 30000, waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);

if (page.url().includes("login") || page.url().includes("FAILED")) {
  console.log("[asc] sign in please...");
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    if (!page.url().includes("login") && !page.url().includes("FAILED")) {
      await page.goto(REVIEW_URL, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log("[asc] signed in");
      break;
    }
    process.stdout.write(".");
  }
  console.log("");
}

await ss(page, "01-submissions");
console.log("[asc] URL:", page.url());

// Click the "Today at" link (most recent submission = Waiting for Review)
const todayLink = page.locator("text=/Today at/").first();
if (await todayLink.isVisible({ timeout: 5000 })) {
  const href = await todayLink.getAttribute("href").catch(() => "");
  console.log("[asc] clicking submission:", href);
  await todayLink.click();
  await page.waitForTimeout(3000);
} else {
  // Try clicking first Waiting for Review row
  const waitingRow = page.locator("text=Waiting for Review").first();
  await waitingRow.locator("..").click().catch(() => {});
  await page.waitForTimeout(3000);
}
await ss(page, "02-submission-detail");
console.log("[asc] URL:", page.url());

// Look for Remove from Review
const removeEl = page.locator("text=Remove from Review").first();
const removeBtn = page.getByRole("button", { name: /Remove from Review/i }).first();
let removed = false;

if (await removeBtn.isVisible({ timeout: 5000 })) {
  await removeBtn.click(); await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) { await ok.click(); await page.waitForTimeout(3000); }
  removed = true;
  console.log("[asc] removed from review via button");
} else if (await removeEl.isVisible({ timeout: 3000 })) {
  await removeEl.click(); await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) { await ok.click(); await page.waitForTimeout(3000); }
  removed = true;
  console.log("[asc] removed from review via text");
} else {
  // Log all text on page to find the button
  const pageText = await page.evaluate(() => document.body.innerText);
  const hasRemove = pageText.includes("Remove");
  console.log("[asc] 'Remove' in page text:", hasRemove);
  if (hasRemove) {
    const lines = pageText.split('\n').filter(l => l.includes('Remove'));
    lines.forEach(l => console.log("  > " + l.trim()));
  }
  await ss(page, "02b-no-remove-found");
}

if (!removed) {
  console.log("[asc] could not remove — dumping all buttons:");
  const btns = await page.locator("button, a[role='button']").all();
  for (const b of btns) {
    const t = (await b.textContent().catch(() => "")).trim();
    const l = await b.getAttribute("aria-label").catch(() => "");
    if (t || l) console.log(`  btn: "${t}" / "${l}"`);
  }
  await page.waitForTimeout(120000);
  await browser.close();
  process.exit(1);
}
await ss(page, "03-removed");

// Navigate to version page to change build
console.log("[asc] navigating to version page...");
await page.goto(VERSION_URL, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
await ss(page, "04-version");

// Scroll to build section
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);

// Find build area — scroll gradually and screenshot
for (let scroll of [500, 1000, 1500, 2000]) {
  await page.evaluate(y => window.scrollTo(0, y), scroll);
  await page.waitForTimeout(300);
  const addBuild = page.getByRole("button", { name: /Add Build/i }).first();
  if (await addBuild.isVisible({ timeout: 1000 })) {
    console.log("[asc] found Add Build button at scroll", scroll);
    await addBuild.click(); await page.waitForTimeout(3000);
    await ss(page, "05-picker");
    // Select build 10
    const allItems = await page.locator("td, li, tr, [role='option'], [role='row']").all();
    for (const item of allItems) {
      const txt = (await item.textContent().catch(() => "")).trim();
      if (txt.includes("1.0 (10)") || txt.match(/\(10\)/)) {
        await item.click(); await page.waitForTimeout(1000);
        console.log("[asc] selected build 10:", txt.slice(0, 60));
        break;
      }
    }
    const done = page.getByRole("button", { name: /Done|Select/i }).first();
    if (await done.isVisible({ timeout: 3000 })) { await done.click(); await page.waitForTimeout(2000); }
    break;
  }
}
await ss(page, "06-build-set");

// Reviewer creds
const inputs = await page.locator("input").all();
for (const inp of inputs) {
  const ph = (await inp.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  const type = await inp.getAttribute("type").catch(() => "");
  if (ph.match(/username|email|user.name/) && type !== "password") {
    await inp.clear(); await inp.fill(REVIEWER_EMAIL);
  }
  if (type === "password" || ph.includes("password")) {
    await inp.clear(); await inp.fill(REVIEWER_PASSWORD);
  }
}
// Notes
const tas = await page.locator("textarea").all();
for (const ta of tas) {
  const ph = (await ta.getAttribute("placeholder").catch(() => "") || "").toLowerCase();
  if (ph.match(/notes|comment/) || tas.length <= 3) {
    await ta.click(); await page.keyboard.selectAll(); await ta.fill(REVIEW_NOTES); break;
  }
}

// Save
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
try {
  await saveBtn.waitFor({ state: "enabled", timeout: 8000 });
  await saveBtn.click(); await page.waitForTimeout(3000);
  console.log("[asc] saved");
} catch { console.log("[asc] save skipped (disabled or not found)"); }
await ss(page, "07-saved");

// Submit
const submitBtn = page.getByRole("button", { name: /Submit for Review|Add for Review/i }).first();
if (await submitBtn.isVisible({ timeout: 10000 })) {
  await submitBtn.click(); await page.waitForTimeout(3000);
  const conf = page.getByRole("button", { name: /Submit|Confirm/i }).first();
  if (await conf.isVisible({ timeout: 3000 })) { await conf.click(); await page.waitForTimeout(3000); }
  console.log("[asc] *** SUBMITTED WITH BUILD 10 ***");
} else {
  console.log("[asc] no Submit button — check screenshots");
}
await ss(page, "08-final");
console.log("[asc] final URL:", page.url());
await page.waitForTimeout(120000);
await browser.close();
