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

    // The offline attempt must come from the BROWSER. page.request is
    // Playwright's APIRequestContext, which does not carry the context's
    // offline flag (see e2e/walkthrough/recorder.ts), so a page.request POST
    // "while offline" reaches the server and answers 201. A fetch from the page
    // is what context.setOffline actually cuts off.
    await page.goto("/api/auth/session");
    await context.setOffline(true);
    const offlineAttempt = await page.evaluate(async (id) => {
      try {
        const r = await fetch(`/api/inspections/${id}/moisture`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `offline-${id}`,
          },
          body: JSON.stringify({
            location: "Lounge",
            surfaceType: "drywall",
            moistureLevel: 12,
            depth: "Surface",
          }),
        });
        return { reached: true, status: r.status };
      } catch (err) {
        return { reached: false, error: String(err) };
      }
    }, inspectionId);
    expect(
      offlineAttempt.reached,
      `offline POST must not reach the server: ${JSON.stringify(offlineAttempt)}`,
    ).toBe(false);

    await context.setOffline(false);
    const beforeSync = await page.request.get(`/api/inspections/${inspectionId}`);
    expect(beforeSync.ok()).toBeTruthy();
    const beforeJson = await beforeSync.json();
    expect(
      (beforeJson.inspection?.moistureReadings ?? []).filter(
        (r: { location: string }) => r.location === "Lounge",
      ),
      "nothing may be saved while offline",
    ).toHaveLength(0);

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
      readings.filter(
        (r: { location: string; moistureLevel: number }) =>
          r.location === "Lounge" && r.moistureLevel === 12,
      ),
    ).toHaveLength(1);
  });
});
