/**
 * P2-3 / P3-6 — NZ org setup path uses 15% GST treatment (API-level).
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers/auth";

/**
 * A valid, run-unique NZBN (GS1 13-digit, 94 prefix, mod-10 check digit, the
 * rule in lib/validation/nzbn-validator.ts). Organization.nzbn is unique, so a
 * fixed value only works once per database.
 */
function uniqueNzbn(): string {
  const body = `9429${String(Date.now()).slice(-8)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

test.describe("NZ GST", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true",
  );

  test("setup state accepts NZ locale + NZBN", async ({ page }) => {
    const nzbn = uniqueNzbn();
    // PATCH /api/setup/state is the setup wizard's write path and answers 409
    // once setup is complete, so this needs an owner whose setup is still open.
    // The shared test-user@test.local org is created setup-complete; a fresh
    // email gets a fresh org created with setupCompletedAt null.
    await loginAs(page, "USER", {
      email: `nz-gst-${Date.now()}@test.local`,
      setupCompletedAt: null,
    });
    const res = await page.request.patch("/api/setup/state", {
      data: {
        country: "NZ",
        timezone: "Pacific/Auckland",
        nzbn,
        // The NZ region is stored in Organization.state (see nzBusinessReady
        // in the GET handler); there is no `region` field on this route.
        state: "Auckland",
        legalName: "NZ Test Restoration Ltd",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const patched = await res.json();
    expect(patched.data?.updated).toEqual(
      expect.arrayContaining(["country", "timezone", "nzbn", "state", "legalName"]),
    );

    // PATCH answers with the updated field names; GET is what reports the org.
    const state = await page.request.get("/api/setup/state");
    expect(state.ok()).toBeTruthy();
    const json = await state.json();
    expect(json.data?.organization?.country).toBe("NZ");
    expect(json.data?.organization?.timezone).toBe("Pacific/Auckland");
    expect(json.data?.organization?.nzbn).toBe(nzbn);
    expect(json.data?.organization?.state).toBe("Auckland");
    expect(json.data?.sections?.businessDetails).toBe("READY");
  });
});
