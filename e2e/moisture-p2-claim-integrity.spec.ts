/**
 * P2 Track A — moisture flags, latest-reading drying goal, invalidation.
 * Requires ALLOW_TEST_HELPERS=true and a running dev server.
 */
import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

test.describe("P2 moisture claim integrity", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true",
  );

  test("POST persists baseline/monitoring; drying goal uses latest per point", async ({
    page,
  }) => {
    const inspectionId = `p2-moisture-${Date.now()}`;
    await loginAs(page, "USER");
    await seedInspection(page, { inspectionId, status: "DRAFT" });

    const baseline = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `p2-base-${inspectionId}` },
        data: {
          location: "Hall reference",
          surfaceType: "drywall",
          moistureLevel: 8,
          depth: "Surface",
          isBaseline: true,
          isMonitoringPoint: false,
        },
      },
    );
    expect(baseline.ok()).toBeTruthy();
    const baselineJson = await baseline.json();
    expect(baselineJson.moistureReading.isBaseline).toBe(true);

    const wet = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `p2-wet-${inspectionId}` },
        data: {
          location: "Bathroom wall",
          surfaceType: "drywall",
          moistureLevel: 28,
          depth: "Surface",
          isMonitoringPoint: true,
        },
      },
    );
    expect(wet.ok()).toBeTruthy();

    const dry = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `p2-dry-${inspectionId}` },
        data: {
          location: "Bathroom wall",
          surfaceType: "drywall",
          moistureLevel: 8,
          depth: "Surface",
          isMonitoringPoint: true,
        },
      },
    );
    expect(dry.ok()).toBeTruthy();

    const init = await page.request.post(
      `/api/inspections/${inspectionId}/drying-goal`,
      {
        headers: { "Idempotency-Key": `p2-dg-${inspectionId}` },
        data: { targetCategory: "Category 2", targetClass: "Class 2" },
      },
    );
    expect(init.ok()).toBeTruthy();

    const evaluate = await page.request.put(
      `/api/inspections/${inspectionId}/drying-goal`,
      { data: {} },
    );
    expect(evaluate.ok()).toBeTruthy();
    const evalJson = await evaluate.json();
    expect(evalJson.status).toBe("ACHIEVED");
    expect(evalJson.readingsChecked).toBe(1);
  });

  test("invalidation retains row and excludes from drying evaluation", async ({
    page,
  }) => {
    const inspectionId = `p2-inv-${Date.now()}`;
    await loginAs(page, "USER");
    await seedInspection(page, { inspectionId, status: "DRAFT" });

    const bad = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `p2-bad-${inspectionId}` },
        data: {
          location: "Kitchen",
          surfaceType: "drywall",
          moistureLevel: 40,
          depth: "Surface",
        },
      },
    );
    expect(bad.ok()).toBeTruthy();
    const badId = (await bad.json()).moistureReading.id as string;

    const good = await page.request.post(
      `/api/inspections/${inspectionId}/moisture`,
      {
        headers: { "Idempotency-Key": `p2-good-${inspectionId}` },
        data: {
          location: "Kitchen",
          surfaceType: "drywall",
          moistureLevel: 8,
          depth: "Surface",
        },
      },
    );
    expect(good.ok()).toBeTruthy();

    const invalidate = await page.request.post(
      `/api/inspections/${inspectionId}/moisture/${badId}/invalidate`,
      { data: { reason: "Misread — meter on wet finger" } },
    );
    expect(invalidate.ok()).toBeTruthy();

    await page.request.post(
      `/api/inspections/${inspectionId}/drying-goal`,
      {
        headers: { "Idempotency-Key": `p2-dg2-${inspectionId}` },
        data: { targetCategory: "Category 2", targetClass: "Class 2" },
      },
    );

    const evaluate = await page.request.put(
      `/api/inspections/${inspectionId}/drying-goal`,
      { data: {} },
    );
    const evalJson = await evaluate.json();
    expect(evalJson.status).toBe("ACHIEVED");
  });
});
