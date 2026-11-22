/**
 * RA-8107: report visuals (Gantt, moisture trends, hazards, before/after) in a real
 * browser on the synthetic demonstration page. The page 404s off localhost and is not
 * tagged @smoke, so it never runs against production.
 *
 * Proves: the critical danger and every table alternative are in the page without
 * interaction, nothing slides sideways at phone, tablet or desktop width, motion is off
 * by default and stays off under reduced motion, and the slider moves.
 */
import { test, expect } from "@playwright/test";

const ROUTE = "/dev/report-experience/visuals";
const WIDTHS = [390, 768, 1440] as const;

for (const width of WIDTHS) {
  test.describe(`report visuals at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("critical danger, tables and provenance are on the page and fit the screen", async ({ page }) => {
      await page.goto(ROUTE, { waitUntil: "networkidle" });

      const alert = page.getByTestId("critical-alert");
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("CRITICAL DANGER");
      await expect(alert).toContainText("Possible live wiring");

      // A hazard with no recorded severity is shown as not assessed, never as safe.
      await expect(page.getByText("Severity not assessed")).toBeVisible();

      // Table alternatives exist for the Gantt and every chart.
      await expect(page.getByTestId("report-gantt").locator("table")).toHaveCount(1);
      await expect(page.getByTestId("moisture-trends").locator("table")).toHaveCount(3);
      await expect(page.getByTestId("report-gantt")).toContainText("Dates as at 10 Mar 2026");
      await expect(page.getByTestId("report-gantt")).toContainText("No date recorded");

      // Dry-target evidence and the safe no-date state.
      await expect(page.getByText("Dry target of 16 WME met on 7 Mar 2026")).toBeVisible();
      await expect(page.getByText("No dry date can be stated").first()).toBeVisible();
      await expect(page.getByTestId("stall-flag")).toBeVisible();

      // Provenance label on the comparison.
      await expect(page.getByTestId("comparison")).toContainText("inspection photo");

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  });
}

test("the page does not answer to a non-local host name", async ({ request }) => {
  const res = await request.get(ROUTE, { headers: { host: "example.test" }, failOnStatusCode: false });
  expect(res.status()).toBe(404);
});

test.describe("motion and slider", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("motion is off by default and can be played and paused", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "networkidle" });
    const gantt = page.getByTestId("report-gantt");
    await expect(gantt).toHaveAttribute("data-motion", "off");
    await gantt.getByRole("button", { name: "Play motion" }).click();
    await expect(gantt).toHaveAttribute("data-motion", "on");
    await gantt.getByRole("button", { name: "Pause motion" }).click();
    await expect(gantt).toHaveAttribute("data-motion", "off");
  });

  test("reduced motion disables the control", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ROUTE, { waitUntil: "networkidle" });
    const gantt = page.getByTestId("report-gantt");
    await expect(gantt.getByRole("button", { name: "Play motion" })).toBeDisabled();
    await expect(gantt).toHaveAttribute("data-motion", "off");
  });

  test("the comparison slider moves and says what it shows", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "networkidle" });
    const range = page.getByRole("slider");
    await range.fill("70");
    await expect(range).toHaveAttribute("aria-valuetext", "70 percent before photo");
  });
});
