import { describe, expect, it } from "vitest";
import {
  buildClientPortalLinkChecklist,
  buildClientSendChecklist,
  isClientEmailJourneyComplete,
} from "../inspection-comms-readiness";

describe("inspection comms readiness", () => {
  it("marks email journey complete when report was delivered", () => {
    expect(
      isClientEmailJourneyComplete({
        reportDeliveredAt: "2026-01-01T00:00:00.000Z",
        portalLinkEmailedAt: null,
      }),
    ).toBe(true);
  });

  it("portal link checklist omits PDF gate", () => {
    const items = buildClientPortalLinkChecklist({
      emailServiceConfigured: true,
      clientHasEmail: true,
      clientEmail: "a@b.com",
    });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("checklist flags missing Mailtrap", () => {
    const items = buildClientSendChecklist({
      emailServiceConfigured: false,
      clientHasEmail: true,
      clientEmail: "a@b.com",
      reportId: "r1",
      reportStatus: "COMPLETED",
      reportPdfReady: true,
      reportDeliveredAt: null,
      portalLinkEmailedAt: null,
      clientEmailSentAt: null,
      completenessBlockerCount: 0,
      requiredFieldEvidenceGapCount: 0,
    });
    expect(items.find((i) => i.id === "mailtrap")?.ok).toBe(false);
    expect(items.every((i) => i.id === "mailtrap" || i.ok)).toBe(true);
  });

  it("blocks send checklist when required field evidence is missing", () => {
    const items = buildClientSendChecklist({
      emailServiceConfigured: true,
      clientHasEmail: true,
      clientEmail: "a@b.com",
      reportId: "r1",
      reportStatus: "COMPLETED",
      reportPdfReady: true,
      reportDeliveredAt: null,
      portalLinkEmailedAt: null,
      clientEmailSentAt: null,
      completenessBlockerCount: 0,
      requiredFieldEvidenceGapCount: 2,
      inspectionId: "insp-1",
    });
    const row = items.find((i) => i.id === "field-evidence");
    expect(row?.ok).toBe(false);
    expect(row?.href).toContain("insp-1");
    expect(row?.href).toContain("#field-evidence-checklist");
  });
});
