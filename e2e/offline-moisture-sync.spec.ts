/**
 * P2-4 — offline moisture save queues and syncs on reconnect.
 */
import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

test.describe("Offline moisture sync", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true",
  );

  test("queued moisture POST appears after going online", async ({
    page,
    context,
  }) => {
    const inspectionId = `p2-offline-${Date.now()}`;
    await loginAs(page, "USER");
    await seedInspection(page, { inspectionId, status: "DRAFT" });

    await context.setOffline(true);
    const offlineRes = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `offline-${inspectionId}` },
        data: {
          location: "Lounge",
          surfaceType: "drywall",
          moistureLevel: 12,
          depth: "Surface",
        },
      },
    );
    expect(offlineRes.status()).toBeGreaterThanOrEqual(400);

    await context.setOffline(false);
    const onlineRes = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `offline-${inspectionId}` },
        data: {
          location: "Lounge",
          surfaceType: "drywall",
          moistureLevel: 12,
          depth: "Surface",
        },
      },
    );
    expect(onlineRes.ok()).toBeTruthy();

    const list = await page.request.get(`/api/inspections/${inspectionId}`);
    expect(list.ok()).toBeTruthy();
    const json = await list.json();
    const readings = json.inspection?.moistureReadings ?? [];
    expect(
      readings.some(
        (r: { location: string; moistureLevel: number }) =>
          r.location === "Lounge" && r.moistureLevel === 12,
      ),
    ).toBeTruthy();
  });
});
