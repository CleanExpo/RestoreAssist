import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-swap-screenshots";
fs.mkdirSync(SS, { recursive: true });

async function ss(page, name) {
  await page.screenshot({ path: `${SS}/${name}.png` }).catch(() => {});
  console.log("[asc] screenshot: " + name);
}

const TARGET =
  "https://appstoreconnect.apple.com/apps/6761808113/distribution/ios/version/inflight";

console.log("[asc] opening browser — sign in when prompted, DO NOT CLOSE");
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
await page
  .goto(TARGET, { timeout: 30000, waitUntil: "domcontentloaded" })
  .catch(() => {});
await page.waitForTimeout(2000);

// Wait for login if needed
if (page.url().includes("login") || page.url().includes("FAILED")) {
  console.log("[asc] waiting for sign-in (up to 3 min)...");
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    const url = page.url();
    if (!url.includes("login") && !url.includes("FAILED")) {
      console.log("[asc] signed in — navigating to version page...");
      await page.goto(TARGET, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      break;
    }
    process.stdout.write(".");
  }
  console.log("");
}

await ss(page, "01-loaded");
console.log("[asc] URL:", page.url());

// Remove from review if needed
const removeBtn = page.getByRole("button", { name: /Remove from Review/i });
if (await removeBtn.isVisible({ timeout: 5000 })) {
  console.log("[asc] removing from review first...");
  await removeBtn.click();
  await page.waitForTimeout(2000);
  const ok = page.getByRole("button", { name: /Remove|OK|Confirm/i }).first();
  if (await ok.isVisible({ timeout: 3000 })) {
    await ok.click();
    await page.waitForTimeout(3000);
  }
  console.log("[asc] removed");
}

// Scroll to build section — it's usually near the top
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);
await ss(page, "02-top");

// Take screenshot of entire page sections
await page.evaluate(() => window.scrollTo(0, 300));
await page.waitForTimeout(500);
await ss(page, "03-mid");

// Find the build remove (-) button
console.log("[asc] looking for build remove button...");
// Try various selectors for the build row
const buildSection = await page.locator("text=Build").first();
if (await buildSection.isVisible({ timeout: 5000 })) {
  await buildSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await ss(page, "04-build-section");
}

// Find any remove button near build 7
const allBtns = await page.locator("button, a[role='button']").all();
console.log(`[asc] found ${allBtns.length} buttons`);
for (const btn of allBtns) {
  const label = (
    (await btn.getAttribute("aria-label").catch(() => "")) || ""
  ).toLowerCase();
  const txt = (await btn.textContent().catch(() => "")).trim();
  const title = (
    (await btn.getAttribute("title").catch(() => "")) || ""
  ).toLowerCase();
  if (
    label.includes("remove") ||
    title.includes("remove") ||
    txt === "−" ||
    txt === "-"
  ) {
    console.log(`[asc] found remove button: label="${label}" txt="${txt}"`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    console.log("[asc] clicked remove");
    await page.waitForTimeout(2000);
    break;
  }
}
await ss(page, "05-after-remove");

// Now add build 10
console.log("[asc] looking for Add Build...");
const allBtns2 = await page.locator("button, a[role='button']").all();
for (const btn of allBtns2) {
  const label = (
    (await btn.getAttribute("aria-label").catch(() => "")) || ""
  ).toLowerCase();
  const txt = (await btn.textContent().catch(() => "")).trim();
  if (
    label.includes("add") ||
    txt.includes("+") ||
    txt.toLowerCase().includes("add build")
  ) {
    console.log(`[asc] clicking add: "${txt}" / "${label}"`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(3000);
    break;
  }
}
await ss(page, "06-picker");

// Select build 10 from picker
console.log("[asc] looking for build 10 in picker...");
const allCells = await page
  .locator("td, tr, li, [role='option'], [role='row'], div")
  .all();
for (const cell of allCells) {
  const txt = (await cell.textContent().catch(() => "")).trim();
  if (txt.includes("1.0 (10)") || txt.match(/\(10\)/)) {
    console.log(`[asc] clicking build 10: "${txt.slice(0, 50)}"`);
    await cell.click();
    await page.waitForTimeout(1000);
    break;
  }
}
await ss(page, "07-build10-selected");

// Done / Select button
for (const name of ["Done", "Select", "Choose"]) {
  const b = page.getByRole("button", { name }).first();
  if (await b.isVisible({ timeout: 2000 })) {
    await b.click();
    await page.waitForTimeout(2000);
    break;
  }
}
await ss(page, "08-done");

// Save
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (await saveBtn.isVisible({ timeout: 5000 })) {
  await saveBtn.click();
  await page.waitForTimeout(3000);
  console.log("[asc] saved");
}
await ss(page, "09-saved");

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
  console.log("[asc] *** SUBMITTED WITH BUILD 10 ***");
} else {
  console.log("[asc] no Submit button — check screenshot 09-saved.png");
}
await ss(page, "10-final");
console.log("[asc] URL:", page.url());
console.log("[asc] screenshots at", SS);
await page.waitForTimeout(90000);
await browser.close();
