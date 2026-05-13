import { test, expect } from "@playwright/test";

test("dashboard banner auto-dismisses after first Authorisation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });
  await page.goto("/dashboard");
  await expect(page.getByText(/Add your IICRC/)).toBeVisible();

  await request.post("/api/test/seed-authorisation", {
    data: { subjectLicenceNumber: "IICRC-1", whsCardNumber: "WHS-1" },
  });
  await page.reload();
  await expect(page.getByText(/Add your IICRC/)).toHaveCount(0);
});
