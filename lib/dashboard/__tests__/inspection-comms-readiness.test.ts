import { describe, expect, it } from "vitest";
import {
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
    });
    expect(items.find((i) => i.id === "mailtrap")?.ok).toBe(false);
    expect(items.every((i) => i.id === "mailtrap" || i.ok)).toBe(true);
  });
});
