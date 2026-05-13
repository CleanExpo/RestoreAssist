import { test, expect } from "@playwright/test";

test("USER role: evidence capture never opens the licence modal (rule 25)", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Capture photo/ }).click();
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page.getByText(/Still using these credentials/)).toHaveCount(0);
});
