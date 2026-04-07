/**
 * generate-store-assets.ts
 *
 * Playwright-based script to capture App Store / Google Play screenshots
 * at the required viewport dimensions.
 *
 * Usage:
 *   npx ts-node scripts/generate-store-assets.ts [--url <url>] [--outDir <dir>]
 *
 * Defaults:
 *   --url     http://localhost:3000
 *   --outDir  ./store-assets
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

interface Viewport {
  name: string;
  width: number;
  height: number;
  filename: string;
}

const VIEWPORTS: Viewport[] = [
  { name: "iPhone 8 Plus", width: 1242, height: 2208, filename: "iphone-8-plus.png" },
  { name: "iPhone 14 Pro Max", width: 1290, height: 2796, filename: "iphone-14-pro-max.png" },
  { name: "iPad Pro 12.9", width: 2048, height: 2732, filename: "ipad-pro-12-9.png" },
  { name: "Android Phone", width: 1080, height: 1920, filename: "android-phone.png" },
  { name: "Android Tablet", width: 2560, height: 1600, filename: "android-tablet.png" },
];

function parseArgs(argv: string[]): { url: string; outDir: string } {
  let url = "http://localhost:3000";
  let outDir = "./store-assets";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url" && argv[i + 1]) {
      url = argv[++i];
    } else if (argv[i] === "--outDir" && argv[i + 1]) {
      outDir = argv[++i];
    }
  }

  return { url, outDir };
}

async function main(): Promise<void> {
  const { url, outDir } = parseArgs(process.argv.slice(2));
  const resolvedOutDir = path.resolve(outDir);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
    console.log(`Created output directory: ${resolvedOutDir}`);
  }

  console.log(`Capturing screenshots from: ${url}`);
  console.log(`Output directory: ${resolvedOutDir}`);
  console.log("");

  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });

      const page = await context.newPage();

      console.log(`Capturing ${viewport.name} (${viewport.width}x${viewport.height})...`);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

      const outputPath = path.join(resolvedOutDir, viewport.filename);
      await page.screenshot({ path: outputPath, fullPage: true });

      console.log(`  Saved: ${outputPath}`);

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log("\nAll screenshots captured successfully.");
}

main().catch((err: Error) => {
  console.error("Error generating store assets:", err.message);
  process.exit(1);
});
