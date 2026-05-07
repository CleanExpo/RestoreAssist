import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE_COPY = "/tmp/chrome-profile-copy-pw";
const OUT = "/tmp/asc-screenshots";
fs.mkdirSync(OUT, { recursive: true });

// Set up a temp user-data-dir with copied Default profile
fs.mkdirSync(PROFILE_COPY, { recursive: true });
if (!fs.existsSync(`${PROFILE_COPY}/Default`)) {
  fs.cpSync("/tmp/chrome-profile-copy", `${PROFILE_COPY}/Default`, { recursive: true });
}

console.log("[asc] launching with copied Chrome profile...");
const browser = await chromium.launchPersistentContext(PROFILE_COPY, {
  channel: "chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
console.log("[asc] going to App Store Connect...");
await page.goto("https://appstoreconnect.apple.com/apps", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/01-apps.png` });

const text = await page.evaluate(() => document.body.innerText);
fs.writeFileSync(`${OUT}/01-text.txt`, text.slice(0, 6000));
console.log("[asc] page text (first 800 chars):");
console.log(text.slice(0, 800));

// Try to click RestoreAssist
const appLink = page.locator("text=RestoreAssist").first();
if (await appLink.isVisible({ timeout: 5000 }).catch(() => false)) {
  await appLink.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/02-restoreassist.png` });
  const t2 = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/02-text.txt`, t2.slice(0, 8000));
  console.log("\n[asc] RestoreAssist page:");
  console.log(t2.slice(0, 1500));
}

await browser.close();
