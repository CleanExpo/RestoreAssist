import { describe, expect, it } from "vitest";
import { aiOwnershipExportMeta } from "@/lib/reports/ai-ownership-export-meta";

describe("aiOwnershipExportMeta", () => {
  it("flags pending drafts", () => {
    expect(
      aiOwnershipExportMeta({
        detailedReport: "draft",
        reportOwnershipAcknowledgedAt: null,
      }).aiAssistedDraft,
    ).toBe(true);
  });

  it("clears flag after acknowledgement", () => {
    expect(
      aiOwnershipExportMeta({
        detailedReport: "owned",
        reportOwnershipAcknowledgedAt: "2026-01-02T00:00:00Z",
      }).aiAssistedDraft,
    ).toBe(false);
  });
});
