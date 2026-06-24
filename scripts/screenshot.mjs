// screenshot.mjs — capture full-page screenshots for visual design verification.
//
// Usage:
//   node scripts/screenshot.mjs <url> <out.png> [width] [height]
//   node scripts/screenshot.mjs https://<preview>.vercel.app/ shots/landing.png 1440 900
//
// Captures light + dark by toggling the `dark` class via prefers-color-scheme
// emulation when a second output is requested:
//   node scripts/screenshot.mjs <url> <out.png> --both
//
// Notes for the managed/remote env:
//  - Launches the full Chromium build explicitly (executablePath) because the
//    default launch path expects chromium-headless-shell, which the proxy
//    can't reliably download. The full build runs headless fine.
//  - --no-sandbox is required (no user namespace in the container).
//  - WORKS for localhost / data URLs (noProxy bypass). REMOTE https URLs are
//    blocked: the egress proxy closes Chromium's tunnel (ERR_CONNECTION_CLOSED)
//    for every external host. To verify a deployed page, run the app locally
//    (`pnpm build && pnpm start`, or `pnpm dev`) and screenshot http://localhost:3000.
//  - PW_PROXY=1 opts into routing through HTTPS_PROXY (only if a future env
//    supports it); default is a direct connection (correct for localhost).
import { chromium } from "@playwright/test";

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.png> [width] [height] [--both]");
  process.exit(1);
}
const both = rest.includes("--both");
const nums = rest.filter((r) => /^\d+$/.test(r)).map(Number);
const width = nums[0] || 1440;
const height = nums[1] || 900;

const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.PW_PROXY === "1" && process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});

async function shot(scheme, path) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600); // let fonts/animations settle
  await page.screenshot({ path, fullPage: true });
  await ctx.close();
  console.log("wrote", path);
}

try {
  if (both) {
    await shot("light", out.replace(/\.png$/, ".light.png"));
    await shot("dark", out.replace(/\.png$/, ".dark.png"));
  } else {
    await shot("dark", out);
  }
} finally {
  await browser.close();
}
