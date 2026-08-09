import { expect, test, type Page } from "@playwright/test";
import { loginAs, seedAuthorisation, seedInspection } from "./_helpers/auth";

const CLIENT_EMAIL = "mock.owner.acceptance@test.local";
const CLIENT_PORTAL_PASSWORD = "Mock-owner-acceptance-2026!";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function fixture(
  page: Page,
  action: string,
  inspectionId: string,
  extra: Record<string, unknown> = {},
) {
  const response = await page.request.post("/api/test/owner-acceptance", {
    data: { action, inspectionId, ...extra },
  });
  if (!response.ok()) {
    throw new Error(
      `fixture ${action} failed: ${response.status()} ${await response.text()}`,
    );
  }
  return response.json();
}

test.describe("mock-only owner lifecycle acceptance", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);

  test("rendered owner journey reaches a genuinely evidence-gated close", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER");
    await seedAuthorisation(page);

    await test.step("create a synthetic client through rendered controls", async () => {
      await page.goto("/dashboard/clients");
      await page
        .getByRole("button", { name: "Add Client", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: "Add New Client" }),
      ).toBeVisible();
      await page.getByLabel("Client Name *").fill("Mock Acceptance Owner");
      await page.getByLabel("Email *").fill(CLIENT_EMAIL);
      const created = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/clients" &&
          response.request().method() === "POST"
        );
      });
      await page
        .getByRole("button", { name: "Add Client", exact: true })
        .last()
        .click();
      expect((await created).ok()).toBe(true);
      await expect(
        page.getByRole("heading", { name: "Add New Client" }),
      ).not.toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("row", {
          name: new RegExp(`Mock Acceptance Owner ${CLIENT_EMAIL}`),
        }),
      ).toBeVisible({ timeout: 15_000 });
    });

    let inspectionId = "";
    await test.step("capture evidence and repeat-save the draft without duplication", async () => {
      await page.goto("/dashboard/inspections/new");
      await page.getByRole("radio", { name: /water damage/i }).check();

      const created = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/inspections" &&
          response.request().method() === "POST"
        );
      });
      await page.getByRole("button", { name: /^Quick Fill/ }).click();
      await page
        .getByRole("button", { name: /Residential Burst Pipe/ })
        .click();
      const createdResponse = await created;
      expect(createdResponse.ok()).toBe(true);
      inspectionId = (await createdResponse.json()).inspection.id;

      await page.route(
        `**/api/inspections/${inspectionId}/photos`,
        async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const body = await fixture(page, "mock-photo", inspectionId);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        },
      );
      await page.route(
        `**/api/inspections/${inspectionId}/floor-plan`,
        async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const body = await fixture(page, "mock-floor-plan", inspectionId);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        },
      );

      await page
        .locator('label:has-text("Add Photo") input[type="file"]')
        .setInputFiles({
          name: "mock-evidence.png",
          mimeType: "image/png",
          buffer: TINY_PNG,
        });
      await expect(
        page.getByText(/1 photo\(s\) uploaded successfully/i),
      ).toBeVisible();

      await page
        .locator('label:has-text("Upload Floor Plan") input[type="file"]')
        .setInputFiles({
          name: "mock-floor-plan.png",
          mimeType: "image/png",
          buffer: TINY_PNG,
        });
      await expect(
        page.getByRole("img", { name: /moisture mapping canvas/i }),
      ).toBeVisible();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const saved = page.waitForResponse(
          (response) =>
            response
              .url()
              .includes(`/api/inspections/${inspectionId}/draft-snapshot`) &&
            response.request().method() === "PUT",
        );
        await page.getByRole("button", { name: "Save Draft" }).click();
        expect((await saved).ok()).toBe(true);
        await expect(
          page.getByRole("button", { name: "Save Draft" }),
        ).toBeEnabled();
      }

      const state = await fixture(page, "inspect-draft", inspectionId);
      expect(state.inspection._count).toEqual({
        moistureReadings: 4,
        affectedAreas: 2,
        scopeItems: 7,
        photos: 1,
      });
      expect(state.inspection.floorPlanImageUrl).toContain("MOCK FLOOR PLAN");
    });

    let reportId = "";
    let estimateId = "";
    await test.step("review the claim, edit scope, generate report and sign off", async () => {
      await page.goto(`/dashboard/inspections/${inspectionId}`);
      await page.getByRole("tab", { name: /Affected Areas/ }).click();
      await expect(page.getByText("Master Bedroom").first()).toBeVisible();
      await page.getByRole("tab", { name: "Floor Plan" }).click();
      await expect(page.getByText(/Ground Floor/i).first()).toBeVisible();

      await page.goto(`/dashboard/inspections/${inspectionId}/scope-items`);
      await expect(
        page.getByRole("heading", { name: "Scope of Works" }),
      ).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: "Remove Carpet" });
      const deselected = page.waitForResponse((response) => {
        if (response.request().method() !== "PATCH") return false;
        if (!new URL(response.url()).pathname.includes("/scope-items/")) {
          return false;
        }
        return response.request().postDataJSON()?.isSelected === false;
      });
      await row.getByRole("checkbox").uncheck();
      expect((await deselected).ok()).toBe(true);
      const notes = row.getByPlaceholder("Add notes…");
      const notePersisted = page.waitForResponse((response) => {
        if (response.request().method() !== "PATCH") return false;
        if (!new URL(response.url()).pathname.includes("/scope-items/")) {
          return false;
        }
        return (
          response.request().postDataJSON()?.specification ===
          "Mock owner requested retention review"
        );
      });
      await notes.fill("Mock owner requested retention review");
      await notes.blur();
      expect((await notePersisted).ok()).toBe(true);
      await expect(notes).toHaveValue("Mock owner requested retention review");
      const editedDraft = await fixture(page, "inspect-draft", inspectionId);
      expect(
        editedDraft.inspection.scopeItems.find(
          (item: { description: string }) =>
            item.description === "Remove Carpet",
        ),
      ).toMatchObject({
        isSelected: false,
        specification: "Mock owner requested retention review",
      });

      const prepared = await fixture(page, "prepare-review", inspectionId, {
        clientEmail: CLIENT_EMAIL,
        portalPassword: CLIENT_PORTAL_PASSWORD,
      });
      reportId = prepared.reportId;
      estimateId = prepared.estimateId;

      await page.goto(`/dashboard/inspections/${inspectionId}`);
      const reportResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/api/inspections/${inspectionId}/report` &&
          url.searchParams.get("format") === "pdf" &&
          response.request().method() === "GET"
        );
      });
      await page.getByRole("button", { name: "Generate NIR Report" }).click();
      const pdf = await reportResponse;
      expect(pdf.ok()).toBe(true);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");

      await expect(
        page.getByRole("heading", { name: "Sign Off Inspection" }),
      ).toBeVisible();
      await page.getByLabel("Full name *").fill("Mock Acceptance Technician");
      await page.getByLabel("Role / Title").fill("Lead Technician");
      await page
        .getByRole("checkbox", { name: /I confirm I have authority/i })
        .check();
      await page.getByRole("button", { name: "Confirm sign-off" }).click();
      await expect(page.getByText("Inspection Signed Off")).toBeVisible();
    });

    await test.step("approve the estimate through the rendered evidence workflow", async () => {
      await page.goto(`/dashboard/reports/${reportId}`);
      await page.getByRole("button", { name: "Approvals" }).click();
      await page.getByRole("button", { name: "Request Approval" }).click();
      await page.getByRole("combobox", { name: /Approval Type/i }).click();
      await page.getByRole("option", { name: "Cost Estimate" }).click();
      await page.getByLabel("Amount (optional)").fill("1100");
      const requested = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/reports/${reportId}/approvals` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Submit" }).click();
      expect((await requested).ok()).toBe(true);
      await expect(page.getByText(/Cost Estimate/).first()).toBeVisible();

      await page.goto("/portal/login");
      await page.getByLabel("Email").fill(CLIENT_EMAIL);
      await page.getByLabel("Password").fill(CLIENT_PORTAL_PASSWORD);
      const portalLogin = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/portal/auth/login" &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Sign In" }).click();
      expect((await portalLogin).ok()).toBe(true);
      await page.waitForURL((url) => url.pathname === "/portal", {
        timeout: 30_000,
      });
      await expect(
        page.getByRole("heading", { name: "My Restoration Reports" }),
      ).toBeVisible({ timeout: 30_000 });
      await page
        .getByRole("link", { name: new RegExp(`Mock acceptance report`) })
        .click();
      await expect(
        page.getByRole("heading", { name: "Approvals Required" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Review & Respond" }).click();
      await expect(
        page.getByRole("heading", { name: "Cost Estimate Approval" }),
      ).toBeVisible();
      await page
        .getByPlaceholder("Add any comments or feedback...")
        .fill("Approved by the synthetic client portal account.");
      const responded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/portal/reports/${reportId}/approvals` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Submit" }).click();
      expect((await responded).ok()).toBe(true);
      await expect(
        page.getByText("APPROVED", { exact: true }).first(),
      ).toBeVisible();

      await page.goto(`/dashboard/reports/${reportId}/edit`);
      await page.getByRole("tab", { name: "Estimation" }).click();
      await expect(
        page.getByRole("heading", { name: "Estimation Engine" }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Approvals" }).click();
      await expect(
        page.getByText("CLIENT REVIEW", { exact: true }),
      ).toBeVisible();
      const promoted = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${estimateId}/status`) &&
          response.request().method() === "PATCH",
      );
      const savedBeforePromotion = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/estimates" &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Approve with Client Evidence" })
        .click();
      const saveResponse = await savedBeforePromotion;
      const savedEstimate = await saveResponse.json();
      expect(saveResponse.ok(), JSON.stringify(savedEstimate)).toBe(true);
      expect(savedEstimate.totals.totalIncGST).toBe(1100);
      const promotedResponse = await promoted;
      const promotedPayload = await promotedResponse.json();
      expect(promotedResponse.ok(), JSON.stringify(promotedPayload)).toBe(true);
      await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
    });

    let publicToken = "";
    await test.step("generate invoice, open both portals, and settle with mock evidence", async () => {
      await page.route(
        `**/api/inspections/${inspectionId}/close-summary`,
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              draft: {
                text: "Mock-only job complete. Report delivered and invoice reconciled.",
                inspectionNumber: "MOCK",
              },
              source: "fallback",
            }),
          });
        },
      );
      await page.goto(`/dashboard/inspections/${inspectionId}/invoice`);
      await page
        .getByRole("button", { name: "Generate Invoice", exact: true })
        .first()
        .click();
      await expect(
        page
          .getByText(/Invoice RA-/)
          .or(page.getByText(/RA-\d{4}-/))
          .first(),
      ).toBeVisible();

      const settlement = await fixture(page, "mock-settlement", inspectionId);
      publicToken = settlement.publicToken;
      await page.goto(`/invoices/public/${publicToken}`);
      await expect(
        page.getByText("Mock Acceptance Owner").first(),
      ).toBeVisible();
      await expect(page.getByText(/Status: PAID/i)).toBeVisible();

      await page.goto(`/dashboard/inspections/${inspectionId}`);
      await page.getByRole("button", { name: "Share with Client" }).click();
      const clientUrl = await page
        .getByLabel("Client portal link", { exact: true })
        .inputValue();
      await page.goto(clientUrl);
      await expect(page.getByText("Client Job Status Portal")).toBeVisible();
      await expect(page.getByText("123 Main Street").first()).toBeVisible();

      await page.goto(`/dashboard/reports/${reportId}`);
      const insurerResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/reports/${reportId}/insurer-link`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Generate Insurer Link" }).click();
      const insurerResult = await insurerResponse;
      expect(insurerResult.ok()).toBe(true);
      const insurerUrl = (await insurerResult.json()).url;
      await page.goto(insurerUrl);
      await expect(
        page.getByText("Insurer Report Review Portal"),
      ).toBeVisible();
      await expect(
        page.getByText("IICRC S500:2021 Compliant Inspection Report", {
          exact: true,
        }),
      ).toBeVisible();
    });

    await test.step("close only after reconciled mock payment and delivery evidence", async () => {
      await page.goto(`/dashboard/inspections/${inspectionId}`);
      await expect(page.getByTestId("close-job-prompt")).toBeVisible();
      await page.reload();
      await page
        .getByRole("button", { name: "Looks right, close job" })
        .click();
      const closed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/inspections/${inspectionId}/close` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Confirm close" }).click();
      const closeResponse = await closed;
      const closePayload = await closeResponse.json();
      expect(closeResponse.ok(), JSON.stringify(closePayload)).toBe(true);
      await expect(page.getByText("Job Closed")).toBeVisible();
      await expect(page.getByText(/Mock-only job complete/i)).toBeVisible();
    });
  });

  test("@smoke owner surfaces remain responsive and keyboard reachable", async ({
    page,
  }) => {
    await loginAs(page, "USER");
    const id = `responsive-${test.info().project.name}`;
    await seedInspection(page, { inspectionId: id, status: "ESTIMATED" });
    await page.goto(`/dashboard/inspections/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Share with Client" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 2,
        ),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const focused = await page
      .locator(":focus")
      .evaluate((element) => element.tagName);
    expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]).toContain(focused);
  });
});
