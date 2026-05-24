import { chromium } from "@playwright/test";
import * as fs from "fs";

const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-submit-screenshots";

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
await page.goto(
  "https://appstoreconnect.apple.com/apps/6761808113/distribution/ios/version/inflight",
  {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  },
);
await page.waitForTimeout(4000);
await page.screenshot({ path: SS + "/check-01-status.png" });

// Scroll to top to see build + status
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);
await page.screenshot({ path: SS + "/check-02-top.png" });

// Get page text for analysis
const txt = await page.evaluate(() => document.body.innerText);
console.log("=== PAGE SUMMARY ===");
// Look for build, status, version info
const lines = txt
  .split("\n")
  .filter(
    (l) =>
      l.trim() &&
      (l.includes("Build") ||
        l.includes("1.0") ||
        l.includes("Status") ||
        l.includes("Review") ||
        l.includes("Waiting") ||
        l.includes("Processing") ||
        l.includes("Rejected") ||
        l.includes("Sale") ||
        l.includes("Submitted")),
  );
lines.slice(0, 20).forEach((l) => console.log(l.trim()));

// Update notes with correct text
const REVIEW_NOTES =
  "Build 1.0(10) addresses all four grounds from the 1.0(7) rejection.\n\n3.1.1(a): All billing CTAs removed from iOS shell.\n3.1.1(b): Subscription/credits panel fully hidden on iOS via BillingGate.\n3.1.1(b) B2B: Subscriptions contracted at business level via web portal, not in-app.\n4.2: Native GPS, share sheet, haptics, local notifications, Bluetooth meter bridge, offline job cache.\n2.1(a): Delete Account button fixed with type=button and touch-manipulation on iPad.\n\nReviewer: reviewer@restoreassist.app / see Sign-In Information above.";

const tas = await page.locator("textarea").all();
for (const ta of tas) {
  await ta.click();
  await page.keyboard.selectAll();
  await ta.fill(REVIEW_NOTES);
  console.log("updated notes");
  break;
}

const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (await saveBtn.isVisible({ timeout: 3000 })) {
  await saveBtn.click();
  await page.waitForTimeout(2000);
  console.log("saved");
}

await page.screenshot({ path: SS + "/check-03-final.png" });
console.log("URL: " + page.url());

await page.waitForTimeout(30000);
await browser.close();
