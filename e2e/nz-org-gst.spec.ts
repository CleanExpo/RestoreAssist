/**
 * P2-3 / P3-6 — NZ org setup path uses 15% GST treatment (API-level).
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers/auth";

test.describe("NZ GST", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true",
  );

  test("setup state accepts NZ locale + NZBN", async ({ page }) => {
    await loginAs(page, "USER");
    const res = await page.request.patch("/api/setup/state", {
      data: {
        country: "NZ",
        timezone: "Pacific/Auckland",
        nzbn: "9429046847584",
        region: "Auckland",
        legalName: "NZ Test Restoration Ltd",
      },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.data?.organization?.country).toBe("NZ");
  });
});
