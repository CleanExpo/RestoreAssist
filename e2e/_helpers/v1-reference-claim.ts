import type { Page } from "@playwright/test";

export type V1ReferenceSeed = {
  inspectionId: string;
  reportId: string;
  clientId: string;
  portalToken: string;
  technicianUserId: string | null;
  managerUserId: string | null;
  gapInspectionId: string;
  estimateId: string | null;
  workspaceId: string | null;
  scopeDisposalItemId: string | null;
};

export async function seedV1ReferenceClaim(
  page: Page,
  inspectionId?: string,
): Promise<V1ReferenceSeed> {
  const res = await page.request.post("/api/test/seed-v1-reference-claim", {
    data: { inspectionId, syncTestColleagues: true },
  });
  if (!res.ok()) {
    throw new Error(
      `seed-v1-reference-claim failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
  const json = await res.json();
  return json.data as V1ReferenceSeed;
}

/**
 * Issue the generated invoice (DRAFT -> SENT) without the client email, which
 * needs a provider this job does not have. Payments refuse a draft invoice.
 */
export async function issueV1ReferenceInvoice(
  page: Page,
  invoiceId: string,
): Promise<void> {
  const res = await page.request.post(
    "/api/test/v1-reference-claim/issue-invoice",
    { data: { invoiceId } },
  );
  if (!res.ok()) {
    throw new Error(
      `issue-invoice failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
}

export async function finalizeV1ReferenceExit(
  page: Page,
  args: { inspectionId: string; invoiceId: string },
): Promise<void> {
  const res = await page.request.post(
    "/api/test/v1-reference-claim/finalize-exit",
    { data: args },
  );
  if (!res.ok()) {
    throw new Error(
      `finalize-exit failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
}
