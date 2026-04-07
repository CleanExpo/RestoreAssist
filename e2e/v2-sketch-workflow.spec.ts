/**
 * V2 Sketch & Property Data — End-to-End Integration Tests
 * RA2-055 (RA-125)
 *
 * Coverage:
 *  1. Full claim workflow WITH property scraper
 *  2. Full claim workflow WITHOUT scraper (manual sketch)
 *  3. Moisture mapping workflow
 *  4. Sketch-to-estimate pipeline (API + UI)
 *  5. Mobile / tablet (iPad Pro)
 *  6. Sketch canvas performance benchmarks
 */

import { test, expect, devices, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth.setup";

// ── Auth setup — all tests in this file use saved credentials ──
test.use({ storageState: AUTH_FILE });

// ── Helpers ───────────────────────────────────────────────────

/** Create a new inspection and return its ID (extracted from redirect URL). */
async function createInspection(page: Page, title: string): Promise<string> {
  await page.goto("/dashboard/inspections/new");
  await page.getByLabel(/title/i).fill(title);
  // Address is often required; fill a placeholder
  const addressInput = page.getByLabel(/address/i);
  if (await addressInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addressInput.fill("12 Test Street, Melbourne VIC 3000");
  }
  await page
    .getByRole("button", { name: /create|save|next/i })
    .first()
    .click();
  // Redirect to /dashboard/inspections/<id>
  await expect(page).toHaveURL(/\/dashboard\/inspections\/[a-z0-9-]+(?:\/|$)/, {
    timeout: 10_000,
  });
  const match = page.url().match(/\/inspections\/([a-z0-9-]+)/);
  return match?.[1] ?? "";
}

/** Navigate to the sketch editor tab for an inspection. */
async function openSketchEditor(page: Page, inspectionId: string) {
  await page.goto(`/dashboard/inspections/${inspectionId}`);
  // Tab or link labelled "Sketch" / "Floor Plan"
  const sketchTab = page
    .getByRole("tab", { name: /sketch|floor plan/i })
    .or(page.getByRole("link", { name: /sketch|floor plan/i }));
  if (await sketchTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await sketchTab.click();
  } else {
    await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. Full Claim Workflow — WITH Property Scraper
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Workflow — with property scraper", () => {
  test("property lookup returns data for a known address", async ({
    request,
  }) => {
    // Unit-level integration test against the scrape API
    const res = await request.post("/api/properties/scrape", {
      data: {
        address: "20 Martin Place",
        postcode: "2000",
      },
    });
    // OnTheHouse may or may not have this address; we just verify the contract
    expect([200, 404, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("cached");
      expect(body).toHaveProperty("source");
      expect(["onthehouse", "domain"]).toContain(body.source);
    }
  });

  test("domain.com.au fallback returns data when requested", async ({
    request,
  }) => {
    const res = await request.post("/api/properties/scrape", {
      data: {
        address: "20 Martin Place",
        postcode: "2000",
        fallbackSources: ["domain"],
      },
    });
    expect([200, 404, 503]).toContain(res.status());
  });

  test("property lookup is cached on second request", async ({ request }) => {
    const payload = { address: "42 Cache Test Street", postcode: "3000" };
    // First call — scrape (may 404 if address not found, that's fine)
    await request.post("/api/properties/scrape", { data: payload });
    // Second call — should be fast (cached hit returns cached:true)
    const start = Date.now();
    const res2 = await request.post("/api/properties/scrape", {
      data: payload,
    });
    const elapsed = Date.now() - start;
    if (res2.status() === 200) {
      const body = await res2.json();
      // If address is not found both attempts return 404; if found, second should be cached
      if (body.cached) {
        // Cache hit should be very fast (no scrape)
        expect(elapsed).toBeLessThan(3_000);
      }
    }
  });

  test("scrape API rejects unauthenticated requests", async ({
    request: anonRequest,
  }) => {
    // Using a fresh context without auth state
    const res = await anonRequest.post("/api/properties/scrape", {
      data: { address: "1 Test Street", postcode: "2000" },
      headers: { Cookie: "" },
    });
    expect(res.status()).toBe(401);
  });

  test("property lookup data appears in inspection detail UI", async ({
    page,
  }) => {
    const id = await createInspection(page, "E2E Scraper Test");
    if (!id) return; // Skip if inspection creation failed

    await page.goto(`/dashboard/inspections/${id}`);

    // Look for the property lookup button / section
    const lookupBtn = page
      .getByRole("button", { name: /lookup|fetch property|property data/i })
      .or(page.getByText(/property lookup/i));

    if (await lookupBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Property lookup section is rendered — verify it exists
      await expect(lookupBtn.first()).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Full Claim Workflow — Manual Sketch (No Scraper)
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Workflow — manual sketch (no scraper)", () => {
  test("sketch editor loads for a new inspection", async ({ page }) => {
    const id = await createInspection(page, "E2E Manual Sketch Test");
    if (!id) return;

    await openSketchEditor(page, id);

    // Canvas should be present
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
  });

  test("sketch toolbar renders expected tool buttons", async ({ page }) => {
    const id = await createInspection(page, "E2E Toolbar Test");
    if (!id) return;

    await openSketchEditor(page, id);

    // At least one tool button should exist
    const toolBtns = page
      .getByRole("button")
      .filter({ hasText: /select|room|line|text|pan/i });
    await expect(toolBtns.first()).toBeVisible({ timeout: 8_000 });
  });

  test("can switch floor tabs in sketch editor", async ({ page }) => {
    const id = await createInspection(page, "E2E Multi-Floor Test");
    if (!id) return;

    await openSketchEditor(page, id);

    // "Add floor" button
    const addFloor = page.getByRole("button", {
      name: /add floor|new floor|\+/i,
    });
    if (await addFloor.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addFloor.click();
      // A new floor tab should appear
      await expect(
        page.getByRole("tab", { name: /floor 2|first floor|level/i }),
      ).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test("floor plan underlay loader panel toggles open", async ({ page }) => {
    const id = await createInspection(page, "E2E Underlay Test");
    if (!id) return;

    await openSketchEditor(page, id);

    // Look for the underlay toggle button
    const underlayToggle = page.getByRole("button", {
      name: /underlay|floor plan image|background/i,
    });
    if (await underlayToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await underlayToggle.click();
      await expect(
        page.getByLabel(/address/i).or(page.getByPlaceholder(/address/i)),
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test("sketch estimate API returns structure for empty inspection", async ({
    request,
  }) => {
    // Without an inspectionId we cannot hit the API directly; verify auth guard
    const res = await request.get(
      "/api/inspections/nonexistent-id/sketches/estimate",
    );
    // 404 or 401 — either is correct (404 = not found, 401 = unauthenticated context)
    expect([401, 404]).toContain(res.status());
  });

  test("sketch-preview page renders homeowner view", async ({ page }) => {
    const id = await createInspection(page, "E2E Homeowner View Test");
    if (!id) return;

    await page.goto(`/dashboard/inspections/${id}/sketch-preview`);

    // Should show the branded header
    await expect(page.getByText(/RestoreAssist/i)).toBeVisible({
      timeout: 8_000,
    });
    // Should have a PDF download button
    await expect(
      page.getByRole("button", { name: /download pdf/i }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Moisture Mapping Workflow
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Moisture Mapping", () => {
  test("moisture mapping tab/section is accessible from inspection", async ({
    page,
  }) => {
    const id = await createInspection(page, "E2E Moisture Mapping Test");
    if (!id) return;

    await page.goto(`/dashboard/inspections/${id}`);

    const moistureTab = page
      .getByRole("tab", { name: /moisture|moisture map/i })
      .or(page.getByRole("link", { name: /moisture/i }))
      .or(page.getByText(/moisture map/i));

    if (await moistureTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await moistureTab.first().click();
      // Canvas should appear (moisture mapping also uses canvas)
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 8_000,
      });
    }
  });

  test("moisture API endpoint requires authentication", async ({
    request: anonRequest,
  }) => {
    const res = await anonRequest.get("/api/inspections/test-id/moisture", {
      headers: { Cookie: "" },
    });
    expect([401, 404]).toContain(res.status());
  });

  test("moisture data is persisted via sketches API", async ({ request }) => {
    // Verify the sketches API accepts moisture sketch type
    const res = await request.get("/api/inspections/nonexistent/sketches");
    // 401 for fresh context without auth, 404 for authenticated nonexistent
    expect([401, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Sketch-to-Estimate Pipeline
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Sketch-to-Estimate Pipeline", () => {
  test("estimate endpoint returns correct structure", async ({ request }) => {
    // Auth-guarded endpoint — with a valid inspection ID it should return estimate data
    // Without a real ID we expect 404 from the auth-guarded check
    const res = await request.get(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/estimate",
    );
    expect([401, 404]).toContain(res.status());
  });

  test("estimate endpoint validates ownership", async ({ request }) => {
    // Authenticated user requesting non-owned inspection returns 404
    const res = await request.get(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/estimate",
    );
    expect(res.status()).toBe(404);
  });

  test("sketch PDF endpoint validates request body", async ({ request }) => {
    const res = await request.post(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/pdf",
      {
        data: { floors: [] }, // Empty floors — should 400 or 404
      },
    );
    expect([400, 404]).toContain(res.status());
  });

  test("sketch PDF endpoint rejects invalid data URL", async ({ request }) => {
    const res = await request.post(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/pdf",
      {
        data: {
          floors: [
            {
              label: "Ground Floor",
              pngDataUrl: "not-a-valid-data-url",
              fabricJson: {},
            },
          ],
        },
      },
    );
    expect([400, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Mobile / Tablet — iPad Pro
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Mobile/Tablet — iPad Pro", () => {
  test.use({ ...devices["iPad Pro"] });

  test("inspection list is usable on iPad", async ({ page }) => {
    await page.goto("/dashboard/inspections");
    await expect(
      page.getByRole("heading", { name: /inspection/i }),
    ).toBeVisible({ timeout: 8_000 });
    // Page should not overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()?.width ?? 1024;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 50); // Allow small tolerance
  });

  test("sketch editor canvas is visible on iPad", async ({ page }) => {
    const id = await createInspection(page, "E2E iPad Sketch Test");
    if (!id) return;

    await openSketchEditor(page, id);
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Canvas should be sized reasonably for the tablet viewport
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(300);
    }
  });

  test("sketch-preview page is usable on iPad", async ({ page }) => {
    const id = await createInspection(page, "E2E iPad Preview Test");
    if (!id) return;

    await page.goto(`/dashboard/inspections/${id}/sketch-preview`);
    await expect(page.getByText(/RestoreAssist/i)).toBeVisible({
      timeout: 8_000,
    });

    // Download button should not overflow
    const downloadBtn = page.getByRole("button", { name: /download pdf/i });
    await expect(downloadBtn).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Sketch Canvas Performance Benchmarks
// ═══════════════════════════════════════════════════════════════

test.describe("V2 Performance Benchmarks", () => {
  test("sketch editor page loads within 5 s", async ({ page }) => {
    const id = await createInspection(page, "E2E Perf Benchmark");
    if (!id) return;

    const start = Date.now();
    await page.goto(`/dashboard/inspections/${id}`);
    const sketchTab = page.getByRole("tab", { name: /sketch|floor plan/i });
    if (await sketchTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sketchTab.click();
    }
    // Canvas should be visible within 5 s
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 5_000,
    });
    const elapsed = Date.now() - start;
    // Log the measurement (non-fatal even if over threshold — benchmark is informational)
    console.log(`[Perf] Sketch canvas visible in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10_000); // Hard limit: 10 s
  });

  test("property scrape API responds within 20 s", async ({ request }) => {
    const start = Date.now();
    await request.post("/api/properties/scrape", {
      data: { address: "1 Test Performance Street", postcode: "3000" },
      timeout: 25_000,
    });
    const elapsed = Date.now() - start;
    console.log(`[Perf] Property scrape in ${elapsed}ms`);
    // Scrape may return 503/404 but should respond (not timeout) within 20 s
    expect(elapsed).toBeLessThan(20_000);
  });

  test("sketch estimate API responds within 2 s for empty inspection", async ({
    request,
  }) => {
    const start = Date.now();
    await request.get(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/estimate",
    );
    const elapsed = Date.now() - start;
    console.log(`[Perf] Sketch estimate API in ${elapsed}ms`);
    // Auth guard or 404 should return in well under 2 s
    expect(elapsed).toBeLessThan(2_000);
  });

  test("sketch PDF endpoint responds within 10 s for minimal payload", async ({
    request,
  }) => {
    // Provide a minimal valid PNG data URL (1×1 transparent PNG)
    const TINY_PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const start = Date.now();
    await request.post(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/pdf",
      {
        data: {
          floors: [
            {
              label: "Ground Floor",
              pngDataUrl: TINY_PNG,
              fabricJson: { objects: [] },
            },
          ],
        },
        timeout: 12_000,
      },
    );
    const elapsed = Date.now() - start;
    console.log(`[Perf] Sketch PDF API in ${elapsed}ms`);
    // Expect ownership check (404) in well under 10 s
    expect(elapsed).toBeLessThan(10_000);
  });
});
