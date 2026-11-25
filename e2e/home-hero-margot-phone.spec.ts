/**
 * RA-8532 — on 21/11/2026 a 390px walk of the home page found the Margot
 * greeting card sitting over the hero's "See how it works" link and the line
 * below the main button. This opens the home page at phone width, waits past
 * the point where the card used to appear (600ms entrance plus 800ms), and
 * checks that the topmost element at the centre and each inside corner of both
 * hero links is the link itself, so nothing covers them or takes their tap.
 *
 * Two phone set-ups: a 390px window with a mouse (how the walk measured it) and
 * a touch phone. Tagged @smoke, so it also runs against production.
 */
import { test, expect, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const HERO_LINKS = ["Start your free trial", "See how it works"] as const;

async function expectLinkUncovered(page: Page, name: string) {
  const link = page.getByRole("link", { name, exact: true }).first();
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  const blocker = await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const inset = 4;
    const points: Array<[number, number]> = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + inset, r.top + inset],
      [r.right - inset, r.top + inset],
      [r.left + inset, r.bottom - inset],
      [r.right - inset, r.bottom - inset],
    ];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top)) {
        return `${top.tagName.toLowerCase()} "${(top.textContent ?? "").trim().slice(0, 60)}" at ${Math.round(x)},${Math.round(y)}`;
      }
    }
    return null;
  });
  expect(blocker, `"${name}" is covered by ${blocker}`).toBeNull();
}

for (const setup of [
  { label: "a 390px window with a mouse", use: { viewport: PHONE } },
  {
    label: "a touch phone",
    use: { viewport: PHONE, hasTouch: true, isMobile: true },
  },
]) {
  test.describe(`@smoke RA-8532 home hero links at 390px, ${setup.label}`, () => {
    test.use(setup.use);

    test("the Margot greeting card does not cover the hero links", async ({
      page,
    }) => {
      const response = await page.goto("/", { waitUntil: "load" });
      expect(response?.status(), "/ status").toBeLessThan(400);
      // Past the old 1.4s greeting delay, before its 6s auto-hide.
      await page.waitForTimeout(2_500);

      for (const name of HERO_LINKS) {
        await expectLinkUncovered(page, name);
      }
    });
  });
}
