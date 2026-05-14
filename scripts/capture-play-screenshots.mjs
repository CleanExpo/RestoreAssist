import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = "/tmp/ra-android-build/fastlane/metadata/android/en-AU/images/phoneScreenshots";
mkdirSync(OUT, { recursive: true });

// Play Store phone screenshot spec: 320–3840px each side, aspect 16:9 to 2:1.
// 1080x1920 (9:16) is the safe sweet spot — exactly within spec, looks native.
const VIEW = { width: 360, height: 640 };
const DSF = 3; // → 1080x1920 native

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const targets = [
  { name: "01-landing",        url: "https://restoreassist.app/" },
  { name: "02-features",       url: "https://restoreassist.app/features" },
  { name: "03-how-it-works",   url: "https://restoreassist.app/how-it-works" },
  { name: "04-pricing",        url: "https://restoreassist.app/pricing" },
  { name: "05-signup",         url: "https://restoreassist.app/signup" },
  { name: "06-login",          url: "https://restoreassist.app/login" },
  { name: "07-compliance",     url: "https://restoreassist.app/compliance" },
  { name: "08-about",          url: "https://restoreassist.app/about" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: DSF,
  isMobile: true,
  hasTouch: true,
  userAgent: UA,
});
const page = await context.newPage();

for (const t of targets) {
  try {
    console.log(`[${t.name}] ${t.url}`);
    await page.goto(t.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500); // hydration time
    const outPath = join(OUT, `${t.name}.png`);
    await page.screenshot({ path: outPath, type: "png", fullPage: false });
    console.log(`  saved ${outPath}`);
  } catch (e) {
    console.error(`[${t.name}] FAILED: ${e.message}`);
  }
}

await browser.close();
console.log("done");
