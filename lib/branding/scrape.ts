/**
 * Website scraping for the setup wizard's "brand auto-pull" step.
 *
 * RA-4989 — Playwright `chromium.launch()` is dynamically imported below
 * (NOT at module top-level). The static `import { chromium } from
 * '@playwright/test'` previously bundled Playwright into the serverless
 * function for /api/setup/hydrate. `@playwright/test` is a devDependency
 * and its runtime `browsers.json` asset is not present in the production
 * function bundle, so route invocation crashed with:
 *   "Failed to load external module playwright-…/test:
 *    Cannot find module '…/playwright-core/browsers.json'"
 *
 * The dynamic import keeps the binding-time cost out of every route that
 * happens to share the module graph, and makes "playwright not available"
 * a soft failure that gracefully degrades to SCRAPE_UNAVAILABLE so the rest
 * of the setup wizard (ABN + pricing) still works.
 */

export interface ScrapeResult {
  logoUrl: string | null;
  hero: string;
}

export async function scrapeWebsite(url: string): Promise<
  { ok: true; data: ScrapeResult } | { ok: false; reason: string }
> {
  // Dynamic import — see header comment for the bundling rationale.
  let chromium: typeof import("@playwright/test")["chromium"];
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    // Playwright not available at runtime (e.g. serverless function bundle).
    // Soft-fail so the website-scrape step degrades cleanly without crashing
    // the rest of the setup-wizard hydrate flow.
    return { ok: false, reason: "SCRAPE_UNAVAILABLE" };
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ userAgent: 'RestoreAssistSetupBot/1.0' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const response = await page.goto(url, { timeout: 5000, waitUntil: 'domcontentloaded' });
    if (!response) return { ok: false, reason: 'UNREACHABLE' };
    if (!response.ok()) return { ok: false, reason: 'FETCH_FAILED' };

    const data = await page.evaluate(() => {
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const iconHref =
        document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel="icon"]')?.getAttribute('href');
      const heroEl = document.querySelector('h1, .hero, [class*="hero"]');
      return {
        ogImage: ogImage || null,
        iconHref: iconHref || null,
        hero: (heroEl?.textContent ?? document.body.innerText ?? '').slice(0, 1500).trim(),
      };
    });

    const logoUrl = data.ogImage || (data.iconHref ? new URL(data.iconHref, url).toString() : null);
    return { ok: true, data: { logoUrl, hero: data.hero } };
  } catch {
    // intentional: no err.message leaks via SSE (CLAUDE.md rule #7)
    return { ok: false, reason: 'FETCH_FAILED' };
  } finally {
    await browser?.close();
  }
}
