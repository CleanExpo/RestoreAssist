import { chromium } from "@playwright/test";
import * as fs from "fs";
import { fileURLToPath } from "url";
import * as path from "path";

const CHROME_PROFILE = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
const OUT = "/tmp/asc-screenshots";
fs.mkdirSync(OUT, { recursive: true });

console.log("[asc] launching Chrome with your profile...");
const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
  channel: "chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

console.log("[asc] going to App Store Connect...");
await page.goto("https://appstoreconnect.apple.com/apps", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/01-apps-list.png` });
console.log("[asc] URL:", page.url());

// Save full text to understand what's on screen
const text1 = await page
  .evaluate(() => document.body.innerText)
  .catch(() => "");
fs.writeFileSync(`${OUT}/01-text.txt`, text1.slice(0, 5000));

// Try clicking RestoreAssist
const appLink = page.locator("text=RestoreAssist").first();
if (await appLink.isVisible({ timeout: 5000 }).catch(() => false)) {
  console.log("[asc] clicking RestoreAssist...");
  await appLink.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/02-app-page.png` });
  const text2 = await page
    .evaluate(() => document.body.innerText)
    .catch(() => "");
  fs.writeFileSync(`${OUT}/02-text.txt`, text2.slice(0, 5000));
  console.log("[asc] app page URL:", page.url());

  // Look for the version / app review / resolution center
  for (const label of [
    "Resolution Center",
    "App Review",
    "View Details",
    "1.0",
    "Rejected",
    "Review",
  ]) {
    const el = page.locator(`text=${label}`).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log(`[asc] visible: "${label}"`);
    }
  }
} else {
  console.log("[asc] RestoreAssist link not visible — may need to sign in");
  const text2 = await page
    .evaluate(() => document.body.innerText)
    .catch(() => "");
  fs.writeFileSync(`${OUT}/01-text.txt`, text2.slice(0, 3000));
}

console.log(`[asc] screenshots saved to ${OUT}`);
console.log("[asc] text content saved — reading now...");
await browser.close();
