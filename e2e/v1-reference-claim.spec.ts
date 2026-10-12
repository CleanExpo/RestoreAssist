/**
 * V1 Phase 6 (P6-1) — §39 reference claim through UI + API (test helpers only, no direct DB).
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers/auth";
import {
  finalizeV1ReferenceExit,
  seedV1ReferenceClaim,
} from "./_helpers/v1-reference-claim";

test.describe("V1 reference claim @v1-exit", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true",
  );

  test("Multi-role spine + financial exit (estimate → invoice → EFT → Xero → close)", async ({
    page,
  }) => {
    const inspectionId = `v1-ref-${Date.now()}`;

    await loginAs(page, "ADMIN");
    const seed = await seedV1ReferenceClaim(page, inspectionId);
    expect(seed.estimateId).toBeTruthy();

    const ctx = await page.request.get(
      `/api/inspections/${inspectionId}/claim-context`,
    );
    expect(ctx.ok()).toBeTruthy();
    const ctxJson = await ctx.json();
    expect(ctxJson.data.completeness.blocking).toEqual([]);
    expect(ctxJson.data.completeness.completionPercent).toBe(100);

    const equip = await page.request.post(
      `/api/inspections/${inspectionId}/equipment-calculator`,
      {
        headers: { "Idempotency-Key": `v1-equip-${inspectionId}` },
        data: {
          affectedAreaM2: 11.15,
          damageClass: "CLASS_2",
          damageCategory: "CAT_2",
          saveScopeItems: true,
        },
      },
    );
    expect(equip.ok()).toBeTruthy();

    const swms = await page.request.get(`/api/inspections/${inspectionId}/swms`);
    expect(swms.ok()).toBeTruthy();

    const disposal = await page.request.post(
      `/api/inspections/${inspectionId}/disposal-authority`,
      {
        data: { signerName: "Reference Homeowner", reference: "AUTH-E2E" },
      },
    );
    expect(disposal.ok()).toBeTruthy();

    if (seed.scopeDisposalItemId) {
      const selectScope = await page.request.patch(
        `/api/inspections/${inspectionId}/scope-items/${seed.scopeDisposalItemId}`,
        { data: { isSelected: true } },
      );
      expect(selectScope.ok()).toBeTruthy();
    }

    const approve = await page.request.patch(
      `/api/estimates/${seed.estimateId}/status`,
      { data: { status: "APPROVED" } },
    );
    expect(approve.ok()).toBeTruthy();

    const sign = await page.request.post(
      `/api/inspections/${inspectionId}/sign`,
      {
        headers: { "Idempotency-Key": `v1-sign-${inspectionId}` },
        data: { signatoryName: "Lead Tech Reference", role: "Site Supervisor" },
      },
    );
    expect(sign.ok()).toBeTruthy();

    const invoiceRes = await page.request.post(
      `/api/inspections/${inspectionId}/generate-invoice`,
      {
        headers: { "Idempotency-Key": `v1-inv-${inspectionId}` },
        data: {},
      },
    );
    expect(invoiceRes.ok()).toBeTruthy();
    const invoiceJson = await invoiceRes.json();
    const invoiceId = invoiceJson.invoiceId as string;
    expect(invoiceId).toBeTruthy();

    const pay = await page.request.post(`/api/invoices/${invoiceId}/payments`, {
      headers: { "Idempotency-Key": `v1-pay-${inspectionId}` },
      data: {
        amount: invoiceJson.totalIncGST ?? 110000,
        paymentMethod: "EFT",
        reference: "V1-REF-EFT-001",
      },
    });
    expect(pay.ok()).toBeTruthy();

    await finalizeV1ReferenceExit(page, { inspectionId, invoiceId });

    const close = await page.request.post(
      `/api/inspections/${inspectionId}/close`,
      {
        headers: { "Idempotency-Key": `v1-close-${inspectionId}` },
        data: {
          closeSummary:
            "Reference claim closed after paid invoice, Xero reconciliation, and report delivery.",
        },
      },
    );
    expect(close.ok()).toBeTruthy();

    await loginAs(page, "MANAGER");

    const inbox = await page.request.get("/api/operations/completeness-inbox");
    expect(inbox.ok()).toBeTruthy();
    const inboxIds = ((await inbox.json()).data ?? []).map(
      (r: { inspectionId: string }) => r.inspectionId,
    );
    expect(inboxIds).toContain(seed.gapInspectionId);
    expect(inboxIds).not.toContain(inspectionId);

    const appt = await page.request.post(
      `/api/inspections/${inspectionId}/appointments`,
      {
        data: {
          title: "Post-close revisit",
          startsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
          endsAt: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
        },
      },
    );
    expect(appt.status()).toBeLessThan(500);

    await loginAs(page, "USER");

    const list = await page.request.get(
      `/api/inspections/${inspectionId}/appointments`,
    );
    expect(list.ok()).toBeTruthy();

    const portal = await page.request.get(
      `/api/portal/${seed.portalToken}/updates`,
    );
    expect(portal.ok()).toBeTruthy();
    const portalJson = await portal.json();
    expect(portalJson.data.statusSummary).toBeTruthy();
    expect(JSON.stringify(portalJson.data)).not.toMatch(/CAT_[123]/);

    await page.goto(`/dashboard/inspections/${inspectionId}`);
    await expect(page.getByText(/Claim readiness/i)).toBeVisible({
      timeout: 20_000,
    });
  });
});
