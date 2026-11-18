/** Needs a local migrated DB and an ALLOW_TEST_HELPERS=true dev server; CI runs it in sketch-e2e.yml. */
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { saveEstimateRows } from "../lib/billing/spm-estimate-rows";
import { applySessionCookieFromResponse } from "./helpers/session-cookie";
import { assertLocalTestDatabase } from "../scripts/ci/assert-local-test-db.mjs";

for (const width of [1440, 390]) {
  // Not @smoke: the production smoke runs every @smoke test against the live site, and this one
  // needs a local database. CI runs it in sketch-e2e.yml, which has one.
  test(`SPM opt-in recommendation at ${width}px`,async ({ page, context, baseURL }, testInfo) => {
    // One user and job per run: browser projects run in parallel, and width plus a millisecond
    // clock collided, so two runs raced the test sign-in's find-then-create on the same email.
    const runId = `${testInfo.project.name}-${width}-${randomUUID()}`;
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
    assertLocalTestDatabase(process.env);
    expect(process.env.DATABASE_URL, "Supply the local seeded database URL").toBeTruthy();
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      // The deliberately injected HTTP 500 below produces a browser resource error.
      if (message.type() === "error" && !message.text().includes("the server responded with a status of 500")) errors.push(message.text());
    });
    const signIn = await page.request.post("/api/test/sign-in-as", { data: { role: "USER", email: `spm-e2e-${runId}@test.local` } });
    expect(signIn.ok()).toBe(true);
    await applySessionCookieFromResponse(context, signIn);
    const { userId } = await signIn.json();
    const job = await prisma.inspection.create({ data: { userId, inspectionNumber: `SPM-${runId}`, propertyAddress: "Local SPM test", propertyPostcode: "4000", propertyCountry: "AU", status: "ESTIMATED" }, select: { id: true } });
    try {
      await prisma.$transaction(tx => saveEstimateRows(tx, { inspectionId: job.id, replace: true, country: "AU", estimate: {
        items: [{ category: "Labour", description: "Water extraction", quantity: 1, unit: "job", rate: 3000, subtotal: 3000, nrpgField: null, nrpgCompliant: true, rateSource: "company-config", isEstimated: true }],
        subtotal: 3000, total: 3000, contingency: 0, currency: "AUD", breakdown: { labour: 3000, equipment: 0, materials: 0, other: 0 }, nrpgCompliant: true, nrpgViolations: [], pricingSource: "company-config",
      } }));
      await page.goto(`/dashboard/inspections/${job.id}?tab=costs`);
      const openCosts = async () => { await expect(page.getByRole("heading", { name: "Cost estimates", exact: true })).toBeVisible(); };
      await openCosts(); await page.reload(); await openCosts();
      const add = page.getByRole("button", { name: "Add to estimate", exact: true });
      const remove = page.getByRole("button", { name: "Remove", exact: true });
      await expect(add).toBeVisible();
      await expect(page.getByText("Highly recommended: Senior Project Manager", { exact: true })).toBeVisible();
      await add.click(); await expect(remove).toBeFocused(); await expect(add).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: /Estimate total/ })).toContainText("3,350.00");
      const spmRows = page.locator('tr[data-spm-row="true"]');
      await expect(spmRows).toHaveCount(1); await expect(spmRows).toContainText("350.00");
      await page.reload(); await openCosts(); await expect(remove).toBeVisible(); await expect(add).toHaveCount(0);
      await remove.click(); await expect(add).toBeFocused(); await expect(spmRows).toHaveCount(0);
      await expect(page.getByText("If this estimate was already sent to Xero or an insurer system, update or void it there.", { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: /Estimate total/ })).toContainText("3,000.00");
      const before = await page.getByRole("table", { name: "Cost estimates", exact: true }).innerText();
      await page.route(`**/api/inspections/${job.id}/cost-estimates/spm`, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) }));
      // Anchored: the page also carries an unrelated "Inspection completion" alert whose text can mention SPM.
      await add.click(); await expect(page.getByRole("alert").filter({ hasText: /^Internal server error$/ })).toBeVisible();
      expect(await page.getByRole("table", { name: "Cost estimates", exact: true }).innerText()).toBe(before);
      const saved = await prisma.costEstimate.findMany({ where: { inspectionId: job.id }, select: { lineKind: true }, take: 100 });
      expect(saved.filter(row => row.lineKind === "SPM")).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await prisma.inspection.delete({ where: { id: job.id } });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
      // Deleting the user cascades its owned organisation; remove the org first
      // so teardown does not attempt to delete a row already removed by the FK.
      if (user?.organizationId) await prisma.organization.delete({ where: { id: user.organizationId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });
}
