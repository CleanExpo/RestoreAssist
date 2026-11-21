/**
 * RA-8403 — on 17/11/2026 a stranger walk found /how-it-works 590px wide in a
 * 390px phone window: the page slid sideways and showed a dark strip on the
 * right. This smoke opens each public page at phone width and fails when the
 * document is wider than the screen, measured the way the walk measured it
 * (document scrollWidth against clientWidth, after load plus 1.5 s).
 *
 * Tagged @smoke, so it also runs against production on the smoke schedule.
 */
import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const PUBLIC_ROUTES = [
  "/",
  "/how-it-works",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/resources",
  "/compliance-library",
  "/support",
  "/help",
];

test.describe("@smoke RA-8403 public pages fit a phone screen", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const route of PUBLIC_ROUTES) {
    test(`${route} does not scroll sideways at 390px`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "load" });
      expect(response?.status(), `${route} status`).toBeLessThan(400);
      await page.waitForTimeout(1_500);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `${route} is ${scrollWidth}px wide in a ${clientWidth}px window`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
