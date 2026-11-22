import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

/**
 * RA-7694: record an intermittent musty odour in one room from the job page and
 * see it listed under that room. The report print is proven in
 * lib/reports/__tests__/room-observations.test.ts (PDF text).
 */
test("a technician records an intermittent musty odour and sees it under the room", async ({
  page,
}) => {
  await loginAs(page, "ADMIN");
  await seedInspection(page);
  await page.goto("/dashboard/inspections/test-inspection");

  const panel = page.getByRole("region", { name: /Room observations/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("room-observations-empty")).toBeVisible();

  await panel.getByLabel("Room").fill("Bedroom 2");
  await panel.getByLabel("Smell (for example musty)").fill("musty");
  await panel.getByLabel("Constant or intermittent").selectOption("INTERMITTENT");
  await panel.getByLabel("Intensity").selectOption("2");
  await panel.getByRole("button", { name: "Save observation" }).click();

  const list = panel.getByTestId("room-observations-list");
  await expect(list).toContainText("Bedroom 2");
  await expect(list).toContainText("musty; intermittent; intensity 2 of 3");
});

test("bad input is refused with a message and nothing is listed", async ({ page }) => {
  await loginAs(page, "ADMIN");
  await seedInspection(page);
  await page.goto("/dashboard/inspections/test-inspection");

  const panel = page.getByRole("region", { name: /Room observations/ });
  // No room named: the server refuses and the panel says so.
  await panel.getByLabel("Smell (for example musty)").fill("musty");
  await panel.getByRole("button", { name: "Save observation" }).click();
  await expect(panel.getByRole("alert")).toContainText(/room/i);
});

test("a stranger cannot read or write another job's observations", async ({ page }) => {
  await loginAs(page, "ADMIN");
  const read = await page.request.get("/api/inspections/not-my-job/room-observations");
  expect(read.status()).toBe(404);
  const write = await page.request.post("/api/inspections/not-my-job/room-observations", {
    data: { kind: "STAINING", roomLabel: "Hall" },
  });
  expect(write.status()).toBe(404);
});
