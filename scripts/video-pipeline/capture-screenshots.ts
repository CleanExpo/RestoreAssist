/**
 * capture-screenshots.ts
 * Uses Playwright Chromium to capture full-page 1920×1080 screenshots of key app pages.
 * Saves to public/screenshots/{page-name}.png
 *
 * Requires a running Next.js dev server at NEXT_PUBLIC_BASE_URL (default: http://localhost:3000).
 * If the app requires auth, set SCREENSHOT_AUTH_BYPASS=1 and supply SCREENSHOT_COOKIE or
 * implement the loginAndNavigate helper below.
 */

import fs from "fs";
import path from "path";

export interface ScreenshotPage {
  /** URL path to capture (relative to base URL) */
  path: string;
  /** Output file name without extension */
  name: string;
  /** Extra query string params (e.g. "tab=sketch") */
  query?: string;
  /** Milliseconds to wait after navigation before screenshotting (default: 2000) */
  waitMs?: number;
}

export interface ScreenshotOptions {
  /** Base URL of the running app. Default: process.env.NEXT_PUBLIC_BASE_URL or http://localhost:3000 */
  baseUrl?: string;
  /** Override output directory. Default: <repo-root>/public/screenshots */
  outputDir?: string;
  /** List of pages to capture. Defaults to the standard RestoreAssist set. */
  pages?: ScreenshotPage[];
  /** If true, log progress to console */
  verbose?: boolean;
}

export interface ScreenshotResult {
  name: string;
  outputPath: string;
  url: string;
  success: boolean;
  error?: string;
}

/** Default RestoreAssist pages to capture for video production */
const DEFAULT_PAGES: ScreenshotPage[] = [
  {
    path: "/dashboard",
    name: "dashboard",
    waitMs: 2500,
  },
  {
    path: "/dashboard/inspections",
    name: "dashboard-inspections",
    waitMs: 2500,
  },
  {
    path: "/dashboard/inspections/demo",
    name: "inspection-detail",
    waitMs: 2500,
  },
  {
    path: "/dashboard/inspections/demo",
    name: "inspection-sketch-tab",
    query: "tab=sketch",
    waitMs: 3000,
  },
  {
    path: "/dashboard/inspections/demo",
    name: "inspection-moisture-tab",
    query: "tab=moisture",
    waitMs: 3000,
  },
];

/**
 * Capture screenshots of key app pages using Playwright Chromium.
 * The running Next.js app must be accessible at baseUrl before calling this.
 */
export async function captureScreenshots(
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult[]> {
  // Dynamic import for SSR-safety and graceful missing-dependency handling
  let chromium: typeof import("playwright").chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    throw new Error(
      "playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium"
    );
  }

  const baseUrl =
    options.baseUrl ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";

  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../.."
  );
  const outputDir =
    options.outputDir ?? path.join(repoRoot, "public", "screenshots");
  fs.mkdirSync(outputDir, { recursive: true });

  const pages = options.pages ?? DEFAULT_PAGES;
  const verbose = options.verbose ?? true;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const results: ScreenshotResult[] = [];

  for (const page of pages) {
    const queryString = page.query ? `?${page.query}` : "";
    const url = `${baseUrl}${page.path}${queryString}`;
    const outputPath = path.join(outputDir, `${page.name}.png`);

    if (verbose) {
      console.log(`[screenshot] Capturing ${page.name} from ${url}...`);
    }

    const browserPage = await context.newPage();
    try {
      await browserPage.goto(url, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      const waitMs = page.waitMs ?? 2000;
      if (waitMs > 0) {
        await browserPage.waitForTimeout(waitMs);
      }

      await browserPage.screenshot({
        path: outputPath,
        fullPage: true,
        type: "png",
      });

      results.push({ name: page.name, outputPath, url, success: true });

      if (verbose) {
        console.log(`[screenshot] Saved ${outputPath}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`[screenshot] Failed to capture ${page.name}: ${error}`);
      results.push({ name: page.name, outputPath, url, success: false, error });
    } finally {
      await browserPage.close();
    }
  }

  await browser.close();

  const succeeded = results.filter((r) => r.success).length;
  console.log(
    `[screenshot] Captured ${succeeded}/${results.length} pages successfully`
  );

  return results;
}
