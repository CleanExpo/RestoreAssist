import { chromium } from '@playwright/test';

export interface ScrapeResult {
  logoUrl: string | null;
  hero: string;
}

export async function scrapeWebsite(url: string): Promise<
  { ok: true; data: ScrapeResult } | { ok: false; reason: string }
> {
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ userAgent: 'RestoreAssistSetupBot/1.0' });
    const page = await ctx.newPage();
    const response = await page.goto(url, { timeout: 5000, waitUntil: 'domcontentloaded' });
    if (!response || !response.ok()) return { ok: false, reason: `HTTP ${response?.status() ?? 'NONE'}` };

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
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  } finally {
    await browser?.close();
  }
}
